import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Copy,
  Check,
  Cpu,
  DollarSign,
  Activity,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { AIUsageSummary, BatchAIStats, NewsArticle } from '../types';

interface AIAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshNews: () => void;
  onSelectArticle: (article: NewsArticle) => void;
}

export const AIAnalysisModal: React.FC<AIAnalysisModalProps> = ({
  isOpen,
  onClose,
  onRefreshNews,
  onSelectArticle,
}) => {
  const [loading, setLoading] = useState(false);
  const [analyzingBatch, setAnalyzingBatch] = useState(false);
  const [usageSummary, setUsageSummary] = useState<AIUsageSummary | null>(null);
  const [batchStats, setBatchStats] = useState<BatchAIStats | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [maxArticles, setMaxArticles] = useState(25);
  const [batchResult, setBatchResult] = useState<{
    processed: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'batch' | 'usage' | 'articles'>('batch');
  const [eligibleArticles, setEligibleArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usageRes, statsRes, newsRes] = await Promise.all([
        fetch('/api/ai/usage').then((r) => r.json()),
        fetch('/api/ai/batch-stats').then((r) => r.json()),
        fetch('/api/news?sort=importance&limit=30').then((r) => r.json()),
      ]);

      setUsageSummary(usageRes);
      setBatchStats(statsRes);
      setEligibleArticles(newsRes.articles || []);
    } catch (err) {
      console.error('Failed to load AI data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatch = async (force = false) => {
    setAnalyzingBatch(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/ai/batch-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concurrencyLimit: concurrency,
          maxArticles,
          force,
        }),
      });
      const data = await res.json();
      setBatchResult(data);
      await loadData();
      onRefreshNews();
    } catch (err) {
      console.error('Batch analysis failed:', err);
    } finally {
      setAnalyzingBatch(false);
    }
  };

  const handleCopyJson = (article: NewsArticle) => {
    if (article.ai_analysis) {
      navigator.clipboard.writeText(JSON.stringify(article.ai_analysis, null, 2));
      setCopiedId(article.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="ai-analysis-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="ai-analysis-modal-container"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  AI News Intelligence Layer
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Phase 5
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Factual synthesis, market impact hypothesis, why it matters, and token cost tracking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="ai-refresh-btn"
              onClick={loadData}
              disabled={loading || analyzingBatch}
              className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="ai-modal-close-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-800 gap-2 bg-slate-100/40 dark:bg-slate-900">
          <button
            id="ai-tab-batch"
            onClick={() => setActiveTab('batch')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'batch'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            Batch Analysis Pipeline
            {batchStats && batchStats.pending > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                {batchStats.pending} pending
              </span>
            )}
          </button>
          <button
            id="ai-tab-usage"
            onClick={() => setActiveTab('usage')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'usage'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Usage & Cost Dashboard
          </button>
          <button
            id="ai-tab-articles"
            onClick={() => setActiveTab('articles')}
            className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'articles'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Eligible News Stream
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: BATCH PROCESSING */}
          {activeTab === 'batch' && (
            <div className="space-y-6">
              {/* Pipeline Overview Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Eligible Articles</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {batchStats?.eligible ?? '...'}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Meets high-importance / priority criteria
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Already Analyzed</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {batchStats?.alreadyAnalyzed ?? '...'}
                  </div>
                  <div className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Cached & persistent in SQLite
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Analysis</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                    {batchStats?.pending ?? '...'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Ready for AI enrichment
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Estimated AI Requests</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {batchStats?.estimatedRequests ?? '...'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                    <Cpu className="w-3 h-3" /> Controlled queue processing
                  </div>
                </div>
              </div>

              {/* Batch Execution Controls Box */}
              <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Batch AI Analysis Execution
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Triggers controlled queue processing across eligible articles with strict rate-limit protection
                    </p>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        Workers:
                      </label>
                      <select
                        id="ai-concurrency-select"
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        disabled={analyzingBatch}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value={1}>1 Worker (Sequential)</option>
                        <option value={2}>2 Workers</option>
                        <option value={3}>3 Workers (Default)</option>
                        <option value={5}>5 Workers (Fast)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        Max:
                      </label>
                      <select
                        id="ai-max-articles-select"
                        value={maxArticles}
                        onChange={(e) => setMaxArticles(Number(e.target.value))}
                        disabled={analyzingBatch}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value={10}>10 Articles</option>
                        <option value={25}>25 Articles</option>
                        <option value={50}>50 Articles</option>
                        <option value={100}>100 Articles</option>
                      </select>
                    </div>

                    <button
                      id="ai-analyze-eligible-btn"
                      onClick={() => handleRunBatch(false)}
                      disabled={analyzingBatch || (batchStats?.pending === 0 && false)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      {analyzingBatch ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Analyzing Eligible News...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Analyze Eligible News
                        </>
                      )}
                    </button>

                    <button
                      id="ai-reanalyze-all-btn"
                      onClick={() => handleRunBatch(true)}
                      disabled={analyzingBatch}
                      className="px-3 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-lg transition-colors"
                      title="Force re-analysis on already analyzed items"
                    >
                      Force Re-analyze
                    </button>
                  </div>
                </div>

                {/* Batch Run Progress & Result */}
                {batchResult && (
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg p-4 text-xs space-y-1">
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Batch Execution Finished Successfully
                    </div>
                    <div className="text-emerald-700 dark:text-emerald-400">
                      Processed <strong>{batchResult.processed}</strong> articles (
                      <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                        {batchResult.succeeded} succeeded
                      </span>
                      {batchResult.failed > 0 && (
                        <span className="text-rose-600 dark:text-rose-400 ml-1">
                          , {batchResult.failed} failed
                        </span>
                      )}
                      ) in <strong>{(batchResult.durationMs / 1000).toFixed(2)}s</strong>.
                    </div>
                  </div>
                )}
              </div>

              {/* Eligibility Gating Rule Details */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  AI Eligibility Gate Criteria
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400">
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Standard Quantitative Gate:</strong> Importance score &ge; 75 AND Relevance score &ge; 60.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>High-Priority Event Auto-Qualification:</strong> Events like <em>earnings</em>, <em>guidance</em>, <em>acquisition</em>, <em>regulatory</em>, <em>legal</em> auto-qualify (with relevance &ge; 30).
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Strict Hallucination Protection:</strong> Analysis strictly separates verified facts from analytical interpretation and bans absolute trading recommendations.
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <strong>Schema & Prompt Versioning:</strong> Analysis output conforms to schema version <code>1.0</code> and prompt version <code>news-analysis-v1</code>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: USAGE & COST DASHBOARD */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Articles Analyzed</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {usageSummary?.articlesAnalyzed ?? 0}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Distinct news records</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Requests Today</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {usageSummary?.requestsToday ?? 0}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Live session volume
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Estimated Tokens</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                    {(usageSummary?.estimatedTokens ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Input + Output token usage</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Estimated Cost</div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    ${(usageSummary?.estimatedCost ?? 0).toFixed(4)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Based on active model pricing</div>
                </div>
              </div>

              {/* Provider & Pricing Breakdown */}
              <div className="bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-500" />
                  Active Model Configuration & Pricing
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">AI Provider</span>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase mt-0.5">
                      {usageSummary?.provider || 'gemini'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Model Name</span>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {usageSummary?.model || 'gemini-3.7-flash'}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500 dark:text-slate-400">Model Rates</span>
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      ${usageSummary?.pricingConfig.inputCostPerMillion}/1M in &bull; ${usageSummary?.pricingConfig.outputCostPerMillion}/1M out
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p>
                    All Gemini API interactions run strictly on the Node.js backend. If <code>GEMINI_API_KEY</code> is absent, the system seamlessly uses the local deterministic fallback engine to guarantee zero disruptions during offline tests.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ELIGIBLE ARTICLES LIST */}
          {activeTab === 'articles' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
                <span>Top articles ordered by Importance score</span>
                <span>Click an article to view details or trigger AI analysis</span>
              </div>

              <div className="space-y-3">
                {eligibleArticles.map((article) => {
                  const hasAI = Boolean(article.ai_analysis);
                  const isEligible = article.ai_eligible;

                  return (
                    <div
                      key={article.id}
                      className={`p-4 rounded-xl border transition-all ${
                        hasAI
                          ? 'bg-indigo-50/30 dark:bg-indigo-950/20 border-indigo-200/80 dark:border-indigo-900/40'
                          : isEligible
                          ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/50 dark:border-slate-800/50 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            {article.tickers && article.tickers.length > 0 && (
                              <span className="font-bold text-slate-900 dark:text-slate-100 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                                {article.tickers.join(', ')}
                              </span>
                            )}
                            <span className="text-slate-500">{article.publisher}</span>
                            <span className="text-slate-400">&bull;</span>
                            <span className="text-slate-400">
                              {new Date(article.published_at).toLocaleDateString()}
                            </span>

                            {article.importance_score !== undefined && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                Score: {article.importance_score}
                              </span>
                            )}

                            {/* Eligibility Badge */}
                            {isEligible ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                AI Eligible
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800">
                                Ineligible
                              </span>
                            )}

                            {/* AI Status Badge */}
                            {hasAI && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5" /> AI Analyzed
                              </span>
                            )}
                          </div>

                          <h4
                            onClick={() => {
                              onSelectArticle(article);
                              onClose();
                            }}
                            className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                          >
                            {article.title}
                          </h4>

                          {/* AI Summary and Impact snippet if available */}
                          {article.ai_analysis && (
                            <div className="pt-2 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-800/80 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/40">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-slate-100">Why It Matters:</span>
                                <span>{article.ai_analysis.why_it_matters}</span>
                              </div>
                              <div className="flex items-center gap-3 pt-1 text-[11px]">
                                <span className="font-medium text-slate-500">Market Impact:</span>
                                <span
                                  className={`font-bold px-1.5 py-0.5 rounded uppercase ${
                                    article.ai_analysis.market_impact === 'bullish'
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      : article.ai_analysis.market_impact === 'bearish'
                                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                  }`}
                                >
                                  {article.ai_analysis.market_impact} ({article.ai_analysis.impact_confidence}%)
                                </span>
                                <span className="text-slate-400">&bull;</span>
                                <span className="text-slate-500">Time Horizon:</span>
                                <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                                  {article.ai_analysis.time_horizon.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {hasAI && (
                            <button
                              onClick={() => handleCopyJson(article)}
                              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                              title="Copy AI Analysis JSON"
                            >
                              {copiedId === article.id ? (
                                <Check className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              onSelectArticle(article);
                              onClose();
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-md transition-colors text-xs font-medium flex items-center gap-1"
                          >
                            Inspect <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs text-slate-500">
          <div>
            AI Schema <strong>v1.0</strong> &bull; Prompt <strong>news-analysis-v1</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
