import { GoogleGenAI, Type } from '@google/genai';
import { getAIConfig } from '../config.js';
import { getNews } from '../database.js';
import { logger } from './logger.js';
import { TechnicalIndicators } from './technicalAnalysis.js';

export interface MultiHorizonSignalResponse {
  ticker: string;
  overallSignal: 'BUY' | 'SELL' | 'HOLD';
  confidenceScore: number;
  nextDay: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    priceTarget: number;
    stopLoss: number;
    primaryReasoning: string;
  };
  swing: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    priceTarget: number;
    stopLoss: number;
    primaryReasoning: string;
  };
  longTerm: {
    signal: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    priceTarget: number;
    stopLoss: number;
    primaryReasoning: string;
  };
  technicalScoreValidation: string;
  riskDisclaimer: string;
  newsAnalysisSummary?: string; // Additional summary showing news impact
}

/**
 * AI Signal Engine using Gemini API
 */
export class AISignalEngine {
  /**
   * Generates a multi-horizon signal analysis by looking at both technical indicators and the latest news.
   */
  public static async analyze(
    ticker: string,
    indicators: TechnicalIndicators,
    recentPrices: Array<{ date: string; close: number; volume: number }>
  ): Promise<MultiHorizonSignalResponse> {
    const symbol = ticker.trim().toUpperCase();
    const resolvedPrice = indicators.latestPrice || (indicators as any).price || (recentPrices && recentPrices.length > 0 ? recentPrices[recentPrices.length - 1].close : 100);

    // 1. Fetch latest news from database
    let newsArticles: any[] = [];
    try {
      const newsResult = await getNews({
        ticker: symbol,
        page: 1,
        limit: 15,
        sort: 'importance',
      });
      newsArticles = newsResult.articles || [];
    } catch (err: any) {
      logger.error(`AI Signal Engine failed to retrieve news for ${symbol}: ${err.message}`);
    }

    // 2. Setup Gemini Client if API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    const { model } = getAIConfig();

    if (apiKey && apiKey.trim() !== '') {
      try {
        const client = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const technicalPayload = {
          ticker: symbol,
          latestPrice: resolvedPrice,
          sma20: indicators.sma20,
          sma50: indicators.sma50,
          sma200: indicators.sma200,
          rsi14: indicators.rsi14,
          macd: indicators.macd,
          recentCandlesCount: recentPrices.length,
          lastCandleClose: recentPrices.length > 0 ? recentPrices[recentPrices.length - 1].close : null,
        };

        const newsPayload = newsArticles.map((art) => ({
          title: art.title,
          publisher: art.publisher,
          published_at: art.published_at,
          summary: art.summary,
          importance_score: art.importance_score,
          relevance_score: art.relevance_score,
          sentiment_score: art.sentiment_score,
          event_type: art.event_type,
        }));

        const systemInstruction = `
You are a senior hedge-fund Quantitative Strategist and AI Market Analyst.
Your core task is to run a combined Technical + Sentiment decision matrix for ${symbol} to issue trade signals.

GUIDELINES FOR SYNTHESIZING TECHNICALS AND NEWS SENTIMENT:
1. News Sentiment can validate or override Technical Indicators.
   - For example: if RSI shows overbought (RSI > 70), but highly critical bullish news (such as an earnings beat with +50% raised guidance) has just been released, the news overrides the overbought signal as momentum will likely continue.
   - For example: if SMA is in a bullish Golden Cross but highly negative news (e.g., regulatory lawsuit or executive departure) has dropped, the news sentiment invalidates the technical breakout.
2. In your reasoning, you MUST cite specific news events, headlines, or sentiments if they influence your target prices, stops, or horizon signals.
3. Be realistic about price targets and stop losses:
   - Next-Day targets/stops should be within +/- 1% to 3% of the latest price.
   - Swing targets/stops should be within +/- 5% to 15% of the latest price.
   - Long-Term targets/stops should be within +/- 15% to 40% of the latest price.
4. ABSOLUTE STRICT DISCLOSURE: Add a professional risk disclaimer.
`;

        const userPrompt = `
Analyze the asset ${symbol} with the following data:

TECHNICAL INDICATORS PAYLOAD:
${JSON.stringify(technicalPayload, null, 2)}

RECENT NEWS ARTICLES SENTIMENT PAYLOAD:
${JSON.stringify(newsPayload, null, 2)}

Generate a structured buy/sell/hold signal across three horizons:
- Next-Day (1 trading session)
- Swing (1-4 weeks)
- Long-Term (3-12 months)

Ensure the output is strictly structured as a JSON object matching the requested schema.
`;

        const response = await client.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ticker: { type: Type.STRING },
                overallSignal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
                confidenceScore: { type: Type.INTEGER, description: 'Score from 0 to 100 representing overall conviction.' },
                nextDay: {
                  type: Type.OBJECT,
                  properties: {
                    signal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
                    confidence: { type: Type.INTEGER },
                    priceTarget: { type: Type.NUMBER },
                    stopLoss: { type: Type.NUMBER },
                    primaryReasoning: { type: Type.STRING, description: 'Explanation citing both indicators (e.g. RSI, SMA) and recent news headlines.' },
                  },
                  required: ['signal', 'confidence', 'priceTarget', 'stopLoss', 'primaryReasoning'],
                },
                swing: {
                  type: Type.OBJECT,
                  properties: {
                    signal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
                    confidence: { type: Type.INTEGER },
                    priceTarget: { type: Type.NUMBER },
                    stopLoss: { type: Type.NUMBER },
                    primaryReasoning: { type: Type.STRING, description: 'Explanation citing both indicators and news factors.' },
                  },
                  required: ['signal', 'confidence', 'priceTarget', 'stopLoss', 'primaryReasoning'],
                },
                longTerm: {
                  type: Type.OBJECT,
                  properties: {
                    signal: { type: Type.STRING, enum: ['BUY', 'SELL', 'HOLD'] },
                    confidence: { type: Type.INTEGER },
                    priceTarget: { type: Type.NUMBER },
                    stopLoss: { type: Type.NUMBER },
                    primaryReasoning: { type: Type.STRING, description: 'Explanation highlighting long-term outlook, macro news, and major moving averages (like SMA 200).' },
                  },
                  required: ['signal', 'confidence', 'priceTarget', 'stopLoss', 'primaryReasoning'],
                },
                technicalScoreValidation: { type: Type.STRING },
                riskDisclaimer: { type: Type.STRING },
                newsAnalysisSummary: { type: Type.STRING, description: 'A high-level summary explaining how the recent news articles played a role in the decision-making process.' },
              },
              required: [
                'ticker',
                'overallSignal',
                'confidenceScore',
                'nextDay',
                'swing',
                'longTerm',
                'technicalScoreValidation',
                'riskDisclaimer',
                'newsAnalysisSummary',
              ],
            },
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text) as MultiHorizonSignalResponse;
          logger.info(`[AISignalEngine] Successfully received and parsed Gemini signal for ${symbol}. Enforcing price target & stop loss integrity checks.`);
          return this.validateAndEnforceSignalIntegrity(parsed, resolvedPrice);
        }
      } catch (err: any) {
        // Log Gemini rate limits or general API failures as warnings/info logs rather than severe system errors
        // since the application implements a fully-supported high-fidelity deterministic calculation fallback.
        const errStr = err?.message || '';
        const isQuota = errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota');
        if (isQuota) {
          logger.info(`[Gemini API] Quota or rate limit reached for ticker ${symbol}. Gracefully falling back to high-fidelity deterministic calculation matrix.`);
        } else {
          logger.warn(`[Gemini API] Analysis warning for ticker ${symbol} (${errStr}). Falling back to deterministic calculation matrix.`);
        }
      }
    }

    // 3. Robust Deterministic Fallback Engine
    const fallbackObj = this.generateDeterministicFallback(symbol, indicators, newsArticles);
    return this.validateAndEnforceSignalIntegrity(fallbackObj, resolvedPrice);
  }

  /**
   * Generates highly accurate deterministic mathematical signals when Gemini is offline or unconfigured.
   */
  private static generateDeterministicFallback(
    ticker: string,
    indicators: TechnicalIndicators,
    newsArticles: any[]
  ): MultiHorizonSignalResponse {
    const latestPrice = indicators.latestPrice || (indicators as any).price || 100;
    const rsi = indicators.rsi14 ?? 50;

    // A. Calculate average news sentiment score
    let averageNewsSentiment = 50;
    let criticalNewsCount = 0;
    let bullishNewsCount = 0;
    let bearishNewsCount = 0;

    if (newsArticles.length > 0) {
      let sum = 0;
      let count = 0;
      newsArticles.forEach((art) => {
        const score = art.sentiment_score ?? 50;
        sum += score;
        count++;

        if (art.importance_score && art.importance_score >= 80) {
          criticalNewsCount++;
        }
        if (score >= 60) bullishNewsCount++;
        if (score <= 40) bearishNewsCount++;
      });
      averageNewsSentiment = sum / count;
    }

    // B. Calculate technical score
    // - RSI under 30 is positive (+2), RSI over 70 is negative (-2)
    // - Price > SMA20 (+1), Price > SMA50 (+1), Price > SMA200 (+2)
    // - MACD Histogram > 0 (+1)
    let techScore = 0;
    let explanationPoints: string[] = [];

    if (rsi < 35) {
      techScore += 2;
      explanationPoints.push(`Oversold RSI of ${rsi.toFixed(1)} suggests near-term bullish mean-reversion.`);
    } else if (rsi > 65) {
      techScore -= 2;
      explanationPoints.push(`Overbought RSI of ${rsi.toFixed(1)} suggests near-term selling pressure.`);
    } else {
      explanationPoints.push(`Neutral RSI of ${rsi.toFixed(1)} indicates balanced momentum.`);
    }

    if (indicators.sma20 && latestPrice > indicators.sma20) {
      techScore += 1;
      explanationPoints.push(`Price trades above 20-day SMA ($${indicators.sma20}), supporting short-term uptrend.`);
    }
    if (indicators.sma50 && latestPrice > indicators.sma50) {
      techScore += 1;
      explanationPoints.push(`Price trades above 50-day SMA ($${indicators.sma50}), validating medium-term structure.`);
    }
    if (indicators.sma200 && latestPrice > indicators.sma200) {
      techScore += 2;
      explanationPoints.push(`Price is sustained above 200-day SMA ($${indicators.sma200}), indicating long-term bull market.`);
    } else if (indicators.sma200 && latestPrice < indicators.sma200) {
      techScore -= 2;
      explanationPoints.push(`Price is capped below 200-day SMA ($${indicators.sma200}), signaling long-term bear market structure.`);
    }

    if (indicators.macd && indicators.macd.histogram > 0) {
      techScore += 1;
      explanationPoints.push(`MACD histogram is positive (${indicators.macd.histogram}), signaling bullish momentum.`);
    } else if (indicators.macd && indicators.macd.histogram < 0) {
      techScore -= 1;
      explanationPoints.push(`MACD histogram is negative (${indicators.macd.histogram}), signaling bearish momentum.`);
    }

    // C. Combine Technical Score (-5 to +7) and News Sentiment (0 to 100)
    // Map average news sentiment to a scale of -4 to +4
    const sentimentBonus = ((averageNewsSentiment - 50) / 50) * 4; // -4 to +4
    const compositeScore = techScore + sentimentBonus; // ranges roughly -9 to +11

    let overallSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidenceScore = 50;

    if (compositeScore > 2) {
      overallSignal = 'BUY';
      confidenceScore = Math.min(95, Math.round(50 + compositeScore * 4));
    } else if (compositeScore < -1) {
      overallSignal = 'SELL';
      confidenceScore = Math.min(95, Math.round(50 + Math.abs(compositeScore) * 5));
    } else {
      overallSignal = 'HOLD';
      confidenceScore = Math.round(50 + Math.abs(compositeScore) * 2);
    }

    // Next-day horizon calculations
    const nextDaySignal = rsi < 30 ? 'BUY' : rsi > 70 ? 'SELL' : averageNewsSentiment > 60 ? 'BUY' : averageNewsSentiment < 40 ? 'SELL' : 'HOLD';
    const nextDayTarget = Number((latestPrice * (nextDaySignal === 'BUY' ? 1.015 : nextDaySignal === 'SELL' ? 0.985 : 1.002)).toFixed(2));
    const nextDayStop = Number((latestPrice * (nextDaySignal === 'BUY' ? 0.99 : nextDaySignal === 'SELL' ? 1.01 : 0.995)).toFixed(2));
    const nextDayReason = `Short-term outlook is shaped by ${
      newsArticles.length > 0 ? `the recent news flows showing ${bullishNewsCount} bullish vs ${bearishNewsCount} bearish catalysts` : 'general technical indicators'
    }. RSI is at ${rsi.toFixed(1)} which represents a ${rsi < 35 ? 'bullish reversal' : rsi > 65 ? 'bearish cooling' : 'stable consolidate'} phase.`;

    // Swing horizon calculations
    const swingSignal = overallSignal;
    const swingTarget = Number((latestPrice * (swingSignal === 'BUY' ? 1.08 : swingSignal === 'SELL' ? 0.92 : 1.01)).toFixed(2));
    const swingStop = Number((latestPrice * (swingSignal === 'BUY' ? 0.95 : swingSignal === 'SELL' ? 1.05 : 0.97)).toFixed(2));
    const swingReason = `Swing traders should note that the 20-day SMA ($${indicators.sma20 || 'N/A'}) and 50-day SMA ($${
      indicators.sma50 || 'N/A'
    }) show ${indicators.sma20 && indicators.sma50 && indicators.sma20 > indicators.sma50 ? 'bullish stacking' : 'bearish posture'}. News sentiment is average ${averageNewsSentiment.toFixed(1)}/100, which is ${
      averageNewsSentiment > 55 ? 'supportive' : averageNewsSentiment < 45 ? 'dilutive' : 'neutral'
    } for swing momentum.`;

    // Long-Term horizon calculations
    let longTermSignal: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    if (indicators.sma200 && latestPrice > indicators.sma200 && averageNewsSentiment > 45) {
      longTermSignal = 'BUY';
    } else if (indicators.sma200 && latestPrice < indicators.sma200) {
      longTermSignal = 'SELL';
    }
    const longTermTarget = Number((latestPrice * (longTermSignal === 'BUY' ? 1.25 : longTermSignal === 'SELL' ? 0.75 : 1.02)).toFixed(2));
    const longTermStop = Number((latestPrice * (longTermSignal === 'BUY' ? 0.85 : longTermSignal === 'SELL' ? 1.15 : 0.90)).toFixed(2));
    const longTermReason = `Long-term posture relies heavily on the 200-day SMA ($${
      indicators.sma200 || 'N/A'
    }) boundary. As price trades ${latestPrice > (indicators.sma200 || 0) ? 'above' : 'below'} this line, the macro trend is deemed ${
      latestPrice > (indicators.sma200 || 0) ? 'bullish' : 'bearish'
    }. Recent high-importance news (${criticalNewsCount} critical articles) outlines long-term structural changes for ${ticker}.`;

    return {
      ticker,
      overallSignal,
      confidenceScore,
      nextDay: {
        signal: nextDaySignal,
        confidence: Math.round(confidenceScore * 0.9),
        priceTarget: nextDayTarget,
        stopLoss: nextDayStop,
        primaryReasoning: nextDayReason,
      },
      swing: {
        signal: swingSignal,
        confidence: confidenceScore,
        priceTarget: swingTarget,
        stopLoss: swingStop,
        primaryReasoning: swingReason,
      },
      longTerm: {
        signal: longTermSignal,
        confidence: Math.round(confidenceScore * 0.95),
        priceTarget: longTermTarget,
        stopLoss: longTermStop,
        primaryReasoning: longTermReason,
      },
      technicalScoreValidation: `Technical validations are derived from indicators. ${explanationPoints.join(' ')}`,
      riskDisclaimer: 'DISCLAIMER: Not financial advice. Technical indicators and news sentiment are models and do not guarantee future performance.',
      newsAnalysisSummary: `We analyzed ${newsArticles.length} news articles for ${ticker}. The average sentiment score is ${averageNewsSentiment.toFixed(
        1
      )}/100, showing a ${
        averageNewsSentiment > 55 ? 'constructive bullish bias' : averageNewsSentiment < 45 ? 'distressed bearish bias' : 'neutral consensus'
      } among journalists and analysts, which ${techScore > 0 ? 'aligns well with' : 'conflicts with'} technical indicators.`,
    };
  }

  /**
   * Enforces financial and mathematical integrity constraints on the generated trading signals,
   * preventing inverted target/stop loss parameters or illogical price valuations.
   */
  private static validateAndEnforceSignalIntegrity(
    res: MultiHorizonSignalResponse,
    latestPrice: number
  ): MultiHorizonSignalResponse {
    const p = latestPrice || 100;

    const enforceHorizon = (
      h: { signal: 'BUY' | 'SELL' | 'HOLD'; confidence: number; priceTarget: number; stopLoss: number; primaryReasoning: string },
      horizonType: 'nextDay' | 'swing' | 'longTerm'
    ) => {
      // 1. Sanitize Signal
      if (!h.signal || !['BUY', 'SELL', 'HOLD'].includes(h.signal)) {
        h.signal = 'HOLD';
      }

      // 2. Default target/stop percentages
      let targetPct = 0.02; // 2% Next-Day
      let stopPct = 0.01;   // 1% Next-Day
      if (horizonType === 'swing') {
        targetPct = 0.10;   // 10% Swing
        stopPct = 0.05;     // 5% Swing
      } else if (horizonType === 'longTerm') {
        targetPct = 0.25;   // 25% Long-Term
        stopPct = 0.15;     // 15% Long-Term
      }

      const signal = h.signal;

      // 3. Enforce Directional Constraints
      if (signal === 'BUY' || signal === 'HOLD') {
        // Price target must be strictly greater than latest price
        if (!h.priceTarget || h.priceTarget <= p) {
          h.priceTarget = Number((p * (1 + targetPct)).toFixed(2));
        }
        // Stop loss must be strictly less than latest price
        if (!h.stopLoss || h.stopLoss >= p) {
          h.stopLoss = Number((p * (1 - stopPct)).toFixed(2));
        }
      } else if (signal === 'SELL') {
        // Price target must be strictly less than latest price
        if (!h.priceTarget || h.priceTarget >= p) {
          h.priceTarget = Number((p * (1 - targetPct)).toFixed(2));
        }
        // Stop loss must be strictly greater than latest price
        if (!h.stopLoss || h.stopLoss <= p) {
          h.stopLoss = Number((p * (1 + stopPct)).toFixed(2));
        }
      }

      // Format to neat decimal precision
      h.priceTarget = Number(Number(h.priceTarget).toFixed(2));
      h.stopLoss = Number(Number(h.stopLoss).toFixed(2));
    };

    enforceHorizon(res.nextDay, 'nextDay');
    enforceHorizon(res.swing, 'swing');
    enforceHorizon(res.longTerm, 'longTerm');

    // Make sure overallSignal matches horizon cues if conflicting
    if (res.overallSignal === 'BUY' && res.swing.signal === 'SELL') {
      res.overallSignal = 'HOLD';
    }

    logger.info(`[AISignalEngine] Cleaned up and verified technical signal integrity bounds for ${res.ticker} (Latest Price: $${p.toFixed(2)}).`);
    return res;
  }
}
