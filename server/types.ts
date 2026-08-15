export interface Ticker {
  id: number;
  symbol: string;
  company_name: string;
  exchange: string;
  enabled: boolean;
  last_successful_fetch_at?: string | null;
  created_at: string;
  updated_at: string;
  article_count?: number;
}

export interface ScoreSignalBreakdown {
  signal: string;
  points: number;
}

export interface ScoreExplanation {
  importance: {
    total: number;
    base: number;
    breakdown: ScoreSignalBreakdown[];
  };
  relevance: {
    total: number;
    breakdown: ScoreSignalBreakdown[];
  };
  sentiment?: {
    total: number;
    base?: number;
    breakdown: ScoreSignalBreakdown[];
  };
  eventType: string;
  sourceTier: number;
  signalsMatched: string[];
}

export interface NewsArticle {
  id: number;
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  summary: string;
  article_hash: string;
  retrieved_at: string;
  created_at: string;
  tickers?: string[]; // Associated ticker symbols
  importance_score?: number;
  relevance_score?: number;
  sentiment_score?: number;
  event_type?: string;
  source_tier?: number;
  duplicate_group_id?: string;
  duplicate_count?: number;
  explanation?: ScoreExplanation;
  classification_version?: string;
  classified_at?: string;
  ai_eligible?: boolean;
  ai_eligibility_reason?: string[];
  ai_analysis?: NewsAIAnalysis;
  ai_status?: AIAnalysisStatus;
}

export interface NewsAnalysis {
  news_id: number;
  importance_score: number;
  relevance_score: number;
  sentiment_score: number;
  event_type: string;
  source_tier: number;
  duplicate_group_id: string;
  duplicate_count?: number;
  explanation_json: string;
  explanation?: ScoreExplanation;
  classification_version: string;
  classified_at: string;
}

export interface TickerNewsJoin {
  ticker_id: number;
  news_id: number;
}

export interface ImportJobSummary {
  id: number;
  provider: 'yahoo' | 'mock';
  status: 'running' | 'completed' | 'failed';
  tickers_count: number;
  articles_retrieved: number;
  new_articles: number;
  duplicates_skipped: number;
  errors_count: number;
  date_from?: string;
  date_to?: string;
  details: {
    fetchMode?: 'initial' | 'incremental' | 'mixed';
    tickerResults?: Array<{
      ticker?: string;
      symbol: string;
      status: 'ok' | 'success' | 'error' | 'empty';
      fetchMode?: 'initial' | 'incremental';
      retrieved?: number;
      articlesRetrieved?: number;
      newInserted?: number;
      newArticles?: number;
      duplicates: number;
      previousLastFetchAt?: string | null;
      newLastFetchAt?: string | null;
      error?: string;
    }>;
    errors?: Array<{ symbol: string; error: string }>;
  };
  started_at: string;
  completed_at?: string;
}

export interface FetchNewsOptions {
  symbols?: string[]; // If undefined, fetch for all enabled tickers
  startDate?: string; // ISO date or YYYY-MM-DD
  endDate?: string;   // ISO date or YYYY-MM-DD
  provider?: 'yahoo' | 'mock';
}

export interface RawArticle {
  title: string;
  publisher: string;
  url: string;
  published_at: string;
  summary: string;
  symbol: string;
  relatedSymbols?: string[];
}

export interface INewsProvider {
  name: 'yahoo' | 'mock';
  fetchNewsForTicker(symbol: string, options: { startDate?: string; endDate?: string }): Promise<RawArticle[]>;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: any;
}

export type ReviewJudgement = 'correct' | 'incorrect' | 'unsure';
export type HumanImportance = 'critical' | 'high' | 'medium' | 'low';
export type HumanRelevance = 'company_specific' | 'broad_macro' | 'irrelevant';

export interface CalibrationReview {
  id?: number;
  news_id: number;
  event_type_correct: ReviewJudgement;
  importance_correct: ReviewJudgement;
  relevance_correct: ReviewJudgement;
  human_importance: HumanImportance;
  human_event_type: string;
  human_relevance: HumanRelevance;
  notes?: string;
  reviewed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CalibrationArticleItem extends NewsArticle {
  human_review?: CalibrationReview;
}

export interface TopNewsComparisonItem {
  rank: number;
  news_id: number;
  ticker: string;
  headline: string;
  publisher: string;
  published_at: string;
  automated_score: number;
  human_rating: HumanImportance;
  is_correct: boolean;
  is_useful: boolean;
  event_type: string;
  source_tier: number;
}

export interface CalibrationStatsReport {
  version: string;
  articlesReviewedCount: number;
  totalSampledCount: number;
  
  // Top News Quality
  top10Precision: number; // % of top 10 articles deemed genuinely useful/important
  top20Precision: number; // % of top 20 articles deemed genuinely useful/important
  top20ByImportanceUsefulCount: number;
  top20ByNewestUsefulCount: number;
  top20ImportanceArticles: TopNewsComparisonItem[];
  top20NewestArticles: TopNewsComparisonItem[];

  // Event Classification Accuracy
  eventClassificationAccuracy: number; // %
  eventClassificationTotal: number;
  eventClassificationCorrect: number;
  commonMisclassifications: Array<{
    automated: string;
    human: string;
    count: number;
    examples: string[];
  }>;

  // Relevance Accuracy
  relevanceAccuracy: number; // %
  companySpecificCount: number;
  macroCommentaryCount: number;
  relevanceErrorsCount: number;
  relevanceAccuracyQualitative: string;

  // Syndication Clusters
  clustersExamined: number;
  clustersCorrect: number;
  clustersIncorrect: number;
  syndicationAccuracy: number;

  // Score Distribution
  scoreDistribution: {
    critical: number; // 90-100
    high: number;     // 75-89
    medium: number;   // 50-74
    low: number;      // 0-49
    total: number;
    average: number;
    median: number;
    minimum: number;
    maximum: number;
  };

  // Event Type Distribution
  eventTypeDistribution: Record<string, number>;

  // Concrete Error Examples
  falsePositives: Array<{ id: number; ticker: string; headline: string; automated_score: number; human_rating: string; reason: string }>;
  falseNegatives: Array<{ id: number; ticker: string; headline: string; automated_score: number; human_rating: string; reason: string }>;
  classificationErrors: Array<{ id: number; ticker: string; headline: string; automated_type: string; human_type: string; reason: string }>;
  relevanceErrors: Array<{ id: number; ticker: string; headline: string; automated_relevance: number; human_relevance: string; reason: string }>;
  syndicationErrors: Array<{ clusterId: string; headlines: string[]; reason: string }>;

  // Rule Changes & Comparison
  ruleChanges: string[];
  v1VsV2Comparison?: {
    v1: {
      version: string;
      top20Precision: number;
      eventAccuracy: number;
      syndicationAccuracy: number;
    };
    v2: {
      version: string;
      top20Precision: number;
      eventAccuracy: number;
      syndicationAccuracy: number;
    };
  };

  recommendation: 'READY FOR AI LAYER' | 'NEEDS MORE CALIBRATION';
}

// -------------------------------------------------------------
// Phase 5: AI News Analysis Types
// -------------------------------------------------------------

export type AIMarketImpact = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'unclear';
export type AITimeHorizon = 'intraday' | 'short_term' | 'medium_term' | 'long_term' | 'unclear';
export type AIAnalysisStatus = 'not_eligible' | 'pending' | 'processing' | 'completed' | 'failed';

export interface AIEligibilityResult {
  eligible: boolean;
  reason: string[];
}

export interface AIAnalysisOutput {
  summary: string;
  why_it_matters: string;
  market_impact: AIMarketImpact;
  impact_confidence: number; // 0 - 100
  time_horizon: AITimeHorizon;
  catalysts: string[];
  risks: string[];
  key_facts: string[];
  mentioned_companies: string[];
  analysis_confidence: number; // 0 - 100
}

export interface NewsAIAnalysis extends AIAnalysisOutput {
  id?: number;
  news_id: number;
  provider: string;
  model: string;
  analysis_version: string;
  prompt_version: string;
  raw_response_json?: string;
  created_at: string;
  updated_at: string;
}

export interface AIAnalysisInput {
  ticker: string;
  title: string;
  publisher: string;
  published_at: string;
  summary: string;
  event_type: string;
  importance_score: number;
  relevance_score: number;
  allArticleTickers?: string[];
}

export interface AIProviderResponse {
  output: AIAnalysisOutput;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  model: string;
  provider: string;
  promptVersion: string;
  analysisVersion: string;
  rawResponse?: any;
}

export interface IAIProvider {
  name: string;
  analyzeArticle(input: AIAnalysisInput): Promise<AIProviderResponse>;
}

export interface AIUsageLog {
  id?: number;
  provider: string;
  model: string;
  news_id?: number;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  status: 'completed' | 'failed';
  error_message?: string;
  created_at: string;
}

export interface AIUsageSummary {
  articlesAnalyzed: number;
  requestsToday: number;
  estimatedTokens: number;
  estimatedCost: number;
  failedRequests: number;
  provider: string;
  model: string;
  pricingConfig: {
    inputCostPerMillion: number;
    outputCostPerMillion: number;
  };
}

export interface BatchAIStats {
  eligible: number;
  alreadyAnalyzed: number;
  pending: number;
  estimatedRequests: number;
}
