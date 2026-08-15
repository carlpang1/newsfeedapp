import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  BarChart3,
  Sliders,
  Award,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Layers,
  Copy,
  Check,
  RotateCw,
  Clock,
  TrendingUp,
  FileText,
  AlertCircle,
  Filter,
} from 'lucide-react';
import {
  CalibrationArticleItem,
  CalibrationReview,
  CalibrationStatsReport,
  HumanImportance,
  HumanRelevance,
  ReviewJudgement,
  EventType,
} from '../types.js';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshGlobal?: () => void;
}

const EVENT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'earnings', label: 'Earnings' },
  { value: 'guidance', label: 'Guidance' },
  { value: 'acquisition', label: 'Acquisition / M&A' },
  { value: 'merger', label: 'Merger' },
  { value: 'regulatory', label: 'Regulatory / FDA / SEC' },
  { value: 'legal', label: 'Legal / Lawsuit' },
  { value: 'product', label: 'Product / Tech Release' },
  { value: 'management', label: 'Management / C-Suite' },
  { value: 'analyst_rating', label: 'Analyst Rating' },
  { value: 'analyst_target', label: 'Analyst Price Target' },
  { value: 'partnership', label: 'Strategic Partnership' },
  { value: 'contract', label: 'Major Contract' },
  { value: 'layoffs', label: 'Layoffs' },
  { value: 'restructuring', label: 'Restructuring' },
  { value: 'financing', label: 'Financing / Buyback' },
  { value: 'market', label: 'Broad Market Commentary' },
  { value: 'industry', label: 'Industry Trends' },
  { value: 'other', label: 'Other / General' },
];

export const CalibrationModal: React.FC<CalibrationModalProps> = ({ isOpen, onClose, onRefreshGlobal }) => {
  const [activeTab, setActiveTab] = useState<'review' | 'top_news' | 'analytics' | 'report'>('review');
  const [tickerFilter, setTickerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'reviewed' | 'unreviewed'>('all');

  const [articles, setArticles] = useState<CalibrationArticleItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [reviewedCount, setReviewedCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [stats, setStats] = useState<CalibrationStatsReport | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [selectedVersion, setSelectedVersion] = useState<'v2.0-rules' | 'v1.0-rules'>('v2.0-rules');

  // Form state for currently viewed article
  const [currentReview, setCurrentReview] = useState<{
    event_type_correct: ReviewJudgement;
    importance_correct: ReviewJudgement;
    relevance_correct: ReviewJudgement;
    human_importance: HumanImportance;
    human_event_type: string;
    human_relevance: HumanRelevance;
    notes: string;
  }>({
    event_type_correct: 'correct',
    importance_correct: 'correct',
    relevance_correct: 'correct',
    human_importance: 'high',
    human_event_type: 'earnings',
    human_relevance: 'company_specific',
    notes: '',
  });

  const loadDataset = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/calibration/articles?ticker=${tickerFilter}&status=${statusFilter}&limit=200`);
      const data = await res.json();
      setArticles(data.items || []);
      setTotalCount(data.total || 0);
      setReviewedCount(data.reviewedCount || 0);
      if (data.items && data.items.length > 0) {
        if (currentIndex >= data.items.length) {
          setCurrentIndex(0);
        }
      }
    } catch (err) {
      console.error('Failed to load calibration dataset:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/calibration/stats?version=${selectedVersion}`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to load calibration stats:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDataset();
      loadStats();
    }
  }, [isOpen, tickerFilter, statusFilter, selectedVersion]);

  const currentArticle = articles[currentIndex];

  useEffect(() => {
    if (currentArticle) {
      const existing = currentArticle.human_review;
      if (existing) {
        setCurrentReview({
          event_type_correct: existing.event_type_correct || 'correct',
          importance_correct: existing.importance_correct || 'correct',
          relevance_correct: existing.relevance_correct || 'correct',
          human_importance: existing.human_importance || 'high',
          human_event_type: existing.human_event_type || currentArticle.event_type || 'other',
          human_relevance: existing.human_relevance || 'company_specific',
          notes: existing.notes || '',
        });
      } else {
        const autScore = currentArticle.importance_score || 0;
        const defaultImp: HumanImportance = autScore >= 90 ? 'critical' : autScore >= 75 ? 'high' : autScore >= 50 ? 'medium' : 'low';
        setCurrentReview({
          event_type_correct: 'correct',
          importance_correct: 'correct',
          relevance_correct: 'correct',
          human_importance: defaultImp,
          human_event_type: currentArticle.event_type || 'other',
          human_relevance: 'company_specific',
          notes: '',
        });
      }
    }
  }, [currentArticle]);

  const handleSaveReview = async () => {
    if (!currentArticle) return;
    setIsSaving(true);
    try {
      await fetch('/api/calibration/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          news_id: currentArticle.id,
          ...currentReview,
        }),
      });

      // Update local article state
      setArticles((prev) =>
        prev.map((art, i) =>
          i === currentIndex
            ? {
                ...art,
                human_review: {
                  news_id: art.id,
                  ...currentReview,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              }
            : art
        )
      );

      await loadStats();
      if (currentIndex < articles.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }
    } catch (err) {
      console.error('Failed to save review:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReclassifyAll = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/news/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: selectedVersion }),
      });
      await loadDataset();
      await loadStats();
      if (onRefreshGlobal) onRefreshGlobal();
    } catch (err) {
      console.error('Failed to reclassify news:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const generateReportText = () => {
    if (!stats) return 'Loading stats...';
    return `========================================
NEWS INTELLIGENCE CALIBRATION
========================================

Articles reviewed:
${stats.articlesReviewedCount} / ${stats.totalSampledCount}

TOP NEWS QUALITY

Top 10 precision:
${stats.top10Precision}%

Top 20 precision:
${stats.top20Precision}%

Top 20 by importance:
${stats.top20ByImportanceUsefulCount} useful

Top 20 by newest:
${stats.top20ByNewestUsefulCount} useful

EVENT CLASSIFICATION

Accuracy:
${stats.eventClassificationAccuracy}%

Common misclassifications:
${stats.commonMisclassifications.map((m) => `• ${m.automated} → ${m.human} (${m.count} articles)`).join('\n')}

RELEVANCE

Accuracy / qualitative result:
${stats.relevanceAccuracy}% - ${stats.relevanceAccuracyQualitative}

SYNDICATION

Clusters reviewed:
${stats.clustersExamined}

Correct:
${stats.clustersCorrect}

Incorrect:
${stats.clustersIncorrect}

Accuracy:
${stats.syndicationAccuracy}%

SCORE DISTRIBUTION

Critical (90-100): ${stats.scoreDistribution.critical}
High (75-89):     ${stats.scoreDistribution.high}
Medium (50-74):   ${stats.scoreDistribution.medium}
Low (0-49):       ${stats.scoreDistribution.low}

Average: ${stats.scoreDistribution.average}
Median:  ${stats.scoreDistribution.median}
Minimum: ${stats.scoreDistribution.minimum}
Maximum: ${stats.scoreDistribution.maximum}

FALSE POSITIVES:
${stats.falsePositives.map((fp, i) => `${i + 1}. [${fp.ticker}] "${fp.headline}" (Auto: ${fp.automated_score} vs Human: ${fp.human_rating}) - ${fp.reason}`).join('\n')}

FALSE NEGATIVES:
${stats.falseNegatives.map((fn, i) => `${i + 1}. [${fn.ticker}] "${fn.headline}" (Auto: ${fn.automated_score} vs Human: ${fn.human_rating}) - ${fn.reason}`).join('\n')}

CLASSIFICATION ERRORS:
${stats.classificationErrors.map((ce, i) => `${i + 1}. [${ce.ticker}] "${ce.headline}" (${ce.automated_type} → ${ce.human_type}) - ${ce.reason}`).join('\n')}

RELEVANCE ERRORS:
${stats.relevanceErrors.map((re, i) => `${i + 1}. [${re.ticker}] "${re.headline}" (Auto: ${re.automated_relevance}% vs Human: ${re.human_relevance}) - ${re.reason}`).join('\n')}

RULE CHANGES:
${stats.ruleChanges.map((rc, i) => `${i + 1}. ${rc}`).join('\n')}

VERSION:
${stats.version}

BEFORE / AFTER COMPARISON:
• Top-20 Precision: v1 = ${stats.v1VsV2Comparison?.v1.top20Precision}%  →  v2 = ${stats.v1VsV2Comparison?.v2.top20Precision}%
• Event Accuracy:   v1 = ${stats.v1VsV2Comparison?.v1.eventAccuracy}%  →  v2 = ${stats.v1VsV2Comparison?.v2.eventAccuracy}%
• Syndication:      v1 = ${stats.v1VsV2Comparison?.v1.syndicationAccuracy}%  →  v2 = ${stats.v1VsV2Comparison?.v2.syndicationAccuracy}%

RECOMMENDATION:
${stats.recommendation}
`;
  };

  const copyReport = () => {
    const text = generateReportText();
    navigator.clipboard.writeText(text);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">Phase 4: News Intelligence Calibration</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {selectedVersion}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Deterministic rule evaluation across real Yahoo Finance news (AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Version switcher */}
            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-medium">
              <button
                onClick={() => setSelectedVersion('v2.0-rules')}
                className={`px-2.5 py-1 rounded-md transition ${
                  selectedVersion === 'v2.0-rules' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                v2.0 Rules (Calibrated)
              </button>
              <button
                onClick={() => setSelectedVersion('v1.0-rules')}
                className={`px-2.5 py-1 rounded-md transition ${
                  selectedVersion === 'v1.0-rules' ? 'bg-white text-indigo-700 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                v1.0 Rules (Baseline)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 bg-white">
          <div className="flex space-x-2 py-2.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('review')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'review'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Human Review Screen</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                {reviewedCount}/{totalCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('top_news')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'top_news'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Award className="w-4 h-4 text-amber-500" />
              <span>Top-News Quality Test</span>
              {stats && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {stats.top20Precision}% Precision
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'analytics'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <BarChart3 className="w-4 h-4 text-indigo-600" />
              <span>Analytics & Diagnostics</span>
            </button>

            <button
              onClick={() => setActiveTab('report')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === 'report'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-4 h-4 text-slate-700" />
              <span>Calibration Report (Section 15)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReclassifyAll}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition border border-slate-200"
              title="Re-run deterministic scoring across all articles using currently selected rule version"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Re-run {selectedVersion}</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Human Review Interface */}
        {activeTab === 'review' && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
            
            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Focus Tickers:
                </span>
                {['ALL', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'].map((ticker) => (
                  <button
                    key={ticker}
                    onClick={() => {
                      setTickerFilter(ticker);
                      setCurrentIndex(0);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      tickerFilter === ticker
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {ticker}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setCurrentIndex(0);
                  }}
                  aria-label="Filter articles by review status"
                  className="px-3 py-1 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="all">All Articles ({totalCount})</option>
                  <option value="reviewed">Reviewed ({reviewedCount})</option>
                  <option value="unreviewed">Unreviewed ({totalCount - reviewedCount})</option>
                </select>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                    disabled={currentIndex === 0 || articles.length === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-600 px-2">
                    {articles.length > 0 ? `${currentIndex + 1} of ${articles.length}` : '0 of 0'}
                  </span>
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(articles.length - 1, prev + 1))}
                    disabled={currentIndex >= articles.length - 1 || articles.length === 0}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Current Article Review Box (Exact layout from PDF page 2) */}
            {currentArticle ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                
                {/* Section Header */}
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-900 text-white tracking-wider">
                        {currentArticle.tickers?.[0] || 'TICKER'}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {currentArticle.publisher}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-500">
                        {new Date(currentArticle.published_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                        (currentArticle.importance_score || 0) >= 90
                          ? 'bg-rose-100 text-rose-800'
                          : (currentArticle.importance_score || 0) >= 75
                          ? 'bg-amber-100 text-amber-800'
                          : (currentArticle.importance_score || 0) >= 50
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        Importance: {currentArticle.importance_score || 0}/100
                      </span>

                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
                        Relevance: {currentArticle.relevance_score || 0}/100
                      </span>

                      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 capitalize">
                        Event: {(currentArticle.event_type || 'other').replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 leading-snug flex items-start justify-between gap-3">
                    <span>{currentArticle.title}</span>
                    <a
                      href={currentArticle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-indigo-600 transition shrink-0"
                      title="Open source URL"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </h3>

                  {currentArticle.summary && (
                    <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                      {currentArticle.summary}
                    </p>
                  )}
                </div>

                {/* Human Review Form Controls */}
                <div className="bg-slate-50/80 rounded-xl p-5 border border-slate-200/80 space-y-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      Human Review & Accuracy Verification
                    </h4>
                    <span className="text-[11px] text-slate-500 italic">
                      Automated engine scores remain untouched in separate table
                    </span>
                  </div>

                  {/* 3 Binary/Trinary Judgement Toggles */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    
                    {/* Event Type Judgement */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Event Type Judgement
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(['correct', 'incorrect', 'unsure'] as ReviewJudgement[]).map((val) => (
                          <button
                            key={val}
                            onClick={() => setCurrentReview((prev) => ({ ...prev, event_type_correct: val }))}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md capitalize transition ${
                              currentReview.event_type_correct === val
                                ? val === 'correct'
                                  ? 'bg-emerald-600 text-white'
                                  : val === 'incorrect'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Importance Judgement */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Importance Score Judgement
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(['correct', 'incorrect', 'unsure'] as ReviewJudgement[]).map((val) => (
                          <button
                            key={val}
                            onClick={() => setCurrentReview((prev) => ({ ...prev, importance_correct: val }))}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md capitalize transition ${
                              currentReview.importance_correct === val
                                ? val === 'correct'
                                  ? 'bg-emerald-600 text-white'
                                  : val === 'incorrect'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Relevance Judgement */}
                    <div className="bg-white p-3.5 rounded-lg border border-slate-200">
                      <div className="text-xs font-semibold text-slate-700 mb-2">
                        Relevance Judgement
                      </div>
                      <div className="flex items-center gap-1.5">
                        {(['correct', 'incorrect', 'unsure'] as ReviewJudgement[]).map((val) => (
                          <button
                            key={val}
                            onClick={() => setCurrentReview((prev) => ({ ...prev, relevance_correct: val }))}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md capitalize transition ${
                              currentReview.relevance_correct === val
                                ? val === 'correct'
                                  ? 'bg-emerald-600 text-white'
                                  : val === 'incorrect'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Human Importance Rating (Critical / High / Medium / Low) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Human Importance Rating:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { val: 'critical', label: 'Critical (90-100)', desc: 'Quarterly beat/miss, major M&A, DOJ suit, CEO resigns', color: 'rose' },
                        { val: 'high', label: 'High (75-89)', desc: 'Guidance change, flagship product, FDA action, multi-year deal', color: 'amber' },
                        { val: 'medium', label: 'Medium (50-74)', desc: 'Analyst ratings, target revisions, minor contracts', color: 'blue' },
                        { val: 'low', label: 'Low (0-49)', desc: 'Generic listicle, market commentary, promotional blog', color: 'slate' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => setCurrentReview((prev) => ({ ...prev, human_importance: item.val as HumanImportance }))}
                          className={`p-3 rounded-xl border text-left transition ${
                            currentReview.human_importance === item.val
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className={`text-[10px] mt-0.5 line-clamp-1 ${currentReview.human_importance === item.val ? 'text-indigo-100' : 'text-slate-500'}`}>
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Human Event Type Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Human Ground-Truth Event Type:
                    </label>
                    <select
                      value={currentReview.human_event_type}
                      onChange={(e) => setCurrentReview((prev) => ({ ...prev, human_event_type: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-800"
                    >
                      {EVENT_TYPES.map((ev) => (
                        <option key={ev.value} value={ev.value}>
                          {ev.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Human Relevance Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Human Relevance Categorization:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {[
                        { val: 'company_specific', label: 'Highly Company-Specific', desc: 'Article specifically covers this company as primary subject' },
                        { val: 'broad_macro', label: 'Broad / Macro Commentary', desc: 'Industry or index wrap with multiple passing ticker mentions' },
                        { val: 'irrelevant', label: 'Irrelevant / Promotional', desc: 'Listicle or clickbait where ticker is only mentioned as a comparison' },
                      ].map((item) => (
                        <button
                          key={item.val}
                          onClick={() => setCurrentReview((prev) => ({ ...prev, human_relevance: item.val as HumanRelevance }))}
                          className={`p-2.5 rounded-lg border text-left transition ${
                            currentReview.human_relevance === item.val
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className={`text-[10px] ${currentReview.human_relevance === item.val ? 'text-indigo-100' : 'text-slate-500'}`}>
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Review Notes */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Reviewer Notes / Calibration Feedback:
                    </label>
                    <textarea
                      value={currentReview.notes}
                      onChange={(e) => setCurrentReview((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="e.g. Forward guidance change incorrectly marked as earnings in v1; listicle dampener correctly suppressed score in v2."
                      rows={2}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500">
                      {currentArticle.human_review ? 'Reviewed on ' + new Date(currentArticle.human_review.updated_at).toLocaleDateString() : 'Pending review'}
                    </span>

                    <button
                      onClick={handleSaveReview}
                      disabled={isSaving}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition flex items-center gap-2 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSaving ? 'Saving...' : 'Save Review & Next'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
                <p className="text-sm text-slate-500">No articles found matching the current filters.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Top-News Quality Test */}
        {activeTab === 'top_news' && stats && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
            
            {/* Precision KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-semibold text-slate-500">Top 10 Precision</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{stats.top10Precision}%</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Human rated Critical or High</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-semibold text-slate-500">Top 20 Precision</div>
                <div className="text-2xl font-black text-emerald-600 mt-1">{stats.top20Precision}%</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Top-20 importance ranking quality</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-semibold text-slate-500">Top 20 by Importance</div>
                <div className="text-2xl font-black text-indigo-600 mt-1">{stats.top20ByImportanceUsefulCount} / 20</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Genuinely useful stock articles</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs font-semibold text-slate-500">Top 20 by Newest (Chrono)</div>
                <div className="text-2xl font-black text-amber-600 mt-1">{stats.top20ByNewestUsefulCount} / 20</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Useful articles without scoring</div>
              </div>
            </div>

            {/* Side-by-Side: Top 20 by Importance vs Top 20 by Publication Time */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Top 20 by Importance */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-indigo-50/70 border-b border-indigo-100 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
                      Top 20 Ranked by Importance Score (DESC)
                    </h4>
                    <p className="text-[11px] text-indigo-700">Ranked by rule-based engine intelligence</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-200 text-indigo-900">
                    {stats.top20ByImportanceUsefulCount}/20 Useful ({stats.top20Precision}%)
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {stats.top20ImportanceArticles.map((item) => (
                    <div key={item.news_id} className="p-3 hover:bg-slate-50 transition text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-[10px]">
                            {item.rank}
                          </span>
                          <span className="font-bold text-slate-900 px-1.5 py-0.2 bg-slate-100 rounded">
                            {item.ticker}
                          </span>
                          <span className="text-slate-500">{item.publisher}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800">
                            {item.automated_score} pts
                          </span>
                          <span className={`px-2 py-0.5 rounded font-semibold capitalize ${
                            item.human_rating === 'critical'
                              ? 'bg-rose-100 text-rose-800'
                              : item.human_rating === 'high'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            Human: {item.human_rating}
                          </span>
                        </div>
                      </div>
                      <p className="font-medium text-slate-800 line-clamp-1">{item.headline}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top 20 by Newest */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Newest 20 by Publication Order (published_at DESC)
                    </h4>
                    <p className="text-[11px] text-slate-500">Unfiltered chronological stream</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-200 text-slate-800">
                    {stats.top20ByNewestUsefulCount}/20 Useful ({Math.round((stats.top20ByNewestUsefulCount / 20) * 100)}%)
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto">
                  {stats.top20NewestArticles.map((item) => (
                    <div key={item.news_id} className="p-3 hover:bg-slate-50 transition text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                            {item.rank}
                          </span>
                          <span className="font-bold text-slate-900 px-1.5 py-0.2 bg-slate-100 rounded">
                            {item.ticker}
                          </span>
                          <span className="text-slate-500">{item.publisher}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500">
                            {new Date(item.published_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-semibold capitalize ${
                            item.is_useful ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.is_useful ? 'Useful' : 'Routine / Noise'}
                          </span>
                        </div>
                      </div>
                      <p className="font-medium text-slate-800 line-clamp-1">{item.headline}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab 3: Analytics & Error Diagnostics */}
        {activeTab === 'analytics' && stats && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
            
            {/* Accuracy & Distribution Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Event Accuracy */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event Classification</span>
                  <span className="text-xl font-black text-indigo-600">{stats.eventClassificationAccuracy}%</span>
                </div>
                <div className="text-xs text-slate-600">
                  {stats.eventClassificationCorrect} of {stats.eventClassificationTotal} correctly classified
                </div>
                
                <div className="pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">Common Misclassifications:</div>
                  <div className="space-y-1">
                    {stats.commonMisclassifications.slice(0, 3).map((m, idx) => (
                      <div key={idx} className="text-xs flex items-center justify-between bg-slate-50 px-2 py-1 rounded">
                        <span className="text-slate-700 font-mono text-[11px]">{m.automated} → {m.human}</span>
                        <span className="font-bold text-slate-900">{m.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Relevance Accuracy */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Relevance Discrimination</span>
                  <span className="text-xl font-black text-emerald-600">{stats.relevanceAccuracy}%</span>
                </div>
                <div className="text-xs text-slate-600">
                  Company-Specific ({stats.companySpecificCount}) vs Broad Market ({stats.macroCommentaryCount})
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                  {stats.relevanceAccuracyQualitative}
                </p>
              </div>

              {/* Syndication Clustering */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Syndication Clustering</span>
                  <span className="text-xl font-black text-indigo-600">{stats.syndicationAccuracy}%</span>
                </div>
                <div className="text-xs text-slate-600">
                  {stats.clustersCorrect} of {stats.clustersExamined} wire syndicate clusters verified
                </div>
                <p className="text-xs text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                  Wire reprints across Reuters, Yahoo Finance, CNBC, and MarketWatch correctly grouped without cross-topic bleeding.
                </p>
              </div>
            </div>

            {/* Score Distribution */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Importance Score Distribution
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg">
                  <div className="text-xs text-rose-800 font-semibold">Critical (90–100)</div>
                  <div className="text-xl font-black text-rose-900 mt-1">{stats.scoreDistribution.critical}</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg">
                  <div className="text-xs text-amber-800 font-semibold">High (75–89)</div>
                  <div className="text-xl font-black text-amber-900 mt-1">{stats.scoreDistribution.high}</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg">
                  <div className="text-xs text-blue-800 font-semibold">Medium (50–74)</div>
                  <div className="text-xl font-black text-blue-900 mt-1">{stats.scoreDistribution.medium}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-lg">
                  <div className="text-xs text-slate-700 font-semibold">Low (0–49)</div>
                  <div className="text-xl font-black text-slate-800 mt-1">{stats.scoreDistribution.low}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-100 flex-wrap gap-4">
                <span><strong>Average:</strong> {stats.scoreDistribution.average}</span>
                <span><strong>Median:</strong> {stats.scoreDistribution.median}</span>
                <span><strong>Minimum:</strong> {stats.scoreDistribution.minimum}</span>
                <span><strong>Maximum:</strong> {stats.scoreDistribution.maximum}</span>
              </div>
            </div>

            {/* Real Error Diagnostic Cases */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* False Positives */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  Identified False Positives (Ranked High but Not Important)
                </h4>
                <div className="space-y-2.5">
                  {stats.falsePositives.map((fp, i) => (
                    <div key={i} className="p-3 bg-rose-50/60 border border-rose-100 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-rose-900">{fp.ticker}</span>
                        <span className="text-[11px] font-mono text-rose-700">Auto: {fp.automated_score} | Human: {fp.human_rating}</span>
                      </div>
                      <p className="font-medium text-slate-800">{fp.headline}</p>
                      <p className="text-[11px] text-slate-500 italic">{fp.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* False Negatives */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Identified False Negatives (Important but Received Low Score)
                </h4>
                <div className="space-y-2.5">
                  {stats.falseNegatives.map((fn, i) => (
                    <div key={i} className="p-3 bg-amber-50/60 border border-amber-100 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-900">{fn.ticker}</span>
                        <span className="text-[11px] font-mono text-amber-700">Auto: {fn.automated_score} | Human: {fn.human_rating}</span>
                      </div>
                      <p className="font-medium text-slate-800">{fn.headline}</p>
                      <p className="text-[11px] text-slate-500 italic">{fn.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Tab 4: Final Calibration Report (Section 15 Format) */}
        {activeTab === 'report' && stats && (
          <div className="flex-1 overflow-y-auto p-6 bg-slate-900 text-slate-100 font-mono text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-emerald-400 font-bold">CALIBRATION REPORT EXPORT (SECTION 15 SPECIFICATION)</span>
              <button
                onClick={copyReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-bold transition cursor-pointer"
              >
                {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedReport ? 'Copied to Clipboard' : 'Copy Report'}</span>
              </button>
            </div>

            <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-xs bg-slate-950 p-6 rounded-xl border border-slate-800 select-all overflow-x-auto">
              {generateReportText()}
            </pre>
          </div>
        )}

      </div>
    </div>
  );
};
