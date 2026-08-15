import React, { useState } from 'react';
import {
  ExternalLink,
  Clock,
  Building2,
  Copy,
  Check,
  Eye,
  Share2,
  Zap,
  Tag,
  Layers,
  Award,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  AlertTriangle,
  FileText,
  Activity,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HelpCircle,
  ShieldCheck,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { NewsArticle } from '../types.js';

interface NewsCardProps {
  article: NewsArticle;
  onSelectTicker: (symbol: string) => void;
  onOpenPreview: (article: NewsArticle) => void;
  onRefreshArticle?: (article: NewsArticle) => void;
}

export const NewsCard: React.FC<NewsCardProps> = ({
  article,
  onSelectTicker,
  onOpenPreview,
  onRefreshArticle,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [showAiDetails, setShowAiDetails] = useState(false);
  const [analyzingSingle, setAnalyzingSingle] = useState(false);

  const getPublisherBadgeColor = (pub: string) => {
    const p = (pub || '').toLowerCase();
    if (p.includes('reuters')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (p.includes('bloomberg')) return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (p.includes('cnbc')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (p.includes('journal') || p.includes('wsj')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (p.includes('barron')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (p.includes('marketwatch')) return 'bg-teal-50 text-teal-700 border-teal-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const getImportanceBadge = (score?: number) => {
    const s = score !== undefined ? score : 50;
    if (s >= 90) {
      return {
        label: 'Critical',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
        scoreClass: 'bg-rose-600 text-white',
      };
    }
    if (s >= 75) {
      return {
        label: 'High',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
        scoreClass: 'bg-amber-600 text-white',
      };
    }
    if (s >= 50) {
      return {
        label: 'Medium',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
        scoreClass: 'bg-sky-600 text-white',
      };
    }
    return {
      label: 'Low',
      badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
      scoreClass: 'bg-slate-500 text-white',
    };
  };

  const getEventBadge = (eventType?: string) => {
    switch (eventType) {
      case 'earnings':
        return { label: 'Earnings', icon: DollarSign, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'acquisition':
      case 'merger':
        return { label: 'M&A Deal', icon: Briefcase, color: 'bg-purple-50 text-purple-700 border-purple-200' };
      case 'fda_clinical':
        return { label: 'FDA / Clinical', icon: Activity, color: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
      case 'guidance':
        return { label: 'Guidance', icon: TrendingUp, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'dividend':
        return { label: 'Dividend', icon: DollarSign, color: 'bg-teal-50 text-teal-700 border-teal-200' };
      case 'legal':
      case 'regulatory':
        return { label: 'Legal / Reg', icon: AlertTriangle, color: 'bg-rose-50 text-rose-700 border-rose-200' };
      case 'executive_change':
      case 'management':
        return { label: 'Leadership', icon: Briefcase, color: 'bg-orange-50 text-orange-700 border-orange-200' };
      case 'partnership':
      case 'contract':
        return { label: 'Partnership', icon: Tag, color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'analyst_rating':
      case 'analyst_target':
        return { label: 'Analyst Call', icon: FileText, color: 'bg-violet-50 text-violet-700 border-violet-200' };
      default:
        return null;
    }
  };

  const getMarketImpactColor = (impact: string) => {
    switch (impact) {
      case 'bullish':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
          badge: 'bg-emerald-600 text-white',
          icon: TrendingUp,
        };
      case 'bearish':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
          badge: 'bg-rose-600 text-white',
          icon: TrendingDown,
        };
      case 'neutral':
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          badge: 'bg-slate-500 text-white',
          icon: Activity,
        };
      case 'mixed':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
          badge: 'bg-amber-600 text-white',
          icon: HelpCircle,
        };
      default:
        return {
          bg: 'bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
          badge: 'bg-slate-400 text-white',
          icon: HelpCircle,
        };
    }
  };

  const handleTriggerAI = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setAnalyzingSingle(true);
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
      console.error('Single AI trigger failed:', err);
    } finally {
      setAnalyzingSingle(false);
    }
  };

  const handleCopyAiJson = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (article.ai_analysis) {
      navigator.clipboard.writeText(JSON.stringify(article.ai_analysis, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    }
  };

  const formatPublishDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      const relative = formatDistanceToNow(date, { addSuffix: true });
      const full = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return { relative, full };
    } catch {
      return { relative: dateStr, full: dateStr };
    }
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(article.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { relative, full } = formatPublishDate(article.published_at);
  const impBadge = getImportanceBadge(article.importance_score);
  const eventInfo = getEventBadge(article.event_type);
  const ai = article.ai_analysis;
  const impactConfig = ai ? getMarketImpactColor(ai.market_impact) : null;

  return (
    <article
      id={`news-card-${article.id}`}
      className={`bg-white border hover:shadow-md transition-all duration-200 rounded-xl p-4.5 flex flex-col justify-between group relative ${
        ai
          ? 'border-indigo-200/90 hover:border-indigo-300'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div>
        {/* Row 1: Source & Intelligence Scores */}
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${getPublisherBadgeColor(
                article.publisher
              )}`}
            >
              {article.publisher || 'Yahoo Finance'}
            </span>

            {article.source_tier === 1 && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100/70 text-amber-800 border border-amber-300/80"
                title="Tier 1 Major Wire / Premier Financial Outlet"
              >
                <Award className="w-2.5 h-2.5 text-amber-600" />
                <span>Tier 1</span>
              </span>
            )}

            {/* AI Intelligence Badge */}
            {ai ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200"
                title={`AI Intelligence Verified (${ai.model})`}
              >
                <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                <span>AI Analyzed</span>
              </span>
            ) : article.ai_eligible ? (
              <button
                onClick={handleTriggerAI}
                disabled={analyzingSingle}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                title="Article qualifies for AI enrichment. Click to run AI analysis."
              >
                {analyzingSingle ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                    <span>Run AI</span>
                  </>
                )}
              </button>
            ) : null}
          </div>

          {/* Importance & Relevance Score Pill */}
          <div className="flex items-center gap-1.5">
            {article.importance_score !== undefined && (
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border cursor-pointer ${impBadge.badgeClass}`}
                onClick={() => onOpenPreview(article)}
                title={`Importance Score: ${article.importance_score}/100 (${impBadge.label})`}
              >
                <Zap className="w-3 h-3 text-current" />
                <span className="font-mono">{article.importance_score}</span>
              </div>
            )}

            {article.relevance_score !== undefined && article.relevance_score > 0 && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded border border-slate-200/80"
                title={`Relevance Score: ${article.relevance_score}/100`}
              >
                {article.relevance_score}% Rel
              </span>
            )}
          </div>
        </div>

        {/* Event Type & Syndication Cluster Badge */}
        {(eventInfo || (article.duplicate_count && article.duplicate_count > 1)) && (
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {eventInfo && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${eventInfo.color}`}>
                <eventInfo.icon className="w-3 h-3" />
                <span>{eventInfo.label}</span>
              </span>
            )}

            {article.duplicate_count && article.duplicate_count > 1 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                title={`Clustered with ${article.duplicate_count} syndicated or re-published variations across wires`}
              >
                <Layers className="w-2.5 h-2.5 text-slate-500" />
                <span>{article.duplicate_count} syndicated</span>
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h3 className="text-sm font-semibold text-slate-900 leading-snug group-hover:text-emerald-700 transition line-clamp-2 mb-2">
          <button
            onClick={() => onOpenPreview(article)}
            className="text-left hover:underline cursor-pointer"
          >
            {article.title}
          </button>
        </h3>

        {/* AI Intelligence Highlight Block (Phase 5) */}
        {ai ? (
          <div className="mb-3 space-y-2 rounded-lg bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 p-3">
            {/* Why It Matters */}
            <div className="text-xs text-slate-700 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-slate-100 mr-1.5">
                Why It Matters:
              </span>
              <span className="leading-relaxed">{ai.why_it_matters}</span>
            </div>

            {/* Market Impact & Time Horizon Ribbon */}
            {impactConfig && (
              <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
                <span className="text-[11px] font-semibold text-slate-500">Market Impact:</span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${impactConfig.bg}`}
                >
                  <impactConfig.icon className="w-3 h-3" />
                  <span>{ai.market_impact}</span>
                  <span className="font-mono opacity-80">({ai.impact_confidence}%)</span>
                </span>

                <span className="text-slate-300">&bull;</span>

                <span className="text-[11px] font-semibold text-slate-500">Horizon:</span>
                <span className="text-[11px] font-medium text-slate-700 capitalize">
                  {ai.time_horizon.replace('_', ' ')}
                </span>

                {/* Toggle details */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAiDetails(!showAiDetails);
                  }}
                  className="ml-auto text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 cursor-pointer"
                >
                  {showAiDetails ? 'Hide' : 'Details'}
                  {showAiDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
            )}

            {/* Expandable AI Inspector */}
            {showAiDetails && (
              <div className="mt-2 pt-2 border-t border-indigo-100 dark:border-indigo-900/60 space-y-2 text-[11px] animate-in fade-in duration-150">
                {/* AI Summary */}
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">Synthesis: </span>
                  <span className="text-slate-600 dark:text-slate-400">{ai.summary}</span>
                </div>

                {/* Key Facts */}
                {ai.key_facts && ai.key_facts.length > 0 && (
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Key Facts:</span>
                    <ul className="list-disc pl-4 text-slate-600 dark:text-slate-400 space-y-0.5 mt-0.5">
                      {ai.key_facts.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Catalysts & Risks */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {ai.catalysts && ai.catalysts.length > 0 && (
                    <div className="bg-emerald-50/60 dark:bg-emerald-950/30 p-2 rounded border border-emerald-200/60 dark:border-emerald-900/40">
                      <span className="font-bold text-emerald-800 dark:text-emerald-300 block mb-0.5">
                        Catalysts:
                      </span>
                      <ul className="list-disc pl-3 text-emerald-900 dark:text-emerald-200 space-y-0.5 text-[10px]">
                        {ai.catalysts.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {ai.risks && ai.risks.length > 0 && (
                    <div className="bg-rose-50/60 dark:bg-rose-950/30 p-2 rounded border border-rose-200/60 dark:border-rose-900/40">
                      <span className="font-bold text-rose-800 dark:text-rose-300 block mb-0.5">
                        Risks:
                      </span>
                      <ul className="list-disc pl-3 text-rose-900 dark:text-rose-200 space-y-0.5 text-[10px]">
                        {ai.risks.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Metadata & Copy JSON */}
                <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 border-t border-indigo-100/60">
                  <span>
                    Model: <strong>{ai.model}</strong> &bull; Schema: <strong>{ai.schema_version}</strong>
                  </span>
                  <button
                    onClick={handleCopyAiJson}
                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"
                  >
                    {copiedJson ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedJson ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : article.summary ? (
          /* Standard summary fallback if AI analysis not performed */
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3 mb-3">
            {article.summary}
          </p>
        ) : null}
      </div>

      {/* Footer: Ticker tags, Relative Time & Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
        {/* Ticker Badges & Timestamp */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {article.tickers && article.tickers.length > 0 ? (
              article.tickers.map((sym) => (
                <button
                  key={sym}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTicker(sym);
                  }}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition cursor-pointer border border-slate-200/80"
                  title={`Filter news by ${sym}`}
                >
                  ${sym}
                </button>
              ))
            ) : (
              <span className="text-[11px] text-slate-400">No ticker</span>
            )}
          </div>

          <div
            className="flex items-center gap-1 text-slate-400 text-[11px]"
            title={`Published: ${full}`}
          >
            <Clock className="w-3 h-3" />
            <span>{relative}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopyUrl}
            title={copied ? 'URL Copied!' : 'Copy canonical URL'}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => onOpenPreview(article)}
            title="Preview Details, Scoring & Signals"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>

          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            title="Open on Publisher Website (External)"
            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
};
