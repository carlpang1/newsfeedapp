# Phase 5.2 AI Quality Benchmark — Portable Transfer Package

## Summary
This export package contains the complete, un-truncated **Phase 5.2 AI Quality Benchmark** calibration dataset (95 articles), human ground truth reviews, existing AI analysis state, database snapshot, configuration settings, and import script.

The benchmark execution on the original environment encountered a Gemini API quota exhaustion (`429 / RESOURCE_EXHAUSTED`). This package allows another Google project or environment to resume the benchmark seamlessly from its exact state without data loss or re-running previously analyzed articles.

---

## Package Contents

- **`phase5_2_benchmark.db`**: SQLite database snapshot containing all 95 calibration articles, news metadata, ticker mappings, and human ground truth reviews.
- **`phase5_2_dataset.json`**: Machine-readable JSON representation of all 95 calibration articles, deterministic scores, and human ground truth reviews.
- **`phase5_2_config.json`**: Benchmark configuration file (Provider: `gemini`, Model: `gemini-3.6-flash`, Prompt: `news-analysis-v1`, Analysis version: `1.0`).
- **`phase5_2_checkpoint.json`**: State checkpoint recording progress and quota status.
- **`SHA256SUMS.txt`**: SHA-256 checksums for verifying file integrity after transfer.
- **`importBenchmark.ts`**: Import script for restoring database state and preparing the benchmark runner in the new environment.

---

## Instructions for the Target Environment

### Step 1: Extract Export Package
Unzip `phase5_2_benchmark_transfer.zip` into your workspace root or `./export` folder.

### Step 2: Configure Environment Variable
Configure your own Gemini API Key in the target environment:
```bash
export GEMINI_API_KEY="your-actual-gemini-api-key"
```
*Note: The API key from the original environment was strictly excluded for security.*

### Step 3: Run the Import & Dry-Run Verification Script
Run the import script to restore database state and verify integrity without making API calls:
```bash
npx tsx server/scripts/importBenchmark.ts
```

### Step 4: Resume the Benchmark Execution
Execute the resumable benchmark runner to process remaining unanalyzed articles in the target environment:
```bash
npx tsx server/scripts/runBatch.ts
```

---

## Checkpoint Status at Transfer
- **Total Calibration Dataset**: 95 articles
- **Already Analyzed**: 0
- **Remaining Articles**: 95
- **Quota Status**: EXHAUSTED ON ORIGINAL ENVIRONMENT
- **Required Model**: `gemini-3.6-flash`
- **Prompt Version**: `news-analysis-v1`
- **Database Integrity**: OK
- **Foreign Key Check**: OK
