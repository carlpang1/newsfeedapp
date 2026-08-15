import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Database,
  Building2,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Ticker, ImportJobSummary, AppConfig } from '../types.js';

interface FetchNewsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickers: Ticker[];
  config: AppConfig | null;
  onRunImport: (options: {
    symbols?: string[];
    startDate?: string;
    endDate?: string;
    provider?: 'yahoo' | 'mock';
  }) => Promise<ImportJobSummary>;
  onRefreshFeed: () => void;
}

export const FetchNewsModal: React.FC<FetchNewsModalProps> = ({
  isOpen,
  onClose,
  tickers,
  config,
  onRunImport,
  onRefreshFeed,
}) => {
  const [targetScope, setTargetScope] = useState<'all_enabled' | 'selected' | 'all'>('all_enabled');
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<'today' | '24h' | '7d' | '30d' | 'all' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [providerChoice, setProviderChoice] = useState<'yahoo' | 'mock'>(config?.provider || 'yahoo');

  const [isLoading, setIsLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState<ImportJobSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const enabledTickers = tickers.filter((t) => t.enabled);

  const toggleSymbol = (sym: string) => {
    if (selectedSymbols.includes(sym)) {
      setSelectedSymbols(selectedSymbols.filter((s) => s !== sym));
    } else {
      setSelectedSymbols([...selectedSymbols, sym]);
    }
  };

  const handleSelectAllSymbols = () => {
    setSelectedSymbols(tickers.map((t) => t.symbol));
  };

  const handleClearSelectedSymbols = () => {
    setSelectedSymbols([]);
  };

  const computeDateRange = (): { startDate?: string; endDate?: string } => {
    const now = new Date();
    if (dateRangePreset === 'all') {
      return {};
    }
    if (dateRangePreset === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: todayStart.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === '24h') {
      const past24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startDate: past24.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === '7d') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past7.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === '30d') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past30.toISOString(), endDate: now.toISOString() };
    }
    if (dateRangePreset === 'custom') {
      return {
        startDate: customStart ? new Date(customStart).toISOString() : undefined,
        endDate: customEnd ? new Date(customEnd).toISOString() : undefined,
      };
    }
    return {};
  };

  const handleExecuteFetch = async () => {
    setErrorMessage('');
    setIsLoading(true);
    setSummaryResult(null);

    let symbolsToFetch: string[] | undefined = undefined;
    if (targetScope === 'selected') {
      if (selectedSymbols.length === 0) {
        setErrorMessage('Please select at least one stock ticker.');
        setIsLoading(false);
        return;
      }
      symbolsToFetch = selectedSymbols;
    } else if (targetScope === 'all') {
      symbolsToFetch = tickers.map((t) => t.symbol);
    }

    const { startDate, endDate } = computeDateRange();

    try {
      const summary = await onRunImport({
        symbols: symbolsToFetch,
        startDate,
        endDate,
        provider: providerChoice,
      });
      setSummaryResult(summary);
      onRefreshFeed();
    } catch (err: any) {
      setErrorMessage(err.message || 'Import operation failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="fetch-news-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 text-emerald-600 ${isLoading ? 'animate-spin' : ''}`} />
            <div>
              <h2 className="text-base font-bold text-slate-900">Retrieve Stock News</h2>
              <p className="text-xs text-slate-500">
                Collect, deduplicate, and persist latest news articles into SQLite
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* If summary result is available, show the completed report */}
          {summaryResult ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <h3 className="text-sm font-bold text-emerald-950">Import Completed Successfully</h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {summaryResult.details?.fetchMode && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 uppercase">
                        Mode: {summaryResult.details.fetchMode}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white text-emerald-700 border border-emerald-200 uppercase">
                      Provider: {summaryResult.provider}
                    </span>
                  </div>
                </div>

                {/* Import Summary stats block matching PDF Section 8 & 10 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <div className="text-[11px] text-slate-500 font-medium">Tickers Processed</div>
                    <div className="text-lg font-bold text-slate-900">{summaryResult.tickers_count}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <div className="text-[11px] text-slate-500 font-medium">Articles Retrieved</div>
                    <div className="text-lg font-bold text-emerald-700">{summaryResult.articles_retrieved}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <div className="text-[11px] text-slate-500 font-medium">New Articles</div>
                    <div className="text-lg font-bold text-emerald-600">{summaryResult.new_articles}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-100 shadow-2xs">
                    <div className="text-[11px] text-slate-500 font-medium">Duplicates Skipped</div>
                    <div className="text-lg font-bold text-amber-600">{summaryResult.duplicates_skipped}</div>
                  </div>
                </div>

                {summaryResult.errors_count > 0 && (
                  <div className="p-2.5 bg-rose-100/70 border border-rose-200 rounded-lg text-xs text-rose-800">
                    <strong>Errors encountered ({summaryResult.errors_count}):</strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 font-mono text-[11px]">
                      {summaryResult.details?.errors?.map((err, i) => (
                        <li key={i}>
                          <strong>{err.symbol}</strong>: {err.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Per-Ticker Results Breakdown */}
              {summaryResult.details?.tickerResults && summaryResult.details.tickerResults.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200">
                    Per-Ticker Import Breakdown
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700 font-mono">
                      <thead className="bg-slate-50/50 text-[11px] uppercase text-slate-400 sticky top-0">
                        <tr>
                          <th className="py-2 px-4">Ticker</th>
                          <th className="py-2 px-4">Mode</th>
                          <th className="py-2 px-4">Status</th>
                          <th className="py-2 px-4">Retrieved</th>
                          <th className="py-2 px-4">New</th>
                          <th className="py-2 px-4">Duplicates</th>
                          <th className="py-2 px-4">Last Fetch</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {summaryResult.details.tickerResults.map((tr, i) => {
                          const tickerSym = tr.ticker || tr.symbol;
                          const statusStr = tr.status === 'ok' || tr.status === 'success' ? 'success' : tr.status;
                          const retCount = tr.articlesRetrieved !== undefined ? tr.articlesRetrieved : tr.retrieved;
                          const newCount = tr.newArticles !== undefined ? tr.newArticles : tr.newInserted;
                          const localTime = tr.newLastFetchAt
                            ? new Date(tr.newLastFetchAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })
                            : '—';

                          return (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="py-1.5 px-4 font-bold text-slate-900">${tickerSym}</td>
                              <td className="py-1.5 px-4">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-sans font-medium ${
                                    tr.fetchMode === 'incremental'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {tr.fetchMode || 'initial'}
                                </span>
                              </td>
                              <td className="py-1.5 px-4">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-sans font-semibold ${
                                    statusStr === 'success'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : statusStr === 'empty'
                                      ? 'bg-slate-100 text-slate-500'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {statusStr}
                                </span>
                              </td>
                              <td className="py-1.5 px-4">{retCount}</td>
                              <td className="py-1.5 px-4 text-emerald-600 font-bold">{newCount}</td>
                              <td className="py-1.5 px-4 text-amber-600">{tr.duplicates}</td>
                              <td className="py-1.5 px-4 text-[11px] text-slate-500">{localTime}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setSummaryResult(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  Configure Another Fetch
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs"
                >
                  View News in Feed
                </button>
              </div>
            </div>
          ) : (
            /* Configure Import Form */
            <div className="space-y-5">
              
              {/* Target Tickers Scope */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  1. Target Stock Tickers
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetScope('all_enabled')}
                    className={`p-2.5 rounded-xl border text-xs text-left transition cursor-pointer ${
                      targetScope === 'all_enabled'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-semibold shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Enabled Only</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {enabledTickers.length} active tickers
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetScope('selected')}
                    className={`p-2.5 rounded-xl border text-xs text-left transition cursor-pointer ${
                      targetScope === 'selected'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-semibold shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">Custom Selection</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {selectedSymbols.length} selected
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTargetScope('all')}
                    className={`p-2.5 rounded-xl border text-xs text-left transition cursor-pointer ${
                      targetScope === 'all'
                        ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-semibold shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="font-bold">All Tickers</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {tickers.length} tickers total
                    </div>
                  </button>
                </div>

                {/* Custom Tickers Checkbox Grid */}
                {targetScope === 'selected' && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Select tickers to query:</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSelectAllSymbols}
                          className="text-[11px] text-emerald-600 hover:underline"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSelectedSymbols}
                          className="text-[11px] text-slate-400 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-36 overflow-y-auto p-1">
                      {tickers.map((t) => {
                        const isChecked = selectedSymbols.includes(t.symbol);
                        return (
                          <label
                            key={t.id}
                            className={`flex items-center gap-1.5 p-1.5 rounded-md border text-xs cursor-pointer select-none transition ${
                              isChecked
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSymbol(t.symbol)}
                              className="rounded text-emerald-600"
                            />
                            <span>{t.symbol}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Date Range Selection (PDF Section 6) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  2. Date Range Filter
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'today', label: 'Today' },
                      { id: '24h', label: 'Last 24 Hours' },
                      { id: '7d', label: 'Last 7 Days' },
                      { id: '30d', label: 'Last 30 Days' },
                      { id: 'all', label: 'All Time' },
                      { id: 'custom', label: 'Custom Range' },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setDateRangePreset(preset.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                        dateRangePreset === preset.id
                          ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {dateRangePreset === 'custom' && (
                  <div className="mt-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Start Date/Time:</label>
                      <input
                        type="datetime-local"
                        value={customStart}
                        onChange={(e) => setCustomStart(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">End Date/Time:</label>
                      <input
                        type="datetime-local"
                        value={customEnd}
                        onChange={(e) => setCustomEnd(e.target.value)}
                        className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Provider Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  3. News Retrieval Provider
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setProviderChoice('yahoo')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      providerChoice === 'yahoo'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-950 font-semibold shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5 text-blue-900">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        Yahoo Finance
                      </div>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                        LIVE
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      Queries real Yahoo Finance RSS feeds (<code className="text-[10px] text-blue-800">feeds.finance.yahoo.com</code>).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProviderChoice('mock')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      providerChoice === 'mock'
                        ? 'border-amber-600 bg-amber-50/70 text-amber-950 font-semibold shadow-2xs'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                        Mock Provider
                      </div>
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                        TEST DATA
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">
                      Generates fixture articles for offline testing and automated verification runs.
                    </p>
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExecuteFetch}
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>{isLoading ? 'Retrieving & Deduplicating...' : 'Start News Retrieval'}</span>
                </button>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};
