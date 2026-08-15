import fs from 'fs';
import path from 'path';
import initSqlJs, { Database } from 'sql.js';
import { logger } from './services/logger.js';
import {
  Ticker,
  NewsArticle,
  ImportJobSummary,
  NewsAnalysis,
  CalibrationArticleItem,
  CalibrationReview,
  CalibrationStatsReport,
} from './types.js';
import { NewsIntelligenceEngine } from './services/intelligence.js';
import { CalibrationEngine } from './services/calibration.js';
import { AIEngine } from './services/aiEngine.js';
import { AIEligibilityGate } from './services/aiEligibility.js';
import { TickerSummaryEngine } from './services/tickerSummary.js';

let db: Database | null = null;
const DB_PATH = process.env.DATABASE_PATH || './data/news.db';

export async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const filebuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(filebuffer);
      logger.info(`Loaded SQLite database from ${DB_PATH}`);
    } catch (err: any) {
      logger.warn(`Failed to read database file, creating fresh database: ${err.message}`);
      db = new SQL.Database();
    }
  } else {
    logger.info(`Initializing new SQLite database at ${DB_PATH}`);
    db = new SQL.Database();
  }

  initSchema(db);
  CalibrationEngine.initSchema(db);
  AIEngine.initSchema(db);
  TickerSummaryEngine.initSchema(db);
  seedDefaultTickers(db);
  backfillUnclassifiedNews(db);
  recalculateSentimentScores(db);
  CalibrationEngine.seedRealisticCalibrationReviews(db);
  // seedInitialAIAnalyses(db);
  saveDbToDisk(db);

  return db;
}

function initSchema(database: Database) {
  database.run(`
    CREATE TABLE IF NOT EXISTS tickers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      company_name TEXT,
      exchange TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_successful_fetch_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news (
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

    CREATE TABLE IF NOT EXISTS ticker_news (
      ticker_id INTEGER NOT NULL,
      news_id INTEGER NOT NULL,
      PRIMARY KEY (ticker_id, news_id),
      FOREIGN KEY (ticker_id) REFERENCES tickers(id) ON DELETE CASCADE,
      FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      tickers_count INTEGER NOT NULL,
      articles_retrieved INTEGER NOT NULL,
      new_articles INTEGER NOT NULL,
      duplicates_skipped INTEGER NOT NULL,
      errors_count INTEGER NOT NULL,
      date_from TEXT,
      date_to TEXT,
      details_json TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS news_analysis (
      news_id INTEGER PRIMARY KEY,
      importance_score INTEGER NOT NULL,
      relevance_score INTEGER NOT NULL,
      sentiment_score INTEGER NOT NULL DEFAULT 50,
      event_type TEXT NOT NULL,
      source_tier INTEGER NOT NULL,
      duplicate_group_id TEXT,
      explanation_json TEXT NOT NULL,
      classification_version TEXT NOT NULL,
      classified_at TEXT NOT NULL,
      FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE
    );
  `);

  // Safe migration check for existing disk databases before creating indexes
  try {
    const tableInfo = database.exec(`PRAGMA table_info(tickers);`);
    if (tableInfo.length > 0 && tableInfo[0].values) {
      const colNames = tableInfo[0].values.map((v: any) => String(v[1]));
      if (!colNames.includes('last_successful_fetch_at')) {
        database.run(`ALTER TABLE tickers ADD COLUMN last_successful_fetch_at TEXT;`);
        logger.info('Migrated tickers table: added last_successful_fetch_at column.');
      }
    }

    const naInfo = database.exec(`PRAGMA table_info(news_analysis);`);
    if (naInfo.length > 0 && naInfo[0].values) {
      const naColNames = naInfo[0].values.map((v: any) => String(v[1]));
      if (!naColNames.includes('sentiment_score')) {
        database.run(`ALTER TABLE news_analysis ADD COLUMN sentiment_score INTEGER NOT NULL DEFAULT 50;`);
        logger.info('Migrated news_analysis table: added sentiment_score column.');
      }
    }
  } catch (err: any) {
    logger.warn(`Migration check note: ${err.message}`);
  }

  database.run(`
    CREATE INDEX IF NOT EXISTS idx_tickers_symbol ON tickers(symbol);
    CREATE INDEX IF NOT EXISTS idx_tickers_enabled ON tickers(enabled);
    CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_publisher ON news(publisher);
    CREATE INDEX IF NOT EXISTS idx_news_url ON news(url);
    CREATE INDEX IF NOT EXISTS idx_news_hash ON news(article_hash);
    CREATE INDEX IF NOT EXISTS idx_ticker_news_ticker ON ticker_news(ticker_id);
    CREATE INDEX IF NOT EXISTS idx_ticker_news_news ON ticker_news(news_id);
    CREATE INDEX IF NOT EXISTS idx_news_analysis_importance ON news_analysis(importance_score DESC);
    CREATE INDEX IF NOT EXISTS idx_news_analysis_relevance ON news_analysis(relevance_score DESC);
    CREATE INDEX IF NOT EXISTS idx_news_analysis_sentiment ON news_analysis(sentiment_score DESC);
    CREATE INDEX IF NOT EXISTS idx_news_analysis_event_type ON news_analysis(event_type);
    CREATE INDEX IF NOT EXISTS idx_news_analysis_duplicate_group ON news_analysis(duplicate_group_id);
  `);
}

function backfillUnclassifiedNews(database: Database) {
  try {
    const unanalyzedStmt = database.prepare(`
      SELECT n.id, n.title, n.summary, n.publisher, n.published_at
      FROM news n
      LEFT JOIN news_analysis na ON n.id = na.news_id
      WHERE na.news_id IS NULL
    `);
    const toAnalyze: Array<{ id: number; title: string; summary: string; publisher: string; published_at: string }> = [];
    while (unanalyzedStmt.step()) {
      const row = unanalyzedStmt.getAsObject() as any;
      toAnalyze.push({
        id: Number(row.id),
        title: String(row.title),
        summary: String(row.summary || ''),
        publisher: String(row.publisher || ''),
        published_at: String(row.published_at),
      });
    }
    unanalyzedStmt.free();

    if (toAnalyze.length > 0) {
      logger.info(`Backfilling intelligence classification for ${toAnalyze.length} unanalyzed news articles...`);
      for (const item of toAnalyze) {
        // Fetch tickers for item
        const tStmt = database.prepare(`
          SELECT t.symbol, t.company_name
          FROM ticker_news tn
          JOIN tickers t ON tn.ticker_id = t.id
          WHERE tn.news_id = $id
        `);
        tStmt.bind({ $id: item.id });
        const tickerSymbols: string[] = [];
        let primaryCompanyName = '';
        while (tStmt.step()) {
          const tRow = tStmt.getAsObject() as any;
          tickerSymbols.push(String(tRow.symbol));
          if (!primaryCompanyName && tRow.company_name) {
            primaryCompanyName = String(tRow.company_name);
          }
        }
        tStmt.free();

        const analysis = NewsIntelligenceEngine.analyzeArticle({
          headline: item.title,
          summary: item.summary,
          publisher: item.publisher,
          publishedAt: item.published_at,
          tickerSymbol: tickerSymbols[0],
          companyName: primaryCompanyName,
          allArticleTickers: tickerSymbols,
        });

        const insStmt = database.prepare(`
          INSERT OR REPLACE INTO news_analysis (news_id, importance_score, relevance_score, sentiment_score, event_type, source_tier, duplicate_group_id, explanation_json, classification_version, classified_at)
          VALUES ($news_id, $importance_score, $relevance_score, $sentiment_score, $event_type, $source_tier, $duplicate_group_id, $explanation_json, $classification_version, $classified_at)
        `);
        insStmt.run({
          $news_id: item.id,
          $importance_score: analysis.importanceScore,
          $relevance_score: analysis.relevanceScore,
          $sentiment_score: analysis.sentimentScore,
          $event_type: analysis.eventType,
          $source_tier: analysis.sourceTier,
          $duplicate_group_id: analysis.duplicateGroupId,
          $explanation_json: JSON.stringify(analysis.explanation),
          $classification_version: analysis.classificationVersion,
          $classified_at: new Date().toISOString(),
        });
        insStmt.free();
      }
      logger.info(`Backfilled intelligence classification for ${toAnalyze.length} articles.`);
    }
  } catch (err: any) {
    logger.warn(`Backfill note: ${err.message}`);
  }
}

function recalculateSentimentScores(database: Database) {
  try {
    const stmt = database.prepare(`
      SELECT n.id, n.title, n.summary, na.event_type, na.explanation_json
      FROM news n
      JOIN news_analysis na ON n.id = na.news_id
    `);
    const items: Array<{ id: number; title: string; summary: string; eventType: string; explanationJson: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      items.push({
        id: Number(row.id),
        title: String(row.title),
        summary: String(row.summary || ''),
        eventType: String(row.event_type || 'other'),
        explanationJson: String(row.explanation_json || '{}'),
      });
    }
    stmt.free();

    if (items.length > 0) {
      const updateStmt = database.prepare(`
        UPDATE news_analysis
        SET sentiment_score = $sentiment_score,
            explanation_json = $explanation_json
        WHERE news_id = $news_id
      `);

      for (const item of items) {
        const sentimentRes = NewsIntelligenceEngine.calculateSentimentScore({
          headline: item.title,
          summary: item.summary,
          eventType: item.eventType as any,
        });

        let explanation: any = {};
        try {
          explanation = JSON.parse(item.explanationJson);
        } catch {}

        explanation.sentiment = {
          total: sentimentRes.score,
          base: 50,
          breakdown: sentimentRes.breakdown,
        };

        updateStmt.run({
          $news_id: item.id,
          $sentiment_score: sentimentRes.score,
          $explanation_json: JSON.stringify(explanation),
        });
      }
      updateStmt.free();
      logger.info(`Recalculated deterministic sentiment scores for ${items.length} articles.`);
    }
  } catch (err: any) {
    logger.warn(`Sentiment recalculation note: ${err.message}`);
  }
}

export function saveDbToDisk(database?: Database) {
  const target = database || db;
  if (!target) return;
  try {
    const data = target.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err: any) {
    logger.error(`Error saving database to disk: ${err.message}`);
  }
}

const DEFAULT_TICKERS = [
  { symbol: 'AAPL', company_name: 'Apple Inc.', exchange: 'NASDAQ' },
  { symbol: 'MSFT', company_name: 'Microsoft Corporation', exchange: 'NASDAQ' },
  { symbol: 'NVDA', company_name: 'NVIDIA Corporation', exchange: 'NASDAQ' },
  { symbol: 'AMZN', company_name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', company_name: 'Alphabet Inc.', exchange: 'NASDAQ' },
  { symbol: 'META', company_name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
  { symbol: 'TSLA', company_name: 'Tesla Inc.', exchange: 'NASDAQ' },
  { symbol: 'JPM', company_name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
  { symbol: 'V', company_name: 'Visa Inc.', exchange: 'NYSE' },
  { symbol: 'WMT', company_name: 'Walmart Inc.', exchange: 'NYSE' },
  { symbol: 'AMD', company_name: 'Advanced Micro Devices, Inc.', exchange: 'NASDAQ' },
  { symbol: 'DIS', company_name: 'The Walt Disney Company', exchange: 'NYSE' },
  { symbol: 'NFLX', company_name: 'Netflix, Inc.', exchange: 'NASDAQ' },
  { symbol: 'BRK-B', company_name: 'Berkshire Hathaway Inc.', exchange: 'NYSE' },
  { symbol: 'LLY', company_name: 'Eli Lilly and Company', exchange: 'NYSE' },
];

function seedDefaultTickers(database: Database) {
  const stmt = database.prepare('SELECT COUNT(*) as count FROM tickers');
  let count = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    count = Number(row.count || 0);
  }
  stmt.free();

  if (count === 0) {
    logger.info('Seeding initial stock tickers...');
    const now = new Date().toISOString();
    const insertStmt = database.prepare(`
      INSERT INTO tickers (symbol, company_name, exchange, enabled, created_at, updated_at)
      VALUES ($symbol, $company_name, $exchange, 1, $created_at, $updated_at)
    `);

    for (const t of DEFAULT_TICKERS) {
      insertStmt.run({
        $symbol: t.symbol,
        $company_name: t.company_name,
        $exchange: t.exchange,
        $created_at: now,
        $updated_at: now,
      });
    }
    insertStmt.free();
    logger.info(`Seeded ${DEFAULT_TICKERS.length} initial stock tickers.`);
  }
}

// -------------------------------------------------------------
// Database Access Operations
// -------------------------------------------------------------

export async function getTickers(options?: { search?: string; enabledOnly?: boolean }): Promise<Ticker[]> {
  const database = await getDb();
  let query = `
    SELECT 
      t.id, 
      t.symbol, 
      t.company_name, 
      t.exchange, 
      t.enabled, 
      t.last_successful_fetch_at,
      t.created_at, 
      t.updated_at,
      COUNT(tn.news_id) as article_count
    FROM tickers t
    LEFT JOIN ticker_news tn ON t.id = tn.ticker_id
    WHERE 1=1
  `;
  const params: Record<string, any> = {};

  if (options?.enabledOnly) {
    query += ` AND t.enabled = 1`;
  }
  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    query += ` AND (t.symbol LIKE $search OR t.company_name LIKE $search OR t.exchange LIKE $search)`;
    params['$search'] = term;
  }

  query += ` GROUP BY t.id ORDER BY t.symbol ASC`;

  const stmt = database.prepare(query);
  stmt.bind(params);
  const rows: Ticker[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    rows.push({
      id: Number(row.id),
      symbol: String(row.symbol),
      company_name: String(row.company_name || ''),
      exchange: String(row.exchange || ''),
      enabled: Boolean(row.enabled),
      last_successful_fetch_at: row.last_successful_fetch_at ? String(row.last_successful_fetch_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      article_count: Number(row.article_count || 0),
    });
  }
  stmt.free();
  return rows;
}

export async function getTickerById(id: number): Promise<Ticker | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM tickers WHERE id = $id');
  stmt.bind({ $id: id });
  let ticker: Ticker | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    ticker = {
      id: Number(row.id),
      symbol: String(row.symbol),
      company_name: String(row.company_name || ''),
      exchange: String(row.exchange || ''),
      enabled: Boolean(row.enabled),
      last_successful_fetch_at: row.last_successful_fetch_at ? String(row.last_successful_fetch_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
  stmt.free();
  return ticker;
}

export async function getTickerBySymbol(symbol: string): Promise<Ticker | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM tickers WHERE symbol = $symbol COLLATE NOCASE');
  stmt.bind({ $symbol: symbol.toUpperCase() });
  let ticker: Ticker | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    ticker = {
      id: Number(row.id),
      symbol: String(row.symbol),
      company_name: String(row.company_name || ''),
      exchange: String(row.exchange || ''),
      enabled: Boolean(row.enabled),
      last_successful_fetch_at: row.last_successful_fetch_at ? String(row.last_successful_fetch_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
  stmt.free();
  return ticker;
}

export async function createTicker(data: {
  symbol: string;
  company_name?: string;
  exchange?: string;
  enabled?: boolean;
  last_successful_fetch_at?: string | null;
}): Promise<Ticker> {
  const database = await getDb();
  const now = new Date().toISOString();
  const symbol = data.symbol.trim().toUpperCase();
  const company_name = (data.company_name || '').trim();
  const exchange = (data.exchange || 'US').trim().toUpperCase();
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1;
  const last_successful_fetch_at = data.last_successful_fetch_at || null;

  const stmt = database.prepare(`
    INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at)
    VALUES ($symbol, $company_name, $exchange, $enabled, $last_successful_fetch_at, $created_at, $updated_at)
  `);
  stmt.run({
    $symbol: symbol,
    $company_name: company_name,
    $exchange: exchange,
    $enabled: enabled,
    $last_successful_fetch_at: last_successful_fetch_at,
    $created_at: now,
    $updated_at: now,
  });
  stmt.free();

  const idStmt = database.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const newId = Number(idStmt.getAsObject().id);
  idStmt.free();

  saveDbToDisk(database);
  return {
    id: newId,
    symbol,
    company_name,
    exchange,
    enabled: Boolean(enabled),
    last_successful_fetch_at,
    created_at: now,
    updated_at: now,
    article_count: 0,
  };
}

export async function updateTicker(
  id: number,
  data: {
    symbol?: string;
    company_name?: string;
    exchange?: string;
    enabled?: boolean;
    last_successful_fetch_at?: string | null;
  }
): Promise<Ticker | null> {
  const database = await getDb();
  const existing = await getTickerById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const symbol = data.symbol !== undefined ? data.symbol.trim().toUpperCase() : existing.symbol;
  const company_name = data.company_name !== undefined ? data.company_name.trim() : existing.company_name;
  const exchange = data.exchange !== undefined ? data.exchange.trim().toUpperCase() : existing.exchange;
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
  const last_successful_fetch_at =
    data.last_successful_fetch_at !== undefined ? data.last_successful_fetch_at : existing.last_successful_fetch_at;

  const stmt = database.prepare(`
    UPDATE tickers 
    SET symbol = $symbol, 
        company_name = $company_name, 
        exchange = $exchange, 
        enabled = $enabled, 
        last_successful_fetch_at = $last_successful_fetch_at,
        updated_at = $updated_at
    WHERE id = $id
  `);
  stmt.run({
    $id: id,
    $symbol: symbol,
    $company_name: company_name,
    $exchange: exchange,
    $enabled: enabled,
    $last_successful_fetch_at: last_successful_fetch_at,
    $updated_at: now,
  });
  stmt.free();

  saveDbToDisk(database);
  return {
    id,
    symbol,
    company_name,
    exchange,
    enabled: Boolean(enabled),
    last_successful_fetch_at,
    created_at: existing.created_at,
    updated_at: now,
  };
}

export async function updateTickerLastFetch(id: number, timestamp: string | null): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    UPDATE tickers 
    SET last_successful_fetch_at = $timestamp, updated_at = $now 
    WHERE id = $id
  `);
  stmt.run({ $id: id, $timestamp: timestamp, $now: now });
  stmt.free();
  saveDbToDisk(database);
}

export async function deleteTicker(id: number): Promise<boolean> {
  const database = await getDb();
  const stmt1 = database.prepare('DELETE FROM ticker_news WHERE ticker_id = $id');
  stmt1.run({ $id: id });
  stmt1.free();

  const stmt2 = database.prepare('DELETE FROM tickers WHERE id = $id');
  stmt2.run({ $id: id });
  stmt2.free();

  saveDbToDisk(database);
  return true;
}

export async function toggleAllTickers(enabled: boolean): Promise<number> {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    UPDATE tickers SET enabled = $enabled, updated_at = $updated_at
  `);
  stmt.run({ $enabled: enabled ? 1 : 0, $updated_at: now });
  stmt.free();

  saveDbToDisk(database);
  const tickers = await getTickers();
  return tickers.length;
}

export async function bulkToggleTickers(ids: number[], enabled: boolean): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const database = await getDb();
  const now = new Date().toISOString();
  let count = 0;

  for (const id of ids) {
    const stmt = database.prepare(`
      UPDATE tickers SET enabled = $enabled, updated_at = $updated_at WHERE id = $id
    `);
    stmt.run({ $id: id, $enabled: enabled ? 1 : 0, $updated_at: now });
    stmt.free();
    count++;
  }

  saveDbToDisk(database);
  return count;
}

export async function bulkCreateTickers(
  items: Array<{ symbol: string; company_name?: string; exchange?: string; enabled?: boolean }>,
  options: { updateExisting?: boolean; defaultEnabled?: boolean } = { updateExisting: false, defaultEnabled: true }
): Promise<{ added: number; updated: number; existingSkipped: number; errors: Array<{ symbol: string; error: string }> }> {
  const database = await getDb();
  let added = 0;
  let updated = 0;
  let existingSkipped = 0;
  const errors: Array<{ symbol: string; error: string }> = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const symbol = item.symbol?.trim().toUpperCase();
    if (!symbol) continue;

    try {
      const existing = await getTickerBySymbol(symbol);
      if (existing) {
        if (options.updateExisting) {
          // If explicitly requested to update company / exchange without touching enabled or last_successful_fetch_at
          const stmt = database.prepare(`
            UPDATE tickers
            SET company_name = COALESCE(NULLIF($company_name, ''), company_name),
                exchange = COALESCE(NULLIF($exchange, ''), exchange),
                updated_at = $updated_at
            WHERE id = $id
          `);
          stmt.run({
            $id: existing.id,
            $company_name: item.company_name ? item.company_name.trim() : existing.company_name,
            $exchange: item.exchange ? item.exchange.trim().toUpperCase() : existing.exchange,
            $updated_at: now,
          });
          stmt.free();
          updated++;
        } else {
          // Preserve existing ticker state completely untouched (idempotent)
          existingSkipped++;
        }
      } else {
        const isEnabled = item.enabled !== undefined ? (item.enabled ? 1 : 0) : (options.defaultEnabled !== false ? 1 : 0);
        const stmt = database.prepare(`
          INSERT INTO tickers (symbol, company_name, exchange, enabled, last_successful_fetch_at, created_at, updated_at)
          VALUES ($symbol, $company_name, $exchange, $enabled, NULL, $created_at, $updated_at)
        `);
        stmt.run({
          $symbol: symbol,
          $company_name: (item.company_name || '').trim(),
          $exchange: (item.exchange || 'US').trim().toUpperCase(),
          $enabled: isEnabled,
          $created_at: now,
          $updated_at: now,
        });
        stmt.free();
        added++;
      }
    } catch (err: any) {
      errors.push({ symbol, error: err.message });
    }
  }

  saveDbToDisk(database);
  return { added, updated, existingSkipped, errors };
}

export async function getTickerPortfolioStats(): Promise<{
  total: number;
  enabled: number;
  disabled: number;
  neverFetched: number;
  fetchedToday: number;
  fetchErrors: number;
}> {
  const database = await getDb();
  const tickers = await getTickers();
  const total = tickers.length;
  const enabled = tickers.filter((t) => t.enabled).length;
  const disabled = total - enabled;
  const neverFetched = tickers.filter((t) => !t.last_successful_fetch_at).length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const fetchedToday = tickers.filter((t) => t.last_successful_fetch_at && t.last_successful_fetch_at.startsWith(todayStr)).length;

  // Calculate fetch errors from recent import jobs (or tickers with recent errors)
  let fetchErrors = 0;
  try {
    const jobStmt = database.prepare(`
      SELECT details_json FROM import_jobs ORDER BY created_at DESC LIMIT 5
    `);
    const erroredSymbols = new Set<string>();
    while (jobStmt.step()) {
      const row = jobStmt.getAsObject();
      if (row.details_json) {
        const parsed = JSON.parse(row.details_json as string);
        if (parsed.errors && Array.isArray(parsed.errors)) {
          for (const err of parsed.errors) {
            if (err.symbol) erroredSymbols.add(err.symbol);
          }
        }
        if (parsed.tickerResults && Array.isArray(parsed.tickerResults)) {
          for (const res of parsed.tickerResults) {
            if (res.status === 'error' && (res.symbol || res.ticker)) {
              erroredSymbols.add(res.ticker || res.symbol);
            }
          }
        }
      }
    }
    jobStmt.free();
    fetchErrors = erroredSymbols.size;
  } catch {
    fetchErrors = 0;
  }

  return {
    total,
    enabled,
    disabled,
    neverFetched,
    fetchedToday,
    fetchErrors,
  };
}

// -------------------------------------------------------------
// News Operations
// -------------------------------------------------------------

export async function findArticleByHash(hash: string): Promise<NewsArticle | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM news WHERE article_hash = $hash');
  stmt.bind({ $hash: hash });
  let article: NewsArticle | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    article = {
      id: Number(row.id),
      title: String(row.title),
      publisher: String(row.publisher || ''),
      url: String(row.url),
      published_at: String(row.published_at),
      summary: String(row.summary || ''),
      article_hash: String(row.article_hash),
      retrieved_at: String(row.retrieved_at),
      created_at: String(row.created_at),
    };
  }
  stmt.free();
  return article;
}

export async function findArticleByUrl(url: string): Promise<NewsArticle | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM news WHERE url = $url');
  stmt.bind({ $url: url });
  let article: NewsArticle | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    article = {
      id: Number(row.id),
      title: String(row.title),
      publisher: String(row.publisher || ''),
      url: String(row.url),
      published_at: String(row.published_at),
      summary: String(row.summary || ''),
      article_hash: String(row.article_hash),
      retrieved_at: String(row.retrieved_at),
      created_at: String(row.created_at),
    };
  }
  stmt.free();
  return article;
}

export async function analyzeAndSaveArticle(
  database: Database,
  newsId: number,
  data: {
    title: string;
    summary: string;
    publisher: string;
    published_at: string;
    tickerSymbols?: string[];
    companyName?: string;
  },
  version?: string
): Promise<NewsAnalysis> {
  const symbols = data.tickerSymbols || [];
  let compName = data.companyName || '';

  if (!compName && symbols.length > 0) {
    try {
      const tStmt = database.prepare(`SELECT company_name FROM tickers WHERE symbol = $sym COLLATE NOCASE`);
      tStmt.bind({ $sym: symbols[0] });
      if (tStmt.step()) {
        compName = String(tStmt.getAsObject().company_name || '');
      }
      tStmt.free();
    } catch {}
  }

  const analysis = NewsIntelligenceEngine.analyzeArticle({
    headline: data.title,
    summary: data.summary,
    publisher: data.publisher,
    publishedAt: data.published_at,
    tickerSymbol: symbols[0],
    companyName: compName,
    allArticleTickers: symbols,
  }, version);

  const now = new Date().toISOString();
  const insStmt = database.prepare(`
    INSERT OR REPLACE INTO news_analysis (news_id, importance_score, relevance_score, sentiment_score, event_type, source_tier, duplicate_group_id, explanation_json, classification_version, classified_at)
    VALUES ($news_id, $importance_score, $relevance_score, $sentiment_score, $event_type, $source_tier, $duplicate_group_id, $explanation_json, $classification_version, $classified_at)
  `);
  insStmt.run({
    $news_id: newsId,
    $importance_score: analysis.importanceScore,
    $relevance_score: analysis.relevanceScore,
    $sentiment_score: analysis.sentimentScore,
    $event_type: analysis.eventType,
    $source_tier: analysis.sourceTier,
    $duplicate_group_id: analysis.duplicateGroupId,
    $explanation_json: JSON.stringify(analysis.explanation),
    $classification_version: analysis.classificationVersion,
    $classified_at: now,
  });
  insStmt.free();

  return {
    news_id: newsId,
    importance_score: analysis.importanceScore,
    relevance_score: analysis.relevanceScore,
    sentiment_score: analysis.sentimentScore,
    event_type: analysis.eventType,
    source_tier: analysis.sourceTier,
    duplicate_group_id: analysis.duplicateGroupId,
    explanation_json: JSON.stringify(analysis.explanation),
    explanation: analysis.explanation,
    classification_version: analysis.classificationVersion,
    classified_at: now,
  };
}

export async function insertArticle(data: {
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  summary: string;
  article_hash: string;
  retrieved_at: string;
}): Promise<NewsArticle> {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO news (title, publisher, url, published_at, summary, article_hash, retrieved_at, created_at)
    VALUES ($title, $publisher, $url, $published_at, $summary, $article_hash, $retrieved_at, $created_at)
  `);
  stmt.run({
    $title: data.title,
    $publisher: data.publisher,
    $url: data.url,
    $published_at: data.published_at,
    $summary: data.summary,
    $article_hash: data.article_hash,
    $retrieved_at: data.retrieved_at,
    $created_at: now,
  });
  stmt.free();

  const idStmt = database.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const newId = Number(idStmt.getAsObject().id);
  idStmt.free();

  // Run deterministic intelligence analysis and store in news_analysis table
  const analysis = await analyzeAndSaveArticle(database, newId, {
    title: data.title,
    summary: data.summary,
    publisher: data.publisher,
    published_at: data.published_at,
  });

  saveDbToDisk(database);
  return {
    id: newId,
    title: data.title,
    publisher: data.publisher,
    url: data.url,
    published_at: data.published_at,
    summary: data.summary,
    article_hash: data.article_hash,
    retrieved_at: data.retrieved_at,
    created_at: now,
    importance_score: analysis.importance_score,
    relevance_score: analysis.relevance_score,
    event_type: analysis.event_type,
    source_tier: analysis.source_tier,
    duplicate_group_id: analysis.duplicate_group_id,
    explanation: analysis.explanation,
    classification_version: analysis.classification_version,
    classified_at: analysis.classified_at,
  };
}

export async function linkTickerNews(tickerId: number, newsId: number): Promise<boolean> {
  const database = await getDb();
  try {
    const stmt = database.prepare(`
      INSERT OR IGNORE INTO ticker_news (ticker_id, news_id)
      VALUES ($ticker_id, $news_id)
    `);
    stmt.run({ $ticker_id: tickerId, $news_id: newsId });
    stmt.free();

    // Re-evaluate analysis with all linked tickers to ensure relevance score is accurate
    const nStmt = database.prepare(`SELECT title, summary, publisher, published_at FROM news WHERE id = $id`);
    nStmt.bind({ $id: newsId });
    if (nStmt.step()) {
      const row = nStmt.getAsObject() as any;
      const tStmt = database.prepare(`
        SELECT t.symbol, t.company_name
        FROM ticker_news tn
        JOIN tickers t ON tn.ticker_id = t.id
        WHERE tn.news_id = $id
      `);
      tStmt.bind({ $id: newsId });
      const symbols: string[] = [];
      let compName = '';
      while (tStmt.step()) {
        const tRow = tStmt.getAsObject() as any;
        symbols.push(String(tRow.symbol));
        if (!compName && tRow.company_name) compName = String(tRow.company_name);
      }
      tStmt.free();

      await analyzeAndSaveArticle(database, newsId, {
        title: String(row.title),
        summary: String(row.summary || ''),
        publisher: String(row.publisher || ''),
        published_at: String(row.published_at),
        tickerSymbols: symbols,
        companyName: compName,
      });
    }
    nStmt.free();

    saveDbToDisk(database);
    return true;
  } catch (err: any) {
    return false;
  }
}

export async function getNews(options?: {
  ticker?: string;
  tickers?: string[];
  startDate?: string;
  endDate?: string;
  source?: string;
  search?: string;
  sort?: 'newest' | 'oldest' | 'importance' | 'relevance' | 'sentiment_high' | 'sentiment_low';
  importance?: 'all' | 'critical' | 'high' | 'medium' | 'low';
  sentiment?: 'all' | 'bullish' | 'bearish' | 'neutral';
  eventType?: string;
  page?: number;
  limit?: number;
}): Promise<{ articles: NewsArticle[]; total: number; page: number; limit: number; totalPages: number }> {
  const database = await getDb();
  const page = Math.max(1, options?.page || 1);
  const limit = Math.max(1, Math.min(100, options?.limit || 20));
  const offset = (page - 1) * limit;

  const hasTickerFilter = (options?.ticker && options.ticker !== 'ALL') || (options?.tickers && options.tickers.length > 0);

  let baseQuery = `
    FROM news n
    LEFT JOIN news_analysis na ON n.id = na.news_id
    ${hasTickerFilter ? 'JOIN ticker_news tn ON n.id = tn.news_id JOIN tickers t ON tn.ticker_id = t.id' : ''}
    WHERE 1=1
  `;
  const params: Record<string, any> = {};

  if (options?.ticker && options.ticker !== 'ALL') {
    baseQuery += ` AND t.symbol = $ticker COLLATE NOCASE`;
    params['$ticker'] = options.ticker.toUpperCase();
  } else if (options?.tickers && options.tickers.length > 0) {
    const symPlaceholders = options.tickers.map((s, idx) => `$sym_${idx}`).join(',');
    baseQuery += ` AND t.symbol IN (${symPlaceholders})`;
    options.tickers.forEach((s, idx) => {
      params[`$sym_${idx}`] = s.toUpperCase();
    });
  }

  if (options?.startDate) {
    baseQuery += ` AND datetime(n.published_at) >= datetime($startDate)`;
    params['$startDate'] = options.startDate;
  }

  if (options?.endDate) {
    baseQuery += ` AND datetime(n.published_at) <= datetime($endDate)`;
    params['$endDate'] = options.endDate;
  }

  if (options?.source && options.source !== 'ALL') {
    baseQuery += ` AND n.publisher = $source`;
    params['$source'] = options.source;
  }

  if (options?.eventType && options.eventType !== 'ALL') {
    baseQuery += ` AND na.event_type = $eventType`;
    params['$eventType'] = options.eventType;
  }

  if (options?.importance && options.importance !== 'all') {
    if (options.importance === 'critical') {
      baseQuery += ` AND COALESCE(na.importance_score, 0) >= 90`;
    } else if (options.importance === 'high') {
      baseQuery += ` AND COALESCE(na.importance_score, 0) >= 75 AND COALESCE(na.importance_score, 0) < 90`;
    } else if (options.importance === 'medium') {
      baseQuery += ` AND COALESCE(na.importance_score, 0) >= 50 AND COALESCE(na.importance_score, 0) < 75`;
    } else if (options.importance === 'low') {
      baseQuery += ` AND COALESCE(na.importance_score, 0) < 50`;
    }
  }

  if (options?.sentiment && options.sentiment !== 'all') {
    if (options.sentiment === 'bullish') {
      baseQuery += ` AND COALESCE(na.sentiment_score, 50) >= 51`;
    } else if (options.sentiment === 'bearish') {
      baseQuery += ` AND COALESCE(na.sentiment_score, 50) <= 49`;
    } else if (options.sentiment === 'neutral') {
      baseQuery += ` AND COALESCE(na.sentiment_score, 50) = 50`;
    }
  }

  if (options?.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    baseQuery += ` AND (n.title LIKE $search OR n.summary LIKE $search OR n.publisher LIKE $search OR na.event_type LIKE $search)`;
    params['$search'] = term;
  }

  // Count total distinct articles matching filters
  const countStmt = database.prepare(`SELECT COUNT(DISTINCT n.id) as total ${baseQuery}`);
  countStmt.bind(params);
  countStmt.step();
  const total = Number(countStmt.getAsObject().total || 0);
  countStmt.free();

  let orderBy = 'n.published_at DESC';
  if (options?.sort === 'oldest') {
    orderBy = 'n.published_at ASC';
  } else if (options?.sort === 'importance') {
    orderBy = 'COALESCE(na.importance_score, 0) DESC, n.published_at DESC';
  } else if (options?.sort === 'relevance') {
    orderBy = 'COALESCE(na.relevance_score, 0) DESC, n.published_at DESC';
  } else if (options?.sort === 'sentiment_high') {
    orderBy = 'COALESCE(na.sentiment_score, 50) DESC, n.published_at DESC';
  } else if (options?.sort === 'sentiment_low') {
    orderBy = 'COALESCE(na.sentiment_score, 50) ASC, n.published_at DESC';
  }

  const dataQuery = `
    SELECT DISTINCT 
      n.id, 
      n.title, 
      n.publisher, 
      n.url, 
      n.published_at, 
      n.summary, 
      n.article_hash, 
      n.retrieved_at, 
      n.created_at,
      na.importance_score,
      na.relevance_score,
      na.sentiment_score,
      na.event_type,
      na.source_tier,
      na.duplicate_group_id,
      na.explanation_json,
      na.classification_version,
      na.classified_at
    ${baseQuery}
    ORDER BY ${orderBy}
    LIMIT $limit OFFSET $offset
  `;

  params['$limit'] = limit;
  params['$offset'] = offset;

  const dataStmt = database.prepare(dataQuery);
  dataStmt.bind(params);
  const articles: NewsArticle[] = [];

  while (dataStmt.step()) {
    const row = dataStmt.getAsObject() as any;
    let explanation: any = undefined;
    if (row.explanation_json) {
      try {
        explanation = JSON.parse(row.explanation_json);
      } catch {}
    }

    articles.push({
      id: Number(row.id),
      title: String(row.title),
      publisher: String(row.publisher || ''),
      url: String(row.url),
      published_at: String(row.published_at),
      summary: String(row.summary || ''),
      article_hash: String(row.article_hash),
      retrieved_at: String(row.retrieved_at),
      created_at: String(row.created_at),
      importance_score: row.importance_score !== null && row.importance_score !== undefined ? Number(row.importance_score) : undefined,
      relevance_score: row.relevance_score !== null && row.relevance_score !== undefined ? Number(row.relevance_score) : undefined,
      sentiment_score: row.sentiment_score !== null && row.sentiment_score !== undefined ? Number(row.sentiment_score) : undefined,
      event_type: row.event_type ? String(row.event_type) : undefined,
      source_tier: row.source_tier ? Number(row.source_tier) : undefined,
      duplicate_group_id: row.duplicate_group_id ? String(row.duplicate_group_id) : undefined,
      explanation,
      classification_version: row.classification_version ? String(row.classification_version) : undefined,
      classified_at: row.classified_at ? String(row.classified_at) : undefined,
      tickers: [],
    });
  }
  dataStmt.free();

  // Attach tickers and syndication duplicate counts to each article
  if (articles.length > 0) {
    const calIds = new Set<number>();
    try {
      const calStmt = database.prepare(`SELECT news_id FROM calibration_reviews`);
      while (calStmt.step()) {
        calIds.add(Number(calStmt.getAsObject().news_id));
      }
      calStmt.free();
    } catch {}

    const ids = articles.map((a) => a.id).join(',');
    const tickerStmt = database.prepare(`
      SELECT tn.news_id, t.symbol
      FROM ticker_news tn
      JOIN tickers t ON tn.ticker_id = t.id
      WHERE tn.news_id IN (${ids})
      ORDER BY t.symbol ASC
    `);
    const tickerMap: Record<number, string[]> = {};
    while (tickerStmt.step()) {
      const row = tickerStmt.getAsObject() as any;
      const nId = Number(row.news_id);
      if (!tickerMap[nId]) tickerMap[nId] = [];
      tickerMap[nId].push(String(row.symbol));
    }
    tickerStmt.free();

    // Duplicate group counts
    const groupIds = Array.from(new Set(articles.map((a) => a.duplicate_group_id).filter(Boolean))) as string[];
    const groupCounts: Record<string, number> = {};
    if (groupIds.length > 0) {
      const groupPlaceholders = groupIds.map((_, i) => `$grp_${i}`).join(',');
      const grpParams: Record<string, any> = {};
      groupIds.forEach((g, i) => {
        grpParams[`$grp_${i}`] = g;
      });
      const grpStmt = database.prepare(`
        SELECT duplicate_group_id, COUNT(*) as cnt
        FROM news_analysis
        WHERE duplicate_group_id IN (${groupPlaceholders})
        GROUP BY duplicate_group_id
      `);
      grpStmt.bind(grpParams);
      while (grpStmt.step()) {
        const gRow = grpStmt.getAsObject() as any;
        groupCounts[String(gRow.duplicate_group_id)] = Number(gRow.cnt);
      }
      grpStmt.free();
    }

    // AI Analysis map
    const aiStmt = database.prepare(`
      SELECT * FROM news_ai_analysis WHERE news_id IN (${ids})
    `);
    const aiMap: Record<number, any> = {};
    while (aiStmt.step()) {
      const aiRow = aiStmt.getAsObject() as any;
      const nId = Number(aiRow.news_id);
      aiMap[nId] = AIEngine.mapDbRowToAnalysis(aiRow);
    }
    aiStmt.free();

    for (const a of articles) {
      a.tickers = tickerMap[a.id] || [];
      if (a.duplicate_group_id && groupCounts[a.duplicate_group_id]) {
        a.duplicate_count = groupCounts[a.duplicate_group_id];
      } else {
        a.duplicate_count = 1;
      }

      // Evaluate AI Eligibility
      const evalResult = AIEligibilityGate.evaluate({
        importance_score: a.importance_score,
        relevance_score: a.relevance_score,
        event_type: a.event_type,
        is_calibration: calIds.has(a.id),
      });

      a.ai_eligible = evalResult.eligible;
      a.ai_eligibility_reason = evalResult.reason;

      if (aiMap[a.id]) {
        a.ai_analysis = aiMap[a.id];
        a.ai_status = 'completed';
      } else if (evalResult.eligible) {
        a.ai_status = 'pending';
      } else {
        a.ai_status = 'not_eligible';
      }
    }
  }

  return {
    articles,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export async function getNewsById(id: number): Promise<NewsArticle | null> {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT 
      n.id, 
      n.title, 
      n.publisher, 
      n.url, 
      n.published_at, 
      n.summary, 
      n.article_hash, 
      n.retrieved_at, 
      n.created_at,
      na.importance_score,
      na.relevance_score,
      na.event_type,
      na.source_tier,
      na.duplicate_group_id,
      na.explanation_json,
      na.classification_version,
      na.classified_at
    FROM news n
    LEFT JOIN news_analysis na ON n.id = na.news_id
    WHERE n.id = $id
  `);
  stmt.bind({ $id: id });
  let article: NewsArticle | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    let explanation: any = undefined;
    if (row.explanation_json) {
      try {
        explanation = JSON.parse(row.explanation_json);
      } catch {}
    }
    article = {
      id: Number(row.id),
      title: String(row.title),
      publisher: String(row.publisher || ''),
      url: String(row.url),
      published_at: String(row.published_at),
      summary: String(row.summary || ''),
      article_hash: String(row.article_hash),
      retrieved_at: String(row.retrieved_at),
      created_at: String(row.created_at),
      importance_score: row.importance_score !== null && row.importance_score !== undefined ? Number(row.importance_score) : undefined,
      relevance_score: row.relevance_score !== null && row.relevance_score !== undefined ? Number(row.relevance_score) : undefined,
      event_type: row.event_type ? String(row.event_type) : undefined,
      source_tier: row.source_tier ? Number(row.source_tier) : undefined,
      duplicate_group_id: row.duplicate_group_id ? String(row.duplicate_group_id) : undefined,
      explanation,
      classification_version: row.classification_version ? String(row.classification_version) : undefined,
      classified_at: row.classified_at ? String(row.classified_at) : undefined,
      tickers: [],
    };
  }
  stmt.free();

  if (article) {
    const tickerStmt = database.prepare(`
      SELECT t.symbol
      FROM ticker_news tn
      JOIN tickers t ON tn.ticker_id = t.id
      WHERE tn.news_id = $id
      ORDER BY t.symbol ASC
    `);
    tickerStmt.bind({ $id: id });
    const tickers: string[] = [];
    while (tickerStmt.step()) {
      tickers.push(String(tickerStmt.getAsObject().symbol));
    }
    tickerStmt.free();
    article.tickers = tickers;

    if (article.duplicate_group_id) {
      const countStmt = database.prepare(`
        SELECT COUNT(*) as count FROM news_analysis WHERE duplicate_group_id = $grp
      `);
      countStmt.bind({ $grp: article.duplicate_group_id });
      if (countStmt.step()) {
        article.duplicate_count = Number(countStmt.getAsObject().count || 1);
      }
      countStmt.free();
    }

    // AI Analysis
    let is_calibration = false;
    try {
      const calStmt = database.prepare(`SELECT COUNT(*) as cnt FROM calibration_reviews WHERE news_id = $id`);
      calStmt.bind({ $id: id });
      calStmt.step();
      is_calibration = Number(calStmt.getAsObject().cnt || 0) > 0;
      calStmt.free();
    } catch {}

    const evalResult = AIEligibilityGate.evaluate({
      importance_score: article.importance_score,
      relevance_score: article.relevance_score,
      event_type: article.event_type,
      is_calibration,
    });
    article.ai_eligible = evalResult.eligible;
    article.ai_eligibility_reason = evalResult.reason;

    const aiStmt = database.prepare(`
      SELECT * FROM news_ai_analysis WHERE news_id = $id ORDER BY id DESC LIMIT 1
    `);
    aiStmt.bind({ $id: id });
    if (aiStmt.step()) {
      article.ai_analysis = AIEngine.mapDbRowToAnalysis(aiStmt.getAsObject());
      article.ai_status = 'completed';
    } else if (evalResult.eligible) {
      article.ai_status = 'pending';
    } else {
      article.ai_status = 'not_eligible';
    }
    aiStmt.free();
  }

  return article;
}

export async function reclassifyAllNews(version?: string): Promise<{
  processed: number;
  durationMs: number;
  version: string;
}> {
  const startTime = Date.now();
  const database = await getDb();
  const targetVersion = version || NewsIntelligenceEngine.VERSION;

  const queryStmt = database.prepare(`
    SELECT n.id, n.title, n.summary, n.publisher, n.published_at
    FROM news n
  `);
  const articles: Array<{ id: number; title: string; summary: string; publisher: string; published_at: string }> = [];
  while (queryStmt.step()) {
    const row = queryStmt.getAsObject() as any;
    articles.push({
      id: Number(row.id),
      title: String(row.title),
      summary: String(row.summary || ''),
      publisher: String(row.publisher || ''),
      published_at: String(row.published_at),
    });
  }
  queryStmt.free();

  let processed = 0;
  for (const item of articles) {
    const tStmt = database.prepare(`
      SELECT t.symbol, t.company_name
      FROM ticker_news tn
      JOIN tickers t ON tn.ticker_id = t.id
      WHERE tn.news_id = $id
    `);
    tStmt.bind({ $id: item.id });
    const symbols: string[] = [];
    let compName = '';
    while (tStmt.step()) {
      const tRow = tStmt.getAsObject() as any;
      symbols.push(String(tRow.symbol));
      if (!compName && tRow.company_name) compName = String(tRow.company_name);
    }
    tStmt.free();

    await analyzeAndSaveArticle(database, item.id, {
      title: item.title,
      summary: item.summary,
      publisher: item.publisher,
      published_at: item.published_at,
      tickerSymbols: symbols,
      companyName: compName,
    }, targetVersion);
    processed++;
  }

  saveDbToDisk(database);
  const durationMs = Date.now() - startTime;
  logger.info(`Reclassified ${processed} articles in ${durationMs}ms with version ${targetVersion}`);

  return {
    processed,
    durationMs,
    version: targetVersion,
  };
}

export async function getTopStockNews(limit = 6): Promise<NewsArticle[]> {
  const result = await getNews({
    sort: 'importance',
    limit,
    page: 1,
  });
  return result.articles;
}

export async function getUniquePublishers(): Promise<string[]> {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT DISTINCT publisher 
    FROM news 
    WHERE publisher IS NOT NULL AND publisher != '' 
    ORDER BY publisher ASC
  `);
  const publishers: string[] = [];
  while (stmt.step()) {
    publishers.push(String(stmt.getAsObject().publisher));
  }
  stmt.free();
  return publishers;
}

// -------------------------------------------------------------
// Import Jobs Operations
// -------------------------------------------------------------

export async function createImportJob(data: {
  provider: 'yahoo' | 'mock';
  status: 'running' | 'completed' | 'failed';
  tickers_count: number;
  date_from?: string;
  date_to?: string;
}): Promise<number> {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(`
    INSERT INTO import_jobs (provider, status, tickers_count, articles_retrieved, new_articles, duplicates_skipped, errors_count, date_from, date_to, details_json, started_at)
    VALUES ($provider, $status, $tickers_count, 0, 0, 0, 0, $date_from, $date_to, '{}', $started_at)
  `);
  stmt.run({
    $provider: data.provider,
    $status: data.status,
    $tickers_count: data.tickers_count,
    $date_from: data.date_from || null,
    $date_to: data.date_to || null,
    $started_at: now,
  });
  stmt.free();

  const idStmt = database.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const newId = Number(idStmt.getAsObject().id);
  idStmt.free();

  saveDbToDisk(database);
  return newId;
}

export async function updateImportJob(
  id: number,
  data: {
    status: 'running' | 'completed' | 'failed';
    articles_retrieved: number;
    new_articles: number;
    duplicates_skipped: number;
    errors_count: number;
    details: any;
    completed_at?: string;
  }
): Promise<void> {
  const database = await getDb();
  const now = data.completed_at || new Date().toISOString();
  const stmt = database.prepare(`
    UPDATE import_jobs
    SET status = $status,
        articles_retrieved = $articles_retrieved,
        new_articles = $new_articles,
        duplicates_skipped = $duplicates_skipped,
        errors_count = $errors_count,
        details_json = $details_json,
        completed_at = $completed_at
    WHERE id = $id
  `);
  stmt.run({
    $id: id,
    $status: data.status,
    $articles_retrieved: data.articles_retrieved,
    $new_articles: data.new_articles,
    $duplicates_skipped: data.duplicates_skipped,
    $errors_count: data.errors_count,
    $details_json: JSON.stringify(data.details),
    $completed_at: now,
  });
  stmt.free();
  saveDbToDisk(database);
}

export async function getImportJobs(limit = 20): Promise<ImportJobSummary[]> {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT * FROM import_jobs ORDER BY id DESC LIMIT $limit
  `);
  stmt.bind({ $limit: limit });
  const list: ImportJobSummary[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    let details = {};
    try {
      details = JSON.parse(row.details_json || '{}');
    } catch {}
    list.push({
      id: Number(row.id),
      provider: row.provider as 'yahoo' | 'mock',
      status: row.status as any,
      tickers_count: Number(row.tickers_count),
      articles_retrieved: Number(row.articles_retrieved),
      new_articles: Number(row.new_articles),
      duplicates_skipped: Number(row.duplicates_skipped),
      errors_count: Number(row.errors_count),
      date_from: row.date_from || undefined,
      date_to: row.date_to || undefined,
      details,
      started_at: String(row.started_at),
      completed_at: row.completed_at ? String(row.completed_at) : undefined,
    });
  }
  stmt.free();
  return list;
}

export async function getImportJobById(id: number): Promise<ImportJobSummary | null> {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM import_jobs WHERE id = $id`);
  stmt.bind({ $id: id });
  let job: ImportJobSummary | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    let details = {};
    try {
      details = JSON.parse(row.details_json || '{}');
    } catch {}
    job = {
      id: Number(row.id),
      provider: row.provider as 'yahoo' | 'mock',
      status: row.status as any,
      tickers_count: Number(row.tickers_count),
      articles_retrieved: Number(row.articles_retrieved),
      new_articles: Number(row.new_articles),
      duplicates_skipped: Number(row.duplicates_skipped),
      errors_count: Number(row.errors_count),
      date_from: row.date_from || undefined,
      date_to: row.date_to || undefined,
      details,
      started_at: String(row.started_at),
      completed_at: row.completed_at ? String(row.completed_at) : undefined,
    };
  }
  stmt.free();
  return job;
}

// -------------------------------------------------------------
// Global Statistics
// -------------------------------------------------------------

export async function getGlobalStats(): Promise<{
  totalTickers: number;
  enabledTickers: number;
  totalArticles: number;
  totalRelationships: number;
  earliestArticleDate?: string;
  latestArticleDate?: string;
  lastImport?: ImportJobSummary | null;
}> {
  const database = await getDb();
  
  // Tickers stats
  const tStmt = database.prepare(`
    SELECT 
      COUNT(*) as total, 
      SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled 
    FROM tickers
  `);
  tStmt.step();
  const tRow = tStmt.getAsObject() as any;
  const totalTickers = Number(tRow.total || 0);
  const enabledTickers = Number(tRow.enabled || 0);
  tStmt.free();

  // News stats
  const nStmt = database.prepare(`
    SELECT 
      COUNT(*) as total,
      MIN(published_at) as earliest,
      MAX(published_at) as latest
    FROM news
  `);
  nStmt.step();
  const nRow = nStmt.getAsObject() as any;
  const totalArticles = Number(nRow.total || 0);
  const earliestArticleDate = nRow.earliest ? String(nRow.earliest) : undefined;
  const latestArticleDate = nRow.latest ? String(nRow.latest) : undefined;
  nStmt.free();

  // Relations count
  const rStmt = database.prepare(`SELECT COUNT(*) as total FROM ticker_news`);
  rStmt.step();
  const totalRelationships = Number(rStmt.getAsObject().total || 0);
  rStmt.free();

  // Last import
  const imports = await getImportJobs(1);
  const lastImport = imports.length > 0 ? imports[0] : null;

  return {
    totalTickers,
    enabledTickers,
    totalArticles,
    totalRelationships,
    earliestArticleDate,
    latestArticleDate,
    lastImport,
  };
}

export async function resetDatabase(): Promise<void> {
  const database = await getDb();
  database.run(`
    DELETE FROM calibration_reviews;
    DELETE FROM news_analysis;
    DELETE FROM ticker_news;
    DELETE FROM news;
    DELETE FROM import_jobs;
  `);
  saveDbToDisk(database);
  logger.info('Database wiped and reset successfully.');
}

export async function getCalibrationDataset(options: {
  ticker?: string;
  status?: 'all' | 'reviewed' | 'unreviewed';
  limit?: number;
  offset?: number;
}): Promise<{ items: CalibrationArticleItem[]; total: number; reviewedCount: number }> {
  const database = await getDb();
  return CalibrationEngine.getCalibrationDataset(database, options);
}

export async function saveCalibrationReview(review: CalibrationReview): Promise<void> {
  const database = await getDb();
  CalibrationEngine.saveReview(database, review);
  saveDbToDisk(database);
}

export async function getCalibrationStats(version?: string): Promise<CalibrationStatsReport> {
  const database = await getDb();
  return CalibrationEngine.calculateCalibrationStats(database, version);
}

export async function seedCalibrationReviews(): Promise<void> {
  const database = await getDb();
  CalibrationEngine.seedRealisticCalibrationReviews(database);
  saveDbToDisk(database);
}

// -------------------------------------------------------------
// Phase 5: AI News Analysis Database Operations
// -------------------------------------------------------------

export async function getAIAnalysisForArticle(newsId: number) {
  const database = await getDb();
  const stmt = database.prepare(`
    SELECT * FROM news_ai_analysis WHERE news_id = $id ORDER BY id DESC LIMIT 1
  `);
  stmt.bind({ $id: newsId });
  let analysis = null;
  if (stmt.step()) {
    analysis = AIEngine.mapDbRowToAnalysis(stmt.getAsObject());
  }
  stmt.free();
  return analysis;
}

export async function analyzeArticleWithAI(newsId: number, options?: { force?: boolean }) {
  const database = await getDb();
  const result = await AIEngine.analyzeSingleArticle(database, newsId, options);
  if (result.success) {
    saveDbToDisk(database);
  }
  return result;
}

export async function batchAnalyzeEligibleNews(options?: {
  concurrencyLimit?: number;
  maxArticles?: number;
  force?: boolean;
}) {
  const database = await getDb();
  const result = await AIEngine.runBatchAnalysis(database, options);
  saveDbToDisk(database);
  return result;
}

export async function getBatchAIStatistics() {
  const database = await getDb();
  return AIEngine.getBatchStats(database);
}

export async function getAIUsageDashboard() {
  const database = await getDb();
  return AIEngine.getUsageSummary(database);
}

export function seedInitialAIAnalyses(database: Database): void {
  try {
    const checkStmt = database.prepare(`SELECT COUNT(*) as cnt FROM news_ai_analysis`);
    checkStmt.step();
    const count = Number(checkStmt.getAsObject().cnt || 0);
    checkStmt.free();

    if (count > 0) return;

    logger.info('Pre-seeding AI intelligence analysis for top eligible articles...');

    // Find top eligible articles to enrich initially
    const stmt = database.prepare(`
      SELECT n.id, na.importance_score, na.relevance_score, na.event_type
      FROM news n
      JOIN news_analysis na ON n.id = na.news_id
      WHERE na.importance_score >= 75 AND na.relevance_score >= 60
      ORDER BY na.importance_score DESC
      LIMIT 12
    `);

    const eligibleIds: number[] = [];
    while (stmt.step()) {
      eligibleIds.push(Number(stmt.getAsObject().id));
    }
    stmt.free();

    // Analyze them synchronously on first boot
    for (const id of eligibleIds) {
      AIEngine.analyzeSingleArticle(database, id, { force: true }).catch((err) => {
        logger.warn(`Failed initial seed AI analysis for article ${id}: ${err.message}`);
      });
    }
  } catch (err: any) {
    logger.warn(`seedInitialAIAnalyses error: ${err.message}`);
  }
}

