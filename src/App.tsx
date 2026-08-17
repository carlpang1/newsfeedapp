import React, { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  SlidersHorizontal,
  FileCode,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Database,
  Building2,
  Calendar,
  Layers,
  Inbox,
  LineChart,
} from 'lucide-react';
import {
  Ticker,
  NewsArticle,
  GlobalStats,
  AppConfig,
  ImportJobSummary,
  ProviderHealth,
} from './types.js';
import {
  fetchTickers,
  fetchNews,
  fetchPublishers,
  fetchStats,
  fetchConfig,
  updateConfig,
  createTicker,
  updateTicker,
  deleteTicker,
  toggleAllTickers,
  bulkToggleTickers,
  bulkImportTickers,
  triggerNewsImport,
  fetchProviderHealth,
  reclassifyNews,
} from './services/api.js';

import { Header } from './components/Header.tsx';
import { FilterBar, DatePreset } from './components/FilterBar.tsx';
import { NewsCard } from './components/NewsCard.tsx';
import { NewsTable } from './components/NewsTable.tsx';
import { ArticleDetailModal } from './components/ArticleDetailModal.tsx';
import { TickerManagerModal } from './components/TickerManagerModal.tsx';
import { FetchNewsModal } from './components/FetchNewsModal.tsx';
import { TestRunnerModal } from './components/TestRunnerModal.tsx';
import { ImportHistoryModal } from './components/ImportHistoryModal.tsx';
import { LogsModal } from './components/LogsModal.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import { CalibrationModal } from './components/CalibrationModal.tsx';
import { AIAnalysisModal } from './components/AIAnalysisModal.tsx';
import { TickerIntelligenceView } from './components/TickerIntelligenceView.tsx';
import { TechnicalSignalsView } from './components/TechnicalSignalsView.tsx';

export default function App() {
  // Navigation tab state
  const [activeMainTab, setActiveMainTab] = useState<'news_feed' | 'ticker_intelligence' | 'technical_analyst'>('ticker_intelligence');

  // Global Data State
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);

  // Pagination & Results Info
  const [totalArticles, setTotalArticles] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Filtering & View State
  const [selectedTicker, setSelectedTicker] = useState<string>('ALL');
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'importance' | 'relevance' | 'sentiment_high' | 'sentiment_low'>('newest');
  const [importanceFilter, setImportanceFilter] = useState<'ALL' | 'critical' | 'high' | 'medium' | 'low'>('ALL');
  const [sentimentFilter, setSentimentFilter] = useState<'all' | 'bullish' | 'bearish' | 'neutral'>('all');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Loading & Modals
  const [loadingNews, setLoadingNews] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [previewArticle, setPreviewArticle] = useState<NewsArticle | null>(null);

  // Modal open states
  const [isFetchModalOpen, setIsFetchModalOpen] = useState(false);
  const [isTickersModalOpen, setIsTickersModalOpen] = useState(false);
  const [isTestsModalOpen, setIsTestsModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Load initial app dependencies
  const loadInitialData = useCallback(async () => {
    try {
      const [tickersData, statsData, configData, publishersData, healthData] = await Promise.all([
        fetchTickers(),
        fetchStats(),
        fetchConfig(),
        fetchPublishers(),
        fetchProviderHealth().catch(() => null),
      ]);
      setTickers(tickersData);
      setStats(statsData);
      setConfig(configData);
      setPublishers(publishersData);
      if (healthData) setProviderHealth(healthData);
    } catch (err) {
      console.error('Error during initialization:', err);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Compute actual date string constraints from preset
  const getDateRangeBounds = useCallback(() => {
    const now = new Date();
    if (selectedPreset === 'all') {
      return { startDate: undefined, endDate: undefined };
    }
    if (selectedPreset === 'today') {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { startDate: todayStart.toISOString(), endDate: now.toISOString() };
    }
    if (selectedPreset === '24h') {
      const past24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startDate: past24.toISOString(), endDate: now.toISOString() };
    }
    if (selectedPreset === '7d') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: past7.toISOString(), endDate: now.toISOString() };
    }
    if (selectedPreset === '30d') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: past30.toISOString(), endDate: now.toISOString() };
    }
    if (selectedPreset === 'custom') {
      return {
        startDate: customStartDate ? new Date(customStartDate).toISOString() : undefined,
        endDate: customEndDate ? new Date(customEndDate).toISOString() : undefined,
      };
    }
    return { startDate: undefined, endDate: undefined };
  }, [selectedPreset, customStartDate, customEndDate]);

  // Query news articles
  const loadNewsArticles = useCallback(async () => {
    setLoadingNews(true);
    const { startDate, endDate } = getDateRangeBounds();

    try {
      const res = await fetchNews({
        ticker: selectedTicker !== 'ALL' ? selectedTicker : undefined,
        startDate,
        endDate,
        source: selectedPublisher !== 'ALL' ? selectedPublisher : undefined,
        search: searchQuery.trim() || undefined,
        sort: sortOrder,
        importance: importanceFilter,
        sentiment: sentimentFilter,
        eventType: eventTypeFilter !== 'ALL' ? eventTypeFilter : undefined,
        page: currentPage,
        limit: itemsPerPage,
      });

      setNews(res.articles);
      setTotalArticles(res.total);
      setTotalPages(res.totalPages);

      // Defensive verification: verify returned dataset strictly satisfies selected sentiment filter
      if (sentimentFilter === 'bullish') {
        const invalid = res.articles.filter((a) => (a.sentiment_score ?? 50) < 51);
        if (invalid.length > 0) {
          console.error(`[DEFENSIVE ASSERTION FAILED] Received ${invalid.length} non-bullish articles (score <= 50) when sentimentFilter='bullish':`, invalid);
        }
      } else if (sentimentFilter === 'bearish') {
        const invalid = res.articles.filter((a) => (a.sentiment_score ?? 50) > 49);
        if (invalid.length > 0) {
          console.error(`[DEFENSIVE ASSERTION FAILED] Received ${invalid.length} non-bearish articles (score >= 50) when sentimentFilter='bearish':`, invalid);
        }
      } else if (sentimentFilter === 'neutral') {
        const invalid = res.articles.filter((a) => (a.sentiment_score ?? 50) !== 50);
        if (invalid.length > 0) {
          console.error(`[DEFENSIVE ASSERTION FAILED] Received ${invalid.length} non-neutral articles when sentimentFilter='neutral':`, invalid);
        }
      }
    } catch (err) {
      console.error('Error fetching news:', err);
    } finally {
      setLoadingNews(false);
    }
  }, [
    selectedTicker,
    getDateRangeBounds,
    selectedPublisher,
    searchQuery,
    sortOrder,
    importanceFilter,
    sentimentFilter,
    eventTypeFilter,
    currentPage,
    itemsPerPage,
  ]);

  // Reload news whenever filters or pagination changes
  useEffect(() => {
    loadNewsArticles();
  }, [loadNewsArticles]);

  // Refresh all data
  const handleFullRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [tickersData, statsData, publishersData, healthData] = await Promise.all([
        fetchTickers(),
        fetchStats(),
        fetchPublishers(),
        fetchProviderHealth().catch(() => null),
      ]);
      setTickers(tickersData);
      setStats(statsData);
      setPublishers(publishersData);
      if (healthData) setProviderHealth(healthData);
      await loadNewsArticles();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Reclassify all news
  const handleReclassify = async () => {
    setIsReclassifying(true);
    try {
      await reclassifyNews();
      await handleFullRefresh();
    } catch (err) {
      console.error('Error reclassifying news:', err);
    } finally {
      setIsReclassifying(false);
    }
  };

  // Quick Provider Toggle
  const handleToggleProvider = async () => {
    if (!config) return;
    const next = config.provider === 'yahoo' ? 'mock' : 'yahoo';
    try {
      await updateConfig({ provider: next });
      setConfig({ ...config, provider: next });
      const healthData = await fetchProviderHealth().catch(() => null);
      if (healthData) setProviderHealth(healthData);
    } catch (err) {
      console.error(err);
    }
  };

  // Ticker Handlers
  const handleAddTicker = async (data: {
    symbol: string;
    company_name?: string;
    exchange?: string;
    enabled?: boolean;
  }) => {
    await createTicker(data);
    await handleFullRefresh();
  };

  const handleUpdateTicker = async (
    id: number,
    data: { symbol?: string; company_name?: string; exchange?: string; enabled?: boolean }
  ) => {
    await updateTicker(id, data);
    await handleFullRefresh();
  };

  const handleDeleteTicker = async (id: number) => {
    await deleteTicker(id);
    if (selectedTicker === tickers.find((t) => t.id === id)?.symbol) {
      setSelectedTicker('ALL');
    }
    await handleFullRefresh();
  };

  const handleToggleAll = async (enabled: boolean) => {
    await toggleAllTickers(enabled);
    await handleFullRefresh();
  };

  const handleBulkToggle = async (ids: number[], enabled: boolean) => {
    await bulkToggleTickers(ids, enabled);
    await handleFullRefresh();
  };

  const handleBulkImport = async (
    items: Array<{ symbol: string; company_name?: string; exchange?: string; enabled?: boolean }>,
    options?: { updateExisting?: boolean; defaultEnabled?: boolean }
  ) => {
    const res = await bulkImportTickers(items, options);
    await handleFullRefresh();
    return res;
  };

  const handleRunNewsImport = async (options: {
    symbols?: string[];
    startDate?: string;
    endDate?: string;
    provider?: 'yahoo' | 'mock';
  }): Promise<ImportJobSummary> => {
    const summary = await triggerNewsImport(options);
    await handleFullRefresh();
    return summary;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* Top Header Navigation */}
      <Header
        stats={stats}
        config={config}
        health={providerHealth}
        activeMainTab={activeMainTab}
        onSelectMainTab={setActiveMainTab}
        onOpenFetch={() => setIsFetchModalOpen(true)}
        onOpenTickers={() => setIsTickersModalOpen(true)}
        onOpenTests={() => setIsTestsModalOpen(true)}
        onOpenCalibration={() => setIsCalibrationModalOpen(true)}
        onOpenAIAnalysis={() => setIsAIModalOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenLogs={() => setIsLogsModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onToggleProvider={handleToggleProvider}
        isRefreshing={isRefreshing}
      />

      {/* Prominent Secondary Navigation Bar */}
      <div className="bg-slate-900 text-white border-b border-slate-800 shadow-md sticky top-[65px] z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center space-x-2 py-2">
            <button
              id="top-nav-news-feed-tab"
              onClick={() => setActiveMainTab('news_feed')}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
                activeMainTab === 'news_feed'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Database className="w-4 h-4 text-emerald-300" />
              <span>News Feed</span>
            </button>

            <button
              id="top-nav-ticker-intelligence-tab"
              onClick={() => setActiveMainTab('ticker_intelligence')}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
                activeMainTab === 'ticker_intelligence'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-4 h-4 text-indigo-300" />
              <span>Ticker Intelligence</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/40 text-indigo-100 border border-indigo-400/30">
                SUMMARY
              </span>
            </button>

            <button
              id="top-nav-technical-signals-tab"
              onClick={() => setActiveMainTab('technical_analyst')}
              className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer flex items-center gap-2 ${
                activeMainTab === 'technical_analyst'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <LineChart className="w-4 h-4 text-indigo-300" />
              <span>Technical & AI Signals</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/40 text-indigo-100 border border-indigo-400/30">
                AI SIGNALS
              </span>
            </button>
          </div>

          <div className="hidden md:flex items-center text-xs text-slate-400 gap-3">
            <span>
              Active View:{' '}
              <strong className="text-white font-mono">
                {activeMainTab === 'news_feed'
                  ? 'Aggregated Articles Feed'
                  : activeMainTab === 'ticker_intelligence'
                  ? 'Ticker Intelligence Summary Page'
                  : 'Stock Technicals & AI Signals Engine'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {activeMainTab === 'technical_analyst' ? (
          <TechnicalSignalsView
            tickers={tickers}
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            onOpenArticlePreview={(art) => setPreviewArticle(art)}
          />
        ) : activeMainTab === 'ticker_intelligence' ? (
          <TickerIntelligenceView
            tickers={tickers}
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            selectedPreset={selectedPreset}
            onSelectPreset={setSelectedPreset}
            onOpenArticlePreview={(art) => setPreviewArticle(art)}
            onSwitchToNewsFeed={() => setActiveMainTab('news_feed')}
          />
        ) : (
          <>
            {/* Filters and Controls */}
            <FilterBar
          tickers={tickers}
          selectedTicker={selectedTicker}
          onSelectTicker={(sym) => {
            setSelectedTicker(sym);
            setCurrentPage(1);
          }}
          selectedPreset={selectedPreset}
          onSelectPreset={(preset) => {
            setSelectedPreset(preset);
            setCurrentPage(1);
          }}
          customStartDate={customStartDate}
          onCustomStartDateChange={setCustomStartDate}
          customEndDate={customEndDate}
          onCustomEndDateChange={setCustomEndDate}
          publishers={publishers}
          selectedPublisher={selectedPublisher}
          onSelectPublisher={(pub) => {
            setSelectedPublisher(pub);
            setCurrentPage(1);
          }}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            setCurrentPage(1);
          }}
          sortOrder={sortOrder}
          onSelectSort={(sort) => {
            setSortOrder(sort);
            setCurrentPage(1);
          }}
          importanceFilter={importanceFilter}
          onSelectImportance={(imp) => {
            setImportanceFilter(imp);
            setCurrentPage(1);
          }}
          sentimentFilter={sentimentFilter}
          onSelectSentiment={(st) => {
            setSentimentFilter(st);
            setCurrentPage(1);
          }}
          eventTypeFilter={eventTypeFilter}
          onSelectEventType={(evt) => {
            setEventTypeFilter(evt);
            setCurrentPage(1);
          }}
          onReclassify={handleReclassify}
          isReclassifying={isReclassifying}
          viewMode={viewMode}
          onToggleViewMode={setViewMode}
          totalArticles={stats?.totalArticles || 0}
        />

        {/* Results Header Info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900">
              {selectedTicker !== 'ALL' ? (
                <span>
                  Showing News for <strong className="text-emerald-700 font-mono">${selectedTicker}</strong>
                </span>
              ) : (
                <span>All Aggregated Stock News</span>
              )}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200/80 text-slate-700">
              {totalArticles} articles
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Show per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Loading Spinner */}
        {loadingNews && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-2 text-slate-500 text-xs font-medium">
              <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin" />
              <span>Querying SQLite database...</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loadingNews && news.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs my-8 space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Inbox className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">No News Found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || selectedPublisher !== 'ALL' || selectedPreset !== 'all'
                  ? 'No articles match your active filter criteria. Try clearing search keywords or date bounds.'
                  : 'Your SQLite database does not have stored news for the selected ticker yet.'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setSelectedTicker('ALL');
                  setSelectedPreset('all');
                  setSelectedPublisher('ALL');
                  setSearchQuery('');
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Reset Filters
              </button>

              <button
                onClick={() => setIsFetchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Fetch Latest News</span>
              </button>
            </div>
          </div>
        )}

        {/* News Content Display */}
        {!loadingNews && news.length > 0 && (
          <div>
            {viewMode === 'cards' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {news.map((article) => (
                  <NewsCard
                    key={article.id}
                    article={article}
                    onSelectTicker={(sym) => {
                      setSelectedTicker(sym);
                      setCurrentPage(1);
                    }}
                    onOpenPreview={(art) => setPreviewArticle(art)}
                  />
                ))}
              </div>
            ) : (
              <NewsTable
                articles={news}
                onSelectTicker={(sym) => {
                  setSelectedTicker(sym);
                  setCurrentPage(1);
                }}
                onOpenPreview={(art) => setPreviewArticle(art)}
              />
            )}

            {/* Pagination Bar */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
                <div className="text-xs text-slate-500">
                  Page <strong className="text-slate-800">{currentPage}</strong> of{' '}
                  <strong className="text-slate-800">{totalPages}</strong> ({totalArticles} total articles)
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = i + 1;
                    if (totalPages > 5 && currentPage > 3) {
                      pageNum = Math.min(totalPages - 4 + i, currentPage - 2 + i);
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                          currentPage === pageNum
                            ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>Stock News Aggregator — Yahoo Finance Integration & SQLite Storage</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsTestsModalOpen(true)}
              className="text-emerald-700 hover:underline flex items-center gap-1"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Run Automated Tests</span>
            </button>
            <span>•</span>
            <button
              onClick={() => setIsHistoryModalOpen(true)}
              className="hover:text-slate-800"
            >
              Import Logs
            </button>
          </div>
        </div>
      </footer>

      {/* Modals & Dialogs */}
      <ArticleDetailModal
        article={previewArticle}
        onClose={() => setPreviewArticle(null)}
        onSelectTicker={(sym) => {
          setSelectedTicker(sym);
          setCurrentPage(1);
        }}
        onRefreshArticle={(updatedArticle) => {
          setPreviewArticle(updatedArticle);
          setNews((prev) =>
            prev.map((a) => (a.id === updatedArticle.id ? updatedArticle : a))
          );
        }}
      />

      <AIAnalysisModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onRefreshFeed={handleFullRefresh}
        onSelectArticle={(art) => {
          setIsAIModalOpen(false);
          setPreviewArticle(art);
        }}
      />

      <TickerManagerModal
        isOpen={isTickersModalOpen}
        onClose={() => setIsTickersModalOpen(false)}
        tickers={tickers}
        onAddTicker={handleAddTicker}
        onUpdateTicker={handleUpdateTicker}
        onDeleteTicker={handleDeleteTicker}
        onToggleAll={handleToggleAll}
        onBulkToggle={handleBulkToggle}
        onBulkImport={handleBulkImport}
        onRefresh={handleFullRefresh}
      />

      <FetchNewsModal
        isOpen={isFetchModalOpen}
        onClose={() => setIsFetchModalOpen(false)}
        tickers={tickers}
        config={config}
        onRunImport={handleRunNewsImport}
        onRefreshFeed={handleFullRefresh}
      />

      <TestRunnerModal
        isOpen={isTestsModalOpen}
        onClose={() => setIsTestsModalOpen(false)}
      />

      <CalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        onRefreshGlobal={handleFullRefresh}
      />

      <ImportHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
      />

      <LogsModal
        isOpen={isLogsModalOpen}
        onClose={() => setIsLogsModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        config={config}
        onConfigUpdated={handleFullRefresh}
        onRefreshFeed={handleFullRefresh}
      />
    </div>
  );
}
