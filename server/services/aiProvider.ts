import { GoogleGenAI, Type } from '@google/genai';
import {
  AIAnalysisInput,
  AIAnalysisOutput,
  AIMarketImpact,
  AITimeHorizon,
  AIProviderResponse,
  IAIProvider,
} from '../types.js';

export type { IAIProvider };
import { AI_PROMPT_VERSION, AI_ANALYSIS_VERSION } from './aiEligibility.js';
import { logger } from './logger.js';
import { getAIConfig } from '../config.js';

export interface ModelPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'gemini-3.6-flash': { inputCostPerMillion: 0.15, outputCostPerMillion: 0.60 },
  'gemini-3.7-flash': { inputCostPerMillion: 0.15, outputCostPerMillion: 0.60 },
  'gemini-2.5-flash': { inputCostPerMillion: 0.15, outputCostPerMillion: 0.60 },
  'gemini-flash-latest': { inputCostPerMillion: 0.15, outputCostPerMillion: 0.60 },
  'fallback-engine': { inputCostPerMillion: 0.0, outputCostPerMillion: 0.0 },
};

/**
 * Validates and sanitizes AI JSON output to conform strictly to AIAnalysisOutput.
 */
export function validateAndSanitizeAIOutput(rawJson: any): AIAnalysisOutput {
  if (!rawJson || typeof rawJson !== 'object') {
    throw new Error('AI response is not a valid JSON object');
  }

  // Validate Summary
  const summary = typeof rawJson.summary === 'string' && rawJson.summary.trim()
    ? rawJson.summary.trim()
    : 'Summary unavailable from source article.';

  // Validate Why It Matters (Interpretation)
  const why_it_matters = typeof rawJson.why_it_matters === 'string' && rawJson.why_it_matters.trim()
    ? rawJson.why_it_matters.trim()
    : 'Interpretation not specified in article context.';

  // Validate Market Impact Enum
  const validImpacts: AIMarketImpact[] = ['bullish', 'bearish', 'neutral', 'mixed', 'unclear'];
  let market_impact: AIMarketImpact = 'unclear';
  if (rawJson.market_impact && validImpacts.includes(String(rawJson.market_impact).toLowerCase() as AIMarketImpact)) {
    market_impact = String(rawJson.market_impact).toLowerCase() as AIMarketImpact;
  }

  // Validate Impact Confidence (0 - 100)
  let impact_confidence = 50;
  if (typeof rawJson.impact_confidence === 'number' && !isNaN(rawJson.impact_confidence)) {
    impact_confidence = Math.max(0, Math.min(100, Math.round(rawJson.impact_confidence)));
  }

  // Validate Time Horizon Enum
  const validHorizons: AITimeHorizon[] = ['intraday', 'short_term', 'medium_term', 'long_term', 'unclear'];
  let time_horizon: AITimeHorizon = 'unclear';
  if (rawJson.time_horizon && validHorizons.includes(String(rawJson.time_horizon).toLowerCase() as AITimeHorizon)) {
    time_horizon = String(rawJson.time_horizon).toLowerCase() as AITimeHorizon;
  }

  // Validate Catalysts Array
  const catalysts = Array.isArray(rawJson.catalysts)
    ? rawJson.catalysts.map((c: any) => String(c).trim()).filter(Boolean)
    : [];

  // Validate Risks Array
  const risks = Array.isArray(rawJson.risks)
    ? rawJson.risks.map((r: any) => String(r).trim()).filter(Boolean)
    : [];

  // Validate Key Facts Array (Facts vs Interpretation)
  const key_facts = Array.isArray(rawJson.key_facts)
    ? rawJson.key_facts.map((k: any) => String(k).trim()).filter(Boolean)
    : [];

  // Validate Mentioned Companies Array
  const mentioned_companies = Array.isArray(rawJson.mentioned_companies)
    ? rawJson.mentioned_companies.map((m: any) => String(m).trim()).filter(Boolean)
    : [];

  // Validate Analysis Confidence (0 - 100)
  let analysis_confidence = 75;
  if (typeof rawJson.analysis_confidence === 'number' && !isNaN(rawJson.analysis_confidence)) {
    analysis_confidence = Math.max(0, Math.min(100, Math.round(rawJson.analysis_confidence)));
  }

  return {
    summary,
    why_it_matters,
    market_impact,
    impact_confidence,
    time_horizon,
    catalysts,
    risks,
    key_facts,
    mentioned_companies,
    analysis_confidence,
  };
}

/**
 * System prompt ensuring strict hallucination protection and anti-trading-advice.
 */
export const AI_SYSTEM_PROMPT = `
You are a senior financial analyst and news intelligence system.
Your task is to analyze financial news articles and return a STRICT, FACTUAL structured JSON object.

CRITICAL INSTRUCTIONS & HALLUCINATION PROTECTION:
1. USE ONLY facts directly supplied in the input. Do NOT invent financial numbers, revenue figures, guidance targets, management quotes, or corporate actions.
2. If any piece of information is not present or verified in the article, state "Not stated in article" or leave the array empty.
3. SEPARATE FACTS FROM INTERPRETATION:
   - "key_facts": List only verified statements of fact directly reported in the article (e.g. "NVIDIA announced new GPU platform at GTC").
   - "why_it_matters": Provide analytical context explaining why this event could matter for the company or industry.
4. NO TRADING ADVICE OR ABSOLUTE CERTAINTY:
   - NEVER use phrases like "BUY NOW", "SELL NOW", "Guaranteed to rise", or "The stock will rally".
   - Use objective, probabilistic phrasing such as: "This could support the stock because..." or "Potential headwinds may include...".
   - "market_impact" MUST be one of: "bullish", "bearish", "neutral", "mixed", "unclear".
5. TIME HORIZON:
   - "time_horizon" MUST be one of: "intraday", "short_term", "medium_term", "long_term", "unclear".
6. CONFIDENCE ASSESSMENT:
   - "analysis_confidence" (0-100): Reduce confidence if the source is brief, multiple companies are conflated, or headline is ambiguous.
   - "impact_confidence" (0-100): Reflect the certainty of potential market impact.

OUTPUT STRICT JSON MATCHING THE REQUESTED SCHEMA.
`;

/**
 * Gemini Provider using the official @google/genai SDK
 */
export class GeminiAIProvider implements IAIProvider {
  public name = 'gemini';
  private model: string;
  private apiKey?: string;
  private client: GoogleGenAI | null = null;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
  }

  private getClient(): GoogleGenAI {
    if (this.client) return this.client;
    const key = this.apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not configured');
    }
    this.client = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    return this.client;
  }

  public async analyzeArticle(input: AIAnalysisInput): Promise<AIProviderResponse> {
    const client = this.getClient();

    const inputDataPayload = {
      ticker: input.ticker,
      title: input.title,
      publisher: input.publisher,
      published_at: input.published_at,
      summary: input.summary,
      event_type: input.event_type,
      importance_score: input.importance_score,
      relevance_score: input.relevance_score,
    };

    const userPrompt = `
Analyze this financial news article for ticker ${input.ticker}:

${JSON.stringify(inputDataPayload, null, 2)}

Provide the structured JSON intelligence analysis adhering strictly to the schema and instructions.
`;

    const response = await client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: AI_SYSTEM_PROMPT,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: 'Factual 1-2 sentence executive summary of what occurred.' },
            why_it_matters: { type: Type.STRING, description: 'Analytical interpretation of why the event matters.' },
            market_impact: {
              type: Type.STRING,
              enum: ['bullish', 'bearish', 'neutral', 'mixed', 'unclear'],
              description: 'Potential market direction hypothesis.',
            },
            impact_confidence: { type: Type.INTEGER, description: 'Confidence in market impact hypothesis (0-100).' },
            time_horizon: {
              type: Type.STRING,
              enum: ['intraday', 'short_term', 'medium_term', 'long_term', 'unclear'],
              description: 'Expected analytical time horizon.',
            },
            catalysts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key positive catalysts stated or directly implied.',
            },
            risks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key downside risks or headwinds stated or directly implied.',
            },
            key_facts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Direct factual claims verified from the article.',
            },
            mentioned_companies: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Specific company names or tickers discussed.',
            },
            analysis_confidence: { type: Type.INTEGER, description: 'Confidence in data completeness (0-100).' },
          },
          required: [
            'summary',
            'why_it_matters',
            'market_impact',
            'impact_confidence',
            'time_horizon',
            'catalysts',
            'risks',
            'key_facts',
            'mentioned_companies',
            'analysis_confidence',
          ],
        },
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API returned an empty text response');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseErr: any) {
      throw new Error(`Failed to parse Gemini JSON output: ${parseErr.message}`);
    }

    const sanitized = validateAndSanitizeAIOutput(parsed);

    // Approximate token counts if not provided by SDK usage metadata
    const inputTokenEstimate = Math.ceil((userPrompt.length + AI_SYSTEM_PROMPT.length) / 4);
    const outputTokenEstimate = Math.ceil(responseText.length / 4);

    const pricing = DEFAULT_PRICING[this.model] || DEFAULT_PRICING[getAIConfig().model];
    const estimatedCost =
      (inputTokenEstimate / 1_000_000) * pricing.inputCostPerMillion +
      (outputTokenEstimate / 1_000_000) * pricing.outputCostPerMillion;

    return {
      output: sanitized,
      inputTokens: inputTokenEstimate,
      outputTokens: outputTokenEstimate,
      estimatedCost,
      model: this.model,
      provider: 'gemini',
      promptVersion: AI_PROMPT_VERSION,
      analysisVersion: AI_ANALYSIS_VERSION,
      rawResponse: parsed,
    };
  }
}

/**
 * Deterministic Fallback / Mock AI Provider.
 * Provides high-fidelity, fact-separated intelligence when Gemini API key is not configured,
 * or for offline / deterministic testing.
 */
export class DeterministicFallbackAIProvider implements IAIProvider {
  public name = 'fallback';
  private model = 'deterministic-rules-v1';

  public async analyzeArticle(input: AIAnalysisInput): Promise<AIProviderResponse> {
    // Generate fact-grounded analysis from article metadata
    const headline = input.title;
    const summaryText = input.summary || headline;
    const ticker = input.ticker.toUpperCase();
    const eventType = input.event_type.toLowerCase();

    // Extract facts vs interpretation
    const key_facts: string[] = [
      `${input.publisher} reported on ${ticker}: "${headline}"`,
    ];
    if (input.summary && input.summary !== headline) {
      key_facts.push(input.summary.replace(/\s+/g, ' ').trim());
    }

    // Determine probabilistic market impact & interpretation
    let market_impact: AIMarketImpact = 'neutral';
    let why_it_matters = `Developments in ${eventType} provide ongoing visibility into ${ticker}'s operational trajectory.`;
    let time_horizon: AITimeHorizon = 'short_term';
    let impact_confidence = 70;
    let analysis_confidence = 85;
    const catalysts: string[] = [];
    const risks: string[] = [];
    const mentioned_companies: string[] = [ticker];

    if (eventType === 'earnings' || eventType === 'guidance') {
      if (headline.toLowerCase().includes('beat') || headline.toLowerCase().includes('raise') || headline.toLowerCase().includes('surge')) {
        market_impact = 'bullish';
        why_it_matters = `Financial performance and guidance momentum could support positive valuation revisions for ${ticker}.`;
        catalysts.push(`Reported quarterly operational growth exceeding previous baseline expectations.`);
        risks.push(`Sustainability of margins and forward demand in subsequent quarters.`);
        impact_confidence = 85;
        time_horizon = 'medium_term';
      } else if (headline.toLowerCase().includes('miss') || headline.toLowerCase().includes('lower') || headline.toLowerCase().includes('cut')) {
        market_impact = 'bearish';
        why_it_matters = `Top/bottom-line softness or trimmed outlook could create valuation headwinds for ${ticker}.`;
        risks.push(`Potential compression of revenue multiples or operating margin headwinds.`);
        catalysts.push(`Cost discipline measures or reacceleration in high-margin segments.`);
        impact_confidence = 80;
        time_horizon = 'medium_term';
      } else {
        market_impact = 'neutral';
        why_it_matters = `Quarterly financial disclosures outline recent business execution for ${ticker}.`;
        time_horizon = 'short_term';
      }
    } else if (eventType === 'regulatory' || eventType === 'legal') {
      market_impact = 'bearish';
      why_it_matters = `Scrutiny from regulatory bodies or legal filings can introduce compliance costs or operational friction.`;
      risks.push(`Potential legal penalties, delayed product rollouts, or mandated compliance changes.`);
      catalysts.push(`Expedited resolution or favorable settlement terms.`);
      impact_confidence = 75;
      time_horizon = 'medium_term';
    } else if (eventType === 'product' || eventType === 'major_contract' || eventType === 'partnership') {
      market_impact = 'bullish';
      why_it_matters = `New product rollouts and strategic commercial alliances expand ${ticker}'s addressable market and customer pipeline.`;
      catalysts.push(`Commercial adoption and monetization of newly introduced product offerings.`);
      risks.push(`Execution timeline, competitive responses, or initial ramp-up costs.`);
      impact_confidence = 78;
      time_horizon = 'long_term';
    } else if (eventType === 'analyst_target' || eventType === 'analyst_rating') {
      if (headline.toLowerCase().includes('upgrade') || headline.toLowerCase().includes('raise') || headline.toLowerCase().includes('buy') || headline.toLowerCase().includes('outperform')) {
        market_impact = 'bullish';
        why_it_matters = `Positive analyst research revisions can influence near-term institutional sentiment.`;
        catalysts.push(`Target price increase reflecting constructive analyst thesis.`);
        impact_confidence = 72;
      } else if (headline.toLowerCase().includes('downgrade') || headline.toLowerCase().includes('cut') || headline.toLowerCase().includes('sell') || headline.toLowerCase().includes('underperform')) {
        market_impact = 'bearish';
        why_it_matters = `Analyst rating downgrades can signal emerging sector or company-level concerns.`;
        risks.push(`Potential multiple contraction or institutional rebalancing.`);
        impact_confidence = 72;
      }
    } else if (eventType === 'acquisition' || eventType === 'merger') {
      market_impact = 'mixed';
      why_it_matters = `M&A activity creates strategic expansion opportunities alongside integration and financing risks.`;
      catalysts.push(`Long-term revenue synergies and consolidated market share.`);
      risks.push(`Integration complexity, regulatory approvals, and balance-sheet leverage.`);
      impact_confidence = 70;
      time_horizon = 'long_term';
    }

    if (input.allArticleTickers) {
      input.allArticleTickers.forEach((t) => {
        if (!mentioned_companies.includes(t)) mentioned_companies.push(t);
      });
    }

    const output: AIAnalysisOutput = {
      summary: `${ticker}: ${headline.replace(/\s+/g, ' ').trim()}`,
      why_it_matters,
      market_impact,
      impact_confidence,
      time_horizon,
      catalysts,
      risks,
      key_facts,
      mentioned_companies,
      analysis_confidence,
    };

    const inputTokens = Math.ceil(headline.length / 4) + 120;
    const outputTokens = 180;

    return {
      output,
      inputTokens,
      outputTokens,
      estimatedCost: 0.000045,
      model: this.model,
      provider: 'fallback-rules',
      promptVersion: AI_PROMPT_VERSION,
      analysisVersion: AI_ANALYSIS_VERSION,
      rawResponse: output,
    };
  }
}

/**
 * Provider failure simulator for unit testing error handling.
 */
export class FailureSimulationProvider implements IAIProvider {
  public name = 'simulator';
  private failureMode: 'timeout' | 'rate_limit' | 'server_error' | 'malformed_json' | 'missing_fields' | 'invalid_enums' | 'confidence_out_of_bounds';

  constructor(failureMode: 'timeout' | 'rate_limit' | 'server_error' | 'malformed_json' | 'missing_fields' | 'invalid_enums' | 'confidence_out_of_bounds') {
    this.failureMode = failureMode;
  }

  public async analyzeArticle(_input: AIAnalysisInput): Promise<AIProviderResponse> {
    if (this.failureMode === 'timeout') {
      throw new Error('AI provider request timed out after 30000ms');
    }
    if (this.failureMode === 'rate_limit') {
      throw new Error('429 Too Many Requests: Rate limit quota exceeded for provider');
    }
    if (this.failureMode === 'server_error') {
      throw new Error('500 Internal Server Error: AI inference service unavailable');
    }
    if (this.failureMode === 'malformed_json') {
      throw new Error('Malformed JSON received from AI provider');
    }
    if (this.failureMode === 'missing_fields') {
      // Simulate raw output with missing required fields
      const badOutput: any = {
        summary: 'Incomplete output',
      };
      const sanitized = validateAndSanitizeAIOutput(badOutput);
      return {
        output: sanitized,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0,
        model: 'sim-missing-fields',
        provider: 'simulator',
        promptVersion: AI_PROMPT_VERSION,
        analysisVersion: AI_ANALYSIS_VERSION,
      };
    }
    if (this.failureMode === 'invalid_enums') {
      const badOutput: any = {
        summary: 'Test summary',
        why_it_matters: 'Test reason',
        market_impact: 'super_bullish_guaranteed_100x', // invalid enum
        time_horizon: 'next_century', // invalid enum
        impact_confidence: 80,
        analysis_confidence: 90,
      };
      const sanitized = validateAndSanitizeAIOutput(badOutput);
      return {
        output: sanitized,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0,
        model: 'sim-invalid-enums',
        provider: 'simulator',
        promptVersion: AI_PROMPT_VERSION,
        analysisVersion: AI_ANALYSIS_VERSION,
      };
    }
    if (this.failureMode === 'confidence_out_of_bounds') {
      const badOutput: any = {
        summary: 'Test summary',
        why_it_matters: 'Test reason',
        market_impact: 'bullish',
        time_horizon: 'short_term',
        impact_confidence: 9999, // out of bounds
        analysis_confidence: -50, // out of bounds
      };
      const sanitized = validateAndSanitizeAIOutput(badOutput);
      return {
        output: sanitized,
        inputTokens: 100,
        outputTokens: 50,
        estimatedCost: 0,
        model: 'sim-out-of-bounds',
        provider: 'simulator',
        promptVersion: AI_PROMPT_VERSION,
        analysisVersion: AI_ANALYSIS_VERSION,
      };
    }

    throw new Error(`Unhandled failure mode: ${this.failureMode}`);
  }
}

/**
 * Returns the active AI Provider based on configuration and available API keys.
 */
export function getActiveAIProvider(): IAIProvider {
  const { provider: providerType, model } = getAIConfig();
  const apiKey = process.env.GEMINI_API_KEY;

  if (providerType === 'gemini' && apiKey && apiKey.trim() !== '') {
    return new GeminiAIProvider(model, apiKey);
  }

  // Fallback to high-fidelity deterministic provider if key not present or explicitly requested
  return new DeterministicFallbackAIProvider();
}
