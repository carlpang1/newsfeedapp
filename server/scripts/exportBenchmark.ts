import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import initSqlJs from 'sql.js';
import { getDb } from '../database.ts';

async function exportBenchmark() {
  console.log('Starting Phase 5.2 Benchmark Transfer Export...');

  const db = await getDb();
  const exportDir = path.join(process.cwd(), 'export');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  // 1. Fetch Calibration Reviews & Articles
  const calStmt = db.prepare('SELECT * FROM calibration_reviews');
  const calibrationReviews: any[] = [];
  while (calStmt.step()) {
    calibrationReviews.push(calStmt.getAsObject());
  }
  calStmt.free();

  const newsIds = calibrationReviews.map(r => r.news_id);
  console.log(`Found ${calibrationReviews.length} calibration review records.`);

  // Fetch news articles details
  const newsList: any[] = [];
  const newsAnalysisList: any[] = [];
  const tickerNewsList: any[] = [];
  const tickersMap: { [key: number]: string[] } = {};

  for (const id of newsIds) {
    // News
    const nStmt = db.prepare('SELECT * FROM news WHERE id = ?');
    nStmt.bind([id]);
    if (nStmt.step()) {
      newsList.push(nStmt.getAsObject());
    }
    nStmt.free();

    // Deterministic News Analysis
    const naStmt = db.prepare('SELECT * FROM news_analysis WHERE news_id = ?');
    naStmt.bind([id]);
    if (naStmt.step()) {
      newsAnalysisList.push(naStmt.getAsObject());
    }
    naStmt.free();

    // Tickers
    const tnStmt = db.prepare(`
      SELECT tn.*, t.symbol 
      FROM ticker_news tn 
      JOIN tickers t ON tn.ticker_id = t.id 
      WHERE tn.news_id = ?
    `);
    tnStmt.bind([id]);
    const ticks: string[] = [];
    while (tnStmt.step()) {
      const row = tnStmt.getAsObject();
      tickerNewsList.push(row);
      ticks.push(String(row.symbol));
    }
    tnStmt.free();
    tickersMap[id] = ticks;
  }

  // Combine Calibration Dataset JSON
  const datasetItems = calibrationReviews.map(rev => {
    const newsItem = newsList.find(n => n.id === rev.news_id) || {};
    const newsAnalysisItem = newsAnalysisList.find(na => na.news_id === rev.news_id) || {};
    return {
      original_news_id: rev.news_id,
      tickers: tickersMap[rev.news_id] || [],
      title: newsItem.title || '',
      canonical_url: newsItem.url || '',
      publisher: newsItem.source || '',
      published_at: newsItem.published_at || '',
      summary: newsItem.summary || '',
      article_hash: newsItem.article_hash || '',
      retrieved_at: newsItem.created_at || '',
      deterministic_analysis: {
        event_type: newsAnalysisItem.event_type || 'other',
        importance_score: newsAnalysisItem.importance_score || 0,
        relevance_score: newsAnalysisItem.relevance_score || 0,
        importance_factors: newsAnalysisItem.importance_factors_json ? JSON.parse(newsAnalysisItem.importance_factors_json) : [],
        relevance_factors: newsAnalysisItem.relevance_factors_json ? JSON.parse(newsAnalysisItem.relevance_factors_json) : [],
      },
      human_ground_truth: {
        calibration_review_id: rev.id,
        human_event_type: rev.human_event_type,
        human_importance: rev.human_importance,
        human_relevance: rev.human_relevance,
        event_type_correct: rev.event_type_correct,
        importance_correct: rev.importance_correct,
        relevance_correct: rev.relevance_correct,
        notes: rev.notes,
        reviewed_by: rev.reviewed_by,
        created_at: rev.created_at,
        updated_at: rev.updated_at
      }
    };
  });

  // Export AI state
  const aiAnalysisRows: any[] = [];
  const aiStmt = db.prepare('SELECT * FROM news_ai_analysis');
  while (aiStmt.step()) {
    aiAnalysisRows.push(aiStmt.getAsObject());
  }
  aiStmt.free();

  const aiLogsRows: any[] = [];
  const logStmt = db.prepare('SELECT * FROM ai_usage_logs');
  while (logStmt.step()) {
    aiLogsRows.push(logStmt.getAsObject());
  }
  logStmt.free();

  const datasetJson = {
    export_version: '1.0',
    export_timestamp: new Date().toISOString(),
    total_articles: datasetItems.length,
    articles: datasetItems,
    current_ai_analysis: aiAnalysisRows,
    ai_usage_logs: aiLogsRows
  };

  const datasetPath = path.join(exportDir, 'phase5_2_dataset.json');
  fs.writeFileSync(datasetPath, JSON.stringify(datasetJson, null, 2));
  console.log(`Saved dataset JSON to ${datasetPath}`);

  // 2. Export Config JSON
  const configJson = {
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    prompt_version: 'news-analysis-v1',
    analysis_version: '1.0',
    dataset_size: 95,
    benchmark_mode: true,
    GEMINI_API_KEY: '<SET_IN_NEW_ENVIRONMENT>'
  };
  const configPath = path.join(exportDir, 'phase5_2_config.json');
  fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2));
  console.log(`Saved config JSON to ${configPath}`);

  // 3. Export Benchmark Checkpoint JSON
  const checkpointJson = {
    dataset: {
      name: 'Phase 5.2 AI Quality Benchmark Calibration Dataset',
      total_articles: newsIds.length,
      article_ids: newsIds
    },
    progress: {
      successful: aiAnalysisRows.length,
      failed: newsIds.length - aiAnalysisRows.length,
      remaining: newsIds.length - aiAnalysisRows.length,
      already_analyzed: aiAnalysisRows.length
    },
    configuration: {
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      prompt_version: 'news-analysis-v1',
      analysis_version: '1.0'
    },
    status: {
      current_status: 'paused_quota',
      quota_exhausted: true,
      last_processed_article_id: null,
      last_successful_article_id: null,
      timestamp: new Date().toISOString()
    }
  };
  const checkpointPath = path.join(exportDir, 'phase5_2_checkpoint.json');
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpointJson, null, 2));
  console.log(`Saved checkpoint JSON to ${checkpointPath}`);

  // 4. Export SQLite DB Backup
  const srcDbPath = path.join(process.cwd(), 'data', 'news.db');
  const targetDbPath = path.join(exportDir, 'phase5_2_benchmark.db');
  fs.copyFileSync(srcDbPath, targetDbPath);
  console.log(`Copied database backup to ${targetDbPath}`);

  // Verify SQLite DB Integrity on backup
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(targetDbPath);
  const checkDb = new SQL.Database(fileBuffer);
  
  let integrityResult = 'unknown';
  const intStmt = checkDb.prepare('PRAGMA integrity_check');
  if (intStmt.step()) {
    integrityResult = String(intStmt.getAsObject().integrity_check);
  }
  intStmt.free();

  let fkResult = 'ok';
  const fkStmt = checkDb.prepare('PRAGMA foreign_key_check');
  const fks = [];
  while (fkStmt.step()) {
    fks.push(fkStmt.getAsObject());
  }
  if (fks.length > 0) fkResult = 'failed';
  fkStmt.free();
  checkDb.close();

  console.log(`Exported DB Integrity Check: ${integrityResult}`);
  console.log(`Exported DB Foreign Key Check: ${fkResult}`);

  // 5. Create README_PHASE_5_2_TRANSFER.md
  const readmeContent = `# Phase 5.2 AI Quality Benchmark — Portable Transfer Package

## Summary
This export package contains the complete, un-truncated **Phase 5.2 AI Quality Benchmark** calibration dataset (95 articles), human ground truth reviews, existing AI analysis state, database snapshot, configuration settings, and import script.

The benchmark execution on the original environment encountered a Gemini API quota exhaustion (\`429 / RESOURCE_EXHAUSTED\`). This package allows another Google project or environment to resume the benchmark seamlessly from its exact state without data loss or re-running previously analyzed articles.

---

## Package Contents

- **\`phase5_2_benchmark.db\`**: SQLite database snapshot containing all 95 calibration articles, news metadata, ticker mappings, and human ground truth reviews.
- **\`phase5_2_dataset.json\`**: Machine-readable JSON representation of all 95 calibration articles, deterministic scores, and human ground truth reviews.
- **\`phase5_2_config.json\`**: Benchmark configuration file (Provider: \`gemini\`, Model: \`gemini-3.6-flash\`, Prompt: \`news-analysis-v1\`, Analysis version: \`1.0\`).
- **\`phase5_2_checkpoint.json\`**: State checkpoint recording progress and quota status.
- **\`SHA256SUMS.txt\`**: SHA-256 checksums for verifying file integrity after transfer.
- **\`importBenchmark.ts\`**: Import script for restoring database state and preparing the benchmark runner in the new environment.

---

## Instructions for the Target Environment

### Step 1: Extract Export Package
Unzip \`phase5_2_benchmark_transfer.zip\` into your workspace root or \`./export\` folder.

### Step 2: Configure Environment Variable
Configure your own Gemini API Key in the target environment:
\`\`\`bash
export GEMINI_API_KEY="your-actual-gemini-api-key"
\`\`\`
*Note: The API key from the original environment was strictly excluded for security.*

### Step 3: Run the Import & Dry-Run Verification Script
Run the import script to restore database state and verify integrity without making API calls:
\`\`\`bash
npx tsx server/scripts/importBenchmark.ts
\`\`\`

### Step 4: Resume the Benchmark Execution
Execute the resumable benchmark runner to process remaining unanalyzed articles in the target environment:
\`\`\`bash
npx tsx server/scripts/runBatch.ts
\`\`\`

---

## Checkpoint Status at Transfer
- **Total Calibration Dataset**: 95 articles
- **Already Analyzed**: ${aiAnalysisRows.length}
- **Remaining Articles**: ${newsIds.length - aiAnalysisRows.length}
- **Quota Status**: EXHAUSTED ON ORIGINAL ENVIRONMENT
- **Required Model**: \`gemini-3.6-flash\`
- **Prompt Version**: \`news-analysis-v1\`
- **Database Integrity**: ${integrityResult.toUpperCase()}
- **Foreign Key Check**: ${fkResult.toUpperCase()}
`;

  const readmePath = path.join(exportDir, 'README_PHASE_5_2_TRANSFER.md');
  fs.writeFileSync(readmePath, readmeContent);
  console.log(`Saved README to ${readmePath}`);

  // Copy importBenchmark.ts into export directory as well
  const importScriptSource = path.join(process.cwd(), 'server', 'scripts', 'importBenchmark.ts');
  const importScriptTarget = path.join(exportDir, 'importBenchmark.ts');
  if (fs.existsSync(importScriptSource)) {
    fs.copyFileSync(importScriptSource, importScriptTarget);
  }

  // 6. Generate SHA256SUMS.txt
  const exportedFiles = fs.readdirSync(exportDir).filter(f => f !== 'SHA256SUMS.txt' && f !== 'phase5_2_benchmark_transfer.zip');
  let shaSumsContent = '';
  for (const file of exportedFiles) {
    const filePath = path.join(exportDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    shaSumsContent += `${hash}  ${file}\n`;
  }
  const shaPath = path.join(exportDir, 'SHA256SUMS.txt');
  fs.writeFileSync(shaPath, shaSumsContent);
  console.log(`Generated SHA256SUMS.txt`);

  console.log('Phase 5.2 Benchmark Export Completed Successfully.');
}

exportBenchmark().catch(err => {
  console.error('Fatal error exporting benchmark:', err);
});
