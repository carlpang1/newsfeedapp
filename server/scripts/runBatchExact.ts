import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { getDb, saveDbToDisk } from '../database.ts';

const configPath = path.join(process.cwd(), 'phase5_2_config.json');
const checkpointPath = path.join(process.cwd(), 'phase5_2_checkpoint.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

// Cost constants for gemini flash
const INPUT_PRICE_PER_MILLION = 0.075; // $0.075 / 1M input tokens
const OUTPUT_PRICE_PER_MILLION = 0.30;  // $0.30 / 1M output tokens

async function runBatch5() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const db = await getDb();

  // Find remaining articles in exact order of checkpoint dataset list
  const orderedIds: number[] = checkpoint.dataset.article_ids || checkpoint.dataset.articleIds || [];
  const batchSize = 5;
  const articlesToProcess: any[] = [];

  for (const id of orderedIds) {
    // Check if already analyzed
    const checkStmt = db.prepare(`SELECT id FROM news_ai_analysis WHERE news_id = ? AND model = ?`);
    checkStmt.bind([id, config.model]);
    const exists = checkStmt.step();
    checkStmt.free();

    if (!exists) {
      const getArticleStmt = db.prepare(`SELECT id, title, summary, url, published_at, event_type, importance_score, relevance_score FROM news WHERE id = ?`);
      getArticleStmt.bind([id]);
      if (getArticleStmt.step()) {
        articlesToProcess.push(getArticleStmt.getAsObject());
      }
      getArticleStmt.free();

      if (articlesToProcess.length >= batchSize) {
        break;
      }
    }
  }

  console.log(`[Batch 1/5] Target articles: ${articlesToProcess.map(a => a.id).join(', ')}`);

  let successful = 0;
  let failed = 0;
  let quotaErrors = 0;
  let geminiRequests = 0;
  let persistenceFailures = 0;

  const latencies: number[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const article of articlesToProcess) {
    console.log(`\nProcessing Article ID #${article.id}: "${article.title}"...`);

    const prompt = `Analyze this financial news article for investment impact and sentiment according to News Intelligence v2.0 standards:
Title: ${article.title}
Summary: ${article.summary}
Published Date: ${article.published_at}
Deterministic Event Type: ${article.event_type}
Deterministic Importance Score: ${article.importance_score}
Deterministic Relevance Score: ${article.relevance_score}

Return a valid JSON object matching this schema:
{
  "summary": "Clear, informative 1-2 sentence executive summary.",
  "why_it_matters": "Fundamental significance for investors and market dynamics.",
  "market_impact": "bullish" | "bearish" | "neutral" | "mixed",
  "impact_confidence": number between 0.0 and 1.0,
  "time_horizon": "short_term" | "medium_term" | "long_term",
  "catalysts": ["specific catalyst 1", "specific catalyst 2"],
  "risks": ["specific risk 1", "specific risk 2"],
  "key_facts": ["key factual point 1", "key factual point 2"],
  "mentioned_companies": ["company or ticker symbol"],
  "analysis_confidence": number between 0.0 and 1.0
}`;

    const startTime = Date.now();
    geminiRequests += 1;

    try {
      const response = await ai.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              why_it_matters: { type: Type.STRING },
              market_impact: { type: Type.STRING, enum: ['bullish', 'bearish', 'neutral', 'mixed'] },
              impact_confidence: { type: Type.NUMBER },
              time_horizon: { type: Type.STRING, enum: ['short_term', 'medium_term', 'long_term'] },
              catalysts: { type: Type.ARRAY, items: { type: Type.STRING } },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
              key_facts: { type: Type.ARRAY, items: { type: Type.STRING } },
              mentioned_companies: { type: Type.ARRAY, items: { type: Type.STRING } },
              analysis_confidence: { type: Type.NUMBER }
            },
            required: ['summary', 'why_it_matters', 'market_impact', 'impact_confidence', 'time_horizon']
          }
        }
      });

      const latencyMs = Date.now() - startTime;
      latencies.push(latencyMs);

      const usage = response.usageMetadata;
      const promptTokens = usage?.promptTokenCount || 0;
      const candidatesTokens = usage?.candidatesTokenCount || 0;
      const totalTokens = usage?.totalTokenCount || (promptTokens + candidatesTokens);

      totalInputTokens += promptTokens;
      totalOutputTokens += candidatesTokens;

      const responseText = response.text?.trim() || '{}';
      const parsed = JSON.parse(responseText);

      // Validate required fields
      if (!parsed.summary || !parsed.market_impact) {
        throw new Error('Response failed validation: missing summary or market_impact');
      }

      // Persist to SQLite
      try {
        db.run('BEGIN TRANSACTION;');
        const insStmt = db.prepare(`
          INSERT INTO news_ai_analysis (
            news_id, provider, model, prompt_version, analysis_version, summary, why_it_matters,
            market_impact, impact_confidence, time_horizon, catalysts_json, risks_json,
            key_facts_json, mentioned_companies_json, analysis_confidence, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);

        insStmt.run([
          article.id,
          config.provider,
          config.model,
          config.prompt_version,
          config.analysis_version,
          parsed.summary,
          parsed.why_it_matters || '',
          parsed.market_impact || 'neutral',
          parsed.impact_confidence !== undefined ? parsed.impact_confidence : 0.8,
          parsed.time_horizon || 'medium_term',
          JSON.stringify(parsed.catalysts || []),
          JSON.stringify(parsed.risks || []),
          JSON.stringify(parsed.key_facts || []),
          JSON.stringify(parsed.mentioned_companies || []),
          parsed.analysis_confidence !== undefined ? parsed.analysis_confidence : 0.85
        ]);
        insStmt.free();

        const logStmt = db.prepare(`
          INSERT INTO ai_usage_logs (news_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `);
        logStmt.run([article.id, config.model, promptTokens, candidatesTokens, totalTokens, latencyMs]);
        logStmt.free();

        db.run('COMMIT;');
        saveDbToDisk(db);

        // Only counted as SUCCESS after database persistence succeeds
        successful += 1;

        // Update checkpoint file
        checkpoint.progress.already_analyzed = successful;
        checkpoint.progress.successful = successful;
        checkpoint.progress.remaining = checkpoint.dataset.total_articles - successful;
        checkpoint.status.last_processed_article_id = article.id;
        checkpoint.status.last_successful_article_id = article.id;
        checkpoint.status.quota_exhausted = false;
        checkpoint.status.current_status = 'in_progress';
        checkpoint.status.timestamp = new Date().toISOString();
        fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));

        console.log(`✓ Article #${article.id} successfully analyzed & persisted (${latencyMs}ms, ${totalTokens} tokens)`);
      } catch (dbErr: any) {
        db.run('ROLLBACK;');
        persistenceFailures += 1;
        failed += 1;
        console.error(`Database persistence failed for article #${article.id}:`, dbErr);
        break;
      }
    } catch (apiErr: any) {
      failed += 1;
      const errStr = String(apiErr?.message || apiErr);
      if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
        quotaErrors += 1;
        console.error(`Quota exhausted (429/RESOURCE_EXHAUSTED) on article #${article.id}. Halting execution immediately.`);
        checkpoint.status.quota_exhausted = true;
        checkpoint.status.current_status = 'paused_quota';
        checkpoint.status.timestamp = new Date().toISOString();
        fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
        break;
      } else {
        console.error(`Error during Gemini API call for article #${article.id}:`, apiErr);
        break;
      }
    }
  }

  // Database verification
  const intStmt = db.prepare('PRAGMA integrity_check');
  intStmt.step();
  const integrity = String(intStmt.getAsObject().integrity_check);
  intStmt.free();

  const fkStmt = db.prepare('PRAGMA foreign_key_check');
  const fks: any[] = [];
  while (fkStmt.step()) fks.push(fkStmt.getAsObject());
  fkStmt.free();

  const totalAiRows = Number(db.exec(`SELECT COUNT(*) as c FROM news_ai_analysis WHERE model = '${config.model}'`)[0]?.values[0][0] || 0);
  const duplicateRows = Number(db.exec(`SELECT COUNT(*) - COUNT(DISTINCT news_id) as dup FROM news_ai_analysis WHERE model = '${config.model}'`)[0]?.values[0][0] || 0);

  // Performance calculations
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  // Cost calculations
  const totalCost = (totalInputTokens / 1_000_000 * INPUT_PRICE_PER_MILLION) + (totalOutputTokens / 1_000_000 * OUTPUT_PRICE_PER_MILLION);
  const avgCostPerArticle = successful > 0 ? totalCost / successful : 0;

  console.log('\n========================================');
  console.log('BATCH 1 EXECUTION COMPLETE');
  console.log('========================================');
  console.log(JSON.stringify({
    requested: batchSize,
    successful,
    failed,
    remaining: 95 - totalAiRows,
    geminiRequests,
    quotaErrors,
    totalAiRows,
    persistenceFailures,
    duplicateRows,
    integrity: integrity === 'ok' ? 'PASS' : 'FAIL',
    foreignKeys: fks.length === 0 ? 'PASS' : 'FAIL',
    avgLatency: `${avgLatency}ms`,
    p50: `${p50}ms`,
    p95: `${p95}ms`,
    totalInputTokens,
    totalOutputTokens,
    totalCost: `$${totalCost.toFixed(6)}`,
    avgCostPerArticle: `$${avgCostPerArticle.toFixed(6)}`
  }, null, 2));
}

runBatch5().catch(err => {
  console.error('Batch execution error:', err);
  process.exit(1);
});
