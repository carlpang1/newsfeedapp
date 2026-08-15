import { Database } from 'sql.js';
import {
  NewsArticle,
  NewsAIAnalysis,
  AIAnalysisInput,
  AIProviderResponse,
  AIUsageSummary,
  BatchAIStats,
  AIAnalysisStatus,
  IAIProvider,
} from '../types.js';
import { AIEligibilityGate, DEFAULT_AI_ELIGIBILITY_CONFIG } from './aiEligibility.js';
import { getActiveAIProvider, DEFAULT_PRICING } from './aiProvider.js';
import { getAIConfig, DEFAULT_MODEL } from '../config.js';
import { logger } from './logger.js';

export class AIEngine {
  /**
   * Initializes the AI tables in SQLite
   */
  public static initSchema(database: Database) {
    database.run(`
      CREATE TABLE IF NOT EXISTS news_ai_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        news_id INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT,
        analysis_version TEXT NOT NULL,
        summary TEXT,
        why_it_matters TEXT,
        market_impact TEXT,
        impact_confidence INTEGER,
        time_horizon TEXT,
        catalysts_json TEXT,
        risks_json TEXT,
        key_facts_json TEXT,
        mentioned_companies_json TEXT,
        analysis_confidence INTEGER,
        prompt_version TEXT,
        raw_response_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
        UNIQUE(news_id, provider, model, analysis_version)
      );

      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT,
        news_id INTEGER,
        request_count INTEGER DEFAULT 1,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        estimated_cost REAL DEFAULT 0.0,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_news_ai_news_id ON news_ai_analysis(news_id);
      CREATE INDEX IF NOT EXISTS idx_news_ai_provider ON news_ai_analysis(provider);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_status ON ai_usage_logs(status);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_logs(created_at);
    `);
  }

  /**
   * Analyzes a single article by news ID with AI
   */
  public static async analyzeSingleArticle(
    database: Database,
    newsId: number,
    options: { force?: boolean; provider?: IAIProvider } = {}
  ): Promise<{ success: boolean; analysis?: NewsAIAnalysis; error?: string; status: AIAnalysisStatus }> {
    // 1. Fetch the article and its rule-based score
    const query = database.prepare(`
      SELECT n.id, n.title, n.summary, n.publisher, n.published_at,
             na.importance_score, na.relevance_score, na.event_type
      FROM news n
      LEFT JOIN news_analysis na ON n.id = na.news_id
      WHERE n.id = $id
    `);
    query.bind({ $id: newsId });
    if (!query.step()) {
      query.free();
      return { success: false, error: `Article ${newsId} not found`, status: 'not_eligible' };
    }
    const row = query.getAsObject() as any;
    query.free();

    // 2. Fetch associated ticker symbols
    const tStmt = database.prepare(`
      SELECT t.symbol
      FROM ticker_news tn
      JOIN tickers t ON tn.ticker_id = t.id
      WHERE tn.news_id = $id
    `);
    tStmt.bind({ $id: newsId });
    const symbols: string[] = [];
    while (tStmt.step()) {
      symbols.push(String(tStmt.getAsObject().symbol));
    }
    tStmt.free();

    // Check if calibration article
    let is_calibration = false;
    try {
      const calStmt = database.prepare(`SELECT COUNT(*) as cnt FROM calibration_reviews WHERE news_id = $id`);
      calStmt.bind({ $id: newsId });
      calStmt.step();
      is_calibration = Number(calStmt.getAsObject().cnt || 0) > 0;
      calStmt.free();
    } catch {}

    // 3. Evaluate eligibility
    const eligibility = AIEligibilityGate.evaluate({
      importance_score: row.importance_score !== null ? Number(row.importance_score) : undefined,
      relevance_score: row.relevance_score !== null ? Number(row.relevance_score) : undefined,
      event_type: row.event_type ? String(row.event_type) : undefined,
      is_calibration,
    });

    if (!eligibility.eligible && !options.force) {
      return {
        success: false,
        error: `Article is not eligible for AI analysis: ${eligibility.reason.join(', ')}`,
        status: 'not_eligible',
      };
    }

    const provider = options.provider || getActiveAIProvider();

    // 4. Check if existing analysis exists (unless forced)
    if (!options.force) {
      const existingStmt = database.prepare(`
        SELECT * FROM news_ai_analysis WHERE news_id = $news_id ORDER BY id DESC LIMIT 1
      `);
      existingStmt.bind({ $news_id: newsId });
      if (existingStmt.step()) {
        const existingRow = existingStmt.getAsObject() as any;
        existingStmt.free();
        const existingAnalysis = this.mapDbRowToAnalysis(existingRow);
        return { success: true, analysis: existingAnalysis, status: 'completed' };
      }
      existingStmt.free();
    }

    // 5. Call AI Provider
    const input: AIAnalysisInput = {
      ticker: symbols[0] || 'MARKET',
      title: String(row.title),
      publisher: String(row.publisher || 'Unknown'),
      published_at: String(row.published_at),
      summary: String(row.summary || ''),
      event_type: String(row.event_type || 'other'),
      importance_score: Number(row.importance_score || 50),
      relevance_score: Number(row.relevance_score || 50),
      allArticleTickers: symbols,
    };

    const now = new Date().toISOString();

    try {
      const response = await provider.analyzeArticle(input);

      // Save analysis to SQLite
      const insStmt = database.prepare(`
        INSERT OR REPLACE INTO news_ai_analysis (
          news_id, provider, model, analysis_version, summary, why_it_matters,
          market_impact, impact_confidence, time_horizon, catalysts_json,
          risks_json, key_facts_json, mentioned_companies_json, analysis_confidence,
          prompt_version, raw_response_json, created_at, updated_at
        ) VALUES (
          $news_id, $provider, $model, $analysis_version, $summary, $why_it_matters,
          $market_impact, $impact_confidence, $time_horizon, $catalysts_json,
          $risks_json, $key_facts_json, $mentioned_companies_json, $analysis_confidence,
          $prompt_version, $raw_response_json, $created_at, $updated_at
        )
      `);

      insStmt.run({
        $news_id: newsId,
        $provider: response.provider,
        $model: response.model || DEFAULT_MODEL,
        $analysis_version: response.analysisVersion || '1.0',
        $summary: response.output.summary,
        $why_it_matters: response.output.why_it_matters,
        $market_impact: response.output.market_impact,
        $impact_confidence: response.output.impact_confidence,
        $time_horizon: response.output.time_horizon,
        $catalysts_json: JSON.stringify(response.output.catalysts),
        $risks_json: JSON.stringify(response.output.risks),
        $key_facts_json: JSON.stringify(response.output.key_facts),
        $mentioned_companies_json: JSON.stringify(response.output.mentioned_companies),
        $analysis_confidence: response.output.analysis_confidence,
        $prompt_version: response.promptVersion || 'news-analysis-v1',
        $raw_response_json: response.rawResponse ? JSON.stringify(response.rawResponse) : null,
        $created_at: now,
        $updated_at: now,
      });
      insStmt.free();

      // Log successful usage
      this.logAIUsage(database, {
        provider: response.provider,
        model: response.model,
        news_id: newsId,
        input_tokens: response.inputTokens,
        output_tokens: response.outputTokens,
        estimated_cost: response.estimatedCost,
        status: 'completed',
      });

      const analysis: NewsAIAnalysis = {
        news_id: newsId,
        provider: response.provider,
        model: response.model,
        analysis_version: response.analysisVersion,
        prompt_version: response.promptVersion,
        summary: response.output.summary,
        why_it_matters: response.output.why_it_matters,
        market_impact: response.output.market_impact,
        impact_confidence: response.output.impact_confidence,
        time_horizon: response.output.time_horizon,
        catalysts: response.output.catalysts,
        risks: response.output.risks,
        key_facts: response.output.key_facts,
        mentioned_companies: response.output.mentioned_companies,
        analysis_confidence: response.output.analysis_confidence,
        created_at: now,
        updated_at: now,
      };

      return { success: true, analysis, status: 'completed' };
    } catch (err: any) {
      logger.error(`AI analysis failed for news ID ${newsId}: ${err.message}`);

      // Log failure in usage log
      this.logAIUsage(database, {
        provider: provider.name,
        model: 'unknown',
        news_id: newsId,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost: 0,
        status: 'failed',
        error_message: err.message,
      });

      return {
        success: false,
        error: err.message,
        status: 'failed',
      };
    }
  }

  /**
   * Logs AI token usage and request status
   */
  private static logAIUsage(
    database: Database,
    log: {
      provider: string;
      model: string;
      news_id?: number;
      input_tokens: number;
      output_tokens: number;
      estimated_cost: number;
      status: 'completed' | 'failed';
      error_message?: string;
    }
  ) {
    try {
      const stmt = database.prepare(`
        INSERT INTO ai_usage_logs (
          provider, model, news_id, request_count, input_tokens, output_tokens,
          estimated_cost, status, error_message, created_at
        ) VALUES (
          $provider, $model, $news_id, 1, $input_tokens, $output_tokens,
          $estimated_cost, $status, $error_message, $created_at
        )
      `);
      stmt.run({
        $provider: log.provider,
        $model: log.model,
        $news_id: log.news_id ?? null,
        $input_tokens: log.input_tokens,
        $output_tokens: log.output_tokens,
        $estimated_cost: log.estimated_cost,
        $status: log.status,
        $error_message: log.error_message ?? null,
        $created_at: new Date().toISOString(),
      });
      stmt.free();
    } catch (err: any) {
      logger.warn(`Failed to write AI usage log: ${err.message}`);
    }
  }

  /**
   * Calculates batch statistics for eligible vs pending vs analyzed news
   */
  public static getBatchStats(database: Database): BatchAIStats {
    const calIds = new Set<number>();
    try {
      const calStmt = database.prepare(`SELECT news_id FROM calibration_reviews`);
      while (calStmt.step()) {
        calIds.add(Number(calStmt.getAsObject().news_id));
      }
      calStmt.free();
    } catch {}

    const stmt = database.prepare(`
      SELECT n.id, na.importance_score, na.relevance_score, na.event_type,
             (SELECT COUNT(*) FROM news_ai_analysis nai WHERE nai.news_id = n.id) as ai_count
      FROM news n
      LEFT JOIN news_analysis na ON n.id = na.news_id
    `);

    let eligible = 0;
    let alreadyAnalyzed = 0;
    let pending = 0;

    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      const isAIAnalyzed = Number(row.ai_count || 0) > 0;

      const evalResult = AIEligibilityGate.evaluate({
        importance_score: row.importance_score !== null ? Number(row.importance_score) : undefined,
        relevance_score: row.relevance_score !== null ? Number(row.relevance_score) : undefined,
        event_type: row.event_type ? String(row.event_type) : undefined,
        is_calibration: calIds.has(Number(row.id)),
      });

      if (evalResult.eligible) {
        eligible++;
        if (isAIAnalyzed) {
          alreadyAnalyzed++;
        } else {
          pending++;
        }
      }
    }
    stmt.free();

    return {
      eligible,
      alreadyAnalyzed,
      pending,
      estimatedRequests: pending,
    };
  }

  /**
   * Runs controlled batch analysis with configurable concurrency
   */
  public static async runBatchAnalysis(
    database: Database,
    options: {
      concurrencyLimit?: number;
      maxArticles?: number;
      force?: boolean;
    } = {}
  ): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    durationMs: number;
    results: Array<{ news_id: number; status: AIAnalysisStatus; error?: string }>;
  }> {
    const startTime = Date.now();
    const concurrency = Math.max(1, Math.min(5, options.concurrencyLimit || 3));
    const maxArticles = options.maxArticles || 100;

    const calIds = new Set<number>();
    try {
      const calStmt = database.prepare(`SELECT news_id FROM calibration_reviews`);
      while (calStmt.step()) {
        calIds.add(Number(calStmt.getAsObject().news_id));
      }
      calStmt.free();
    } catch {}

    // Find eligible items that need analysis
    const stmt = database.prepare(`
      SELECT n.id, na.importance_score, na.relevance_score, na.event_type,
             (SELECT COUNT(*) FROM news_ai_analysis nai WHERE nai.news_id = n.id) as ai_count
      FROM news n
      LEFT JOIN news_analysis na ON n.id = na.news_id
      ORDER BY COALESCE(na.importance_score, 0) DESC, n.published_at DESC
    `);

    const eligibleIds: number[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as any;
      const id = Number(row.id);
      const isAIAnalyzed = Number(row.ai_count || 0) > 0;

      if (!options.force && isAIAnalyzed) continue;

      const evalResult = AIEligibilityGate.evaluate({
        importance_score: row.importance_score !== null ? Number(row.importance_score) : undefined,
        relevance_score: row.relevance_score !== null ? Number(row.relevance_score) : undefined,
        event_type: row.event_type ? String(row.event_type) : undefined,
        is_calibration: calIds.has(id),
      });

      if (evalResult.eligible) {
        eligibleIds.push(id);
        if (eligibleIds.length >= maxArticles) break;
      }
    }
    stmt.free();

    logger.info(`Starting batch AI analysis for ${eligibleIds.length} articles with concurrency=${concurrency}...`);

    let succeeded = 0;
    let failed = 0;
    const results: Array<{ news_id: number; status: AIAnalysisStatus; error?: string }> = [];

    // Worker pool for controlled concurrency
    let currentIndex = 0;
    const provider = getActiveAIProvider();

    const worker = async () => {
      while (currentIndex < eligibleIds.length) {
        const idx = currentIndex++;
        const newsId = eligibleIds[idx];
        const res = await this.analyzeSingleArticle(database, newsId, {
          force: options.force,
          provider,
        });

        if (res.success) {
          succeeded++;
          results.push({ news_id: newsId, status: 'completed' });
        } else {
          failed++;
          results.push({ news_id: newsId, status: res.status, error: res.error });
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    const durationMs = Date.now() - startTime;
    logger.info(`Batch AI analysis complete: ${succeeded} succeeded, ${failed} failed in ${durationMs}ms`);

    return {
      processed: succeeded + failed,
      succeeded,
      failed,
      durationMs,
      results,
    };
  }

  /**
   * Returns aggregated AI usage and cost statistics
   */
  public static getUsageSummary(database: Database): AIUsageSummary {
    const today = new Date().toISOString().slice(0, 10);

    const stmtTotal = database.prepare(`
      SELECT 
        COUNT(DISTINCT news_id) as articles_analyzed,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(estimated_cost) as total_cost,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_requests
      FROM ai_usage_logs
    `);
    stmtTotal.step();
    const totalRow = stmtTotal.getAsObject() as any;
    stmtTotal.free();

    const stmtToday = database.prepare(`
      SELECT COUNT(*) as requests_today
      FROM ai_usage_logs
      WHERE created_at LIKE $today
    `);
    stmtToday.bind({ $today: `${today}%` });
    stmtToday.step();
    const todayRow = stmtToday.getAsObject() as any;
    stmtToday.free();

    const { model, provider } = getAIConfig();
    const pricing = DEFAULT_PRICING[model] || DEFAULT_PRICING[DEFAULT_MODEL];

    const totalTokens = Number(totalRow.total_input_tokens || 0) + Number(totalRow.total_output_tokens || 0);

    return {
      articlesAnalyzed: Number(totalRow.articles_analyzed || 0),
      requestsToday: Number(todayRow.requests_today || 0),
      estimatedTokens: totalTokens,
      estimatedCost: Number(totalRow.total_cost || 0),
      failedRequests: Number(totalRow.failed_requests || 0),
      provider,
      model,
      pricingConfig: {
        inputCostPerMillion: pricing.inputCostPerMillion,
        outputCostPerMillion: pricing.outputCostPerMillion,
      },
    };
  }

  /**
   * Maps SQLite row to NewsAIAnalysis object
   */
  public static mapDbRowToAnalysis(row: any): NewsAIAnalysis {
    return {
      id: row.id ? Number(row.id) : undefined,
      news_id: Number(row.news_id),
      provider: String(row.provider || 'gemini'),
      model: String(row.model || DEFAULT_MODEL),
      analysis_version: String(row.analysis_version || '1.0'),
      prompt_version: String(row.prompt_version || 'news-analysis-v1'),
      summary: String(row.summary || ''),
      why_it_matters: String(row.why_it_matters || ''),
      market_impact: (row.market_impact || 'unclear') as any,
      impact_confidence: Number(row.impact_confidence || 50),
      time_horizon: (row.time_horizon || 'unclear') as any,
      catalysts: row.catalysts_json ? JSON.parse(row.catalysts_json) : [],
      risks: row.risks_json ? JSON.parse(row.risks_json) : [],
      key_facts: row.key_facts_json ? JSON.parse(row.key_facts_json) : [],
      mentioned_companies: row.mentioned_companies_json ? JSON.parse(row.mentioned_companies_json) : [],
      analysis_confidence: Number(row.analysis_confidence || 75),
      raw_response_json: row.raw_response_json ? String(row.raw_response_json) : undefined,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  }
}
