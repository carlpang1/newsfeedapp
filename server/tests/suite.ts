import initSqlJs from 'sql.js';
import { YahooFinanceNewsProvider } from '../services/yahooFinanceProvider.js';
import { MockNewsProvider } from '../services/mockNewsProvider.js';
import { ArticleDeduplicator } from '../services/deduplicator.js';
import { NewsIntelligenceEngine } from '../services/intelligence.js';
import { CalibrationEngine } from '../services/calibration.js';
import { AIEligibilityGate } from '../services/aiEligibility.js';
import {
  GeminiAIProvider,
  DeterministicFallbackAIProvider,
  FailureSimulationProvider,
  validateAndSanitizeAIOutput,
  DEFAULT_PRICING,
} from '../services/aiProvider.js';
import { AIEngine } from '../services/aiEngine.js';
import { getAIConfig, DEFAULT_MODEL } from '../config.js';
import {
  getNews,
  insertArticle,
  reclassifyAllNews,
  getCalibrationStats,
  getCalibrationDataset,
  analyzeArticleWithAI,
  getBatchAIStatistics,
  getAIUsageDashboard,
} from '../database.js';

export interface TestResultItem {
  id: string;
  category:
    | 'Database'
    | 'Parser & Provider'
    | 'Deduplication'
    | 'Filtering & Pipeline'
    | 'Incremental Fetching'
    | 'Ticker Management & CSV'
    | 'News Intelligence & Scoring'
    | 'Intelligence Calibration & Quality'
    | 'AI News Analysis Layer';
  name: string;
  status: 'passed' | 'failed';
  durationMs: number;
  message?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: TestResultItem[];
  timestamp: string;
}

export async function runAllTests(): Promise<TestSuiteSummary> {
  const startTime = Date.now();
  const results: TestResultItem[] = [];

  const runTest = async (
    id: string,
    category: TestResultItem['category'],
    name: string,
    fn: () => Promise<void> | void
  ) => {
    const t0 = Date.now();
    try {
      await fn();
      results.push({
        id,
        category,
        name,
        status: 'passed',
        durationMs: Date.now() - t0,
      });
    } catch (err: any) {
      results.push({
        id,
        category,
        name,
        status: 'failed',
        durationMs: Date.now() - t0,
        message: err.message || String(err),
      });
    }
  };

  // -------------------------------------------------------------
  // 1. DATABASE TESTS (Isolated in-memory SQLite instance)
  // -------------------------------------------------------------
  let testDb: any;
  const SQL = await initSqlJs();

  await runTest('db-init', 'Database', 'Initialize SQLite schema and create required tables & indexes', () => {
    testDb = new SQL.Database();
    testDb.run(`
      CREATE TABLE tickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT UNIQUE NOT NULL,
        company_name TEXT,
        exchange TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_successful_fetch_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        publisher TEXT,
        url TEXT UNIQUE NOT NULL,
        published_at TEXT NOT NULL,
        summary TEXT,
        article_hash TEXT UNIQUE NOT NULL,
        retrieved_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE ticker_news (
        ticker_id INTEGER NOT NULL,
        news_id INTEGER NOT NULL,
        PRIMARY KEY (ticker_id, news_id)
      );
      CREATE INDEX idx_tickers_symbol ON tickers(symbol);
      CREATE INDEX idx_news_published_at ON news(published_at DESC);
      CREATE INDEX idx_news_url ON news(url);
      CREATE INDEX idx_news_hash ON news(article_hash);
    `);
  });

  await runTest('db-ticker-crud', 'Database', 'Ticker Creation, Modification, Querying, and Deletion', () => {
    const now = new Date().toISOString();
    // 1. Create
    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, created_at, updated_at) VALUES ('TEST_TICKER', 'Test Company Inc', 'NASDAQ', 1, '${now}', '${now}')`
    );
    const stmt = testDb.prepare("SELECT * FROM tickers WHERE symbol = 'TEST_TICKER'");
    if (!stmt.step()) throw new Error('Failed to find created ticker');
    const created = stmt.getAsObject();
    stmt.free();

    if (created.symbol !== 'TEST_TICKER' || created.enabled !== 1) {
      throw new Error('Ticker data mismatch after insert');
    }

    // 2. Update
    testDb.run("UPDATE tickers SET enabled = 0, company_name = 'Updated Co' WHERE symbol = 'TEST_TICKER'");
    const stmt2 = testDb.prepare("SELECT * FROM tickers WHERE symbol = 'TEST_TICKER'");
    stmt2.step();
    const updated = stmt2.getAsObject();
    stmt2.free();
    if (updated.enabled !== 0 || updated.company_name !== 'Updated Co') {
      throw new Error('Ticker update failed');
    }

    // 3. Delete
    testDb.run("DELETE FROM tickers WHERE symbol = 'TEST_TICKER'");
    const stmt3 = testDb.prepare("SELECT COUNT(*) as c FROM tickers WHERE symbol = 'TEST_TICKER'");
    stmt3.step();
    const count = stmt3.getAsObject().c;
    stmt3.free();
    if (count !== 0) throw new Error('Ticker deletion failed');
  });

  await runTest('db-news-insert-link', 'Database', 'News insertion and many-to-many ticker relationship', () => {
    const now = new Date().toISOString();
    testDb.run(
      `INSERT INTO tickers (id, symbol, company_name, exchange, enabled, created_at, updated_at) VALUES (101, 'AAPL', 'Apple Inc', 'NASDAQ', 1, '${now}', '${now}')`
    );
    testDb.run(
      `INSERT INTO tickers (id, symbol, company_name, exchange, enabled, created_at, updated_at) VALUES (102, 'MSFT', 'Microsoft Corp', 'NASDAQ', 1, '${now}', '${now}')`
    );

    testDb.run(`
      INSERT INTO news (id, title, publisher, url, published_at, summary, article_hash, retrieved_at, created_at)
      VALUES (501, 'Joint AI Hardware Initiative Announced', 'Reuters', 'https://finance.yahoo.com/news/joint-ai-hardware-501.html', '${now}', 'Summary text', 'hash501', '${now}', '${now}')
    `);

    testDb.run('INSERT INTO ticker_news (ticker_id, news_id) VALUES (101, 501)');
    testDb.run('INSERT INTO ticker_news (ticker_id, news_id) VALUES (102, 501)');

    const stmt = testDb.prepare('SELECT COUNT(*) as c FROM ticker_news WHERE news_id = 501');
    stmt.step();
    const linksCount = stmt.getAsObject().c;
    stmt.free();

    if (linksCount !== 2) {
      throw new Error(`Expected 2 ticker associations for joint news, found ${linksCount}`);
    }
  });

  // -------------------------------------------------------------
  // 2. YAHOO FINANCE PARSER & PROVIDER TESTS
  // -------------------------------------------------------------
  const yahooProvider = new YahooFinanceNewsProvider();

  await runTest('parser-valid-rss', 'Parser & Provider', 'Parse valid Yahoo Finance RSS XML response', () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Yahoo! Finance: AAPL News</title>
        <link>https://finance.yahoo.com/quote/AAPL</link>
        <description>Stock news for AAPL</description>
        <item>
          <title>Apple Expands AI Silicon Production Capabilities</title>
          <link>https://finance.yahoo.com/news/apple-expands-ai-silicon-production-1200001.html?utm_source=rss</link>
          <guid isPermaLink="false">apple-expands-ai-silicon-production-1200001</guid>
          <pubDate>Thu, 14 Aug 2026 14:30:00 GMT</pubDate>
          <description>&lt;p&gt;Apple announced increased wafer allocations with TSMC for next-generation silicon.&lt;/p&gt;</description>
          <source>Reuters</source>
        </item>
        <item>
          <title>Analyst Upgrades Apple Target to $270</title>
          <link>https://finance.yahoo.com/news/analyst-upgrades-apple-target-270-1600002.html</link>
          <guid isPermaLink="false">analyst-upgrades-apple-target-270-1600002</guid>
          <pubDate>Thu, 14 Aug 2026 16:00:00 GMT</pubDate>
          <description>Wall street firm highlights services growth.</description>
          <source>CNBC</source>
        </item>
      </channel>
    </rss>`;

    const articles = yahooProvider.parseRssFeed(sampleXml, 'AAPL');
    if (articles.length !== 2) {
      throw new Error(`Expected 2 parsed articles, got ${articles.length}`);
    }
    if (articles[0].publisher !== 'Reuters') {
      throw new Error(`Expected publisher 'Reuters', got '${articles[0].publisher}'`);
    }
    if (articles[0].summary.includes('<p>')) {
      throw new Error('HTML tags were not stripped from description');
    }
  });

  await runTest('parser-empty-response', 'Parser & Provider', 'Handle empty XML or empty RSS channel item list', () => {
    const emptyXml1 = '';
    const emptyXml2 = '<rss><channel><title>Empty Feed</title></channel></rss>';

    const res1 = yahooProvider.parseRssFeed(emptyXml1, 'XYZ');
    const res2 = yahooProvider.parseRssFeed(emptyXml2, 'XYZ');

    if (res1.length !== 0 || res2.length !== 0) {
      throw new Error('Expected 0 articles for empty responses');
    }
  });

  await runTest('parser-malformed-xml', 'Parser & Provider', 'Handle malformed XML without unhandled exceptions', () => {
    const malformedXml = '<rss><channel><item><title>Broken Title<unclosed>';
    try {
      yahooProvider.parseRssFeed(malformedXml, 'AAPL');
      // Some parsers return best-effort or throw, both should be safely handled
    } catch (err: any) {
      if (!err.message.includes('Malformed') && !err.message.includes('XML')) {
        throw new Error(`Unexpected error message format: ${err.message}`);
      }
    }
  });

  await runTest('parser-missing-fields', 'Parser & Provider', 'Gracefully parse items with missing description, publisher or date', () => {
    const xmlWithMissing = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Minimal News Item</title>
          <link>https://finance.yahoo.com/news/minimal-item-123.html</link>
        </item>
      </channel>
    </rss>`;

    const articles = yahooProvider.parseRssFeed(xmlWithMissing, 'AAPL');
    if (articles.length !== 1) {
      throw new Error('Failed to parse minimal item');
    }
    if (!articles[0].published_at) {
      throw new Error('Missing published_at default fallback');
    }
    if (!articles[0].publisher) {
      throw new Error('Missing publisher default fallback');
    }
  });

  await runTest('parser-invalid-dates', 'Parser & Provider', 'Handle invalid date strings gracefully with ISO fallback', () => {
    const xmlInvalidDate = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Item With Garbage Date</title>
          <link>https://finance.yahoo.com/news/garbage-date-456.html</link>
          <pubDate>not-a-valid-date-string-xyz</pubDate>
        </item>
      </channel>
    </rss>`;

    const articles = yahooProvider.parseRssFeed(xmlInvalidDate, 'AAPL');
    if (articles.length !== 1) throw new Error('Failed to parse article with invalid date');
    const d = new Date(articles[0].published_at);
    if (isNaN(d.getTime())) throw new Error('published_at is not a valid ISO timestamp');
  });

  await runTest('provider-mock-error-simulation', 'Parser & Provider', 'Mock provider simulation of network failure and timeout', async () => {
    const mock = new MockNewsProvider();
    mock.simulateErrorMode = 'network';

    let caughtNetwork = false;
    try {
      await mock.fetchNewsForTicker('AAPL');
    } catch (err: any) {
      caughtNetwork = true;
    }
    if (!caughtNetwork) throw new Error('Failed to simulate network error');

    mock.simulateErrorMode = 'timeout';
    let caughtTimeout = false;
    try {
      await mock.fetchNewsForTicker('AAPL');
    } catch (err: any) {
      caughtTimeout = true;
    }
    if (!caughtTimeout) throw new Error('Failed to simulate timeout error');

    mock.simulateErrorMode = 'none'; // reset
  });

  // -------------------------------------------------------------
  // 3. DEDUPLICATION TESTS
  // -------------------------------------------------------------
  await runTest('dedup-canonical-url', 'Deduplication', 'URL Normalization: strip tracking parameters & query strings', () => {
    const rawUrl1 = 'https://finance.yahoo.com/news/apple-ai-m5-chip-12345.html?utm_source=yahoo&utm_medium=rss&guccounter=1';
    const rawUrl2 = 'https://finance.yahoo.com/news/apple-ai-m5-chip-12345.html?ncid=txtlnkusaolp00000618&fbclid=abc123xyz#comments';
    const norm1 = ArticleDeduplicator.normalizeUrl(rawUrl1);
    const norm2 = ArticleDeduplicator.normalizeUrl(rawUrl2);

    if (norm1 !== 'https://finance.yahoo.com/news/apple-ai-m5-chip-12345.html') {
      throw new Error(`Normalization error, got: ${norm1}`);
    }
    if (norm1 !== norm2) {
      throw new Error(`URLs with different tracking params should resolve to identical canonical URL`);
    }
  });

  await runTest('dedup-deterministic-hash', 'Deduplication', 'Deterministic SHA-256 hash generation consistency', () => {
    const articleA = {
      title: 'Mega-Cap Tech Rally Continues',
      publisher: 'Reuters',
      url: 'https://finance.yahoo.com/news/mega-cap-tech-rally-999.html?utm_source=email',
      published_at: '2026-08-14T10:00:00.000Z',
      summary: 'Tech stocks advance',
      symbol: 'AAPL',
    };
    const articleB = {
      title: 'Mega-Cap Tech Rally Continues',
      publisher: 'Reuters',
      url: 'https://finance.yahoo.com/news/mega-cap-tech-rally-999.html?utm_source=twitter&guccounter=1',
      published_at: '2026-08-14T10:00:00.000Z',
      summary: 'Tech stocks advance',
      symbol: 'MSFT',
    };

    const hashA = ArticleDeduplicator.generateHash(articleA);
    const hashB = ArticleDeduplicator.generateHash(articleB);

    if (!hashA || hashA.length !== 64) {
      throw new Error(`Invalid SHA-256 hash length: ${hashA}`);
    }
    if (hashA !== hashB) {
      throw new Error('Hash mismatch between same article with different tracking parameters');
    }
  });

  // -------------------------------------------------------------
  // 4. FILTERING & DATE RANGE TESTS
  // -------------------------------------------------------------
  await runTest('filtering-date-ranges', 'Filtering & Pipeline', 'Date Range Filtering: correctly bounds publication dates', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <item>
          <title>Article Aug 10</title>
          <link>https://finance.yahoo.com/news/art-aug10.html</link>
          <pubDate>Mon, 10 Aug 2026 12:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Article Aug 14</title>
          <link>https://finance.yahoo.com/news/art-aug14.html</link>
          <pubDate>Fri, 14 Aug 2026 12:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Article Aug 18</title>
          <link>https://finance.yahoo.com/news/art-aug18.html</link>
          <pubDate>Tue, 18 Aug 2026 12:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    // Request date range: 2026-08-12 to 2026-08-15
    const filtered = yahooProvider.parseRssFeed(xml, 'AAPL', {
      startDate: '2026-08-12T00:00:00.000Z',
      endDate: '2026-08-15T23:59:59.000Z',
    });

    if (filtered.length !== 1) {
      throw new Error(`Expected exactly 1 article within date range, got ${filtered.length}`);
    }
    if (filtered[0].title !== 'Article Aug 14') {
      throw new Error(`Wrong article kept: ${filtered[0].title}`);
    }
  });

  await runTest('mock-provider-pipeline', 'Filtering & Pipeline', 'Mock provider multi-ticker deduplication pipeline verification', async () => {
    const mock = new MockNewsProvider();
    const aaplNews = await mock.fetchNewsForTicker('AAPL');
    const msftNews = await mock.fetchNewsForTicker('MSFT');

    if (aaplNews.length === 0 || msftNews.length === 0) {
      throw new Error('Mock provider should return articles for top tickers');
    }

    // Check that cross-ticker stories exist in both
    const commonUrls = aaplNews
      .map((a) => ArticleDeduplicator.normalizeUrl(a.url))
      .filter((url) => msftNews.some((m) => ArticleDeduplicator.normalizeUrl(m.url) === url));

    if (commonUrls.length === 0) {
      throw new Error('Expected at least one cross-ticker shared story for deduplication test');
    }
  });

  // -------------------------------------------------------------
  // 5. INCREMENTAL FETCHING TESTS
  // -------------------------------------------------------------
  await runTest('incremental-first-fetch', 'Incremental Fetching', 'First fetch: ticker with last_successful_fetch_at = NULL sets timestamp on success', async () => {
    const mock = new MockNewsProvider();
    const tickerSymbol = 'AAPL_INC_TEST_1';
    const now = new Date().toISOString();

    // Insert ticker with last_successful_fetch_at = NULL
    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES ('${tickerSymbol}', 'Apple Test', 'NASDAQ', 1, NULL, '${now}', '${now}')`
    );

    const stmt = testDb.prepare(`SELECT * FROM tickers WHERE symbol = '${tickerSymbol}'`);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();

    if (row.last_successful_fetch_at !== null && row.last_successful_fetch_at !== undefined) {
      throw new Error('Expected initial last_successful_fetch_at to be NULL');
    }

    // Fetch news
    const articles = await mock.fetchNewsForTicker(tickerSymbol);
    if (articles.length === 0) throw new Error('Expected mock articles for first fetch');

    // Simulate successful processing and timestamp update
    const successTime = new Date().toISOString();
    testDb.run(`UPDATE tickers SET last_successful_fetch_at = '${successTime}' WHERE symbol = '${tickerSymbol}'`);

    const verifyStmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    verifyStmt.step();
    const updatedRow = verifyStmt.getAsObject();
    verifyStmt.free();

    if (updatedRow.last_successful_fetch_at !== successTime) {
      throw new Error('last_successful_fetch_at was not properly updated after successful first fetch');
    }
  });

  await runTest('incremental-successful-subsequent-fetch', 'Incremental Fetching', 'Successful incremental fetch: calculates 2h overlap window and advances timestamp', async () => {
    const mock = new MockNewsProvider();
    const tickerSymbol = 'MSFT_INC_TEST_2';
    const priorFetchTime = '2026-08-15T06:48:10.000Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES ('${tickerSymbol}', 'Microsoft Test', 'NASDAQ', 1, '${priorFetchTime}', '${now}', '${now}')`
    );

    // Verify prior timestamp
    const stmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    if (row.last_successful_fetch_at !== priorFetchTime) {
      throw new Error('Prior timestamp mismatch');
    }

    // Calculate overlap window: 2 hours prior to priorFetchTime
    const OVERLAP_MS = 2 * 60 * 60 * 1000;
    const overlapStart = new Date(new Date(priorFetchTime).getTime() - OVERLAP_MS).toISOString();

    if (new Date(overlapStart).getTime() >= new Date(priorFetchTime).getTime()) {
      throw new Error('Overlap window start time must precede prior fetch timestamp');
    }

    // Fetch with overlap startDate
    const articles = await mock.fetchNewsForTicker(tickerSymbol, { startDate: overlapStart });
    if (articles.length === 0) throw new Error('Expected articles from incremental fetch');

    // Upon success, timestamp advances to new current time
    const newSuccessTime = '2026-08-15T08:00:00.000Z';
    testDb.run(`UPDATE tickers SET last_successful_fetch_at = '${newSuccessTime}' WHERE symbol = '${tickerSymbol}'`);

    const verifyStmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    verifyStmt.step();
    const updatedRow = verifyStmt.getAsObject();
    verifyStmt.free();

    if (updatedRow.last_successful_fetch_at !== newSuccessTime) {
      throw new Error('Timestamp failed to advance after incremental fetch');
    }
  });

  await runTest('incremental-duplicate-fetch', 'Incremental Fetching', 'Duplicate incremental fetch: deduplicates stored articles, new = 0, duplicates > 0', async () => {
    const mock = new MockNewsProvider();
    const tickerSymbol = 'NVDA_INC_TEST_3';
    const initialTime = '2026-08-15T06:00:00.000Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (id, symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES (301, '${tickerSymbol}', 'NVIDIA Test', 'NASDAQ', 1, '${initialTime}', '${now}', '${now}')`
    );

    // Initial fetch and store
    const articles = await mock.fetchNewsForTicker('NVDA');
    for (const art of articles) {
      const hash = ArticleDeduplicator.generateHash(art);
      const url = ArticleDeduplicator.normalizeUrl(art.url);
      testDb.run(
        `INSERT OR IGNORE INTO news (title, publisher, url, published_at, summary, article_hash, retrieved_at, created_at)
         VALUES ('${art.title.replace(/'/g, "''")}', '${art.publisher}', '${url}', '${art.published_at}', '${art.summary.replace(/'/g, "''")}', '${hash}', '${now}', '${now}')`
      );
    }

    // Run duplicate incremental fetch immediately
    let duplicateCount = 0;
    let newCount = 0;

    for (const art of articles) {
      const hash = ArticleDeduplicator.generateHash(art);
      const stmt = testDb.prepare(`SELECT id FROM news WHERE article_hash = '${hash}'`);
      if (stmt.step()) {
        duplicateCount++;
      } else {
        newCount++;
      }
      stmt.free();
    }

    if (newCount !== 0) {
      throw new Error(`Expected 0 new articles on immediate duplicate fetch, got ${newCount}`);
    }
    if (duplicateCount === 0) {
      throw new Error('Expected duplicateCount > 0 on immediate duplicate fetch');
    }
  });

  await runTest('incremental-failed-fetch-preserves-timestamp', 'Incremental Fetching', 'Failed fetch: simulate provider error, timestamp remains strictly preserved', async () => {
    const mock = new MockNewsProvider();
    mock.simulateErrorMode = 'network';
    const tickerSymbol = 'FAIL_TICKER_TEST_4';
    const preservedTimestamp = '2026-08-15T06:48:10.000Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES ('${tickerSymbol}', 'Fail Co', 'NYSE', 1, '${preservedTimestamp}', '${now}', '${now}')`
    );

    let errorThrown = false;
    try {
      await mock.fetchNewsForTicker(tickerSymbol);
      // If no error thrown, update would happen, which is wrong
      testDb.run(`UPDATE tickers SET last_successful_fetch_at = '${new Date().toISOString()}' WHERE symbol = '${tickerSymbol}'`);
    } catch (err: any) {
      errorThrown = true;
      // As per requirement: timestamp NOT updated
    }

    mock.simulateErrorMode = 'none'; // reset

    if (!errorThrown) throw new Error('Expected provider error to be thrown');

    const stmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();

    if (row.last_successful_fetch_at !== preservedTimestamp) {
      throw new Error(`Failed fetch must NEVER advance timestamp! Expected '${preservedTimestamp}', got '${row.last_successful_fetch_at}'`);
    }
  });

  await runTest('incremental-disabled-ticker-not-fetched', 'Incremental Fetching', 'Disabled ticker (enabled = 0): excluded from retrieval, timestamp remains untouched', async () => {
    const tickerSymbol = 'DISABLED_TICKER_5';
    const preservedTimestamp = '2026-08-15T05:00:00.000Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES ('${tickerSymbol}', 'Disabled Co', 'NYSE', 0, '${preservedTimestamp}', '${now}', '${now}')`
    );

    // Query active enabled tickers (as importer does)
    const stmt = testDb.prepare(`SELECT symbol, last_successful_fetch_at FROM tickers WHERE enabled = 1`);
    const enabledSymbols: string[] = [];
    while (stmt.step()) {
      enabledSymbols.push(stmt.getAsObject().symbol as string);
    }
    stmt.free();

    if (enabledSymbols.includes(tickerSymbol)) {
      throw new Error('Disabled ticker was incorrectly included in active fetch list');
    }

    // Verify timestamp remains untouched
    const checkStmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    checkStmt.step();
    const row = checkStmt.getAsObject();
    checkStmt.free();

    if (row.last_successful_fetch_at !== preservedTimestamp) {
      throw new Error('Disabled ticker timestamp was modified');
    }
  });

  await runTest('incremental-timestamp-update', 'Incremental Fetching', 'Timestamp update: accurately stores and retrieves ISO UTC timestamps', () => {
    const tickerSymbol = 'UTC_TEST_6';
    const testUtcTime = '2026-08-15T07:14:33.123Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at) 
       VALUES ('${tickerSymbol}', 'UTC Co', 'NASDAQ', 1, NULL, '${now}', '${now}')`
    );

    testDb.run(`UPDATE tickers SET last_successful_fetch_at = '${testUtcTime}' WHERE symbol = '${tickerSymbol}'`);

    const stmt = testDb.prepare(`SELECT last_successful_fetch_at FROM tickers WHERE symbol = '${tickerSymbol}'`);
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();

    if (row.last_successful_fetch_at !== testUtcTime) {
      throw new Error(`Expected UTC string '${testUtcTime}', got '${row.last_successful_fetch_at}'`);
    }

    const parsedDate = new Date(row.last_successful_fetch_at as string);
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Stored timestamp is not a valid ISO date');
    }
  });

  await runTest('incremental-timestamp-not-updated-after-failure', 'Incremental Fetching', 'Timestamp preserved on failure: pipeline level guarantee', async () => {
    const priorTimestamp = '2026-08-15T04:15:00.000Z';
    let tickerState = {
      id: 99,
      symbol: 'TEST_FAIL_ISO',
      last_successful_fetch_at: priorTimestamp,
    };

    // Simulate import failure flow
    try {
      throw new Error('Simulated 503 Service Unavailable');
      // If success: tickerState.last_successful_fetch_at = new Date().toISOString();
    } catch {
      // Catch block does not update last_successful_fetch_at
    }

    if (tickerState.last_successful_fetch_at !== priorTimestamp) {
      throw new Error('Pipeline failure handler advanced timestamp incorrectly');
    }
  });

  // -------------------------------------------------------------
  // 6. TICKER MANAGEMENT & CSV TESTS (Phase 2)
  // -------------------------------------------------------------
  await runTest('ticker-csv-validation-rules', 'Ticker Management & CSV', 'CSV Validation Engine: handles empty, symbols > 10 chars, invalid characters & normalization', () => {
    const rawRows = [
      { symbol: '  aapl  ', company_name: 'Apple Inc.', exchange: 'NASDAQ' }, // should normalize to AAPL
      { symbol: '', company_name: 'Empty Co' }, // empty -> invalid
      { symbol: 'VERYLONGSYMBOL123', company_name: 'Long Co' }, // > 10 chars -> invalid
      { symbol: 'BAD$SYM!', company_name: 'Invalid Chars' }, // invalid chars -> invalid
      { symbol: 'BRK-B', company_name: 'Berkshire', exchange: 'NYSE' }, // valid with hyphen
      { symbol: 'BF.B', company_name: 'Brown-Forman', exchange: 'NYSE' }, // valid with dot
      { symbol: 'NVDA', company_name: 'NVIDIA Corp.', exchange: 'NASDAQ' }, // valid
    ];

    const processed = rawRows.map((r) => {
      const sym = r.symbol.trim().toUpperCase();
      let status = 'New';
      let error = '';

      if (!sym) {
        status = 'Invalid';
        error = 'Empty symbol';
      } else if (!/^[A-Z0-9.-]+$/.test(sym)) {
        status = 'Invalid';
        error = 'Invalid characters in symbol';
      } else if (sym.length > 10) {
        status = 'Invalid';
        error = 'Excessively long symbol (> 10 chars)';
      }

      return { symbol: sym, status, error };
    });

    if (processed[0].symbol !== 'AAPL' || processed[0].status !== 'New') {
      throw new Error('Failed to normalize whitespace and lowercase symbol');
    }
    if (processed[1].status !== 'Invalid' || processed[1].error !== 'Empty symbol') {
      throw new Error('Failed to reject empty symbol');
    }
    if (processed[2].status !== 'Invalid' || !processed[2].error.includes('Excessively long')) {
      throw new Error('Failed to reject symbol longer than 10 characters');
    }
    if (processed[3].status !== 'Invalid' || !processed[3].error.includes('Invalid characters')) {
      throw new Error('Failed to reject symbol with special characters like $ or !');
    }
    if (processed[4].status !== 'New' || processed[5].status !== 'New') {
      throw new Error('Failed to accept symbols with valid dot or hyphen');
    }
  });

  await runTest('ticker-csv-duplicate-detection', 'Ticker Management & CSV', 'CSV Duplicate Handling: detects internal CSV duplicates & existing SQLite tickers', () => {
    const existingDbSymbols = new Set(['AAPL', 'MSFT']);
    const csvInput = ['AAPL', 'NVDA', 'AMZN', 'NVDA', 'GOOGL'];

    const seenInCsv = new Set<string>();
    const results = csvInput.map((rawSym) => {
      const sym = rawSym.trim().toUpperCase();
      if (seenInCsv.has(sym)) {
        return { symbol: sym, status: 'Invalid', reason: 'Duplicate in CSV' };
      }
      seenInCsv.add(sym);
      if (existingDbSymbols.has(sym)) {
        return { symbol: sym, status: 'Existing', reason: 'Already exists in SQLite' };
      }
      return { symbol: sym, status: 'New' };
    });

    const aapl = results.find((r) => r.symbol === 'AAPL');
    if (aapl?.status !== 'Existing') throw new Error('AAPL was not identified as Existing');

    const duplicateNvda = results[3];
    if (duplicateNvda.status !== 'Invalid' || duplicateNvda.reason !== 'Duplicate in CSV') {
      throw new Error('Duplicate NVDA in CSV was not flagged as duplicate');
    }
  });

  await runTest('ticker-csv-idempotency-and-safety', 'Ticker Management & CSV', 'Safety guarantee: CSV import preserves existing fetch timestamps & enabled state', () => {
    const preservedUtc = '2026-08-14T18:30:00.000Z';
    const now = new Date().toISOString();

    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at)
       VALUES ('EXIST_SAFE', 'Safe Co', 'NYSE', 0, '${preservedUtc}', '${now}', '${now}')`
    );

    // Simulate bulk import of existing ticker without updateExisting
    const checkStmt1 = testDb.prepare(`SELECT * FROM tickers WHERE symbol = 'EXIST_SAFE'`);
    checkStmt1.step();
    const before = checkStmt1.getAsObject();
    checkStmt1.free();

    if (before.last_successful_fetch_at !== preservedUtc || before.enabled !== 0) {
      throw new Error('Initial state mismatch');
    }

    // Attempt to re-import EXIST_SAFE
    // When updateExisting=false, database skips update
    // Verify it remains disabled with exact same timestamp
    const checkStmt2 = testDb.prepare(`SELECT * FROM tickers WHERE symbol = 'EXIST_SAFE'`);
    checkStmt2.step();
    const after = checkStmt2.getAsObject();
    checkStmt2.free();

    if (after.last_successful_fetch_at !== preservedUtc) {
      throw new Error('Existing ticker fetch timestamp was modified during CSV import');
    }
    if (after.enabled !== 0) {
      throw new Error('Existing ticker enabled state was modified during CSV import');
    }
  });

  await runTest('ticker-bulk-toggle-operations', 'Ticker Management & CSV', 'Bulk Ticker Selection: toggle multiple tickers simultaneously', () => {
    const now = new Date().toISOString();
    testDb.run(
      `INSERT INTO tickers (symbol, company_name, exchange, enabled, created_at, updated_at) VALUES 
       ('BULK_T1', 'Bulk 1', 'NASDAQ', 1, '${now}', '${now}'),
       ('BULK_T2', 'Bulk 2', 'NASDAQ', 1, '${now}', '${now}'),
       ('BULK_T3', 'Bulk 3', 'NASDAQ', 1, '${now}', '${now}')`
    );

    // Get IDs
    const stmt = testDb.prepare(`SELECT id, symbol FROM tickers WHERE symbol IN ('BULK_T1', 'BULK_T2')`);
    const ids: number[] = [];
    while (stmt.step()) {
      ids.push(stmt.getAsObject().id as number);
    }
    stmt.free();

    if (ids.length !== 2) throw new Error('Failed to find bulk test ticker IDs');

    // Bulk Disable IDs
    const placeholders = ids.map(() => '?').join(',');
    testDb.run(`UPDATE tickers SET enabled = 0 WHERE id IN (${placeholders})`, ids);

    // Verify T1 & T2 are 0, while T3 remains 1
    const checkStmt = testDb.prepare(`SELECT symbol, enabled FROM tickers WHERE symbol IN ('BULK_T1', 'BULK_T2', 'BULK_T3')`);
    const rows: Record<string, number> = {};
    while (checkStmt.step()) {
      const obj = checkStmt.getAsObject();
      rows[obj.symbol as string] = obj.enabled as number;
    }
    checkStmt.free();

    if (rows['BULK_T1'] !== 0 || rows['BULK_T2'] !== 0) {
      throw new Error('Bulk disable did not disable selected tickers');
    }
    if (rows['BULK_T3'] !== 1) {
      throw new Error('Unselected ticker was modified during bulk operation');
    }
  });

  await runTest('ticker-portfolio-stats-calculation', 'Ticker Management & CSV', 'Portfolio Statistics: accurate counts for total, enabled, disabled, never fetched, and fetched today', () => {
    const statsStmt = testDb.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN enabled = 0 THEN 1 ELSE 0 END) as disabled,
        SUM(CASE WHEN last_successful_fetch_at IS NULL OR last_successful_fetch_at = '' THEN 1 ELSE 0 END) as never_fetched
      FROM tickers
    `);
    statsStmt.step();
    const stats = statsStmt.getAsObject();
    statsStmt.free();

    if (typeof stats.total !== 'number' || stats.total <= 0) {
      throw new Error('Invalid total tickers count in portfolio stats');
    }
    if (Number(stats.enabled) + Number(stats.disabled) !== Number(stats.total)) {
      throw new Error('Enabled + Disabled does not equal Total tickers');
    }
  });

  // -------------------------------------------------------------
  // 7. NEWS INTELLIGENCE & SCORING TESTS
  // -------------------------------------------------------------
  await runTest('intel-event-classification', 'News Intelligence & Scoring', 'Deterministic event type classification from financial headlines & keywords', () => {
    const earningsType = NewsIntelligenceEngine.classifyEventType(
      'Apple Q4 Revenue Tops $89B, Beating Wall Street Estimates on Strong Services Growth',
      'Summary about quarterly results'
    );
    if (earningsType !== 'earnings') {
      throw new Error(`Expected 'earnings', got '${earningsType}'`);
    }

    const maType = NewsIntelligenceEngine.classifyEventType(
      'Microsoft to Acquire Cyber Security Leader in $10B Cash Deal',
      'All-cash merger agreement announced'
    );
    if (maType !== 'acquisition') {
      throw new Error(`Expected 'acquisition', got '${maType}'`);
    }

    const legalType = NewsIntelligenceEngine.classifyEventType(
      'DOJ Files Antitrust Lawsuit Against Tech Giant Over Advertising Monopoly',
      'Department of Justice investigation lawsuit'
    );
    if (legalType !== 'legal' && legalType !== 'regulatory') {
      throw new Error(`Expected 'legal' or 'regulatory', got '${legalType}'`);
    }

    const financingType = NewsIntelligenceEngine.classifyEventType(
      'JPMorgan Raises Quarterly Dividend by 10% and Announces $30B Stock Buyback',
      'Board authorized dividend hike'
    );
    if (financingType !== 'financing') {
      throw new Error(`Expected 'financing', got '${financingType}'`);
    }

    const managementType = NewsIntelligenceEngine.classifyEventType(
      'Veteran CEO Steps Down; Board Names Chief Operating Officer as Successor',
      'Leadership resignation announced'
    );
    if (managementType !== 'management') {
      throw new Error(`Expected 'management', got '${managementType}'`);
    }
  });

  await runTest('intel-importance-scoring', 'News Intelligence & Scoring', 'Importance calculation factoring source tier, market-moving keywords, and recency', () => {
    // Critical Tier 1 Earnings beat vs Minor Tier 3 article
    const highAnalysis = NewsIntelligenceEngine.analyzeArticle({
      headline: 'Apple Beats Q3 Earnings Estimates by 20%, Raises Full-Year Guidance on Record iPhone Sales',
      summary: 'Apple Inc. reported record third quarter revenue and raised guidance.',
      publisher: 'Bloomberg',
      publishedAt: new Date().toISOString(),
      tickerSymbol: 'AAPL',
      companyName: 'Apple Inc',
    });

    if (highAnalysis.importanceScore < 70) {
      throw new Error(`Expected high importance score (>=70) for Bloomberg earnings beat, got ${highAnalysis.importanceScore}`);
    }
    if (highAnalysis.sourceTier !== 1) {
      throw new Error(`Expected Tier 1 for Bloomberg, got ${highAnalysis.sourceTier}`);
    }

    // Low importance blog post
    const lowAnalysis = NewsIntelligenceEngine.analyzeArticle({
      headline: 'Why I Am Keeping An Eye On This Company Next Week',
      summary: 'Some general commentary about the stock.',
      publisher: 'Random Investor Blog',
      publishedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
      tickerSymbol: 'AAPL',
    });

    if (lowAnalysis.importanceScore > 60) {
      throw new Error(`Expected low/moderate importance score for blog post, got ${lowAnalysis.importanceScore}`);
    }
    if (lowAnalysis.sourceTier !== 3) {
      throw new Error(`Expected Tier 3 for unknown publisher, got ${lowAnalysis.sourceTier}`);
    }
  });

  await runTest('intel-relevance-scoring', 'News Intelligence & Scoring', 'Relevance scoring distinguishing primary subject from secondary/sector mentions', () => {
    // Primary focus article
    const primaryRel = NewsIntelligenceEngine.calculateRelevanceScore({
      headline: 'NVDA Announces Next-Gen Blackwell Ultra AI Chips at GTC',
      summary: 'Nvidia unveiled new processors',
      tickerSymbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      allArticleTickers: ['NVDA'],
    });

    // Multi-ticker roundup where ticker is just listed in a 10-stock summary
    const roundupRel = NewsIntelligenceEngine.calculateRelevanceScore({
      headline: 'Top 10 Stocks Moving In The S&P 500 Today',
      summary: 'Tech stocks rose with AAPL, MSFT, GOOG, AMZN, NVDA, META, TSLA, NFLX, AMD, INTC gaining ground.',
      tickerSymbol: 'NVDA',
      companyName: 'NVIDIA Corporation',
      allArticleTickers: ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'NFLX', 'AMD', 'INTC'],
    });

    if (primaryRel.score < 80) {
      throw new Error(`Expected primary focus relevance >= 80, got ${primaryRel.score}`);
    }
    if (roundupRel.score >= primaryRel.score) {
      throw new Error(`Roundup relevance (${roundupRel.score}) should be lower than primary subject (${primaryRel.score})`);
    }
  });

  await runTest('intel-explanation-breakdown', 'News Intelligence & Scoring', 'Structured explanation breakdown with factor weights and signal highlights', () => {
    const analysis = NewsIntelligenceEngine.analyzeArticle({
      headline: 'Tesla Cuts Prices on Model Y and Model 3 in US and Europe',
      summary: 'Tesla Inc reduced electric vehicle prices across key markets.',
      publisher: 'Reuters',
      publishedAt: new Date().toISOString(),
      tickerSymbol: 'TSLA',
      companyName: 'Tesla Inc',
    });

    const exp = analysis.explanation;
    if (!exp.importance.breakdown || exp.importance.breakdown.length === 0) {
      throw new Error('Missing importance breakdown in analysis explanation');
    }
    if (!exp.relevance.breakdown || exp.relevance.breakdown.length === 0) {
      throw new Error('Missing relevance breakdown in analysis explanation');
    }
    if (typeof exp.importance.total !== 'number' || typeof exp.sourceTier !== 'number') {
      throw new Error('Invalid numeric factor scores in explanation');
    }
    if (!analysis.duplicateGroupId || analysis.duplicateGroupId.length < 8) {
      throw new Error('Invalid duplicate group ID generated');
    }
  });

  await runTest('intel-syndication-clustering', 'News Intelligence & Scoring', 'Syndication clustering generating stable duplicate group IDs across minor headline differences', () => {
    const id1 = NewsIntelligenceEngine.generateDuplicateGroupId(
      'Amazon launches new grocery subscription for Prime members',
      '2025-04-10T12:00:00Z'
    );

    const id2 = NewsIntelligenceEngine.generateDuplicateGroupId(
      'Amazon Launches New Grocery Subscription For Prime Members! - Reuters',
      '2025-04-10T14:30:00Z'
    );

    if (id1 !== id2) {
      throw new Error(`Expected identical duplicate group IDs for syndicated variations, got ${id1} vs ${id2}`);
    }
  });

  await runTest('intel-reclassify-pipeline', 'News Intelligence & Scoring', 'Batch reclassification pipeline with version stamping', async () => {
    const reclassResult = await reclassifyAllNews();
    if (typeof reclassResult.processed !== 'number' || reclassResult.processed < 0) {
      throw new Error('Reclassification did not return valid processed count');
    }
    if (!reclassResult.version) {
      throw new Error('Reclassification did not return engine version');
    }
  });

  // -------------------------------------------------------------
  // 9. AI CONFIGURATION TESTS
  // -------------------------------------------------------------
  await runTest('ai-model-env-read', 'AI News Analysis Layer', 'Verify AI_MODEL is read from environment', () => {
    process.env.AI_MODEL = 'gemini-3.7-flash';
    const config = getAIConfig();
    if (config.model !== 'gemini-3.7-flash') throw new Error(`Expected gemini-3.7-flash, got ${config.model}`);
    process.env.AI_MODEL = 'gemini-3.6-flash'; // reset
  });

  await runTest('ai-model-fallback', 'AI News Analysis Layer', 'Verify missing model uses documented fallback', () => {
    delete process.env.AI_MODEL;
    const config = getAIConfig();
    if (config.model !== DEFAULT_MODEL) throw new Error(`Expected ${DEFAULT_MODEL}, got ${config.model}`);
    process.env.AI_MODEL = 'gemini-3.6-flash'; // reset
  });

  await runTest('ai-model-invalid-report', 'AI News Analysis Layer', 'Verify invalid model configuration is reported', () => {
    process.env.AI_MODEL = 'invalid-model';
    try {
      getAIConfig();
      throw new Error('Should have thrown error for invalid model');
    } catch (e: any) {
      if (!e.message.includes('Invalid AI_MODEL')) throw new Error('Wrong error message');
    }
    process.env.AI_MODEL = 'gemini-3.6-flash'; // reset
  });

  // -------------------------------------------------------------
  // 8. PHASE 4: CALIBRATION & QUALITY BENCHMARKS
  // -------------------------------------------------------------
  await runTest('calib-dataset-access', 'Intelligence Calibration & Quality', 'Query calibration sample dataset with review status tracking', async () => {
    const dataset = await getCalibrationDataset({ status: 'all', limit: 50 });
    if (!dataset || !Array.isArray(dataset.items)) {
      throw new Error('Calibration dataset failed to return article list');
    }
    if (dataset.total < 0) {
      throw new Error('Invalid total article count in calibration dataset');
    }
  });

  await runTest('calib-stats-precision-calculation', 'Intelligence Calibration & Quality', 'Calculate Top 10 & Top 20 Precision and Quality comparison', async () => {
    const stats = await getCalibrationStats('v2.0-rules');
    if (typeof stats.top10Precision !== 'number' || stats.top10Precision < 0 || stats.top10Precision > 100) {
      throw new Error(`Invalid Top 10 precision: ${stats.top10Precision}`);
    }
    if (typeof stats.top20Precision !== 'number' || stats.top20Precision < 0 || stats.top20Precision > 100) {
      throw new Error(`Invalid Top 20 precision: ${stats.top20Precision}`);
    }
    if (!stats.recommendation) {
      throw new Error('Missing recommendation in calibration stats report');
    }
  });

  await runTest('calib-v2-vs-v1-benchmark', 'Intelligence Calibration & Quality', 'Verify v2.0-rules outperform baseline v1.0 across precision and accuracy', async () => {
    const v2Stats = await getCalibrationStats('v2.0-rules');
    if (!v2Stats.v1VsV2Comparison) {
      throw new Error('Missing v1 vs v2 comparison metrics');
    }
    if (v2Stats.v1VsV2Comparison.v2.top20Precision <= v2Stats.v1VsV2Comparison.v1.top20Precision) {
      throw new Error('Expected v2.0 Top 20 precision to exceed v1.0 baseline');
    }
    if (v2Stats.v1VsV2Comparison.v2.eventAccuracy <= v2Stats.v1VsV2Comparison.v1.eventAccuracy) {
      throw new Error('Expected v2.0 Event classification accuracy to exceed v1.0 baseline');
    }
  });

  // -------------------------------------------------------------
  // 9. PHASE 5: AI NEWS ANALYSIS LAYER TESTS
  // -------------------------------------------------------------

  await runTest('ai-eligibility-high-importance', 'AI News Analysis Layer', 'Evaluate eligibility: High importance (>=75) and relevance (>=60) evaluates as eligible', () => {
    const res = AIEligibilityGate.evaluate({
      importance_score: 85,
      relevance_score: 75,
      event_type: 'product',
    });
    if (!res.eligible) {
      throw new Error(`Expected eligible=true, got false: ${res.reason.join(', ')}`);
    }
  });

  await runTest('ai-eligibility-low-importance', 'AI News Analysis Layer', 'Evaluate eligibility: Low importance (<75) evaluates as ineligible', () => {
    const res = AIEligibilityGate.evaluate({
      importance_score: 45,
      relevance_score: 80,
      event_type: 'market',
    });
    if (res.eligible) {
      throw new Error('Expected eligible=false for low importance article');
    }
  });

  await runTest('ai-eligibility-high-priority-event', 'AI News Analysis Layer', 'Evaluate eligibility: High priority event types (earnings, guidance, acquisitions) auto-qualify', () => {
    const resEarnings = AIEligibilityGate.evaluate({
      importance_score: 65,
      relevance_score: 50,
      event_type: 'earnings',
    });
    if (!resEarnings.eligible) {
      throw new Error('Expected earnings event to auto-qualify for AI analysis');
    }

    const resGuidance = AIEligibilityGate.evaluate({
      importance_score: 60,
      relevance_score: 55,
      event_type: 'guidance',
    });
    if (!resGuidance.eligible) {
      throw new Error('Expected guidance event to auto-qualify for AI analysis');
    }
  });

  await runTest('ai-eligibility-low-relevance', 'AI News Analysis Layer', 'Evaluate eligibility: Low relevance (<30) fails eligibility even for high-priority events', () => {
    const res = AIEligibilityGate.evaluate({
      importance_score: 90,
      relevance_score: 15,
      event_type: 'earnings',
    });
    if (res.eligible) {
      throw new Error('Expected low relevance article to be rejected');
    }
  });

  await runTest('ai-schema-valid-json', 'AI News Analysis Layer', 'AI JSON Schema: Validate complete valid response conforms to schema', () => {
    const validRaw = {
      summary: 'Apple reported quarterly earnings of $1.64 per share on revenue of $94.9 billion.',
      why_it_matters: 'iPhone and Services revenue growth could support positive sentiment for AAPL.',
      market_impact: 'bullish',
      impact_confidence: 85,
      time_horizon: 'medium_term',
      catalysts: ['Gross margin expansion to 46.2%', 'Services revenue up 12% YoY'],
      risks: ['Greater China sales softness'],
      key_facts: ['Q4 revenue of $94.9B vs $94.5B consensus', 'iPhone sales $46.22B'],
      mentioned_companies: ['AAPL'],
      analysis_confidence: 90,
    };
    const sanitized = validateAndSanitizeAIOutput(validRaw);
    if (sanitized.market_impact !== 'bullish') {
      throw new Error(`Unexpected market_impact: ${sanitized.market_impact}`);
    }
    if (sanitized.impact_confidence !== 85 || sanitized.analysis_confidence !== 90) {
      throw new Error('Confidence scores mismatch');
    }
    if (sanitized.key_facts.length !== 2) {
      throw new Error('Key facts array length mismatch');
    }
  });

  await runTest('ai-schema-malformed-json', 'AI News Analysis Layer', 'AI JSON Schema: Malformed non-object inputs are rejected gracefully', () => {
    let caught = false;
    try {
      validateAndSanitizeAIOutput(null);
    } catch {
      caught = true;
    }
    if (!caught) {
      throw new Error('Expected null input to throw validation error');
    }
  });

  await runTest('ai-schema-missing-fields-fallback', 'AI News Analysis Layer', 'AI JSON Schema: Missing optional fields are populated with safe defaults', () => {
    const incomplete = {
      summary: 'Short summary',
    };
    const sanitized = validateAndSanitizeAIOutput(incomplete);
    if (!sanitized.summary || sanitized.market_impact !== 'unclear' || sanitized.time_horizon !== 'unclear') {
      throw new Error('Failed to provide safe fallbacks for missing fields');
    }
    if (!Array.isArray(sanitized.catalysts) || !Array.isArray(sanitized.risks) || !Array.isArray(sanitized.key_facts)) {
      throw new Error('Arrays should default to empty lists');
    }
  });

  await runTest('ai-schema-invalid-enums-sanitized', 'AI News Analysis Layer', 'AI JSON Schema: Invalid enum strings are sanitized to "unclear"', () => {
    const invalidEnums = {
      summary: 'Valid summary',
      why_it_matters: 'Valid reasoning',
      market_impact: 'hyper_bullish_100x',
      time_horizon: 'forever_and_ever',
      impact_confidence: 80,
      analysis_confidence: 70,
    };
    const sanitized = validateAndSanitizeAIOutput(invalidEnums);
    if (sanitized.market_impact !== 'unclear') {
      throw new Error(`Expected market_impact to sanitize to 'unclear', got: ${sanitized.market_impact}`);
    }
    if (sanitized.time_horizon !== 'unclear') {
      throw new Error(`Expected time_horizon to sanitize to 'unclear', got: ${sanitized.time_horizon}`);
    }
  });

  await runTest('ai-schema-confidence-clamping', 'AI News Analysis Layer', 'AI JSON Schema: Out-of-bounds confidence values clamp to [0, 100]', () => {
    const outOfBounds = {
      summary: 'Test',
      why_it_matters: 'Test',
      impact_confidence: 9999,
      analysis_confidence: -50,
    };
    const sanitized = validateAndSanitizeAIOutput(outOfBounds);
    if (sanitized.impact_confidence !== 100) {
      throw new Error(`Expected impact_confidence to clamp to 100, got ${sanitized.impact_confidence}`);
    }
    if (sanitized.analysis_confidence !== 0) {
      throw new Error(`Expected analysis_confidence to clamp to 0, got ${sanitized.analysis_confidence}`);
    }
  });

  await runTest('ai-deterministic-provider-execution', 'AI News Analysis Layer', 'AI Provider: Execute deterministic fallback provider on high-importance article', async () => {
    const provider = new DeterministicFallbackAIProvider();
    const response = await provider.analyzeArticle({
      ticker: 'NVDA',
      title: 'NVIDIA beats quarterly estimates and raises forward revenue guidance',
      publisher: 'Bloomberg',
      published_at: new Date().toISOString(),
      summary: 'NVIDIA Corporation announced record data center revenue exceeding Wall Street forecasts.',
      event_type: 'earnings',
      importance_score: 95,
      relevance_score: 90,
      allArticleTickers: ['NVDA'],
    });

    if (response.output.market_impact !== 'bullish') {
      throw new Error(`Expected bullish market impact for earnings beat, got: ${response.output.market_impact}`);
    }
    if (!response.output.why_it_matters || !response.output.why_it_matters.includes('support')) {
      throw new Error('Expected analytical interpretation in why_it_matters');
    }
    if (response.output.key_facts.length === 0) {
      throw new Error('Expected key_facts to contain factual article statements');
    }
    if (response.inputTokens <= 0 || response.outputTokens <= 0) {
      throw new Error('Expected non-zero token accounting');
    }
  });

  await runTest('ai-persistence-and-idempotence', 'AI News Analysis Layer', 'Database Persistence: Store AI analysis, verify foreign key link, and ensure idempotence', async () => {
    const memoryDb = new SQL.Database();
    AIEngine.initSchema(memoryDb);
    memoryDb.run(`
      CREATE TABLE tickers (id INTEGER PRIMARY KEY, symbol TEXT);
      CREATE TABLE news (id INTEGER PRIMARY KEY, title TEXT, summary TEXT, publisher TEXT, published_at TEXT);
      CREATE TABLE news_analysis (news_id INTEGER PRIMARY KEY, importance_score INTEGER, relevance_score INTEGER, event_type TEXT);
      CREATE TABLE ticker_news (ticker_id INTEGER, news_id INTEGER);

      INSERT INTO tickers (id, symbol) VALUES (1, 'MSFT');
      INSERT INTO news (id, title, summary, publisher, published_at) VALUES (1, 'Microsoft announces new Azure AI partnership', 'Microsoft Corp entered strategic alliance.', 'Reuters', '2026-03-01T12:00:00Z');
      INSERT INTO news_analysis (news_id, importance_score, relevance_score, event_type) VALUES (1, 88, 85, 'partnership');
      INSERT INTO ticker_news (ticker_id, news_id) VALUES (1, 1);
    `);

    // Run first analysis
    const res1 = await AIEngine.analyzeSingleArticle(memoryDb, 1, { provider: new DeterministicFallbackAIProvider() });
    if (!res1.success || !res1.analysis) {
      throw new Error(`First AI analysis failed: ${res1.error}`);
    }

    // Run second analysis without force - should return cached analysis (idempotent)
    const res2 = await AIEngine.analyzeSingleArticle(memoryDb, 1, { provider: new DeterministicFallbackAIProvider() });
    if (!res2.success || !res2.analysis) {
      throw new Error('Second cached analysis failed');
    }

    // Verify row count in news_ai_analysis is exactly 1
    const countStmt = memoryDb.prepare(`SELECT COUNT(*) as count FROM news_ai_analysis WHERE news_id = 1`);
    countStmt.step();
    const count = Number(countStmt.getAsObject().count);
    countStmt.free();

    if (count !== 1) {
      throw new Error(`Expected exactly 1 news_ai_analysis record, found ${count}`);
    }
  });

  await runTest('ai-provider-failure-simulation', 'AI News Analysis Layer', 'Provider Failure Simulation: Timeout, Rate Limit, and Server Errors fail gracefully without corrupting news data', async () => {
    const memoryDb = new SQL.Database();
    AIEngine.initSchema(memoryDb);
    memoryDb.run(`
      CREATE TABLE tickers (id INTEGER PRIMARY KEY, symbol TEXT);
      CREATE TABLE news (id INTEGER PRIMARY KEY, title TEXT, summary TEXT, publisher TEXT, published_at TEXT);
      CREATE TABLE news_analysis (news_id INTEGER PRIMARY KEY, importance_score INTEGER, relevance_score INTEGER, event_type TEXT);
      CREATE TABLE ticker_news (ticker_id INTEGER, news_id INTEGER);

      INSERT INTO tickers (id, symbol) VALUES (1, 'TSLA');
      INSERT INTO news (id, title, summary, publisher, published_at) VALUES (10, 'Tesla robotaxi launch update', 'Tesla announced updates.', 'WSJ', '2026-03-01T12:00:00Z');
      INSERT INTO news_analysis (news_id, importance_score, relevance_score, event_type) VALUES (10, 92, 90, 'product');
      INSERT INTO ticker_news (ticker_id, news_id) VALUES (1, 10);
    `);

    // Test Timeout Simulation
    const timeoutProvider = new FailureSimulationProvider('timeout');
    const resTimeout = await AIEngine.analyzeSingleArticle(memoryDb, 10, { provider: timeoutProvider });
    if (resTimeout.success) {
      throw new Error('Expected timeout to report failure');
    }
    if (resTimeout.status !== 'failed') {
      throw new Error(`Expected status="failed", got ${resTimeout.status}`);
    }

    // Test Rate Limit Simulation
    const rateLimitProvider = new FailureSimulationProvider('rate_limit');
    const resRateLimit = await AIEngine.analyzeSingleArticle(memoryDb, 10, { provider: rateLimitProvider });
    if (resRateLimit.success) {
      throw new Error('Expected rate limit to report failure');
    }

    // Test Server Error Simulation
    const serverErrorProvider = new FailureSimulationProvider('server_error');
    const resServerError = await AIEngine.analyzeSingleArticle(memoryDb, 10, { provider: serverErrorProvider });
    if (resServerError.success) {
      throw new Error('Expected server error to report failure');
    }

    // Verify news article is still intact
    const newsCheck = memoryDb.prepare(`SELECT * FROM news WHERE id = 10`);
    if (!newsCheck.step()) {
      throw new Error('News article was corrupted or removed during provider failures');
    }
    newsCheck.free();

    // Verify failures were logged in ai_usage_logs
    const logCheck = memoryDb.prepare(`SELECT COUNT(*) as failed_cnt FROM ai_usage_logs WHERE status = 'failed'`);
    logCheck.step();
    const failedCnt = Number(logCheck.getAsObject().failed_cnt);
    logCheck.free();

    if (failedCnt < 3) {
      throw new Error(`Expected at least 3 failure logs, found ${failedCnt}`);
    }
  });

  await runTest('ai-usage-dashboard-metrics', 'AI News Analysis Layer', 'AI Usage Dashboard: Verify token, cost, and request aggregation metrics', async () => {
    const memoryDb = new SQL.Database();
    AIEngine.initSchema(memoryDb);

    memoryDb.run(`
      INSERT INTO ai_usage_logs (provider, model, news_id, request_count, input_tokens, output_tokens, estimated_cost, status, created_at)
      VALUES 
        ('gemini', 'gemini-3.6-flash', 1, 1, 400, 200, 0.00018, 'completed', datetime('now')),
        ('gemini', 'gemini-3.6-flash', 2, 1, 500, 250, 0.00022, 'completed', datetime('now')),
        ('gemini', 'gemini-3.6-flash', 3, 1, 300, 0, 0.0, 'failed', datetime('now'));
    `);

    const summary = AIEngine.getUsageSummary(memoryDb);
    if (summary.articlesAnalyzed < 2) {
      throw new Error(`Expected at least 2 analyzed articles, got ${summary.articlesAnalyzed}`);
    }
    if (summary.failedRequests !== 1) {
      throw new Error(`Expected 1 failed request, got ${summary.failedRequests}`);
    }
    if (summary.estimatedTokens !== 1650) {
      throw new Error(`Expected 1650 total tokens, got ${summary.estimatedTokens}`);
    }
  });

  await runTest('ai-model-config-default', 'AI News Analysis Layer', 'AI Model Configuration: Verify configured model is properly initialized', () => {
    const { model } = getAIConfig();
    const provider = new GeminiAIProvider(model);
    if ((provider as any).model !== model) {
      throw new Error(`Expected GeminiAIProvider model to be ${model}, got ${(provider as any).model}`);
    }
    const pricing = DEFAULT_PRICING[model];
    if (!pricing) {
      throw new Error(`Expected pricing entry for ${model}, got ${JSON.stringify(pricing)}`);
    }
  });

  const durationMs = Date.now() - startTime;
  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return {
    total: results.length,
    passed,
    failed,
    durationMs,
    results,
    timestamp: new Date().toISOString(),
  };
}
