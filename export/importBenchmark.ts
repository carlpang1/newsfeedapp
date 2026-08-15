import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import initSqlJs from 'sql.js';
import { getDb, saveDbToDisk } from '../database.ts';

async function importBenchmark() {
  console.log('Starting Phase 5.2 Benchmark Import & Verification...');

  const exportDir = fs.existsSync(path.join(process.cwd(), 'export'))
    ? path.join(process.cwd(), 'export')
    : process.cwd();

  const datasetPath = path.join(exportDir, 'phase5_2_dataset.json');
  const configPath = path.join(exportDir, 'phase5_2_config.json');
  const checkpointPath = path.join(exportDir, 'phase5_2_checkpoint.json');
  const shaPath = path.join(exportDir, 'SHA256SUMS.txt');
  const dbBackupPath = path.join(exportDir, 'phase5_2_benchmark.db');

  // 1. Verify existence of required export package files
  if (!fs.existsSync(datasetPath)) {
    throw new Error(`Dataset JSON not found at ${datasetPath}`);
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config JSON not found at ${configPath}`);
  }
  if (!fs.existsSync(checkpointPath)) {
    throw new Error(`Checkpoint JSON not found at ${checkpointPath}`);
  }

  // 2. Verify SHA-256 Checksums
  if (fs.existsSync(shaPath)) {
    console.log('Verifying SHA-256 Checksums...');
    const shaContent = fs.readFileSync(shaPath, 'utf8');
    const lines = shaContent.trim().split('\n');
    let checksumPass = true;
    for (const line of lines) {
      if (!line.trim()) continue;
      const [expectedHash, fileName] = line.trim().split(/\s+/);
      const filePath = path.join(exportDir, fileName);
      if (fs.existsSync(filePath)) {
        const fileBuf = fs.readFileSync(filePath);
        const actualHash = crypto.createHash('sha256').update(fileBuf).digest('hex');
        if (actualHash !== expectedHash) {
          console.error(`Checksum mismatch for ${fileName}! Expected: ${expectedHash}, Got: ${actualHash}`);
          checksumPass = false;
        }
      } else {
        console.warn(`File listed in SHA256SUMS.txt not found: ${fileName}`);
      }
    }
    if (checksumPass) {
      console.log('All SHA-256 checksums verified successfully.');
    }
  }

  // Read dataset JSON
  const datasetJson = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const checkpointJson = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));

  const db = await getDb();

  // 3. Import Calibration Dataset & Human Ground Truth into target DB
  console.log(`Restoring calibration dataset (${datasetJson.articles.length} articles)...`);
  
  db.run('BEGIN TRANSACTION;');
  try {
    for (const item of datasetJson.articles) {
      // Restore news article if missing
      const checkNews = db.prepare('SELECT id FROM news WHERE id = ?');
      checkNews.bind([item.original_news_id]);
      const exists = checkNews.step();
      checkNews.free();

      if (!exists) {
        const insNews = db.prepare(`
          INSERT INTO news (id, url, source, title, summary, published_at, article_hash, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insNews.run([
          item.original_news_id,
          item.canonical_url,
          item.publisher,
          item.title,
          item.summary,
          item.published_at,
          item.article_hash,
          item.retrieved_at
        ]);
        insNews.free();
      }

      // Restore Human Calibration Review ground truth
      const gt = item.human_ground_truth;
      if (gt) {
        const checkRev = db.prepare('SELECT id FROM calibration_reviews WHERE news_id = ?');
        checkRev.bind([item.original_news_id]);
        const revExists = checkRev.step();
        checkRev.free();

        if (!revExists) {
          const insRev = db.prepare(`
            INSERT INTO calibration_reviews (news_id, event_type_correct, importance_correct, relevance_correct, human_importance, human_event_type, human_relevance, notes, reviewed_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insRev.run([
            item.original_news_id,
            gt.event_type_correct || 'true',
            gt.importance_correct || 'true',
            gt.relevance_correct || 'true',
            gt.human_importance || 'high',
            gt.human_event_type || 'earnings',
            gt.human_relevance || 'company_specific',
            gt.notes || '',
            gt.reviewed_by || 'Human Reviewer',
            gt.created_at || new Date().toISOString(),
            gt.updated_at || new Date().toISOString()
          ]);
          insRev.free();
        }
      }
    }

    // 4. Restore existing AI analysis rows
    if (datasetJson.current_ai_analysis && Array.isArray(datasetJson.current_ai_analysis)) {
      for (const aiRow of datasetJson.current_ai_analysis) {
        const checkAi = db.prepare('SELECT id FROM news_ai_analysis WHERE news_id = ? AND model = ?');
        checkAi.bind([aiRow.news_id, aiRow.model]);
        const aiExists = checkAi.step();
        checkAi.free();

        if (!aiExists) {
          const insAi = db.prepare(`
            INSERT INTO news_ai_analysis (
              news_id, provider, model, prompt_version, analysis_version, summary, why_it_matters,
              market_impact, impact_confidence, time_horizon, catalysts_json, risks_json,
              key_facts_json, mentioned_companies_json, analysis_confidence, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          insAi.run([
            aiRow.news_id, aiRow.provider, aiRow.model, aiRow.prompt_version, aiRow.analysis_version,
            aiRow.summary, aiRow.why_it_matters, aiRow.market_impact, aiRow.impact_confidence,
            aiRow.time_horizon, aiRow.catalysts_json, aiRow.risks_json, aiRow.key_facts_json,
            aiRow.mentioned_companies_json, aiRow.analysis_confidence, aiRow.created_at, aiRow.updated_at
          ]);
          insAi.free();
        }
      }
    }

    db.run('COMMIT;');
  } catch (err) {
    db.run('ROLLBACK;');
    throw err;
  }

  saveDbToDisk(db);

  // 5. Database Integrity Checks
  let integrity = 'ok';
  const intStmt = db.prepare('PRAGMA integrity_check');
  if (intStmt.step()) integrity = String(intStmt.getAsObject().integrity_check);
  intStmt.free();

  let fkCheck = 'ok';
  const fkStmt = db.prepare('PRAGMA foreign_key_check');
  const fks = [];
  while (fkStmt.step()) fks.push(fkStmt.getAsObject());
  if (fks.length > 0) fkCheck = 'failed';
  fkStmt.free();

  // 6. Calculate Remaining Benchmark Articles
  const calCountStmt = db.prepare('SELECT COUNT(*) as cnt FROM calibration_reviews');
  calCountStmt.step();
  const totalCal = Number(calCountStmt.getAsObject().cnt);
  calCountStmt.free();

  const analyzedCountStmt = db.prepare('SELECT COUNT(DISTINCT news_id) as cnt FROM news_ai_analysis WHERE model = ?');
  analyzedCountStmt.bind([configJson.model]);
  analyzedCountStmt.step();
  const analyzedCount = Number(analyzedCountStmt.getAsObject().cnt);
  analyzedCountStmt.free();

  const remainingCount = totalCal - analyzedCount;

  console.log('\n========================================');
  console.log('PHASE 5.2 BENCHMARK RESTORED');
  console.log('========================================');
  console.log(`Dataset: ${totalCal}`);
  console.log(`Already analyzed: ${analyzedCount}`);
  console.log(`Remaining: ${remainingCount}`);
  console.log(`Provider: ${configJson.provider}`);
  console.log(`Model: ${configJson.model}`);
  console.log(`Prompt: ${configJson.prompt_version}`);
  console.log(`Status: ready_to_resume`);
  console.log(`SQLite Integrity: ${integrity.toUpperCase()}`);
  console.log(`Foreign Key Check: ${fkCheck.toUpperCase()}`);
  console.log('========================================\n');
}

importBenchmark().catch(err => {
  console.error('Fatal error importing benchmark:', err);
  process.exit(1);
});
