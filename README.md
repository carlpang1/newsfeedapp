# News Intelligence System

A full-stack Financial News Aggregation, Sentiment Scoring, and Ticker Intelligence application built with **React 19**, **Vite**, **Express**, **SQLite (sql.js)**, and **Google Gemini 2.5 Flash**.

---

## 🌟 Key Features

1. **Aggregated Financial News Feed**:
   - Automated RSS fetching from Yahoo Finance & simulated providers.
   - Multi-ticker support with custom portfolio watchlists & bulk CSV import.
   - Syndication deduplication via URL normalization and content hashing.

2. **Deterministic Sentiment Rule Engine v2.0**:
   - Calculates real-time directional sentiment scores (1–100) based on weighted factors:
     - Recency decay weighting.
     - Event type impact multipliers (earnings, guidance, acquisitions, legal, regulatory).
     - Importance and relevance scoring.
   - Direction classification: **BULLISH** (51–100), **BEARISH** (1–49), and **NEUTRAL** (50).

3. **Ticker Intelligence Summary**:
   - Dedicated summary view ranking all tickers by calculated overall score.
   - Period selector (**24 Hours**, **7 Days**, **30 Days**, **All Time**, **Custom Date Range**).
   - Ticker selector (**All Tickers** or specific ticker symbol).
   - Displays positive factors, negative factors, and most important news per ticker.

4. **Gemini AI Qualitative Analysis & Quota Protection**:
   - Optional qualitative summary generation using Gemini 2.5 Flash.
   - Quota estimation modal showing predicted token usage, request counts, and estimated cost before execution.
   - Smart SQLite caching (`ticker_ai_summaries`) to eliminate duplicate API requests.

5. **Automated Test Suite & Quality Calibration**:
   - Built-in test suite (`server/tests/suite.ts`) verifying 55 unit/integration checks across database operations, provider deduplication, deterministic scoring, and AI layer safety.

---

## 📦 Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

---

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/carlpang1/newsfeedapp.git
cd newsfeedapp
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` to configure your Google Gemini API Key:
```env
PORT=3000
DATABASE_PATH=./data/news.db
GEMINI_API_KEY=your_actual_gemini_api_key_here
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
```

*Note: If `GEMINI_API_KEY` is omitted, the app will continue to run using deterministic fallback analysis without failing.*

---

## 💻 Running the Application

### Development Mode
Starts the Express server with Vite middleware on `http://localhost:3000`:
```bash
npm run dev
```

### Production Build & Start
Compile client assets and server bundle:
```bash
npm run build
npm start
```

---

## 🧪 Testing & Verification

Run the full automated test suite:
```bash
npx tsx server/tests/suite.ts
```

Run TypeScript linting:
```bash
npm run lint
```

---

## 📁 Project Structure

```
.
├── server/
│   ├── services/
│   │   ├── aiEligibility.ts      # AI triage and eligibility rules
│   │   ├── aiEngine.ts           # Gemini API integration & schema validation
│   │   ├── aiProvider.ts         # Provider selection & pricing models
│   │   ├── deduplicator.ts       # URL normalization & SHA-256 hash deduplication
│   │   ├── intelligence.ts       # Deterministic Rule Engine v2.0 scoring logic
│   │   ├── newsProvider.ts       # RSS news fetching & mock fallback engine
│   │   ├── tickerSummary.ts      # Ticker Intelligence Engine & caching
│   │   └── yahooFinanceProvider.ts # Yahoo Finance RSS parser
│   ├── tests/
│   │   └── suite.ts              # 55-test suite for database, scoring & AI
│   └── database.ts               # SQLite (sql.js) schema & query handlers
├── src/
│   ├── components/
│   │   ├── ArticleDetailModal.tsx # Article preview & sentiment analysis modal
│   │   ├── FilterBar.tsx          # Date range & ticker filters
│   │   ├── Header.tsx             # Primary navigation top bar
│   │   ├── NewsCard.tsx           # Article card view
│   │   ├── NewsTable.tsx          # Article table view
│   │   └── TickerIntelligenceView.tsx # Ticker Intelligence Summary view
│   ├── services/
│   │   └── api.ts                 # Frontend API client
│   ├── App.tsx                    # Main React entry point
│   └── main.tsx                   # React DOM root
├── server.ts                      # Express server entry point
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 🛡️ License

MIT License.
