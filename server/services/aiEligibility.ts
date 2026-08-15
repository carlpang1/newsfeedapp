import { AIEligibilityResult, NewsArticle } from '../types.js';

export const AI_PROMPT_VERSION = 'news-analysis-v1';
export const AI_ANALYSIS_VERSION = '1.0';

export const HIGH_PRIORITY_AI_EVENT_TYPES = new Set<string>([
  'earnings',
  'guidance',
  'acquisition',
  'merger',
  'regulatory',
  'legal',
  'management',
  'major_contract',
]);

export interface AIEligibilityConfig {
  minImportanceScore: number;
  minRelevanceScore: number;
  autoEligibleEventTypes: string[];
}

export const DEFAULT_AI_ELIGIBILITY_CONFIG: AIEligibilityConfig = {
  minImportanceScore: 75,
  minRelevanceScore: 60,
  autoEligibleEventTypes: Array.from(HIGH_PRIORITY_AI_EVENT_TYPES),
};

export class AIEligibilityGate {
  /**
   * Deterministically evaluates if an article is eligible for AI analysis.
   */
  public static evaluate(
    article: {
      importance_score?: number;
      relevance_score?: number;
      event_type?: string;
      is_calibration?: boolean;
    },
    config: AIEligibilityConfig = DEFAULT_AI_ELIGIBILITY_CONFIG
  ): AIEligibilityResult {
    const reasons: string[] = [];

    // Rule 0: Calibration articles are automatically eligible for benchmark runs when BENCHMARK_MODE is true
    if (process.env.BENCHMARK_MODE === 'true' && article.is_calibration) {
      reasons.push('calibration_dataset_article');
      return {
        eligible: true,
        reason: reasons,
      };
    }

    const importance = article.importance_score ?? 0;
    const relevance = article.relevance_score ?? 0;
    const eventType = (article.event_type || 'other').toLowerCase();

    // Check if event type auto-qualifies
    const isHighPriorityEvent = config.autoEligibleEventTypes.some(
      (t) => t.toLowerCase() === eventType
    );

    // Rule 1: High priority event types qualify automatically provided minimum relevance check isn't complete zero/irrelevant (< 30)
    if (isHighPriorityEvent && relevance >= 30) {
      reasons.push(`high_priority_event: ${eventType}`);
      if (importance >= config.minImportanceScore) {
        reasons.push(`importance_score (${importance}) >= ${config.minImportanceScore}`);
      }
      return {
        eligible: true,
        reason: reasons,
      };
    }

    // Rule 2: Standard threshold (importance >= 75 AND relevance >= 60)
    const meetsImportance = importance >= config.minImportanceScore;
    const meetsRelevance = relevance >= config.minRelevanceScore;

    if (meetsImportance && meetsRelevance) {
      reasons.push(`importance_score (${importance}) >= ${config.minImportanceScore}`);
      reasons.push(`relevance_score (${relevance}) >= ${config.minRelevanceScore}`);
      return {
        eligible: true,
        reason: reasons,
      };
    }

    // Ineligible explanation
    if (!meetsImportance) {
      reasons.push(`importance_score (${importance}) < ${config.minImportanceScore}`);
    }
    if (!meetsRelevance) {
      reasons.push(`relevance_score (${relevance}) < ${config.minRelevanceScore}`);
    }
    if (!isHighPriorityEvent) {
      reasons.push(`event_type '${eventType}' is not in auto-qualify list`);
    }

    return {
      eligible: false,
      reason: reasons,
    };
  }
}
