import React, { useState } from 'react';
import {
  Search,
  Calendar,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  List,
  X,
  ChevronDown,
  Building2,
  Sparkles,
  Zap,
  Tag,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Ticker, ImportanceFilter, EventType } from '../types.js';

export type DatePreset = 'all' | 'today' | '24h' | '7d' | '30d' | 'custom';
export type SortOption = 'newest' | 'oldest' | 'importance' | 'relevance' | 'sentiment_high' | 'sentiment_low';
export type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral';

interface FilterBarProps {
  tickers: Ticker[];
  selectedTicker: string;
  onSelectTicker: (symbol: string) => void;
  selectedPreset: DatePreset;
  onSelectPreset: (preset: DatePreset) => void;
  customStartDate: string;
  onCustomStartDateChange: (val: string) => void;
  customEndDate: string;
  onCustomEndDateChange: (val: string) => void;
  publishers: string[];
  selectedPublisher: string;
  onSelectPublisher: (pub: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortOrder: SortOption;
  onSelectSort: (sort: SortOption) => void;
  importanceFilter: ImportanceFilter;
  onSelectImportance: (imp: ImportanceFilter) => void;
  sentimentFilter: SentimentFilter;
  onSelectSentiment: (sentiment: SentimentFilter) => void;
  eventTypeFilter: string;
  onSelectEventType: (evt: string) => void;
  viewMode: 'cards' | 'table';
  onToggleViewMode: (mode: 'cards' | 'table') => void;
  totalArticles: number;
  onReclassify?: () => Promise<void>;
  isReclassifying?: boolean;
}

const EVENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'ALL', label: 'All Event Types' },
  { value: 'earnings', label: 'Earnings & Financials' },
  { value: 'acquisition', label: 'M&A & Acquisitions' },
  { value: 'fda_clinical', label: 'FDA & Clinical Trials' },
  { value: 'guidance', label: 'Guidance & Forecasts' },
  { value: 'dividend', label: 'Dividends & Buybacks' },
  { value: 'legal', label: 'Legal & Regulatory' },
  { value: 'executive_change', label: 'Executive Changes' },
  { value: 'partnership', label: 'Partnerships & Deals' },
  { value: 'product_launch', label: 'Product Launches' },
  { value: 'analyst_rating', label: 'Analyst Ratings' },
  { value: 'market_movement', label: 'Market Movement' },
  { value: 'general', label: 'General News' },
];

export const FilterBar: React.FC<FilterBarProps> = ({
  tickers,
  selectedTicker,
  onSelectTicker,
  selectedPreset,
  onSelectPreset,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  publishers,
  selectedPublisher,
  onSelectPublisher,
  searchQuery,
  onSearchChange,
  sortOrder,
  onSelectSort,
  importanceFilter,
  onSelectImportance,
  sentimentFilter,
  onSelectSentiment,
  eventTypeFilter,
  onSelectEventType,
  viewMode,
  onToggleViewMode,
  totalArticles,
  onReclassify,
  isReclassifying = false,
}) => {
  const [showCustomDate, setShowCustomDate] = useState(selectedPreset === 'custom');

  const handlePresetClick = (preset: DatePreset) => {
    onSelectPreset(preset);
    if (preset === 'custom') {
      setShowCustomDate(true);
    } else {
      setShowCustomDate(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5 mb-6">
      
      {/* Row 1: Tickers Scrollable Filter Pills */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Filter by Ticker</span>
          </label>
          <span className="text-xs text-slate-600">
            {tickers.length} tickers available
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-200">
          <button
            onClick={() => onSelectTicker('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border ${
              selectedTicker === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>All Tickers</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                selectedTicker === 'ALL' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {totalArticles}
            </span>
          </button>

          {tickers.map((t) => {
            const isSelected = selectedTicker === t.symbol;
            return (
              <button
                key={t.id}
                onClick={() => onSelectTicker(t.symbol)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : t.enabled
                    ? 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    : 'bg-slate-100 text-slate-400 border-slate-200 opacity-60'
                }`}
              >
                <span>{t.symbol}</span>
                {t.article_count !== undefined && t.article_count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                      isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.article_count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Row 2: Intelligence & Scoring Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
        
        {/* Importance Score Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mr-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Importance:</span>
          </span>

          {(
            [
              { key: 'all', label: 'All', badge: '' },
              { key: 'critical', label: 'Critical', badge: '90-100', color: 'text-rose-700 bg-rose-50 border-rose-200' },
              { key: 'high', label: 'High', badge: '75-89', color: 'text-amber-700 bg-amber-50 border-amber-200' },
              { key: 'medium', label: 'Medium', badge: '50-74', color: 'text-sky-700 bg-sky-50 border-sky-200' },
              { key: 'low', label: 'Low', badge: '<50', color: 'text-slate-600 bg-slate-100 border-slate-200' },
            ] as Array<{ key: ImportanceFilter; label: string; badge?: string; color?: string }>
          ).map((item) => {
            const isSelected = importanceFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelectImportance(item.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer flex items-center gap-1 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                      isSelected ? 'bg-slate-700 text-white' : item.color || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sentiment Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 mr-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span>Sentiment:</span>
          </span>

          {(
            [
              { key: 'all', label: 'All', badge: '' },
              { key: 'bullish', label: 'Bullish', badge: '≥51', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
              { key: 'bearish', label: 'Bearish', badge: '≤49', color: 'text-rose-700 bg-rose-50 border-rose-200' },
              { key: 'neutral', label: 'Neutral', badge: '50', color: 'text-amber-700 bg-amber-50 border-amber-200' },
            ] as Array<{ key: SentimentFilter; label: string; badge?: string; color?: string }>
          ).map((item) => {
            const isSelected = sentimentFilter === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onSelectSentiment(item.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer flex items-center gap-1 border ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                      isSelected ? 'bg-slate-700 text-white' : item.color || 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Event Type Filter & Reclassify Button */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={eventTypeFilter}
              onChange={(e) => onSelectEventType(e.target.value)}
              className="appearance-none pl-8 pr-8 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {EVENT_TYPE_OPTIONS.map((evt) => (
                <option key={evt.value} value={evt.value}>
                  {evt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {onReclassify && (
            <button
              onClick={onReclassify}
              disabled={isReclassifying}
              title="Re-run deterministic classification engine across all articles"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 text-emerald-600 ${isReclassifying ? 'animate-spin' : ''}`} />
              <span>{isReclassifying ? 'Scoring...' : 'Reclassify'}</span>
            </button>
          )}
        </div>

      </div>

      {/* Row 3: Search, Date Range Presets, Source Filter, Sort, View Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        
        {/* Left: Search input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search news titles, summaries, publishers..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Middle: Date Range Presets */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {(
            [
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: '24h', label: '24h' },
              { key: '7d', label: '7 Days' },
              { key: '30d', label: '30 Days' },
              { key: 'custom', label: 'Custom' },
            ] as Array<{ key: DatePreset; label: string }>
          ).map((p) => {
            const isSel = selectedPreset === p.key;
            return (
              <button
                key={p.key}
                onClick={() => handlePresetClick(p.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                  isSel ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Right: Publisher filter, Sort order, View Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Publisher dropdown */}
          <div className="relative">
            <select
              value={selectedPublisher}
              onChange={(e) => onSelectPublisher(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Sources ({publishers.length})</option>
              {publishers.map((pub) => (
                <option key={pub} value={pub}>
                  {pub}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Sort Order Dropdown */}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => onSelectSort(e.target.value as SortOption)}
              className="appearance-none pl-3 pr-8 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="importance">Sort: Highest Importance</option>
              <option value="relevance">Sort: Highest Relevance</option>
              <option value="sentiment_high">Sort: Highest Sentiment (Bullish First)</option>
              <option value="sentiment_low">Sort: Lowest Sentiment (Bearish First)</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={() => onToggleViewMode('cards')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === 'cards' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Card View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onToggleViewMode('table')}
              className={`p-1 rounded-md transition cursor-pointer ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

      </div>

      {/* Row 4: Custom Date Range Inputs (when custom preset is selected) */}
      {showCustomDate && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-slate-700">Custom Date Range:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="text-slate-500">From:</span>
              <input
                type="datetime-local"
                value={customStartDate}
                onChange={(e) => onCustomStartDateChange(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-1">
              <span className="text-slate-500">To:</span>
              <input
                type="datetime-local"
                value={customEndDate}
                onChange={(e) => onCustomEndDateChange(e.target.value)}
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                onCustomStartDateChange('');
                onCustomEndDateChange('');
              }}
              className="text-xs text-slate-500 hover:text-slate-800 underline ml-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
