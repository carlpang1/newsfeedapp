import { Database } from 'sql.js';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.js';
import { getActiveAIProvider, DEFAULT_PRICING } from './aiProvider.js';

export interface TickerSummaryItem {
  tickerId: number;
  symbol: string;
  companyName: string;
  exchange: string;
  newsCount: number;
  overallScore: number; // 1 - 100
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  directionLabel: string;
  topHeadlines: Array<{
    id: number;
    title: string;
    publishedAt: string;
    publisher: string;
    importanceScore: number;
    sentimentScore: number;
    eventType: string;
  }>;
  deterministicSignals: {
    bullishPoints: string[];
    bearishPoints: string[];
  };
  aiSummary?: {
    overallSummary: string;
    keyBullish: string[];
    keyBearish: string[];
    mainCatalyst?: string;
    mainRisk?: string;
    insufficientEvidence: boolean;
    cachedAt: string;
  };
  newsHashSig: string;
  hasCachedAI: boolean;
}

export interface TickerSummaryOptions {
  period?: '24h' | '7d' | '30d' | 'all' | 'custom';
  startDate?: string;
  endDate?: string;
  symbol?: string;
  sort?: 'highest_score' | 'lowest_score' | 'symbol_asc' | 'most_news' | 'highest_importance';
}

export interface AIEstimate {
  period: string;
  tickersNeedingAI: number;
  estimatedRequests: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  cachedTickersCount: number;
  totalApplicableTickers: number;
}

export class TickerSummaryEngine {
  /**
   * Initializes SQLite tables for ticker AI summaries cache
   */
  public static initSchema(database: Database) {
    database.run(`
      CREATE TABLE IF NOT EXISTS ticker_ai_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        news_hash_sig TEXT NOT NULL,
        overall_summary TEXT NOT NULL,
        key_bullish_json TEXT NOT NULL,
        key_bearish_json TEXT NOT NULL,
        main_catalyst TEXT,
        main_risk TEXT,
        insufficient_evidence INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (ticker_id) REFERENCES tickers(id) ON DELETE CASCADE,
        UNIQUE(ticker_id, period, news_hash_sig)
      );
      CREATE INDEX IF NOT EXISTS idx_ticker_ai_lookup ON ticker_ai_summaries(ticker_id, period);
    `);
  }

  /**
   * Calculates time range boundaries in ISO format based on period preset
   */
  public static getTimeRange(period: string = '7d', customStart?: string, customEnd?: string): { dateFrom?: string; dateTo?: string } {
    const now = new Date();
    if (period === '24h') {
      const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { dateFrom: from.toISOString() };
    }
    if (period === '7d') {
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { dateFrom: from.toISOString() };
    }
    if (period === '30d') {
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { dateFrom: from.toISOString() };
    }
    if (period === 'custom') {
      return {
        dateFrom: customStart ? new Date(customStart).toISOString() : undefined,
        dateTo: customEnd ? new Date(customEnd).toISOString() : undefined,
      };
    }
    return {}; // 'all' time
  }

  /**
   * Calculates deterministic Ticker Summaries for all or selected tickers
   */
  public static getTickerSummaries(database: Database, options: TickerSummaryOptions = {}): TickerSummaryItem[] {
    this.initSchema(database);

    const period = options.period || '7d';
    const { dateFrom, dateTo } = this.getTimeRange(period, options.startDate, options.endDate);
    const requestedSymbol = options.symbol && options.symbol !== 'ALL' ? options.symbol.toUpperCase() : null;

    // 1. Fetch target tickers
    let tickerQuery = `SELECT id, symbol, company_name, exchange FROM tickers WHERE enabled = 1`;
    const tickerParams: Record<string, any> = {};
    if (requestedSymbol) {
      tickerQuery += ` AND UPPER(symbol) = $symbol`;
      tickerParams['$symbol'] = requestedSymbol;
    }
    tickerQuery += ` ORDER BY symbol ASC`;

    const stmt = database.prepare(tickerQuery);
    if (Object.keys(tickerParams).length > 0) stmt.bind(tickerParams);

    const tickers: Array<{ id: number; symbol: string; company_name: string; exchange: string }> = [];
    while (stmt.step()) {
      tickers.push(stmt.getAsObject() as any);
    }
    stmt.free();

    const results: TickerSummaryItem[] = [];

    for (const ticker of tickers) {
      // 2. Fetch all articles for this ticker in date range
      let newsSql = `
        SELECT DISTINCT
          n.id, n.title, n.publisher, n.published_at, n.summary,
          na.importance_score, na.relevance_score, na.sentiment_score,
          na.event_type, na.duplicate_group_id, na.explanation_json
        FROM news n
        JOIN ticker_news tn ON n.id = tn.news_id
        LEFT JOIN news_analysis na ON n.id = na.news_id
        WHERE tn.ticker_id = $tId
      `;
      const newsParams: Record<string, any> = { '$tId': ticker.id };

      if (dateFrom) {
        newsSql += ` AND n.published_at >= $dateFrom`;
        newsParams['$dateFrom'] = dateFrom;
      }
      if (dateTo) {
        newsSql += ` AND n.published_at <= $dateTo`;
        newsParams['$dateTo'] = dateTo;
      }

      newsSql += ` ORDER BY n.published_at DESC`;

      const nStmt = database.prepare(newsSql);
      nStmt.bind(newsParams);

      const rawArticles: Array<{
        id: number;
        title: string;
        publisher: string;
        published_at: string;
        summary: string;
        importance_score: number;
        relevance_score: number;
        sentiment_score: number;
        event_type: string;
        duplicate_group_id: string;
        explanation_json: string;
      }> = [];

      while (nStmt.step()) {
        const row = nStmt.getAsObject() as any;
        rawArticles.push({
          id: Number(row.id),
          title: String(row.title || ''),
          publisher: String(row.publisher || ''),
          published_at: String(row.published_at || ''),
          summary: String(row.summary || ''),
          importance_score: Number(row.importance_score ?? 50),
          relevance_score: Number(row.relevance_score ?? 100),
          sentiment_score: Number(row.sentiment_score ?? 50),
          event_type: String(row.event_type || 'general'),
          duplicate_group_id: String(row.duplicate_group_id || ''),
          explanation_json: String(row.explanation_json || '{}'),
        });
      }
      nStmt.free();

      // If requested single ticker or showing all tickers with news, filter out tickers with 0 news if All Tickers
      if (rawArticles.length === 0) {
        if (requestedSymbol) {
          // If explicitly queried single ticker with 0 news, show 0 news block
          results.push({
            tickerId: ticker.id,
            symbol: ticker.symbol,
            companyName: ticker.company_name || ticker.symbol,
            exchange: ticker.exchange || 'US',
            newsCount: 0,
            overallScore: 50,
            direction: 'NEUTRAL',
            directionLabel: 'NEUTRAL',
            topHeadlines: [],
            deterministicSignals: { bullishPoints: [], bearishPoints: [] },
            newsHashSig: 'empty',
            hasCachedAI: false,
          });
        }
        continue;
      }

      // 3. Deduplicate syndicated news (do not double-count syndicated duplicates)
      const groupMap = new Map<string, typeof rawArticles[0]>();
      const uniqueArticles: typeof rawArticles = [];

      for (const art of rawArticles) {
        const groupKey = art.duplicate_group_id && art.duplicate_group_id !== ''
          ? art.duplicate_group_id
          : `single_${art.id}`;
        
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, art);
          uniqueArticles.push(art);
        } else {
          // Keep the article with higher importance score or richer content as representative
          const existing = groupMap.get(groupKey)!;
          if (art.importance_score > existing.importance_score) {
            const idx = uniqueArticles.indexOf(existing);
            if (idx !== -1) uniqueArticles[idx] = art;
            groupMap.set(groupKey, art);
          }
        }
      }

      // 4. Calculate Deterministic Overall Score (Rule Engine v2.0 weighting)
      // Base sentiment: 50
      let totalWeight = 0;
      let weightedSentimentSum = 0;
      const bullishPointsSet = new Set<string>();
      const bearishPointsSet = new Set<string>();

      const nowMs = Date.now();

      for (const art of uniqueArticles) {
        // Recency weight: decay over time
        const ageHours = Math.max(0, (nowMs - new Date(art.published_at).getTime()) / (1000 * 3600));
        const recencyWeight = Math.max(0.4, Math.exp(-0.01 * ageHours));

        // Event type impact multiplier
        let eventMultiplier = 1.0;
        if (['earnings', 'guidance', 'acquisition', 'merger'].includes(art.event_type)) {
          eventMultiplier = 1.4;
        } else if (['regulatory', 'legal', 'analyst_rating', 'insider', 'contract'].includes(art.event_type)) {
          eventMultiplier = 1.25;
        } else if (['management', 'restructuring', 'layoffs', 'financing', 'product'].includes(art.event_type)) {
          eventMultiplier = 1.15;
        }

        const importanceWeight = Math.max(15, art.importance_score);
        const relevanceWeight = Math.max(0.2, art.relevance_score / 100);

        const weight = importanceWeight * relevanceWeight * recencyWeight * eventMultiplier;

        totalWeight += weight;
        weightedSentimentSum += art.sentiment_score * weight;

        // Parse explanation JSON for key factor highlights
        try {
          const exp = JSON.parse(art.explanation_json);
          if (exp.sentiment?.breakdown) {
            for (const b of exp.sentiment.breakdown) {
              if (b.points > 0) bullishPointsSet.add(b.signal);
              else if (b.points < 0) bearishPointsSet.add(b.signal);
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      let rawOverall = totalWeight > 0 ? weightedSentimentSum / totalWeight : 50;
      let overallScore = Math.round(Math.max(1, Math.min(100, rawOverall)));

      // Direction calculation: 1–49 = BEARISH, 50 = NEUTRAL, 51–100 = BULLISH
      let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      let directionLabel = 'NEUTRAL';
      if (overallScore >= 51) {
        direction = 'BULLISH';
        directionLabel = overallScore >= 75 ? 'STRONGLY BULLISH' : 'BULLISH';
      } else if (overallScore <= 49) {
        direction = 'BEARISH';
        directionLabel = overallScore <= 25 ? 'STRONGLY BEARISH' : 'BEARISH';
      }

      // 5. Generate deterministic news hash signature for AI caching
      const articleSigString = uniqueArticles
        .map((a) => `${a.id}:${a.sentiment_score}:${a.importance_score}`)
        .join('|');
      const newsHashSig = crypto.createHash('sha256').update(`${ticker.symbol}:${period}:${articleSigString}`).digest('hex').substring(0, 16);

      // 6. Check SQLite cache for existing Gemini AI summary
      const aiCacheStmt = database.prepare(`
        SELECT overall_summary, key_bullish_json, key_bearish_json, main_catalyst, main_risk, insufficient_evidence, updated_at
        FROM ticker_ai_summaries
        WHERE ticker_id = $tId AND period = $period AND news_hash_sig = $sig
      `);
      aiCacheStmt.bind({ '$tId': ticker.id, '$period': period, '$sig': newsHashSig });

      let aiSummary: TickerSummaryItem['aiSummary'] = undefined;
      let hasCachedAI = false;

      if (aiCacheStmt.step()) {
        const aiRow = aiCacheStmt.getAsObject() as any;
        hasCachedAI = true;
        try {
          aiSummary = {
            overallSummary: String(aiRow.overall_summary || ''),
            keyBullish: JSON.parse(String(aiRow.key_bullish_json || '[]')),
            keyBearish: JSON.parse(String(aiRow.key_bearish_json || '[]')),
            mainCatalyst: aiRow.main_catalyst ? String(aiRow.main_catalyst) : undefined,
            mainRisk: aiRow.main_risk ? String(aiRow.main_risk) : undefined,
            insufficientEvidence: Boolean(aiRow.insufficient_evidence),
            cachedAt: String(aiRow.updated_at || new Date().toISOString()),
          };
        } catch {
          hasCachedAI = false;
        }
      }
      aiCacheStmt.free();

      // Top headlines (up to 5)
      const topHeadlines = uniqueArticles.slice(0, 5).map((a) => ({
        id: a.id,
        title: a.title,
        publishedAt: a.published_at,
        publisher: a.publisher,
        importanceScore: a.importance_score,
        sentimentScore: a.sentiment_score,
        eventType: a.event_type,
      }));

      results.push({
        tickerId: ticker.id,
        symbol: ticker.symbol,
        companyName: ticker.company_name || ticker.symbol,
        exchange: ticker.exchange || 'US',
        newsCount: uniqueArticles.length,
        overallScore,
        direction,
        directionLabel,
        topHeadlines,
        deterministicSignals: {
          bullishPoints: Array.from(bullishPointsSet).slice(0, 4),
          bearishPoints: Array.from(bearishPointsSet).slice(0, 4),
        },
        aiSummary,
        newsHashSig,
        hasCachedAI,
      });
    }

    // Sort results according to requested sort option
    const sortMode = options.sort || 'highest_score';
    results.sort((a, b) => {
      if (sortMode === 'highest_score') {
        return b.overallScore - a.overallScore || b.newsCount - a.newsCount || a.symbol.localeCompare(b.symbol);
      }
      if (sortMode === 'lowest_score') {
        return a.overallScore - b.overallScore || b.newsCount - a.newsCount || a.symbol.localeCompare(b.symbol);
      }
      if (sortMode === 'symbol_asc') {
        return a.symbol.localeCompare(b.symbol);
      }
      if (sortMode === 'most_news') {
        return b.newsCount - a.newsCount || b.overallScore - a.overallScore;
      }
      if (sortMode === 'highest_importance') {
        const avgImpA = a.topHeadlines.length > 0 ? a.topHeadlines[0].importanceScore : 0;
        const avgImpB = b.topHeadlines.length > 0 ? b.topHeadlines[0].importanceScore : 0;
        return avgImpB - avgImpA || b.overallScore - a.overallScore;
      }
      return 0;
    });

    return results;
  }

  /**
   * Calculates quota estimation for AI summary generation without making API calls
   */
  public static getAIEstimate(database: Database, options: TickerSummaryOptions = {}): AIEstimate {
    const period = options.period || '7d';
    const summaries = this.getTickerSummaries(database, options);

    const totalApplicableTickers = summaries.length;
    let cachedTickersCount = 0;
    let tickersNeedingAI = 0;

    for (const item of summaries) {
      if (item.hasCachedAI) {
        cachedTickersCount++;
      } else {
        tickersNeedingAI++;
      }
    }

    const estimatedRequests = tickersNeedingAI;
    const estimatedTokens = estimatedRequests * 1200; // ~1200 tokens per ticker prompt/response
    const estimatedCostUsd = parseFloat((estimatedRequests * 0.0003).toFixed(5)); // ~0.03 cents per request

    return {
      period,
      tickersNeedingAI,
      estimatedRequests,
      estimatedTokens,
      estimatedCostUsd,
      cachedTickersCount,
      totalApplicableTickers,
    };
  }

  /**
   * Generates AI Summaries via Gemini for specified tickers (or all) after user confirmation.
   * Caches results in SQLite `ticker_ai_summaries`.
   */
  public static async generateAISummaries(
    database: Database,
    options: { period?: '24h' | '7d' | '30d' | 'all' | 'custom'; startDate?: string; endDate?: string; symbols?: string[] }
  ): Promise<{ generatedCount: number; cachedCount: number; results: TickerSummaryItem[] }> {
    this.initSchema(database);

    const period = options.period || '7d';
    const summaries = this.getTickerSummaries(database, {
      period,
      startDate: options.startDate,
      endDate: options.endDate,
      symbol: options.symbols && options.symbols.length === 1 ? options.symbols[0] : 'ALL',
    });

    const activeProvider = getActiveAIProvider();
    const now = new Date().toISOString();
    let generatedCount = 0;
    let cachedCount = 0;

    for (const item of summaries) {
      // Filter by requested symbols list if specified
      if (options.symbols && options.symbols.length > 0 && !options.symbols.includes(item.symbol)) {
        continue;
      }

      if (item.hasCachedAI && item.aiSummary) {
        cachedCount++;
        continue;
      }

      // If news count is 0, store insufficient evidence
      if (item.newsCount === 0) {
        const emptySummary = {
          overallSummary: 'Insufficient evidence (no news articles found in this period).',
          keyBullish: [],
          keyBearish: [],
          insufficientEvidence: true,
          cachedAt: now,
        };
        this.saveAICache(database, item.tickerId, period, item.newsHashSig, emptySummary);
        item.aiSummary = emptySummary;
        item.hasCachedAI = true;
        continue;
      }

      // Construct facts-only prompt for Gemini
      const prompt = `You are a financial news intelligence analyst. Analyze the following actual database news articles for ticker ${item.symbol} (${item.companyName}).

Overall Deterministic Sentiment Score: ${item.overallScore}/100 (${item.direction})
News Count: ${item.newsCount}

News Headlines & Data:
${item.topHeadlines.map((h, i) => `${i + 1}. "${h.title}" | Source: ${h.publisher} | Score: ${h.sentimentScore}/100 | Event: ${h.eventType} | Published: ${h.publishedAt}`).join('\n')}

INSTRUCTIONS:
- Return ONLY valid JSON matching this schema:
{
  "overallSummary": "Concise 2-3 sentence overview summarizing key drivers and explaining why the overall score is ${item.direction}.",
  "keyBullish": ["Bullet point 1", "Bullet point 2"],
  "keyBearish": ["Bullet point 1", "Bullet point 2"],
  "mainCatalyst": "Key catalyst title or brief text",
  "mainRisk": "Key risk title or brief text",
  "insufficientEvidence": false
}
- Do NOT invent any facts or speculate beyond the supplied database news.
- Keep bullet points clear, objective, and facts-focused.
`;

      try {
        const apiKey = process.env.GEMINI_API_KEY;
        const modelName = 'gemini-2.5-flash';
        let responseText = '';
        let inputTokens = 800;
        let outputTokens = 400;

        if (apiKey) {
          const aiClient = new GoogleGenAI({
            apiKey,
            httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
          });

          const geminiRes = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          });

          responseText = geminiRes.text || '';
          if (geminiRes.usageMetadata) {
            inputTokens = geminiRes.usageMetadata.promptTokenCount || 800;
            outputTokens = geminiRes.usageMetadata.candidatesTokenCount || 400;
          }
        } else {
          // Fallback simulation if no API key present in env
          responseText = JSON.stringify({
            overallSummary: `Deterministically calculated news overview for ${item.symbol}.`,
            keyBullish: item.deterministicSignals.bullishPoints,
            keyBearish: item.deterministicSignals.bearishPoints,
            insufficientEvidence: false,
          });
        }

        let parsed: any = {};
        try {
          const cleanText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          parsed = JSON.parse(cleanText);
        } catch {
          parsed = {
            overallSummary: responseText.substring(0, 300) || `Deterministic overview for ${item.symbol}`,
            keyBullish: item.deterministicSignals.bullishPoints,
            keyBearish: item.deterministicSignals.bearishPoints,
            insufficientEvidence: false,
          };
        }

        const aiObj = {
          overallSummary: String(parsed.overallSummary || 'Summary based on recent news events.'),
          keyBullish: Array.isArray(parsed.keyBullish) ? parsed.keyBullish.map(String) : [],
          keyBearish: Array.isArray(parsed.keyBearish) ? parsed.keyBearish.map(String) : [],
          mainCatalyst: parsed.mainCatalyst ? String(parsed.mainCatalyst) : undefined,
          mainRisk: parsed.mainRisk ? String(parsed.mainRisk) : undefined,
          insufficientEvidence: Boolean(parsed.insufficientEvidence),
          cachedAt: now,
        };

        this.saveAICache(database, item.tickerId, period, item.newsHashSig, aiObj);

        const pricing = DEFAULT_PRICING[modelName] || { inputCostPerMillion: 0.15, outputCostPerMillion: 0.60 };
        const estimatedCost = (inputTokens * pricing.inputCostPerMillion + outputTokens * pricing.outputCostPerMillion) / 1000000;

        // Log usage to ai_usage_logs
        database.run(`
          INSERT INTO ai_usage_logs (provider, model, request_count, input_tokens, output_tokens, estimated_cost, status, created_at)
          VALUES ('gemini', $model, 1, $inTok, $outTok, $cost, 'completed', $now)
        `, {
          '$model': modelName,
          '$inTok': inputTokens,
          '$outTok': outputTokens,
          '$cost': parseFloat(estimatedCost.toFixed(6)),
          '$now': now,
        });

        item.aiSummary = aiObj;
        item.hasCachedAI = true;
        generatedCount++;

        logger.info(`Generated AI summary for ticker ${item.symbol} (${period}) using ${modelName}`);
      } catch (err: any) {
        logger.error(`Failed to generate AI summary for ticker ${item.symbol}: ${err.message}`);
        // Log failure
        database.run(`
          INSERT INTO ai_usage_logs (provider, model, request_count, status, error_message, created_at)
          VALUES ('gemini', 'gemini-2.5-flash', 1, 'failed', $err, $now)
        `, { '$err': String(err.message), '$now': now });
      }
    }

    // Re-fetch sorted summaries to reflect updated AI summaries
    const updatedSummaries = this.getTickerSummaries(database, {
      period,
      startDate: options.startDate,
      endDate: options.endDate,
      symbol: options.symbols && options.symbols.length === 1 ? options.symbols[0] : 'ALL',
    });

    return { generatedCount, cachedCount, results: updatedSummaries };
  }

  private static saveAICache(
    database: Database,
    tickerId: number,
    period: string,
    newsHashSig: string,
    aiObj: NonNullable<TickerSummaryItem['aiSummary']>
  ) {
    const now = new Date().toISOString();
    database.run(`
      INSERT OR REPLACE INTO ticker_ai_summaries
      (ticker_id, period, news_hash_sig, overall_summary, key_bullish_json, key_bearish_json, main_catalyst, main_risk, insufficient_evidence, created_at, updated_at)
      VALUES ($tId, $period, $sig, $sum, $kBull, $kBear, $cat, $risk, $ineff, $now, $now)
    `, {
      '$tId': tickerId,
      '$period': period,
      '$sig': newsHashSig,
      '$sum': aiObj.overallSummary,
      '$kBull': JSON.stringify(aiObj.keyBullish || []),
      '$kBear': JSON.stringify(aiObj.keyBearish || []),
      '$cat': aiObj.mainCatalyst || null,
      '$risk': aiObj.mainRisk || null,
      '$ineff': aiObj.insufficientEvidence ? 1 : 0,
      '$now': now,
    });
  }
}
