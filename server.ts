import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  getDb,
  getTickers,
  getTickerById,
  createTicker,
  updateTicker,
  deleteTicker,
  bulkCreateTickers,
  bulkToggleTickers,
  toggleAllTickers,
  getTickerPortfolioStats,
  getNews,
  getNewsById,
  getTopStockNews,
  reclassifyAllNews,
  getUniquePublishers,
  getImportJobs,
  getImportJobById,
  getGlobalStats,
  resetDatabase,
  getCalibrationDataset,
  saveCalibrationReview,
  getCalibrationStats,
  seedCalibrationReviews,
  getAIAnalysisForArticle,
  analyzeArticleWithAI,
  batchAnalyzeEligibleNews,
  getBatchAIStatistics,
  getAIUsageDashboard,
} from './server/database.js';
import { NewsImporter } from './server/services/importer.js';
import { getAIConfig } from './server/config.js';
import {
  getActiveProviderType,
  setActiveProviderType,
  getProviderHealth,
} from './server/services/newsProvider.js';
import { logger } from './server/services/logger.js';
import { runAllTests } from './server/tests/suite.js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize SQLite database on boot
  await getDb();
  logger.info('SQLite database ready.');

  const { provider, model } = getAIConfig();
  logger.info(`AI Provider: ${provider}`);
  logger.info(`AI Model: ${model}`);

  // -------------------------------------------------------------
  // API Routes
  // -------------------------------------------------------------

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Tickers Endpoints
  app.get('/api/tickers', async (req, res) => {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const enabledOnly = req.query.enabledOnly === 'true';
      const tickers = await getTickers({ search, enabledOnly });
      res.json({ data: tickers, count: tickers.length });
    } catch (err: any) {
      logger.error(`GET /api/tickers error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tickers/stats', async (req, res) => {
    try {
      const stats = await getTickerPortfolioStats();
      res.json({ data: stats });
    } catch (err: any) {
      logger.error(`GET /api/tickers/stats error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tickers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const ticker = await getTickerById(id);
      if (!ticker) {
        return res.status(404).json({ error: 'Ticker not found' });
      }
      res.json({ data: ticker });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tickers', async (req, res) => {
    try {
      const { symbol, company_name, exchange, enabled } = req.body;
      if (!symbol || !symbol.trim()) {
        return res.status(400).json({ error: 'Ticker symbol is required' });
      }
      const ticker = await createTicker({
        symbol: symbol.trim().toUpperCase(),
        company_name,
        exchange,
        enabled,
      });
      logger.info(`Added ticker: ${ticker.symbol} (${ticker.company_name || 'N/A'})`);
      res.status(201).json({ data: ticker });
    } catch (err: any) {
      logger.error(`POST /api/tickers error: ${err.message}`);
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/tickers/bulk', async (req, res) => {
    try {
      const { tickers, options } = req.body;
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: 'Array of tickers is required' });
      }
      const result = await bulkCreateTickers(tickers, options);
      logger.info(
        `Bulk ticker import: ${result.added} added, ${result.updated} updated, ${result.existingSkipped} existing skipped, ${result.errors.length} errors`
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tickers/bulk-toggle', async (req, res) => {
    try {
      const { ids, enabled } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Array of ticker IDs is required' });
      }
      const count = await bulkToggleTickers(ids, Boolean(enabled));
      logger.info(`Bulk toggled ${count} tickers to enabled=${Boolean(enabled)}`);
      res.json({ success: true, count, enabled: Boolean(enabled) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/tickers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { symbol, company_name, exchange, enabled } = req.body;
      const updated = await updateTicker(id, { symbol, company_name, exchange, enabled });
      if (!updated) {
        return res.status(404).json({ error: 'Ticker not found' });
      }
      logger.info(`Updated ticker ${updated.symbol} (ID: ${id})`);
      res.json({ data: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete('/api/tickers/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      await deleteTicker(id);
      logger.info(`Deleted ticker ID: ${id}`);
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tickers/toggle-all', async (req, res) => {
    try {
      const { enabled } = req.body;
      const count = await toggleAllTickers(Boolean(enabled));
      logger.info(`Toggled all ${count} tickers to enabled=${Boolean(enabled)}`);
      res.json({ success: true, count, enabled: Boolean(enabled) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // News Endpoints
  app.get('/api/news', async (req, res) => {
    try {
      const ticker = req.query.ticker ? String(req.query.ticker) : undefined;
      const tickers = req.query.tickers ? String(req.query.tickers).split(',').map(s => s.trim()).filter(Boolean) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const source = req.query.source ? String(req.query.source) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const sort = (req.query.sort as 'newest' | 'oldest' | 'importance' | 'relevance') || 'newest';
      const importance = (req.query.importance as 'all' | 'critical' | 'high' | 'medium' | 'low') || 'all';
      const eventType = req.query.eventType ? String(req.query.eventType) : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;

      const result = await getNews({
        ticker,
        tickers,
        startDate,
        endDate,
        source,
        search,
        sort,
        importance,
        eventType,
        page,
        limit,
      });

      res.json(result);
    } catch (err: any) {
      logger.error(`GET /api/news error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/news/top', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 6;
      const topNews = await getTopStockNews(limit);
      res.json({ articles: topNews });
    } catch (err: any) {
      logger.error(`GET /api/news/top error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/news/reclassify', async (req, res) => {
    try {
      const version = req.body.version ? String(req.body.version) : undefined;
      const result = await reclassifyAllNews(version);
      res.json({ success: true, ...result });
    } catch (err: any) {
      logger.error(`POST /api/news/reclassify error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Phase 4: News Intelligence Calibration Endpoints
  // -------------------------------------------------------------
  app.get('/api/calibration/articles', async (req, res) => {
    try {
      const ticker = req.query.ticker ? String(req.query.ticker) : undefined;
      const status = (req.query.status as any) || 'all';
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 200;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

      const dataset = await getCalibrationDataset({ ticker, status, limit, offset });
      res.json(dataset);
    } catch (err: any) {
      logger.error(`GET /api/calibration/articles error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/calibration/review', async (req, res) => {
    try {
      const {
        news_id,
        event_type_correct,
        importance_correct,
        relevance_correct,
        human_importance,
        human_event_type,
        human_relevance,
        notes,
        reviewed_by,
      } = req.body;

      if (!news_id) {
        return res.status(400).json({ error: 'news_id is required' });
      }

      await saveCalibrationReview({
        news_id: Number(news_id),
        event_type_correct: event_type_correct || 'correct',
        importance_correct: importance_correct || 'correct',
        relevance_correct: relevance_correct || 'correct',
        human_importance: human_importance || 'medium',
        human_event_type: human_event_type || 'other',
        human_relevance: human_relevance || 'company_specific',
        notes: notes || '',
        reviewed_by: reviewed_by || 'Human Reviewer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Human review saved successfully' });
    } catch (err: any) {
      logger.error(`POST /api/calibration/review error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/calibration/stats', async (req, res) => {
    try {
      const version = req.query.version ? String(req.query.version) : undefined;
      const stats = await getCalibrationStats(version);
      res.json(stats);
    } catch (err: any) {
      logger.error(`GET /api/calibration/stats error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/calibration/seed-reviews', async (_req, res) => {
    try {
      await seedCalibrationReviews();
      res.json({ success: true, message: 'Calibration reviews seeded successfully' });
    } catch (err: any) {
      logger.error(`POST /api/calibration/seed-reviews error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/news/publishers', async (req, res) => {
    try {
      const publishers = await getUniquePublishers();
      res.json({ publishers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/news/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const article = await getNewsById(id);
      if (!article) {
        return res.status(404).json({ error: 'News article not found' });
      }
      res.json({ data: article });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Phase 5: AI Intelligence Analysis Endpoints
  // -------------------------------------------------------------

  app.get('/api/ai/usage', async (_req, res) => {
    try {
      const summary = await getAIUsageDashboard();
      res.json(summary);
    } catch (err: any) {
      logger.error(`GET /api/ai/usage error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ai/batch-stats', async (_req, res) => {
    try {
      const stats = await getBatchAIStatistics();
      res.json(stats);
    } catch (err: any) {
      logger.error(`GET /api/ai/batch-stats error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ai/analyze/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const force = req.body.force === true;
      const result = await analyzeArticleWithAI(id, { force });
      if (!result.success) {
        return res.status(400).json({ error: result.error, status: result.status });
      }
      res.json(result);
    } catch (err: any) {
      logger.error(`POST /api/ai/analyze/:id error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/ai/batch-analyze', async (req, res) => {
    try {
      const { concurrencyLimit, maxArticles, force } = req.body;
      const result = await batchAnalyzeEligibleNews({
        concurrencyLimit: concurrencyLimit ? parseInt(concurrencyLimit, 10) : 3,
        maxArticles: maxArticles ? parseInt(maxArticles, 10) : 100,
        force: force === true,
      });
      res.json(result);
    } catch (err: any) {
      logger.error(`POST /api/ai/batch-analyze error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ai/analysis/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const analysis = await getAIAnalysisForArticle(id);
      if (!analysis) {
        return res.status(404).json({ error: 'AI analysis not found for article' });
      }
      res.json({ data: analysis });
    } catch (err: any) {
      logger.error(`GET /api/ai/analysis/:id error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // News Import Trigger Endpoint
  app.post('/api/news/fetch', async (req, res) => {
    try {
      const { symbols, startDate, endDate, provider } = req.body;
      const summary = await NewsImporter.runImport({
        symbols: Array.isArray(symbols) && symbols.length > 0 ? symbols : undefined,
        startDate,
        endDate,
        provider: provider || getActiveProviderType(),
      });
      res.json(summary);
    } catch (err: any) {
      logger.error(`POST /api/news/fetch error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Import History Endpoints
  app.get('/api/imports', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const jobs = await getImportJobs(limit);
      res.json({ data: jobs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/imports/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const job = await getImportJobById(id);
      if (!job) {
        return res.status(404).json({ error: 'Import job not found' });
      }
      res.json({ data: job });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stats Endpoint
  app.get('/api/stats', async (req, res) => {
    try {
      const stats = await getGlobalStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Configuration Endpoints
  app.get('/api/config', (req, res) => {
    res.json({
      provider: getActiveProviderType(),
      logLevel: process.env.LOG_LEVEL || 'INFO',
      timeoutMs: parseInt(process.env.REQUEST_TIMEOUT || '20000', 10),
      maxConcurrent: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5', 10),
      dbPath: process.env.DATABASE_PATH || './data/news.db',
    });
  });

  app.post('/api/config', (req, res) => {
    const { provider } = req.body;
    if (provider === 'yahoo' || provider === 'mock') {
      setActiveProviderType(provider);
      return res.json({ success: true, provider: getActiveProviderType() });
    }
    res.status(400).json({ error: 'Invalid provider. Must be "yahoo" or "mock"' });
  });

  // Provider Health Endpoint
  app.get('/api/provider/health', async (req, res) => {
    try {
      const probe = req.query.probe === 'true';
      const health = await getProviderHealth(probe);
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logs Endpoint
  app.get('/api/logs', (req, res) => {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
    res.json({ logs: logger.getRecentLogs(limit) });
  });

  // Automated Test Runner Endpoint
  app.post('/api/test/run', async (req, res) => {
    try {
      logger.info('Running automated test suite...');
      const summary = await runAllTests();
      logger.info(`Test suite completed: ${summary.passed}/${summary.total} passed in ${summary.durationMs}ms`);
      res.json(summary);
    } catch (err: any) {
      logger.error(`Test run execution failure: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Database Reset Endpoint (for testing/clean slate)
  app.post('/api/database/reset', async (req, res) => {
    try {
      await resetDatabase();
      res.json({ success: true, message: 'Database reset successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Phase 5.2 Transfer Export Download Endpoints
  app.get('/api/export/download', (req, res) => {
    const zipPath = path.join(process.cwd(), 'export', 'phase5_2_benchmark_transfer.zip');
    if (fs.existsSync(zipPath)) {
      res.download(zipPath, 'phase5_2_benchmark_transfer.zip');
    } else {
      res.status(404).json({ error: 'Export package zip file not found' });
    }
  });

  app.use('/export', express.static(path.join(process.cwd(), 'export')));

  // -------------------------------------------------------------
  // Vite Middleware for SPA Frontend
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Stock News Aggregator server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
