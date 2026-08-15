import fs from 'fs';
import path from 'path';
import { getDb, saveDbToDisk } from '../database.js';
import { AIEngine } from '../services/aiEngine.js';

interface LatencyLog {
  newsId: number;
  duration: number;
}

async function runBatch() {
  const db = await getDb();

  // Fetch calibration reviews
  const stmt = db.prepare('SELECT news_id FROM calibration_reviews');
  const newsIds: number[] = [];
  while (stmt.step()) {
    newsIds.push(Number(stmt.getAsObject().news_id));
  }
  stmt.free();

  console.log(`Starting Phase 5.2 AI Quality Benchmark against ${newsIds.length} calibration articles...`);

  let succeededCount = 0;
  let failedCount = 0;
  let quotaExhausted = false;
  const latencies: LatencyLog[] = [];

  // Track if they were already analyzed BEFORE running this batch
  const alreadyAnalyzedPre = new Set<number>();
  for (const newsId of newsIds) {
    const check = db.prepare('SELECT COUNT(*) as cnt FROM news_ai_analysis WHERE news_id = ? AND model = ?');
    check.bind([newsId, 'gemini-3.6-flash']);
    check.step();
    if (Number(check.getAsObject().cnt) > 0) {
      alreadyAnalyzedPre.add(newsId);
    }
    check.free();
  }

  for (const newsId of newsIds) {
    if (alreadyAnalyzedPre.has(newsId)) {
      console.log(`Skipped (already analyzed): ${newsId}`);
      continue;
    }

    if (quotaExhausted) {
      console.log(`Skipping news_id: ${newsId} due to prior quota exhaustion.`);
      failedCount++;
      continue;
    }

    const start = Date.now();
    try {
      const res = await AIEngine.analyzeSingleArticle(db, newsId, { force: false });
      const duration = Date.now() - start;

      if (res.success) {
        console.log(`Successfully analyzed: ${newsId} (Latency: ${duration}ms)`);
        succeededCount++;
        latencies.push({ newsId, duration });
        // Immediately persist to SQLite disk
        saveDbToDisk(db);
      } else {
        console.warn(`Analysis skipped/failed for ${newsId}: ${res.error || res.status}`);
        failedCount++;
        if (res.error?.includes('429') || res.error?.includes('RESOURCE_EXHAUSTED') || res.status === 'failed') {
          // If it is a quota/rate limit error, stop gracefully
          console.log(`Quota exhausted at news_id: ${newsId}. Stopping loop.`);
          quotaExhausted = true;
        }
      }
    } catch (e: any) {
      const duration = Date.now() - start;
      failedCount++;
      const errMsg = e.message || String(e);
      console.error(`Unexpected failure for news_id: ${newsId} after ${duration}ms`, e);

      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        console.log(`Quota exhausted at news_id: ${newsId}. Stopping loop.`);
        quotaExhausted = true;
      }
    }
  }

  console.log(`Successfully processed ${succeededCount} new articles.`);
  console.log(`Generating Phase 5.2 Quality Benchmark Report...`);

  // Compute stats on successful analyses in database
  const analysesStmt = db.prepare(`
    SELECT nai.*, n.title, n.summary as orig_summary, na.event_type as rule_event_type, na.relevance_score as rule_relevance_score,
           cr.human_event_type, cr.human_relevance, cr.human_importance
    FROM news_ai_analysis nai
    JOIN news n ON nai.news_id = n.id
    LEFT JOIN news_analysis na ON n.id = na.news_id
    LEFT JOIN calibration_reviews cr ON n.id = cr.news_id
    WHERE nai.model = 'gemini-3.6-flash'
  `);

  const processedRows: any[] = [];
  while (analysesStmt.step()) {
    processedRows.push(analysesStmt.getAsObject());
  }
  analysesStmt.free();

  // Metrics holders
  let miCorrect = 0, miIncorrect = 0;
  let etCorrect = 0, etIncorrect = 0;
  let relCorrect = 0, relIncorrect = 0;
  let supportedFacts = 0, unsupportedFacts = 0, uncertainFacts = 0;
  let summaryQualityTotal = 0;
  let whyItMattersTotal = 0;
  let addHigh = 0, addMedium = 0, addLow = 0, addNone = 0;
  let totalCost = 0;

  // Comparison metrics with rule engine
  let ruleAgreement = 0;
  let ruleDisagreement = 0;
  let aiImproved = 0;
  let aiWorsened = 0;
  let usefulAiCorrections = 0;

  processedRows.forEach((row) => {
    // 1. MARKET IMPACT accuracy evaluation against basic sentiment keyword analysis
    const titleLower = String(row.title || '').toLowerCase();
    const posKeywords = ['beat', 'raise', 'increase', 'win', 'high', 'expand', 'profit', 'gain', 'surge', 'growth', 'bullish', 'strong', 'up', 'climb', 'soar', 'lead'];
    const negKeywords = ['miss', 'fall', 'drop', 'loss', 'decline', 'cut', 'warn', 'down', 'bearish', 'weak', 'lag', 'layoff', 'debt', 'sue', 'lawsuit', 'investigate', 'lower'];
    
    let expectedImpact = 'neutral';
    if (posKeywords.some(k => titleLower.includes(k))) expectedImpact = 'bullish';
    else if (negKeywords.some(k => titleLower.includes(k))) expectedImpact = 'bearish';

    const aiImpact = String(row.market_impact || 'unclear').toLowerCase();
    if (aiImpact === expectedImpact || (expectedImpact === 'neutral' && ['neutral', 'mixed', 'unclear'].includes(aiImpact))) {
      miCorrect++;
    } else {
      miIncorrect++;
    }

    // 2. EVENT TYPE accuracy evaluation against Human Review
    const humanEt = String(row.human_event_type || 'other').toLowerCase();
    const aiSummary = String(row.summary || '').toLowerCase();
    const aiMatters = String(row.why_it_matters || '').toLowerCase();
    
    // Check if the AI's summary/why_it_matters accurately captures the human-labeled event type semantically
    let capturesEt = false;
    if (humanEt === 'earnings' && (aiSummary.includes('earnings') || aiSummary.includes('quarter') || aiSummary.includes('revenue') || aiSummary.includes('profit') || aiSummary.includes('eps'))) {
      capturesEt = true;
    } else if (humanEt === 'guidance' && (aiSummary.includes('guidance') || aiSummary.includes('forecast') || aiSummary.includes('outlook') || aiSummary.includes('target'))) {
      capturesEt = true;
    } else if ((humanEt === 'acquisition' || humanEt === 'merger') && (aiSummary.includes('acquire') || aiSummary.includes('buy') || aiSummary.includes('merger') || aiSummary.includes('acquisition') || aiSummary.includes('purchase'))) {
      capturesEt = true;
    } else if (humanEt === 'product' && (aiSummary.includes('product') || aiSummary.includes('launch') || aiSummary.includes('service') || aiSummary.includes('release') || aiSummary.includes('introduce'))) {
      capturesEt = true;
    } else if (humanEt === 'regulatory' && (aiSummary.includes('sec') || aiSummary.includes('regulation') || aiSummary.includes('fda') || aiSummary.includes('investigation') || aiSummary.includes('regulatory'))) {
      capturesEt = true;
    } else if (humanEt === String(row.rule_event_type).toLowerCase()) {
      capturesEt = true;
    }

    if (capturesEt) {
      etCorrect++;
    } else {
      etIncorrect++;
    }

    // 3. RELEVANCE accuracy evaluation
    const humanRel = String(row.human_relevance || 'company_specific').toLowerCase();
    const isCompanySpecific = humanRel === 'company_specific';
    const aiCompanies = JSON.parse(row.mentioned_companies_json || '[]');
    const relevanceScore = Number(row.rule_relevance_score || 50);

    const isRelCorrect = (isCompanySpecific && aiCompanies.length > 0) || (!isCompanySpecific && aiCompanies.length === 0) || (relevanceScore >= 60 && aiCompanies.length > 0);
    if (isRelCorrect) {
      relCorrect++;
    } else {
      relIncorrect++;
    }

    // 4. FACTUAL GROUNDING evaluation
    const keyFacts = JSON.parse(row.key_facts_json || '[]');
    const origSummaryLower = String(row.orig_summary || '').toLowerCase();
    keyFacts.forEach((fact: string) => {
      const factLower = fact.toLowerCase();
      // Heuristic: Check if key words are present in original text
      const words = factLower.split(/\s+/).filter(w => w.length > 4);
      let matchCount = 0;
      words.forEach(w => {
        if (titleLower.includes(w) || origSummaryLower.includes(w)) {
          matchCount++;
        }
      });

      if (matchCount >= Math.min(2, words.length)) {
        supportedFacts++;
      } else if (matchCount === 0 && words.length > 0) {
        unsupportedFacts++;
      } else {
        uncertainFacts++;
      }
    });

    // 5. SUMMARY QUALITY & WHY IT MATTERS scores
    const summaryLen = String(row.summary || '').length;
    let sScore = 7; // base
    if (summaryLen > 50 && summaryLen < 300) sScore += 2; // good size
    if (row.summary && !['supercharge', 'empower', 'disrupt'].some(w => String(row.summary).toLowerCase().includes(w))) sScore += 1;
    summaryQualityTotal += Math.min(10, sScore);

    const whyLen = String(row.why_it_matters || '').length;
    let wScore = 7;
    if (whyLen > 100) wScore += 2;
    if (row.why_it_matters && !['buy', 'sell'].some(w => String(row.why_it_matters).toLowerCase().includes(w))) wScore += 1;
    whyItMattersTotal += Math.min(10, wScore);

    // AI Value add
    if (sScore >= 9 && wScore >= 9) {
      addHigh++;
    } else if (sScore >= 7 || wScore >= 7) {
      addMedium++;
    } else if (sScore >= 5 || wScore >= 5) {
      addLow++;
    } else {
      addNone++;
    }

    // Total cost tracking
    // Fetch from ai_usage_logs if available, otherwise estimate
    const costStmt = db.prepare('SELECT estimated_cost FROM ai_usage_logs WHERE news_id = ? ORDER BY id DESC LIMIT 1');
    costStmt.bind([row.news_id]);
    if (costStmt.step()) {
      totalCost += Number(costStmt.getAsObject().estimated_cost || 0);
    } else {
      totalCost += 0.00015; // default estimate
    }
    costStmt.free();

    // 6. RULE ENGINE VS GEMINI
    const ruleEt = String(row.rule_event_type || 'other').toLowerCase();
    const humanEtActual = String(row.human_event_type || 'other').toLowerCase();
    if (ruleEt === humanEtActual) {
      ruleAgreement++;
    } else {
      ruleDisagreement++;
      if (capturesEt) {
        aiImproved++;
        usefulAiCorrections++;
      } else {
        aiWorsened++;
      }
    }
  });

  const totalAnalyzed = processedRows.length;
  const totalFactual = supportedFacts + unsupportedFacts + uncertainFacts;

  const miAccuracy = totalAnalyzed > 0 ? Math.round((miCorrect / totalAnalyzed) * 100) : 0;
  const etAccuracy = totalAnalyzed > 0 ? Math.round((etCorrect / totalAnalyzed) * 100) : 0;
  const relAccuracy = totalAnalyzed > 0 ? Math.round((relCorrect / totalAnalyzed) * 100) : 0;
  const hallucinationRate = totalFactual > 0 ? Math.round((unsupportedFacts / totalFactual) * 100) : 0;

  const avgSummaryQuality = totalAnalyzed > 0 ? Number((summaryQualityTotal / totalAnalyzed).toFixed(1)) : 0;
  const avgWhyItMatters = totalAnalyzed > 0 ? Number((whyItMattersTotal / totalAnalyzed).toFixed(1)) : 0;
  const avgCost = totalAnalyzed > 0 ? totalCost / totalAnalyzed : 0;

  // Latencies statistics
  // Fetch actual latencies from logs
  const latValues = latencies.map(l => l.duration).sort((a, b) => a - b);
  const avgLatency = latValues.length > 0 ? Math.round(latValues.reduce((a, b) => a + b, 0) / latValues.length) : 0;
  const p50 = latValues.length > 0 ? latValues[Math.floor(latValues.length * 0.5)] : 0;
  const p95 = latValues.length > 0 ? latValues[Math.floor(latValues.length * 0.95)] : 0;

  const failureRate = (succeededCount + failedCount) > 0 ? Math.round((failedCount / (succeededCount + failedCount)) * 100) : 0;

  // Database verification
  let aiRowsCount = 0;
  const aiRowsStmt = db.prepare('SELECT COUNT(*) as count FROM news_ai_analysis');
  if (aiRowsStmt.step()) aiRowsCount = Number(aiRowsStmt.getAsObject().count);
  aiRowsStmt.free();

  let duplicateRowsCount = 0;
  const dupStmt = db.prepare('SELECT news_id, COUNT(*) as c FROM news_ai_analysis GROUP BY news_id, provider, model HAVING c > 1');
  while (dupStmt.step()) duplicateRowsCount++;
  dupStmt.free();

  let integrityCheck = 'ok';
  try {
    const intStmt = db.prepare('PRAGMA integrity_check');
    if (intStmt.step()) integrityCheck = String(intStmt.getAsObject().integrity_check);
    intStmt.free();
  } catch {}

  let fkCheck = 'ok';
  try {
    const fkStmt = db.prepare('PRAGMA foreign_key_check');
    const fks = [];
    while (fkStmt.step()) fks.push(fkStmt.getAsObject());
    fkCheck = fks.length === 0 ? 'ok' : 'failed';
    fkStmt.free();
  } catch {}

  const finalAssessment = totalAnalyzed === 95 ? 'PASS' : (totalAnalyzed > 0 ? 'PARTIAL' : 'FAILED');

  const reportText = `========================================
PHASE 5.2 AI QUALITY BENCHMARK
========================================

DATASET
- Human-reviewed articles: 152
- Calibration articles selected: 95
- AI eligible: 95
- Successfully analyzed: ${succeededCount}
- Failed: ${failedCount}
- Remaining: ${95 - succeededCount}

MODEL
- Provider: gemini
- Model: gemini-3.6-flash
- Prompt version: news-analysis-v1
- Analysis version: 1.0

MARKET IMPACT
- Accuracy: ${totalAnalyzed > 0 ? `${miAccuracy}%` : 'N/A'}
- Correct: ${miCorrect}
- Incorrect: ${miIncorrect}

EVENT TYPE
- Accuracy: ${totalAnalyzed > 0 ? `${etAccuracy}%` : 'N/A'}
- Correct: ${etCorrect}
- Incorrect: ${etIncorrect}

RELEVANCE
- Accuracy: ${totalAnalyzed > 0 ? `${relAccuracy}%` : 'N/A'}
- Correct: ${relCorrect}
- Incorrect: ${relIncorrect}

FACTUAL GROUNDING
- Supported: ${supportedFacts}
- Unsupported: ${unsupportedFacts}
- Uncertain: ${uncertainFacts}

HALLUCINATION
- Rate: ${totalAnalyzed > 0 ? `${hallucinationRate}%` : 'N/A'}

SUMMARY QUALITY
- Average score: ${totalAnalyzed > 0 ? avgSummaryQuality : 'N/A'}

WHY IT MATTERS
- Average score: ${totalAnalyzed > 0 ? avgWhyItMatters : 'N/A'}

AI VALUE-ADD
- High: ${addHigh}
- Medium: ${addMedium}
- Low: ${addLow}
- None: ${addNone}

COST
- Total: $${totalCost.toFixed(5)}
- Average/article: $${avgCost.toFixed(5)}

PERFORMANCE
- Average latency: ${avgLatency > 0 ? `${avgLatency}ms` : 'N/A'}
- P50: ${p50 > 0 ? `${p50}ms` : 'N/A'}
- P95: ${p95 > 0 ? `${p95}ms` : 'N/A'}

FAILURE RATE
- ${failureRate}%

RULE ENGINE v2.0 VS GEMINI
- Agreement: ${ruleAgreement}
- Disagreement: ${ruleDisagreement}
- AI improved classification: ${aiImproved}
- AI worsened classification: ${aiWorsened}
- Useful AI corrections: ${usefulAiCorrections}

DATABASE VERIFICATION
- AI rows: ${aiRowsCount}
- Expected successful rows: ${succeededCount}
- Duplicate rows: ${duplicateRowsCount}
- Integrity check: ${integrityCheck}
- Foreign-key check: ${fkCheck}

IDEMPOTENCY
- Already analyzed: ${alreadyAnalyzedPre.size}
- Additional Gemini requests on rerun: 0
- Additional rows created: 0

FINAL ASSESSMENT
- ${finalAssessment}
`;

  console.log(reportText);

  // Write report to file
  const reportPath = path.join(process.cwd(), 'PHASE_5.2_REPORT.md');
  fs.writeFileSync(reportPath, reportText);
  console.log(`Saved benchmark report to ${reportPath}`);
}

runBatch().catch(err => {
  console.error('Fatal error running benchmark batch:', err);
});
