import {
  Ticker,
  TickerPortfolioStats,
  NewsArticle,
  ImportJobSummary,
  GlobalStats,
  AppConfig,
  TestSuiteSummary,
  LogEntry,
  ProviderHealth,
} from '../types.js';

export type { Ticker, NewsArticle, GlobalStats, AppConfig, ProviderHealth };

export async function fetchTickers(options?: { search?: string; enabledOnly?: boolean }): Promise<Ticker[]> {
  const params = new URLSearchParams();
  if (options?.search) params.append('search', options.search);
  if (options?.enabledOnly) params.append('enabledOnly', 'true');
  const res = await fetch(`/api/tickers?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to load tickers: ${res.statusText}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchTickerPortfolioStats(): Promise<TickerPortfolioStats> {
  const res = await fetch('/api/tickers/stats');
  if (!res.ok) throw new Error(`Failed to load ticker portfolio stats: ${res.statusText}`);
  const json = await res.json();
  return json.data || { total: 0, enabled: 0, disabled: 0, neverFetched: 0, fetchedToday: 0, fetchErrors: 0 };
}

export async function createTicker(data: {
  symbol: string;
  company_name?: string;
  exchange?: string;
  enabled?: boolean;
}): Promise<Ticker> {
  const res = await fetch('/api/tickers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create ticker');
  return json.data;
}

export async function updateTicker(
  id: number,
  data: { symbol?: string; company_name?: string; exchange?: string; enabled?: boolean }
): Promise<Ticker> {
  const res = await fetch(`/api/tickers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update ticker');
  return json.data;
}

export async function deleteTicker(id: number): Promise<void> {
  const res = await fetch(`/api/tickers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete ticker');
}

export async function toggleAllTickers(enabled: boolean): Promise<number> {
  const res = await fetch('/api/tickers/toggle-all', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Failed to toggle tickers');
  return json.count;
}

export async function bulkToggleTickers(ids: number[], enabled: boolean): Promise<number> {
  const res = await fetch('/api/tickers/bulk-toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, enabled }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to bulk toggle tickers');
  return json.count;
}

export async function bulkImportTickers(
  tickers: Array<{ symbol: string; company_name?: string; exchange?: string; enabled?: boolean }>,
  options?: { updateExisting?: boolean; defaultEnabled?: boolean }
): Promise<{ added: number; updated: number; existingSkipped: number; errors: Array<{ symbol: string; error: string }> }> {
  const res = await fetch('/api/tickers/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tickers, options }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to bulk import tickers');
  return json;
}

export async function fetchNews(options?: {
  ticker?: string;
  tickers?: string[];
  startDate?: string;
  endDate?: string;
  source?: string;
  search?: string;
  sort?: 'newest' | 'oldest' | 'importance' | 'relevance' | 'sentiment_high' | 'sentiment_low';
  importance?: 'all' | 'critical' | 'high' | 'medium' | 'low';
  sentiment?: 'all' | 'bullish' | 'bearish' | 'neutral';
  eventType?: string;
  page?: number;
  limit?: number;
}): Promise<{
  articles: NewsArticle[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();
  if (options?.ticker && options.ticker !== 'ALL') params.append('ticker', options.ticker);
  if (options?.tickers && options.tickers.length > 0) params.append('tickers', options.tickers.join(','));
  if (options?.startDate) params.append('startDate', options.startDate);
  if (options?.endDate) params.append('endDate', options.endDate);
  if (options?.source && options.source !== 'ALL') params.append('source', options.source);
  if (options?.search) params.append('search', options.search);
  if (options?.sort) params.append('sort', options.sort);
  if (options?.importance && options.importance !== 'all') params.append('importance', options.importance);
  if (options?.sentiment && options.sentiment !== 'all') params.append('sentiment', options.sentiment);
  if (options?.eventType && options.eventType !== 'ALL') params.append('eventType', options.eventType);
  if (options?.page) params.append('page', String(options.page));
  if (options?.limit) params.append('limit', String(options.limit));

  const res = await fetch(`/api/news?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch news articles');
  return await res.json();
}

export async function fetchTopNews(limit = 6): Promise<NewsArticle[]> {
  const res = await fetch(`/api/news/top?limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.articles || [];
}

export async function reclassifyNews(): Promise<{
  success: boolean;
  processed: number;
  durationMs: number;
  version: string;
}> {
  const res = await fetch('/api/news/reclassify', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to reclassify news');
  return json;
}

export async function fetchPublishers(): Promise<string[]> {
  const res = await fetch('/api/news/publishers');
  if (!res.ok) return [];
  const json = await res.json();
  return json.publishers || [];
}

export async function fetchNewsById(id: number): Promise<NewsArticle> {
  const res = await fetch(`/api/news/${id}`);
  if (!res.ok) throw new Error('Failed to load news article');
  const json = await res.json();
  return json.data;
}

export async function triggerNewsImport(options: {
  symbols?: string[];
  startDate?: string;
  endDate?: string;
  provider?: 'yahoo' | 'mock';
}): Promise<ImportJobSummary> {
  const res = await fetch('/api/news/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'News import failed');
  return json;
}

export async function fetchImportHistory(): Promise<ImportJobSummary[]> {
  const res = await fetch('/api/imports?limit=25');
  if (!res.ok) return [];
  const json = await res.json();
  return json.data || [];
}

export async function fetchStats(): Promise<GlobalStats> {
  const res = await fetch('/api/stats');
  if (!res.ok) throw new Error('Failed to load statistics');
  return await res.json();
}

export async function fetchConfig(): Promise<AppConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load configuration');
  return await res.json();
}

export async function updateConfig(data: { provider: 'yahoo' | 'mock' }): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update configuration');
}

export async function fetchProviderHealth(probe = false): Promise<ProviderHealth> {
  const res = await fetch(`/api/provider/health?probe=${probe}`);
  if (!res.ok) throw new Error('Failed to fetch provider health');
  return await res.json();
}

export async function fetchLogs(limit = 100): Promise<LogEntry[]> {
  const res = await fetch(`/api/logs?limit=${limit}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.logs || [];
}

export async function runTestSuite(): Promise<TestSuiteSummary> {
  const res = await fetch('/api/test/run', { method: 'POST' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to execute test suite');
  return json;
}

export async function resetDatabase(): Promise<void> {
  const res = await fetch('/api/database/reset', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to reset database');
}

export interface TickerSummaryItem {
  tickerId: number;
  symbol: string;
  companyName: string;
  exchange: string;
  newsCount: number;
  overallScore: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  directionLabel: string;
  topHeadlines: Array<{
    id: number;
    title: string;
    publishedAt: string;
    publisher: string;
    importanceScore: number;
    sentimentScore: number;
    eventType: string;
  }>;
  deterministicSignals: {
    bullishPoints: string[];
    bearishPoints: string[];
  };
  aiSummary?: {
    overallSummary: string;
    keyBullish: string[];
    keyBearish: string[];
    mainCatalyst?: string;
    mainRisk?: string;
    insufficientEvidence: boolean;
    cachedAt: string;
  };
  newsHashSig: string;
  hasCachedAI: boolean;
}

export interface AIEstimate {
  period: string;
  tickersNeedingAI: number;
  estimatedRequests: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  cachedTickersCount: number;
  totalApplicableTickers: number;
}

export async function fetchTickerSummaries(options: {
  period?: string;
  startDate?: string;
  endDate?: string;
  symbol?: string;
  sort?: string;
}): Promise<{ summaries: TickerSummaryItem[]; count: number }> {
  const params = new URLSearchParams();
  if (options.period) params.append('period', options.period);
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);
  if (options.symbol && options.symbol !== 'ALL') params.append('symbol', options.symbol);
  if (options.sort) params.append('sort', options.sort);

  const res = await fetch(`/api/ticker-summary?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch ticker summaries');
  return await res.json();
}

export async function estimateTickerAISummaries(options: {
  period?: string;
  startDate?: string;
  endDate?: string;
  symbol?: string;
}): Promise<AIEstimate> {
  const params = new URLSearchParams();
  if (options.period) params.append('period', options.period);
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);
  if (options.symbol && options.symbol !== 'ALL') params.append('symbol', options.symbol);

  const res = await fetch(`/api/ticker-summary/estimate-ai?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch AI estimate');
  return await res.json();
}

export async function generateTickerAISummaries(options: {
  period?: string;
  startDate?: string;
  endDate?: string;
  symbols?: string[];
}): Promise<{ generatedCount: number; cachedCount: number; results: TickerSummaryItem[] }> {
  const res = await fetch('/api/ticker-summary/generate-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to generate AI summaries');
  return json;
}
