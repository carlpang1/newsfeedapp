import React, { useState } from 'react';
import {
  ExternalLink,
  Clock,
  Copy,
  Check,
  Eye,
  Zap,
  Tag,
  Award,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { NewsArticle } from '../types.js';

interface NewsTableProps {
  articles: NewsArticle[];
  onSelectTicker: (symbol: string) => void;
  onOpenPreview: (article: NewsArticle) => void;
}

export const NewsTable: React.FC<NewsTableProps> = ({
  articles,
  onSelectTicker,
  onOpenPreview,
}) => {
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getImportanceBadge = (score?: number) => {
    const s = score !== undefined ? score : 50;
    if (s >= 90) return { label: 'Critical', color: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (s >= 75) return { label: 'High', color: 'bg-amber-50 text-amber-800 border-amber-200' };
    if (s >= 50) return { label: 'Med', color: 'bg-sky-50 text-sky-700 border-sky-200' };
    return { label: 'Low', color: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const handleCopy = (id: number, url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 w-28">Date</th>
              <th className="py-3 px-3 w-36 text-center">Scores</th>
              <th className="py-3 px-3 w-28">Event</th>
              <th className="py-3 px-4 w-28">Tickers</th>
              <th className="py-3 px-4 w-36">Source</th>
              <th className="py-3 px-4">Headline & Summary</th>
              <th className="py-3 px-4 text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {articles.map((article) => {
              const imp = getImportanceBadge(article.importance_score);
              return (
                <tr
                  key={article.id}
                  className="hover:bg-slate-50/80 transition group"
                >
                  {/* Date */}
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap align-top">
                    {formatDate(article.published_at)}
                  </td>

                  {/* Importance & Sentiment Scores */}
                  <td className="py-3 px-3 align-top text-center">
                    <div className="flex flex-col items-center gap-1">
                      {article.importance_score !== undefined && (
                        <span
                          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${imp.color}`}
                          title={`Importance Score: ${article.importance_score}/100 (${imp.label})`}
                        >
                          <Zap className="w-2.5 h-2.5 text-current" />
                          <span>{article.importance_score} Imp</span>
                        </span>
                      )}
                      {article.sentiment_score !== undefined && (() => {
                        const s = article.sentiment_score;
                        const isBull = s > 50;
                        const isBear = s < 50;
                        const label = isBull ? 'BULL' : isBear ? 'BEAR' : 'NEUT';
                        const sym = isBull ? '▲' : isBear ? '▼' : '—';
                        const cls = isBull
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isBear
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200';
                        return (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${cls}`}
                            title={`Sentiment Score: ${s}/100 (${isBull ? 'BULLISH' : isBear ? 'BEARISH' : 'NEUTRAL'})`}
                          >
                            <span>{sym} {s} {label}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </td>

                  {/* Event Type */}
                  <td className="py-3 px-3 align-top whitespace-nowrap">
                    {article.event_type && article.event_type !== 'general' ? (
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80 capitalize">
                        {article.event_type.replace('_', ' ')}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px]">General</span>
                    )}
                  </td>

                  {/* Tickers */}
                  <td className="py-3 px-4 align-top">
                    <div className="flex items-center gap-1 flex-wrap">
                      {article.tickers && article.tickers.length > 0 ? (
                        article.tickers.map((sym) => (
                          <button
                            key={sym}
                            onClick={() => onSelectTicker(sym)}
                            className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-700 transition cursor-pointer border border-slate-200/80"
                          >
                            ${sym}
                          </button>
                        ))
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </div>
                  </td>

                  {/* Publisher & Tier */}
                  <td className="py-3 px-4 align-top font-medium text-slate-800 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{article.publisher || 'Yahoo Finance'}</span>
                      {article.source_tier === 1 && (
                        <Award className="w-3 h-3 text-amber-500 shrink-0" title="Tier 1 Source" />
                      )}
                    </div>
                  </td>

                  {/* Headline & Summary */}
                  <td className="py-3 px-4 align-top">
                    <button
                      onClick={() => onOpenPreview(article)}
                      className="text-left font-semibold text-slate-900 group-hover:text-emerald-700 transition cursor-pointer line-clamp-1 mb-1 block"
                    >
                      {article.title}
                    </button>
                    {article.summary && (
                      <p className="text-slate-500 text-[11px] line-clamp-2 leading-relaxed">
                        {article.summary}
                      </p>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3 px-4 text-right align-top whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => handleCopy(article.id, article.url, e)}
                        title={copiedId === article.id ? 'Copied' : 'Copy link'}
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                      >
                        {copiedId === article.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => onOpenPreview(article)}
                        title="Preview & Scoring Breakdown"
                        className="p-1 text-slate-400 hover:text-slate-700 rounded transition cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        title="Open external link"
                        className="p-1 text-slate-400 hover:text-emerald-600 rounded transition cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
