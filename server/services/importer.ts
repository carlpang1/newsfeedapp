import { getTickers, getTickerBySymbol, createImportJob, updateImportJob, updateTickerLastFetch } from '../database.js';
import { ArticleDeduplicator } from './deduplicator.js';
import { getNewsProvider } from './newsProvider.js';
import { logger } from './logger.js';
import { FetchNewsOptions, ImportJobSummary, Ticker } from '../types.js';

export class NewsImporter {
  /**
   * Sensible overlap buffer for incremental fetches (2 hours).
   * Yahoo Finance and wire services can experience slight indexing or timestamp
   * synchronization variances. A 2-hour overlap window prevents dropped boundary
   * articles while canonical URL/hash deduplication safely ignores already-persisted items.
   */
  public static readonly OVERLAP_WINDOW_MS = 2 * 60 * 60 * 1000;

  /**
   * Executes a complete news import pipeline with robust incremental fetching per ticker.
   */
  public static async runImport(options: FetchNewsOptions = {}): Promise<ImportJobSummary> {
    const providerType = options.provider || (process.env.NEWS_PROVIDER as 'yahoo' | 'mock') || 'yahoo';
    const provider = getNewsProvider(providerType);
    const startedAt = new Date().toISOString();

    logger.info(`=== Starting News Import using [${providerType.toUpperCase()}] Provider ===`);

    // 1. Determine target tickers
    let targetTickers: Ticker[] = [];

    if (options.symbols && options.symbols.length > 0) {
      for (const sym of options.symbols) {
        const found = await getTickerBySymbol(sym);
        if (found) {
          targetTickers.push(found);
        }
      }
    } else {
      const allEnabled = await getTickers({ enabledOnly: true });
      targetTickers = allEnabled;
    }

    if (targetTickers.length === 0) {
      logger.warn('No tickers selected or enabled for news import.');
    }

    // 2. Create import job record in SQLite
    const jobId = await createImportJob({
      provider: providerType,
      status: 'running',
      tickers_count: targetTickers.length,
      date_from: options.startDate,
      date_to: options.endDate,
    });

    let totalArticlesRetrieved = 0;
    let totalNewArticles = 0;
    let totalDuplicatesSkipped = 0;
    let initialCount = 0;
    let incrementalCount = 0;

    const tickerResults: Array<{
      ticker: string;
      symbol: string;
      status: 'success' | 'ok' | 'error' | 'empty';
      fetchMode: 'initial' | 'incremental';
      articlesRetrieved: number;
      retrieved: number;
      newArticles: number;
      newInserted: number;
      duplicates: number;
      previousLastFetchAt: string | null;
      newLastFetchAt: string | null;
      error?: string;
    }> = [];
    const errorsList: Array<{ symbol: string; error: string }> = [];

    const concurrencyLimit = Math.max(1, parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5', 10));

    // Process tickers in controlled concurrent chunks to avoid rate limiting
    for (let i = 0; i < targetTickers.length; i += concurrencyLimit) {
      const batch = targetTickers.slice(i, i + concurrencyLimit);

      const batchPromises = batch.map(async (ticker) => {
        const isIncremental = Boolean(ticker.last_successful_fetch_at);
        const fetchMode: 'initial' | 'incremental' = isIncremental ? 'incremental' : 'initial';

        if (isIncremental) {
          incrementalCount++;
        } else {
          initialCount++;
        }

        // Calculate effective start date
        let effectiveStartDate = options.startDate;
        if (isIncremental && ticker.last_successful_fetch_at && !options.startDate) {
          const prevTime = new Date(ticker.last_successful_fetch_at).getTime();
          const overlapTime = Math.max(0, prevTime - NewsImporter.OVERLAP_WINDOW_MS);
          effectiveStartDate = new Date(overlapTime).toISOString();
        }

        logger.info(
          `Processing ticker ${ticker.symbol} [Mode: ${fetchMode.toUpperCase()}]` +
            (effectiveStartDate ? ` (StartDate: ${effectiveStartDate})` : '')
        );

        try {
          const rawArticles = await provider.fetchNewsForTicker(ticker.symbol, {
            startDate: effectiveStartDate,
            endDate: options.endDate,
          });

          let tickerNew = 0;
          let tickerDuplicates = 0;

          for (const raw of rawArticles) {
            const processResult = await ArticleDeduplicator.processAndStoreArticle(raw, ticker.id);
            if (processResult.isDuplicate) {
              tickerDuplicates++;
            } else {
              tickerNew++;
            }
          }

          const fetchSuccessTimestamp = new Date().toISOString();

          // CRITICAL: Update last_successful_fetch_at ONLY after actual successful processing
          await updateTickerLastFetch(ticker.id, fetchSuccessTimestamp);

          totalArticlesRetrieved += rawArticles.length;
          totalNewArticles += tickerNew;
          totalDuplicatesSkipped += tickerDuplicates;

          tickerResults.push({
            ticker: ticker.symbol,
            symbol: ticker.symbol,
            status: rawArticles.length === 0 ? 'empty' : 'success',
            fetchMode,
            articlesRetrieved: rawArticles.length,
            retrieved: rawArticles.length,
            newArticles: tickerNew,
            newInserted: tickerNew,
            duplicates: tickerDuplicates,
            previousLastFetchAt: ticker.last_successful_fetch_at || null,
            newLastFetchAt: fetchSuccessTimestamp,
          });

          logger.info(
            `Retrieved ${rawArticles.length} articles for ${ticker.symbol} (New: ${tickerNew}, Duplicates: ${tickerDuplicates}, Timestamp: ${fetchSuccessTimestamp})`
          );
        } catch (err: any) {
          const errorMsg = err.message || 'Unknown error occurred';
          logger.error(`Error processing ticker ${ticker.symbol}: ${errorMsg}`);
          errorsList.push({ symbol: ticker.symbol, error: errorMsg });

          // CRITICAL: On failure, last_successful_fetch_at remains completely unchanged
          tickerResults.push({
            ticker: ticker.symbol,
            symbol: ticker.symbol,
            status: 'error',
            fetchMode,
            articlesRetrieved: 0,
            retrieved: 0,
            newArticles: 0,
            newInserted: 0,
            duplicates: 0,
            previousLastFetchAt: ticker.last_successful_fetch_at || null,
            newLastFetchAt: ticker.last_successful_fetch_at || null,
            error: errorMsg,
          });
        }
      });

      await Promise.all(batchPromises);

      // Add a small polite pause between batches when hitting live Yahoo Finance
      if (providerType === 'yahoo' && i + concurrencyLimit < targetTickers.length) {
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    const completedAt = new Date().toISOString();
    const finalStatus = errorsList.length === targetTickers.length && targetTickers.length > 0 ? 'failed' : 'completed';

    const overallFetchMode: 'initial' | 'incremental' | 'mixed' =
      incrementalCount === 0 ? 'initial' : initialCount === 0 ? 'incremental' : 'mixed';

    const details = {
      fetchMode: overallFetchMode,
      tickerResults,
      errors: errorsList,
    };

    // 3. Update job record in SQLite
    await updateImportJob(jobId, {
      status: finalStatus,
      articles_retrieved: totalArticlesRetrieved,
      new_articles: totalNewArticles,
      duplicates_skipped: totalDuplicatesSkipped,
      errors_count: errorsList.length,
      details,
      completed_at: completedAt,
    });

    logger.info(
      `=== Import Completed [${overallFetchMode}]: ${targetTickers.length} tickers, ${totalArticlesRetrieved} articles processed (${totalNewArticles} new, ${totalDuplicatesSkipped} deduplicated), ${errorsList.length} failed ===`
    );

    return {
      id: jobId,
      provider: providerType,
      status: finalStatus,
      tickers_count: targetTickers.length,
      articles_retrieved: totalArticlesRetrieved,
      new_articles: totalNewArticles,
      duplicates_skipped: totalDuplicatesSkipped,
      errors_count: errorsList.length,
      date_from: options.startDate,
      date_to: options.endDate,
      details,
      started_at: startedAt,
      completed_at: completedAt,
    };
  }
}
