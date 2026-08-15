import React, { useState } from 'react';
import {
  TrendingUp,
  RefreshCw,
  SlidersHorizontal,
  CheckCircle2,
  Database,
  History,
  FileCode,
  Terminal,
  Settings,
  Sparkles,
  Activity,
  AlertCircle,
  Clock,
  Target,
} from 'lucide-react';
import { GlobalStats, AppConfig, ProviderHealth } from '../types.js';

interface HeaderProps {
  stats: GlobalStats | null;
  config: AppConfig | null;
  health: ProviderHealth | null;
  activeMainTab: 'news_feed' | 'ticker_intelligence';
  onSelectMainTab: (tab: 'news_feed' | 'ticker_intelligence') => void;
  onOpenFetch: () => void;
  onOpenTickers: () => void;
  onOpenTests: () => void;
  onOpenCalibration: () => void;
  onOpenAIAnalysis: () => void;
  onOpenHistory: () => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
  onToggleProvider: () => void;
  onProbeHealth?: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  config,
  health,
  activeMainTab,
  onSelectMainTab,
  onOpenFetch,
  onOpenTickers,
  onOpenTests,
  onOpenCalibration,
  onOpenAIAnalysis,
  onOpenHistory,
  onOpenLogs,
  onOpenSettings,
  onToggleProvider,
  onProbeHealth,
  isRefreshing,
}) => {
  const isYahoo = config?.provider === 'yahoo';
  const [showHealthTooltip, setShowHealthTooltip] = useState(false);

  const isConnected = health?.status === 'connected';
  const hasError = health?.status === 'error';

  return (
    <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo & Main Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stock News Aggregator</h1>
                
                {/* SQLite Database Tag */}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <Database className="w-3 h-3" /> SQLite Active
                </span>

                {/* Clear MOCK vs LIVE Provider Tag */}
                <div className="relative">
                  <button
                    onClick={onToggleProvider}
                    onMouseEnter={() => setShowHealthTooltip(true)}
                    onMouseLeave={() => setShowHealthTooltip(false)}
                    title="Click to toggle between Yahoo Finance (LIVE) and Mock (TEST DATA)"
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition cursor-pointer border shadow-2xs ${
                      isYahoo
                        ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isYahoo
                          ? hasError
                            ? 'bg-red-500'
                            : isConnected
                            ? 'bg-emerald-500 ring-2 ring-emerald-300'
                            : 'bg-blue-600 animate-pulse'
                          : 'bg-amber-600'
                      }`}
                    />
                    <span className="font-semibold">
                      Provider: {isYahoo ? 'Yahoo Finance' : 'Mock'}
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-sm bg-white/80 border border-current/20">
                      {isYahoo ? 'LIVE' : 'TEST DATA'}
                    </span>
                  </button>

                  {/* Provider Health Tooltip */}
                  {showHealthTooltip && isYahoo && (
                    <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-slate-900 text-white rounded-xl shadow-xl text-xs z-50 animate-in fade-in zoom-in-95">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2 font-semibold">
                        <span>Yahoo Finance Health</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                            hasError ? 'bg-red-900/80 text-red-200' : isConnected ? 'bg-emerald-900/80 text-emerald-200' : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {health?.status || 'Active'}
                        </span>
                      </div>
                      <div className="space-y-1 text-slate-300 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Endpoint:</span>
                          <span className="font-mono text-[10px] text-slate-300">feeds.finance.yahoo.com</span>
                        </div>
                        {health?.lastSuccessfulFetch && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-400">Last Fetch:</span>
                            <span>{new Date(health.lastSuccessfulFetch).toLocaleTimeString()}</span>
                          </div>
                        )}
                        {health?.lastError && (
                          <div className="text-red-400 font-mono text-[10px] mt-1 pt-1 border-t border-slate-800">
                            Last error: {health.lastError}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
              <p className="text-xs text-slate-600 mt-0.5 truncate max-w-xs sm:max-w-none">
                Yahoo Finance RSS news retrieval • Deduplication engine • Many-to-many SQLite relations
              </p>
            </div>
          </div>

          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => onSelectMainTab('news_feed')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'news_feed'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>News Feed</span>
            </button>
            <button
              id="nav-ticker-intelligence-tab"
              onClick={() => onSelectMainTab('ticker_intelligence')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeMainTab === 'ticker_intelligence'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Ticker Intelligence</span>
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black uppercase tracking-wider bg-white/20 text-current">
                NEW
              </span>
            </button>
          </div>

          {/* Quick Metrics Bar & Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Stats chips */}
            {stats && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                <span>
                  <strong className="text-slate-900">{stats.enabledTickers}</strong>/{stats.totalTickers} Tickers
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  <strong className="text-slate-900">{stats.totalArticles}</strong> Unique News
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  <strong className="text-slate-900">{stats.totalRelationships}</strong> Links
                </span>
              </div>
            )}

            {/* AI News Intelligence Button (Phase 5) */}
            <button
              id="header-ai-intelligence-btn"
              onClick={onOpenAIAnalysis}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs cursor-pointer"
              title="Phase 5: AI News Intelligence Analysis & Token Cost Dashboard"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>AI Intelligence</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-800 text-indigo-100">
                Phase 5
              </span>
            </button>

            {/* News Calibration Button */}
            <button
              onClick={onOpenCalibration}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition shadow-2xs cursor-pointer"
              title="Phase 4: Calibrate News Intelligence Engine (v2.0 rules, human reviews, quality tests)"
            >
              <Target className="w-3.5 h-3.5 text-indigo-600" />
              <span>News Calibration</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                v2.0
              </span>
            </button>

            {/* Download Source ZIP Button */}
            <a
              href="/api/download-zip"
              download="newsfeedapp_production_source.zip"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs cursor-pointer"
              title="Download clean production-ready ZIP archive of source code"
            >
              <Database className="w-3.5 h-3.5 text-emerald-200" />
              <span>Download ZIP</span>
            </a>

            {/* Test Suite Runner Button */}
            <button
              onClick={onOpenTests}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition shadow-2xs hover:border-slate-300"
            >
              <FileCode className="w-3.5 h-3.5 text-emerald-600" />
              <span>Automated Tests</span>
            </button>

            {/* Manage Tickers Button */}
            <button
              onClick={onOpenTickers}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition shadow-2xs hover:border-slate-300"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-600" />
              <span>Manage Tickers</span>
              {stats && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-semibold text-[10px]">
                  {stats.totalTickers}
                </span>
              )}
            </button>

            {/* Import History */}
            <button
              onClick={onOpenHistory}
              title="Import History & Logs"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
            >
              <History className="w-4 h-4" />
            </button>

            {/* System Logs */}
            <button
              onClick={onOpenLogs}
              title="System Logs"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
            >
              <Terminal className="w-4 h-4" />
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              title="Application Settings"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Primary Action: Fetch News */}
            <button
              onClick={onOpenFetch}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 rounded-lg transition shadow-sm cursor-pointer ml-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Fetch News</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
