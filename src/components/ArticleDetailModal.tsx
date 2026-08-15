import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Calendar,
  Clock,
  Building2,
  Hash,
  Copy,
  Check,
  Database,
  Link2,
  Zap,
  Sparkles,
  Award,
  Layers,
  Tag,
  CheckCircle2,
  Info,
  TrendingUp,
  TrendingDown,
  HelpCircle,
  Activity,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { NewsArticle } from '../types.js';

interface ArticleDetailModalProps {
  article: NewsArticle | null;
  onClose: () => void;
  onSelectTicker: (symbol: string) => void;
  onRefreshArticle?: (article: NewsArticle) => void;
}

export const ArticleDetailModal: React.FC<ArticleDetailModalProps> = ({
  article,
  onClose,
  onSelectTicker,
  onRefreshArticle,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedAiJson, setCopiedAiJson] = useState(false);
  const [analyzingAi, setAnalyzingAi] = useState(false);

  if (!article) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(article.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(article.article_hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyAiJson = () => {
    if (article.ai_analysis) {
      navigator.clipboard.writeText(JSON.stringify(article.ai_analysis, null, 2));
      setCopiedAiJson(true);
      setTimeout(() => setCopiedAiJson(false), 2000);
    }
  };

  const handleTriggerAI = async () => {
    setAnalyzingAi(true);
    try {
      const res = await fetch(`/api/ai/analyze/${article.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (data.success && data.analysis && onRefreshArticle) {
        onRefreshArticle({ ...article, ai_analysis: data.analysis, ai_status: 'completed' });
      }
    } catch (err) {
      console.error('Trigger AI in modal failed:', err);
    } finally {
      setAnalyzingAi(false);
    }
  };

  const exp = article.explanation;
  const ai = article.ai_analysis;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div
        id="article-detail-modal"
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/70">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              {article.publisher || 'Yahoo Finance'}
            </span>
            <span className="text-xs text-slate-400 font-mono">ID: #{article.id}</span>

            {ai && (
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                AI Analyzed ({ai.model})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Article Title */}
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
            {article.title}
          </h2>

          {/* Associated Tickers */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500">Associated Tickers:</span>
            {article.tickers && article.tickers.length > 0 ? (
              article.tickers.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    onSelectTicker(t);
                    onClose();
                  }}
                  className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  ${t}
                </button>
              ))
            ) : (
              <span className="text-xs text-slate-400">None</span>
            )}
          </div>

          {/* PHASE 5: AI Intelligence Analysis Block */}
          {ai ? (
            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-200/60 dark:border-indigo-800 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-400">
                  <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>AI News Intelligence Synthesis</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyAiJson}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-200 flex items-center gap-1"
                  >
                    {copiedAiJson ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAiJson ? 'Copied JSON' : 'Copy JSON'}</span>
                  </button>
                  <button
                    onClick={handleTriggerAI}
                    disabled={analyzingAi}
                    className="text-xs font-semibold px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${analyzingAi ? 'animate-spin' : ''}`} />
                    <span>Re-Analyze</span>
                  </button>
                </div>
              </div>

              {/* Why It Matters */}
              <div className="bg-white dark:bg-slate-800/90 rounded-lg p-3.5 border border-indigo-100 dark:border-indigo-900/40">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-1">
                  Why It Matters:
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {ai.why_it_matters}
                </p>
              </div>

              {/* Market Impact & Time Horizon Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white dark:bg-slate-800/90 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Market Impact
                  </span>
                  <span className="text-sm font-bold capitalize text-slate-900 dark:text-slate-100">
                    {ai.market_impact}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-800/90 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Impact Confidence
                  </span>
                  <span className="text-sm font-bold font-mono text-indigo-600 dark:text-indigo-400">
                    {ai.impact_confidence}%
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-800/90 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Time Horizon
                  </span>
                  <span className="text-sm font-semibold capitalize text-slate-800 dark:text-slate-200 truncate block">
                    {ai.time_horizon.replace('_', ' ')}
                  </span>
                </div>

                <div className="bg-white dark:bg-slate-800/90 rounded-lg p-2.5 border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                    Analysis Confidence
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {ai.analysis_confidence}%
                  </span>
                </div>
              </div>

              {/* Key Facts */}
              {ai.key_facts && ai.key_facts.length > 0 && (
                <div className="bg-white dark:bg-slate-800/90 rounded-lg p-3 border border-indigo-100 dark:border-indigo-900/40">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block mb-1.5">
                    Key Verified Facts:
                  </span>
                  <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                    {ai.key_facts.map((fact, i) => (
                      <li key={i}>{fact}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Catalysts & Risks */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ai.catalysts && ai.catalysts.length > 0 && (
                  <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60">
                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                      Bullish Catalysts:
                    </span>
                    <ul className="list-disc pl-4 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
                      {ai.catalysts.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {ai.risks && ai.risks.length > 0 && (
                  <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-lg border border-rose-200 dark:border-rose-900/60">
                    <span className="text-xs font-bold text-rose-800 dark:text-rose-300 block mb-1">
                      Downside Risks:
                    </span>
                    <ul className="list-disc pl-4 text-xs text-rose-900 dark:text-rose-200 space-y-1">
                      {ai.risks.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : article.ai_eligible ? (
            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Eligible for AI News Intelligence
                </div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400">
                  This article passes importance and relevance thresholds for AI factual synthesis.
                </div>
              </div>
              <button
                onClick={handleTriggerAI}
                disabled={analyzingAi}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{analyzingAi ? 'Analyzing...' : 'Run AI Analysis'}</span>
              </button>
            </div>
          ) : null}

          {/* Intelligence & Scoring Section */}
          <div className="bg-slate-900 text-white rounded-xl p-4.5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-emerald-400 uppercase">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Deterministic News Intelligence & Scoring</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                v{article.classification_version || '2.0-rules'}
              </span>
            </div>

            {/* Scores Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60 col-span-2 sm:col-span-1">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span>Sentiment</span>
                </div>
                {(() => {
                  const s = article.sentiment_score ?? 50;
                  const isBull = s > 50;
                  const isBear = s < 50;
                  const dir = isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL';
                  const sym = isBull ? '▲' : isBear ? '▼' : '—';
                  const textColor = isBull ? 'text-emerald-400' : isBear ? 'text-rose-400' : 'text-amber-400';
                  return (
                    <div className={`text-sm font-bold font-mono ${textColor}`}>
                      {sym} {s} <span className="text-[10px] uppercase font-sans tracking-wide">({dir})</span>
                    </div>
                  );
                })()}
              </div>

              <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <span>Importance</span>
                </div>
                <div className="text-lg font-bold font-mono text-amber-400">
                  {article.importance_score ?? 50}
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-400" />
                  <span>Relevance</span>
                </div>
                <div className="text-lg font-bold font-mono text-cyan-400">
                  {article.relevance_score ?? 100}
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                  <Info className="w-3 h-3 text-purple-400" />
                  <span>Event Type</span>
                </div>
                <div className="text-xs font-semibold text-purple-300 capitalize truncate">
                  {(article.event_type || 'general').replace('_', ' ')}
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-lg p-2.5 border border-slate-700/60">
                <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-1">
                  <Award className="w-3 h-3 text-emerald-400" />
                  <span>Source Tier</span>
                </div>
                <div className="text-xs font-semibold text-emerald-300">
                  Tier {article.source_tier ?? 2}
                </div>
              </div>
            </div>

            {/* Explanation Factor Highlights */}
            {exp && (
              <div className="space-y-3 pt-1">
                {/* Sentiment Signals Breakdown */}
                {exp.sentiment && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
                      <span>Directional Sentiment Signals & Weighting:</span>
                      <span className="text-[10px] font-mono text-slate-400">Base: {exp.sentiment.base ?? 50} | Final: {exp.sentiment.total ?? article.sentiment_score ?? 50}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {exp.sentiment.breakdown?.map((factor, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-800/50 px-2.5 py-1 rounded border border-slate-700/40 flex items-center justify-between text-slate-300"
                        >
                          <span className="truncate pr-2">{factor.signal}</span>
                          <span className={`font-mono font-bold shrink-0 ${factor.points > 0 ? 'text-emerald-400' : factor.points < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                            {factor.points > 0 ? `+${factor.points}` : factor.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Importance Signals Breakdown */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Importance Signals & Weighting:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {exp.importance?.breakdown?.map((factor, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-800/50 px-2.5 py-1 rounded border border-slate-700/40 flex items-center justify-between text-slate-300"
                      >
                        <span className="truncate pr-2">{factor.signal}</span>
                        <span className="font-mono text-emerald-400 font-bold shrink-0">
                          +{factor.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {exp.signalsMatched && exp.signalsMatched.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[10px] uppercase font-semibold text-slate-400 mb-1">
                      Matched Signals & Keywords:
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {exp.signalsMatched.map((sig, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono border border-slate-700"
                        >
                          {sig}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Syndication Group Info */}
            {article.duplicate_group_id && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>Syndication Cluster ID:</span>
                  <span className="font-mono text-slate-300">{article.duplicate_group_id}</span>
                </div>
                {article.duplicate_count && article.duplicate_count > 1 && (
                  <span className="text-amber-400 font-semibold">
                    {article.duplicate_count} syndicated copies
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Summary / Body */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Original Feed Summary
            </h4>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {article.summary || 'No summary text available in the feed.'}
            </p>
          </div>

          {/* SQLite Metadata Box */}
          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 space-y-2.5 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400 font-sans font-semibold text-xs border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <Database className="w-3.5 h-3.5" /> SQLite Record Metadata
              </span>
              <span>Tables: news, news_analysis, news_ai_analysis</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Published At:</span>
              <span className="text-slate-200">{article.published_at}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">Retrieved At:</span>
              <span className="text-slate-200">{article.retrieved_at}</span>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-400 shrink-0">SHA-256 Hash:</span>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-amber-300 truncate max-w-[280px]" title={article.article_hash}>
                  {article.article_hash}
                </span>
                <button
                  onClick={handleCopyHash}
                  className="text-slate-400 hover:text-white transition"
                  title="Copy Hash"
                >
                  {copiedHash ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="flex items-start justify-between gap-2">
              <span className="text-slate-400 shrink-0">Canonical URL:</span>
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-sky-300 truncate max-w-[280px]" title={article.url}>
                  {article.url}
                </span>
                <button
                  onClick={handleCopyUrl}
                  className="text-slate-400 hover:text-white transition"
                  title="Copy URL"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between">
          <button
            onClick={handleCopyUrl}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
            <span>{copiedUrl ? 'Copied URL' : 'Copy Canonical Link'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
            >
              Close
            </button>
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs cursor-pointer"
            >
              <span>Read Original Article</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
