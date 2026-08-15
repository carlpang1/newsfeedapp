import { getDb, saveDbToDisk } from '../database.js';
import { AIEngine } from '../services/aiEngine.js';
import { GeminiAIProvider } from '../services/aiProvider.js';
import { getAIConfig } from '../config.js';
import { logger } from '../services/logger.js';

interface ValidationResult {
  articleId: number;
  category: string;
  ticker: string;
  title: string;
  publisher: string;
  publishedAt: string;
  deterministicEvent: string;
  deterministicImportance: number;
  deterministicRelevance: number;
  deterministicExplanation: any;
  geminiOutput?: any;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCost: number;
  success: boolean;
  error?: string;
}

async function runProductionValidation() {
  const db = await getDb();
  const config = getAIConfig();
  console.log(`==================================================`);
  console.log(`PHASE 5 AI — REPRESENTATIVE PRODUCTION VALIDATION`);
  console.log(`Configuration: Provider=${config.provider}, Model=${config.model}`);
  console.log(`==================================================\n`);

  // Verify row count before
  const beforeCountStmt = db.prepare('SELECT COUNT(*) as count FROM news_ai_analysis');
  beforeCountStmt.step();
  const rowsBefore = Number(beforeCountStmt.getAsObject().count || 0);
  beforeCountStmt.free();
  console.log(`news_ai_analysis rows BEFORE: ${rowsBefore}`);

  // Test set: Exactly 3 representative articles
  const testArticles = [
    { id: 207, category: 'HIGH IMPACT (M&A / Capital Allocation)' },
    { id: 136, category: 'MEDIUM IMPACT (Analyst Price Target Revision)' },
    { id: 6,   category: 'NOISY / LOW VALUE (Promotional Stock Comparison Listicle)' }
  ];

  const results: ValidationResult[] = [];
  const geminiProvider = new GeminiAIProvider(config.model);

  for (const item of testArticles) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing Article ID ${item.id} [${item.category}]...`);
    console.log(`--------------------------------------------------`);

    // 1. Load original article from SQLite
    const articleStmt = db.prepare(`
      SELECT n.id, n.title, n.publisher, n.published_at, n.summary, n.url,
             na.event_type, na.importance_score, na.relevance_score, na.explanation_json
      FROM news n
      LEFT JOIN news_analysis na ON n.id = na.news_id
      WHERE n.id = $id
    `);
    articleStmt.bind({ $id: item.id });
    if (!articleStmt.step()) {
      console.error(`Article ID ${item.id} not found in database!`);
      articleStmt.free();
      continue;
    }
    const rawArticle = articleStmt.getAsObject() as any;
    articleStmt.free();

    // Load tickers
    const tStmt = db.prepare(`
      SELECT t.symbol FROM ticker_news tn JOIN tickers t ON tn.ticker_id = t.id WHERE tn.news_id = $id
    `);
    tStmt.bind({ $id: item.id });
    const tickers: string[] = [];
    while (tStmt.step()) {
      tickers.push(String(tStmt.getAsObject().symbol));
    }
    tStmt.free();

    const startTime = Date.now();
    try {
      const res = await AIEngine.analyzeSingleArticle(db, item.id, {
        force: true,
        provider: geminiProvider
      });
      const latencyMs = Date.now() - startTime;

      if (res.success && res.analysis) {
        saveDbToDisk(db);
        console.log(`✓ Analysis succeeded in ${latencyMs}ms`);
        console.log(`  Market Impact: ${res.analysis.market_impact} (Confidence: ${res.analysis.impact_confidence}%)`);
        console.log(`  Time Horizon: ${res.analysis.time_horizon}`);
        console.log(`  Summary: ${res.analysis.summary}`);
        console.log(`  Why It Matters: ${res.analysis.why_it_matters}`);
        console.log(`  Key Facts (${res.analysis.key_facts.length}): ${JSON.stringify(res.analysis.key_facts)}`);
        console.log(`  Catalysts (${res.analysis.catalysts.length}): ${JSON.stringify(res.analysis.catalysts)}`);
        console.log(`  Risks (${res.analysis.risks.length}): ${JSON.stringify(res.analysis.risks)}`);
        console.log(`  Mentioned Companies: ${JSON.stringify(res.analysis.mentioned_companies)}`);

        // Read usage log for this request
        const logStmt = db.prepare(`
          SELECT input_tokens, output_tokens, estimated_cost FROM ai_usage_logs
          WHERE news_id = $news_id ORDER BY id DESC LIMIT 1
        `);
        logStmt.bind({ $news_id: item.id });
        let inputTokens = 0;
        let outputTokens = 0;
        let estimatedCost = 0;
        if (logStmt.step()) {
          const logRow = logStmt.getAsObject() as any;
          inputTokens = Number(logRow.input_tokens || 0);
          outputTokens = Number(logRow.output_tokens || 0);
          estimatedCost = Number(logRow.estimated_cost || 0);
        }
        logStmt.free();

        results.push({
          articleId: item.id,
          category: item.category,
          ticker: tickers.join(', ') || 'N/A',
          title: rawArticle.title,
          publisher: rawArticle.publisher,
          publishedAt: rawArticle.published_at,
          deterministicEvent: rawArticle.event_type,
          deterministicImportance: rawArticle.importance_score,
          deterministicRelevance: rawArticle.relevance_score,
          deterministicExplanation: rawArticle.explanation_json ? JSON.parse(rawArticle.explanation_json) : null,
          geminiOutput: res.analysis,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCost,
          success: true
        });
      } else {
        console.error(`✗ Analysis failed: ${res.error}`);
        results.push({
          articleId: item.id,
          category: item.category,
          ticker: tickers.join(', ') || 'N/A',
          title: rawArticle.title,
          publisher: rawArticle.publisher,
          publishedAt: rawArticle.published_at,
          deterministicEvent: rawArticle.event_type,
          deterministicImportance: rawArticle.importance_score,
          deterministicRelevance: rawArticle.relevance_score,
          deterministicExplanation: rawArticle.explanation_json ? JSON.parse(rawArticle.explanation_json) : null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs,
          estimatedCost: 0,
          success: false,
          error: res.error
        });
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      console.error(`✗ Exception during analysis: ${err.message}`);
      results.push({
        articleId: item.id,
        category: item.category,
        ticker: tickers.join(', ') || 'N/A',
        title: rawArticle.title,
        publisher: rawArticle.publisher,
        publishedAt: rawArticle.published_at,
        deterministicEvent: rawArticle.event_type,
        deterministicImportance: rawArticle.importance_score,
        deterministicRelevance: rawArticle.relevance_score,
        deterministicExplanation: rawArticle.explanation_json ? JSON.parse(rawArticle.explanation_json) : null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs,
        estimatedCost: 0,
        success: false,
        error: err.message
      });
    }
  }

  // Final disk sync
  saveDbToDisk(db);

  // Database verification
  console.log(`\n==================================================`);
  console.log(`DATABASE VERIFICATION`);
  console.log(`==================================================`);
  const afterCountStmt = db.prepare('SELECT COUNT(*) as count FROM news_ai_analysis');
  afterCountStmt.step();
  const rowsAfter = Number(afterCountStmt.getAsObject().count || 0);
  afterCountStmt.free();

  const integrityRes = db.exec('PRAGMA integrity_check;');
  const foreignKeyRes = db.exec('PRAGMA foreign_key_check;');
  const dupCheckRes = db.exec(`
    SELECT news_id, provider, model, analysis_version, COUNT(*) as cnt
    FROM news_ai_analysis
    GROUP BY news_id, provider, model, analysis_version
    HAVING cnt > 1
  `);

  console.log(`Rows Before: ${rowsBefore}`);
  console.log(`Rows After: ${rowsAfter}`);
  console.log(`Net Persisted: ${rowsAfter - rowsBefore}`);
  console.log(`Integrity Check: ${integrityRes[0]?.values[0][0]}`);
  console.log(`Foreign Key Check Violations: ${foreignKeyRes.length === 0 || foreignKeyRes[0]?.values?.length === 0 ? '0' : foreignKeyRes[0]?.values?.length}`);
  console.log(`Duplicate Rows: ${dupCheckRes.length === 0 || dupCheckRes[0]?.values?.length === 0 ? '0' : dupCheckRes[0]?.values?.length}`);

  console.log(`\nFINAL_VALIDATION_RESULTS_JSON_START`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`FINAL_VALIDATION_RESULTS_JSON_END`);
}

runProductionValidation().catch(console.error);
