import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  SlidersHorizontal,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  Cpu,
  Layers,
  ChevronRight,
  ShieldCheck,
  ExternalLink,
  ArrowRight,
  FileText,
} from 'lucide-react';
import {
  Ticker,
  TickerSummaryItem,
  AIEstimate,
  NewsArticle,
  fetchTickerSummaries,
  estimateTickerAISummaries,
  generateTickerAISummaries,
  fetchNewsById,
} from '../services/api.js';

export type TickerPeriod = '24h' | '7d' | '30d' | 'all' | 'custom';
export type TickerSort = 'highest_score' | 'lowest_score' | 'symbol_asc' | 'most_news' | 'highest_importance';

interface TickerIntelligenceViewProps {
  tickers: Ticker[];
  selectedTicker: string;
  onSelectTicker: (symbol: string) => void;
  selectedPreset?: string;
  onSelectPreset?: (preset: string) => void;
  onOpenArticlePreview?: (article: NewsArticle) => void;
  onSwitchToNewsFeed?: () => void;
}

export const TickerIntelligenceView: React.FC<TickerIntelligenceViewProps> = ({
  tickers,
  selectedTicker,
  onSelectTicker,
  selectedPreset,
  onSelectPreset,
  onOpenArticlePreview,
  onSwitchToNewsFeed,
}) => {
  // Map preset from App if available
  const initialPeriod: TickerPeriod =
    selectedPreset === 'today' || selectedPreset === '24h'
      ? '24h'
      : selectedPreset === '30d'
      ? '30d'
      : selectedPreset === 'all'
      ? 'all'
      : selectedPreset === 'custom'
      ? 'custom'
      : '7d';

  const [period, setPeriod] = useState<TickerPeriod>(initialPeriod);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortOrder, setSortOrder] = useState<TickerSort>('highest_score');

  const [summaries, setSummaries] = useState<TickerSummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingArticleId, setLoadingArticleId] = useState<number | null>(null);

  // AI Confirmation Modal
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [aiEstimate, setAiEstimate] = useState<AIEstimate | null>(null);
  const [targetSymbolsForAI, setTargetSymbolsForAI] = useState<string[] | undefined>(undefined);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTickerSummaries({
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        symbol: selectedTicker,
        sort: sortOrder,
      });
      setSummaries(res.summaries);
    } catch (err: any) {
      console.error('Failed to load ticker summaries:', err);
      setError(err.message || 'Failed to load ticker intelligence data.');
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, selectedTicker, sortOrder]);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handlePeriodChange = (newPeriod: TickerPeriod) => {
    setPeriod(newPeriod);
    if (onSelectPreset) {
      const mappedPreset =
        newPeriod === '24h' ? 'today' : newPeriod === '7d' ? '7d' : newPeriod === '30d' ? '30d' : newPeriod === 'all' ? 'all' : 'custom';
      onSelectPreset(mappedPreset);
    }
  };

  // Handle headline click to open preview modal
  const handleHeadlineClick = async (headlineId: number) => {
    setLoadingArticleId(headlineId);
    try {
      const article = await fetchNewsById(headlineId);
      if (article && onOpenArticlePreview) {
        onOpenArticlePreview(article);
      }
    } catch (err) {
      console.error('Failed to fetch article detail:', err);
      alert('Could not load full article details.');
    } finally {
      setLoadingArticleId(null);
    }
  };

  // Handle open AI estimate modal
  const handleOpenAIEstimate = async (symbolsToAnalyze?: string[]) => {
    try {
      setTargetSymbolsForAI(symbolsToAnalyze);
      const estimate = await estimateTickerAISummaries({
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        symbol: symbolsToAnalyze && symbolsToAnalyze.length === 1 ? symbolsToAnalyze[0] : selectedTicker,
      });
      setAiEstimate(estimate);
      setIsConfirmModalOpen(true);
    } catch (err: any) {
      alert(`Could not estimate AI usage: ${err.message}`);
    }
  };

  // Confirm and run AI Summaries request
  const handleConfirmGenerateAI = async () => {
    setIsGeneratingAI(true);
    setAiSuccessMsg(null);
    try {
      const result = await generateTickerAISummaries({
        period,
        startDate: period === 'custom' ? customStart : undefined,
        endDate: period === 'custom' ? customEnd : undefined,
        symbols: targetSymbolsForAI,
      });
      setAiSuccessMsg(`Successfully generated ${result.generatedCount} AI summaries (${result.cachedCount} reused from cache).`);
      setIsConfirmModalOpen(false);
      await loadSummaries();
    } catch (err: any) {
      alert(`AI Summary generation failed: ${err.message}`);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Helper score badges
  const getDirectionBadge = (score: number, direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL') => {
    if (direction === 'BULLISH') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>BULLISH</span>
        </span>
      );
    }
    if (direction === 'BEARISH') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
          <TrendingDown className="w-4 h-4 text-rose-600" />
          <span>BEARISH</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
        <Minus className="w-4 h-4 text-amber-600" />
        <span>NEUTRAL</span>
      </span>
    );
  };

  const cachedCount = summaries.filter((s) => s.hasCachedAI).length;
  const totalCount = summaries.length;

  return (
    <div className="space-y-6" id="ticker-intelligence-view-container">
      
      {/* Top Filter Bar for Ticker Intelligence */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <Cpu className="w-6 h-6 text-indigo-600" />
                <span>Ticker Intelligence Summary</span>
              </h2>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Rule Engine v2.0 + Gemini AI
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Select ticker & period to view calculated deterministic stock news scores, directional stance, key factors, and Gemini summaries.
            </p>
          </div>

          {/* AI Generation Quota Protection Button */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              Cached AI: <strong className="text-slate-900 font-bold">{cachedCount} / {totalCount}</strong>
            </span>
            <button
              id="generate-ai-summaries-btn"
              onClick={() => handleOpenAIEstimate()}
              disabled={loading || summaries.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-sm cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>Generate AI Summaries</span>
            </button>
          </div>
        </div>

        {/* Filters Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Period Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Period:</span>
            </span>
            {(
              [
                { key: '24h', label: '24 Hours' },
                { key: '7d', label: '7 Days' },
                { key: '30d', label: '30 Days' },
                { key: 'all', label: 'All Time' },
                { key: 'custom', label: 'Custom' },
              ] as Array<{ key: TickerPeriod; label: string }>
            ).map((p) => (
              <button
                key={p.key}
                onClick={() => handlePeriodChange(p.key)}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition border cursor-pointer ${
                  period === p.key
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}

            {period === 'custom' && (
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 font-mono"
                />
                <span className="text-slate-400 font-medium">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 font-mono"
                />
              </div>
            )}
          </div>

          {/* Ticker & Sort Selectors */}
          <div className="flex items-center gap-3">
            
            {/* Ticker Select Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">Ticker:</span>
              <select
                value={selectedTicker}
                onChange={(e) => onSelectTicker(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="ALL">All Tickers ({tickers.length})</option>
                {tickers.map((t) => (
                  <option key={t.id} value={t.symbol}>
                    {t.symbol} — {t.company_name || t.symbol}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">Sort:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as TickerSort)}
                className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="highest_score">Highest Score First</option>
                <option value="lowest_score">Lowest Score First</option>
                <option value="symbol_asc">Ticker Symbol (A-Z)</option>
                <option value="most_news">Most News Articles</option>
                <option value="highest_importance">Most Important News</option>
              </select>
            </div>

            <button
              onClick={loadSummaries}
              disabled={loading}
              title="Refresh Ticker Intelligence Data"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>

        {aiSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{aiSuccessMsg}</span>
          </div>
        )}

      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm text-slate-700 font-bold">Calculating deterministic ticker intelligence scores...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-sm space-y-2">
          <div className="flex items-center gap-2 font-bold">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <span>Failed to load ticker intelligence data</span>
          </div>
          <p>{error}</p>
        </div>
      ) : summaries.length === 0 ? (
        <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
          <Layers className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No News Found for Selected Period</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Try expanding the date range (e.g., 30 Days or All Time) or selecting a different ticker symbol.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {summaries.map((item) => (
            <div
              key={item.tickerId}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs transition hover:border-slate-300 space-y-5"
            >
              {/* Ticker Header matching user requested format */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                
                {/* Left: Ticker Symbol & News Count */}
                <div className="space-y-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => {
                        onSelectTicker(item.symbol);
                        if (onSwitchToNewsFeed) onSwitchToNewsFeed();
                      }}
                      className="text-2xl font-black text-slate-900 tracking-tight hover:text-indigo-600 transition flex items-center gap-1.5 cursor-pointer group"
                      title={`Filter News Feed to ${item.symbol}`}
                    >
                      <span>{item.symbol}</span>
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition text-indigo-600" />
                    </button>
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
                      {item.newsCount} news
                    </span>
                    <span className="text-xs text-slate-500 font-medium truncate max-w-xs">
                      {item.companyName}
                    </span>
                  </div>
                </div>

                {/* Right: Overall Score & Direction */}
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Overall Score</div>
                    <div className="text-2xl font-black text-slate-900 font-mono leading-none mt-0.5">
                      {item.overallScore} <span className="text-slate-400 font-normal text-xs">/ 100</span>
                    </div>
                  </div>

                  <div>
                    {getDirectionBadge(item.overallScore, item.direction)}
                  </div>
                </div>

              </div>

              {/* Factors Grid (Positive & Negative) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Positive Factors */}
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Positive factors</span>
                  </h4>
                  {item.aiSummary?.keyBullish && item.aiSummary.keyBullish.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-xs text-emerald-950 font-medium">
                      {item.aiSummary.keyBullish.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  ) : item.deterministicSignals.bullishPoints.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-xs text-emerald-950 font-medium">
                      {item.deterministicSignals.bullishPoints.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No significant positive factors identified.</p>
                  )}
                </div>

                {/* Negative Factors */}
                <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Negative factors</span>
                  </h4>
                  {item.aiSummary?.keyBearish && item.aiSummary.keyBearish.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-xs text-rose-950 font-medium">
                      {item.aiSummary.keyBearish.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  ) : item.deterministicSignals.bearishPoints.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-xs text-rose-950 font-medium">
                      {item.deterministicSignals.bearishPoints.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No significant negative factors identified.</p>
                  )}
                </div>

              </div>

              {/* Gemini Qualitative Summary (If Generated) */}
              {item.aiSummary && (
                <div className="bg-indigo-50/40 border border-indigo-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Gemini Qualitative Summary</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Cached {new Date(item.aiSummary.cachedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 leading-relaxed font-medium">
                    {item.aiSummary.overallSummary}
                  </p>
                </div>
              )}

              {/* Most Important News Section */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>Most important news ({item.topHeadlines.length})</span>
                  </h4>
                  <button
                    onClick={() => {
                      onSelectTicker(item.symbol);
                      if (onSwitchToNewsFeed) onSwitchToNewsFeed();
                    }}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                  >
                    <span>View all news for ${item.symbol}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-2xs">
                  {item.topHeadlines.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => handleHeadlineClick(h.id)}
                      disabled={loadingArticleId === h.id}
                      className="w-full text-left p-3.5 text-xs flex items-center justify-between gap-3 hover:bg-slate-50/80 transition cursor-pointer group"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition truncate flex items-center gap-2">
                          <span>{h.title}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-700">{h.publisher}</span>
                          <span>•</span>
                          <span>{new Date(h.publishedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="uppercase font-mono text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.2 rounded">
                            {h.eventType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono text-slate-500 font-semibold hidden sm:inline">
                          Importance: {h.importanceScore}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-md font-mono font-bold text-[10px] border ${
                            h.sentimentScore >= 51
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : h.sentimentScore <= 49
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          Score: {h.sentimentScore}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Gemini AI Quota Confirmation Modal */}
      {isConfirmModalOpen && aiEstimate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-base">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <span>Confirm Gemini AI Summaries Request</span>
              </div>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Gemini will generate qualitative ticker summaries based strictly on actual database news for the selected period (<strong>{aiEstimate.period}</strong>).
            </p>

            {/* Quota Metrics Breakdown Cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
                <div className="text-slate-600 font-medium">Tickers Requiring AI</div>
                <div className="text-lg font-extrabold text-indigo-900 font-mono">
                  {aiEstimate.tickersNeedingAI}
                </div>
                <div className="text-[10px] text-indigo-700 font-medium">
                  ({aiEstimate.cachedTickersCount} already cached)
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-600 font-medium">Estimated Requests</div>
                <div className="text-lg font-extrabold text-slate-900 font-mono">
                  {aiEstimate.estimatedRequests}
                </div>
                <div className="text-[10px] text-slate-500">
                  1 request per uncached ticker
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="text-slate-600 font-medium">Estimated Tokens</div>
                <div className="text-lg font-extrabold text-slate-900 font-mono">
                  ~{aiEstimate.estimatedTokens.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-500">
                  ~1,200 tokens per request
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <div className="text-slate-600 font-medium">Estimated Cost</div>
                <div className="text-lg font-extrabold text-emerald-900 font-mono flex items-center gap-0.5">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  <span>{aiEstimate.estimatedCostUsd}</span>
                </div>
                <div className="text-[10px] text-emerald-700 font-medium">
                  Gemini 2.5 Flash pricing
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-100 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <span>
                Results will be cached in SQLite. Re-opening this page or re-selecting filters will NOT consume additional quota.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isGeneratingAI}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGenerateAI}
                disabled={isGeneratingAI || aiEstimate.tickersNeedingAI === 0}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition shadow-sm cursor-pointer"
              >
                {isGeneratingAI ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                    <span>Executing Gemini Requests...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-indigo-200" />
                    <span>Confirm & Generate ({aiEstimate.tickersNeedingAI})</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

