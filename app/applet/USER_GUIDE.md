# StockNews Pro Intelligence — User Guide & Daily Operating Manual

---

## 1. What This System Does

### Purpose
StockNews Pro Intelligence is an institutional-grade news monitoring and decision support application designed for investors, analysts, and traders. It automates financial news ingestion from Yahoo Finance RSS feeds, organizes and deduplicates wire stories using syndication clustering, classifies corporate events, computes rigorous quantitative importance scores, and provides selective, on-demand AI qualitative enrichment.

### Core Architecture: Rule Engine v2.0 vs. AI Analysis
To prevent hallucinations and maintain absolute analytical integrity, the system splits intelligence into two distinct layers:

1. **Deterministic Rule Engine v2.0 (Authoritative Layer):**
   - **Role:** Primary ranking, scoring, event classification, relevance filtering, and syndication deduplication.
   - **Mechanism:** Fast, local, sub-millisecond additive mathematical scoring based on event categories, source tiers, market-moving signals, and recency.
   - **Characteristics:** 100% deterministic, repeatable, and transparent. It decides how articles are ordered and filtered.

2. **Gemini 3.6 Flash (Selective Qualitative Intelligence Layer):**
   - **Role:** Optional qualitative enrichment and synthesis.
   - **Mechanism:** Invoked only when an article passes the strict **AI Eligibility Gate** (or upon explicit user request).
   - **Characteristics:** Provides summaries, "Why It Matters," market impact (bullish/bearish/neutral), catalysts, risks, time horizon, and key facts. It **never** alters deterministic scores or replaces raw source facts.

---

## 2. Getting Started

### Starting the Application
1. Open your terminal in the application workspace directory.
2. Start the production server by executing:
   ```bash
   npm start
   ```
   *(Behind the scenes, this starts the Express backend server and serves the optimized Vite frontend).*

### Accessing the App
Open your web browser and navigate to:
```text
http://localhost:3000
```
*(Or use your assigned preview environment URL).*

### What You Should See Upon Startup
- **Top Navigation Header:** Displays the brand wordmark, active engine indicators, and quick-access buttons for Portfolio, Calibration, AI Safeguards, and System Logs.
- **Health & Status Bar:** Confirms database connectivity, last ingestion timestamp, and live resource telemetry.
- **Intelligence Dashboard:** Summarizes tracked tickers, fetched articles today, critical events, high-importance items, syndication clusters, and AI cost metrics.
- **News Feed & Filters:** Allows instant switching between intelligent view presets and custom filters.

### Environment Configuration
The system expects server-side environment variables configured in `.env` (such as `GEMINI_API_KEY`). **The API key is strictly server-side and is never exposed to the browser.**

---

## 3. Daily Workflow (5–10 Minute Morning Routine)

A disciplined 5–10 minute morning review workflow ensures you capture critical market-moving intelligence without information overload:

1. **Step 1 — Check the Intelligence Dashboard:** Scan the top telemetry cards to see how many critical and high-importance news items landed overnight, plus total feed volume and syndication cluster counts.
2. **Step 2 — Open "Recommended Intelligence":** This view automatically prioritizes articles by importance score, relevance, event significance, and recency. Start here to catch the highest-value market stories first.
3. **Step 3 — Review "Critical News" (Score $\ge 80$):** Instantly filter out routine noise and inspect major regulatory actions, emergency guidance revisions, or major M&A announcements.
4. **Step 4 — Review "High Importance" (Score 60–79):** Examine material corporate catalysts such as earnings reports, executive transitions, or product announcements.
5. **Step 5 — Check "Company-Specific" & Watchlists:** Filter by specific tickers you hold or track closely to evaluate single-stock exposure.
6. **Step 6 — Inspect "Macro & Market":** Review broad market commentary and multi-ticker roundups to understand sector and macroeconomic headwinds.
7. **Step 7 — Trigger AI Analysis Selectively:** For eligible high-value stories where you need deeper qualitative context, click **"Analyze with AI"** to read Gemini's breakdown of catalysts, risks, and market impact.
8. **Step 8 — Deep-Dive via Ticker Intelligence:** Click on any active ticker in your portfolio or dashboard to view its dedicated multi-signal intelligence summary.

---

## 4. Understanding Scores

### Key Quantitative Metrics
- **Importance Score (0–100):** Measures the broader market-moving significance of an event. Computed additively by Rule Engine v2.0 based on event category weight, source tier credibility, and signal density.
- **Relevance Score (0–100):** Measures how directly a story impacts a specific company/ticker vs. being broad macro commentary.
- **Event Type:** Categorizes the news item (e.g., `earnings`, `acquisition`, `regulatory`, `guidance`, `executive`, `partnership`, `product_launch`, `analyst_target`).
- **Source Tier (Tier 1 to 3):** Reflects the editorial reliability and wire origin of the publisher.
- **Syndication Cluster Count:** Groups duplicate wire service reports (e.g., Reuters, Bloomberg, PR Newswire covering the same story) into a single canonical cluster so you don't read the same news five times.

### Crucial Caveats
- **High Importance $\neq$ Bullish:** A company filing for bankruptcy, facing an emergency antitrust lawsuit, or reporting catastrophic earnings will receive an extremely **high importance score (80–100)** because it is market-moving. However, the event is obviously bearish. Always read the headline and qualitative analysis.
- **Scores $\neq$ Investment Advice:** Importance and relevance scores are quantitative routing signals designed to filter noise. They do not constitute financial advice, target prices, or buy/sell recommendations.

---

## 5. Reading an Article

When you inspect an article card or open the article inspector, you will see:
- **Headline & Publisher:** The primary source reporting the news.
- **Publication Timestamp:** Exact UTC/local time published.
- **Tickers & Event Type:** Associated portfolio symbols and classified event category.
- **Importance & Relevance Scores:** Quantitative priority metrics.
- **Syndication Badge:** Shows how many wire syndications were grouped into this cluster. Click to view all syndicate sources.
- **Rule Engine Breakdown ("Why is this important?"):** Expands to show the exact additive point contributions from event type, source tier, recency, and market signals.
- **AI Analysis Panel (If analyzed):** Displays Gemini’s structured qualitative enrichment.

---

## 6. Using "Analyze with AI"

### When the Button Appears
The **"Analyze with AI"** button appears exclusively on articles that pass the **AI Eligibility Gate** (Importance $\ge 45$ or material event category like earnings/M&A/regulatory, AND Relevance $\ge 10$). Non-eligible noise items do not show the button, protecting you from wasting API quota.

### What Gemini Adds
When triggered, Gemini provides:
- **AI Summary:** A concise 2-sentence synthesis.
- **Why It Matters:** Strategic context for investors.
- **Market Impact:** Categorized as `bullish`, `bearish`, or `neutral`.
- **Impact Confidence:** Numerical confidence rating.
- **Time Horizon:** Immediate, short-term, medium-term, or long-term.
- **Catalysts & Risks:** Bulleted upside drivers and downside risks.
- **Key Facts & Mentioned Companies:** Extracted entity intelligence.

*Warning:* AI analysis is supporting intelligence, **NOT** authoritative fact verification or a guaranteed trade signal.

---

## 7. AI Quota & Cost Management

- **Selective Execution:** Gemini is never called automatically upon ingestion. Every analysis is either gated or triggered on-demand.
- **Idempotency:** Once an article is analyzed with a specific prompt/model version, the result is permanently cached in SQLite. Clicking the button again instantly retrieves the cached analysis without consuming API quota.
- **Usage Telemetry:** View total daily requests, articles analyzed, token counts, and estimated cost in real-time via the **AI Safeguards** control panel.
- **Quota Exhaustion:** If rate limits (429) or exhaustion occur, the system fails gracefully, logs the error, and preserves all deterministic rules and cached analyses.

---

## 8. Ticker Intelligence

Clicking any ticker in the portfolio opens the **Ticker Intelligence View**, providing:
- **Total News Volume & Critical Event Count:** How many stories and critical alerts are associated with the symbol.
- **Deterministic Event Breakdown:** Distribution of earnings, M&A, analyst revisions, etc.
- **AI Sentiment Distribution:** Count of bullish vs. bearish vs. neutral AI insights across analyzed articles.
- **Aggregated Catalysts & Risks:** Rolling summary of upside drivers and downside risks for the company.

---

## 9. Smart Event Alerts

The **Smart Event Alerts Framework** automatically flags high-priority triggers based on deterministic rules:
- **Critical Importance ($\ge 80$):** Extreme market-moving probability.
- **Major Corporate Events:** Earnings releases, guidance revisions, M&A acquisitions, regulatory enforcement actions, and executive C-suite transitions.
- **Analyst Targets & Partnerships:** Key price target revisions or strategic commercial deals.

---

## 10. Intelligence Dashboard

The top **Intelligence Dashboard** displays real-time telemetry:
- **Tracked Portfolio:** Active vs. total monitored tickers.
- **Total Articles & Clusters:** Total wire volume and syndication deduplication count.
- **Critical & High Importance Counts:** Breakdown of market-moving news volume.
- **AI Intelligence Count:** Number of articles enriched by Gemini today.
- **AI Cost Today:** Live cumulative dollar cost based on input/output token pricing ($0.15/$0.60 per million tokens).

---

## 11. Recommended Daily Process

1. **Morning Scan (8:30 AM):** Open Recommended Intelligence and Critical News. Identify overnight M&A, earnings, or regulatory filings.
2. **Watchlist Check (9:00 AM):** Filter by your portfolio tickers to review pre-market developments.
3. **Deep Investigation:** Expand Rule Engine breakdowns to understand why a story scored high. Trigger "Analyze with AI" on 2–3 top stories requiring qualitative context.
4. **Ticker Review:** Open Ticker Intelligence for active positions showing unusual volume.
5. **Action:** Record findings externally into your trading/investment journal.

---

## 12. What NOT To Do

- ❌ **Do not treat AI sentiment as a buy/sell signal.** Gemini provides qualitative context, not trading advice.
- ❌ **Do not assume high importance = bullish.** Bankruptcy and regulatory fines score 90+ importance but are highly bearish.
- ❌ **Do not repeatedly run AI analysis unnecessarily.** Rely on idempotency and cached results.
- ❌ **Do not rely on a single news article.** Always check syndication clusters for cross-verification.
- ❌ **Do not expose `GEMINI_API_KEY`.** Keep credentials strictly server-side.

---

## 13. Realistic Example: Discovering an M&A Article

1. **Ingestion:** A breaking Reuters wire report arrives: *"Acme Corp to Acquire WidgetTech for $4.2B in Cash"* linked to ticker `WGTK`.
2. **Rule Engine v2.0 Classification:**
   - Event Type: `acquisition`
   - Source Tier: Tier 1 (`reuters.com`)
   - Importance Score: `88` (triggered by acquisition category + Tier 1 source + high syndication count)
   - Relevance Score: `95` (direct ticker match)
3. **User Action:** The story appears instantly at the top of **Critical News** and **Recommended Intelligence**.
4. **Investigation:** You click "Why is this important?" and see additive scoring (+40 for M&A, +20 for Tier 1 source, +20 for high relevance).
5. **AI Enrichment:** Recognizing the materiality, you click **"Analyze with AI"**. Gemini returns a structured breakdown noting a 35% premium, regulatory antitrust risk in Europe, and a medium-term closing horizon.
6. **Next Step:** You review SEC filings or fundamental models externally before making an investment decision.

---

## 14. Troubleshooting

- **Application does not start:** Verify Node.js is installed and run `npm install` followed by `npm start`.
- **News feed is empty:** Check your internet connection, verify RSS ingestion status via the Health Bar, or ensure tickers are enabled in the Ticker Manager.
- **Gemini analysis fails / Quota exhausted:** Ensure `GEMINI_API_KEY` is correctly set in your server environment. If rate-limited (429), wait a few moments or rely on cached analyses.
- **Data looks duplicated:** The system automatically groups syndication clusters. Use the cluster modal to view all syndicate sources.

---

## 15. Quick Reference Cheat Sheet

| Feature / Control | Purpose / Meaning |
| :--- | :--- |
| **Recommended View** | Prioritizes importance, relevance, event significance, and recency. |
| **Critical View** | Isolates score $\ge 80$ market-moving events. |
| **High Importance View** | Isolates score 60–79 material corporate events. |
| **Importance Score (0–100)** | Quantitative measure of market-moving priority. |
| **Relevance Score (0–100)** | Measures direct impact on a specific ticker. |
| **Analyze with AI Button** | On-demand qualitative enrichment (available on eligible items). |
| **Smart Alerts** | Rule-driven notifications for earnings, M&A, and regulatory actions. |
| **Ticker Intelligence** | Dedicated deep-dive modal for single-ticker news and AI sentiment. |

---

## 16. Beginner Version ("If You Only Remember 5 Things")

1. **Rule Engine v2.0 ranks everything:** It scores and sorts news instantly using math, not AI.
2. **High score $\neq$ Good news:** Important news can be severely bearish (e.g., fraud, bankruptcy, fines).
3. **AI is optional & selective:** Gemini only runs when you ask or when an article passes strict quality gates.
4. **Syndication clusters save time:** Multiple wire reports of the same story are automatically grouped together.
5. **Always do your own research:** The system is an intelligence filter and decision support tool, not a crystal ball.
