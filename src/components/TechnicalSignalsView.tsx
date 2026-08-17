import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ChevronRight,
  ShieldCheck,
  Percent,
  CheckCircle2,
  DollarSign,
  Briefcase,
  Layers,
  ArrowRight,
  FileText,
  AlertTriangle,
  Info,
  Search,
  Activity,
  Zap,
  Compass,
  HelpCircle,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { Ticker, NewsArticle, fetchYahooData, fetchAISignalAnalysis, fetchNews } from '../services/api.js';

interface TechnicalSignalsViewProps {
  tickers: Ticker[];
  selectedTicker: string;
  onSelectTicker: (symbol: string) => void;
  onOpenArticlePreview?: (article: NewsArticle) => void;
}

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
}

interface TickerIndicators {
  symbol: string;
  companyName: string;
  price: number;
  priceChangePercent: number;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  maAlignment: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish';
  techScore: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  candles: CandleData[];
  loading: boolean;
  error: string | null;
}

export const TechnicalSignalsView: React.FC<TechnicalSignalsViewProps> = ({
  tickers,
  selectedTicker,
  onSelectTicker,
  onOpenArticlePreview,
}) => {
  // Enabled Tickers list
  const activeTickersList = useMemo(() => {
    return tickers.filter(t => t.enabled);
  }, [tickers]);

  const [activeTicker, setActiveTicker] = useState<string>(
    selectedTicker && selectedTicker !== 'ALL' 
      ? selectedTicker 
      : (activeTickersList[0]?.symbol || 'AAPL')
  );

  // Indicators mapping for all active tickers
  const [tickerIndicatorsMap, setTickerIndicatorsMap] = useState<Record<string, TickerIndicators>>({});
  const [loadingAllData, setLoadingAllData] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Custom user-triggered Gemini AI Signals map
  const [customAISignalsMap, setCustomAISignalsMap] = useState<Record<string, any>>({});
  const [loadingAI, setLoadingAI] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Batch Gemini AI Signal states
  const [loadingBatchAI, setLoadingBatchAI] = useState<boolean>(false);
  const [batchAIProgress, setBatchAIProgress] = useState<string>('');
  const [batchAISummary, setBatchAISummary] = useState<string | null>(null);

  // Timeframe for the main detail chart
  const [chartTimeframe, setChartTimeframe] = useState<'3m' | '6m' | '1y'>('6m');

  // Filters State for the Summary Table
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [rsiFilterPreset, setRsiFilterPreset] = useState<'all' | 'oversold' | 'overbought' | 'neutral'>('all');
  const [techScoreFilterPreset, setTechScoreFilterPreset] = useState<'all' | 'bullish' | 'bearish'>('all');
  const [aiStanceFilterPreset, setAiStanceFilterPreset] = useState<'all' | 'BUY' | 'HOLD' | 'SELL' | 'CAUTION'>('all');

  // Sorting State for the Summary Table
  const [sortField, setSortField] = useState<'ticker' | 'price' | 'rsi' | 'macd' | 'ma' | 'score' | 'nextDay' | 'swing' | 'longTerm' | 'horizon' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Sync state if selected ticker prop changes from parent
  useEffect(() => {
    if (selectedTicker && selectedTicker !== 'ALL') {
      setActiveTicker(selectedTicker);
    }
  }, [selectedTicker]);

  // Active Ticker News Feed State
  const [activeTickerNews, setActiveTickerNews] = useState<NewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  useEffect(() => {
    if (!activeTicker) return;
    let isMounted = true;
    const fetchNewsForActiveTicker = async () => {
      setLoadingNews(true);
      try {
        const res = await fetchNews({ ticker: activeTicker, limit: 5 });
        if (isMounted) {
          setActiveTickerNews(res.articles || []);
        }
      } catch (err) {
        console.warn(`[TechnicalSignalsView] Failed to retrieve news for ${activeTicker}:`, err);
      } finally {
        if (isMounted) {
          setLoadingNews(false);
        }
      }
    };
    fetchNewsForActiveTicker();
    return () => {
      isMounted = false;
    };
  }, [activeTicker]);

  // Client-side indicators math
  const computeIndicatorsForCandles = (symbol: string, companyName: string, rawCandles: any[]): TickerIndicators => {
    if (rawCandles.length === 0) {
      return {
        symbol,
        companyName,
        price: 0,
        priceChangePercent: 0,
        rsi14: null,
        macd: null,
        maAlignment: 'Neutral',
        techScore: 0,
        sma20: null,
        sma50: null,
        sma200: null,
        candles: [],
        loading: false,
        error: 'No price candles supplied',
      };
    }

    const candlesWithSma: CandleData[] = rawCandles.map((c, idx) => {
      // SMA 20
      let sma20: number | null = null;
      if (idx >= 19) {
        const sum = rawCandles.slice(idx - 19, idx + 1).reduce((acc, val) => acc + val.close, 0);
        sma20 = Number((sum / 20).toFixed(2));
      }
      // SMA 50
      let sma50: number | null = null;
      if (idx >= 49) {
        const sum = rawCandles.slice(idx - 49, idx + 1).reduce((acc, val) => acc + val.close, 0);
        sma50 = Number((sum / 50).toFixed(2));
      }
      // SMA 200
      let sma200: number | null = null;
      if (idx >= 199) {
        const sum = rawCandles.slice(idx - 199, idx + 1).reduce((acc, val) => acc + val.close, 0);
        sma200 = Number((sum / 200).toFixed(2));
      }
      return { ...c, sma20, sma50, sma200 };
    });

    const latest = candlesWithSma[candlesWithSma.length - 1];
    const prev = candlesWithSma.length >= 2 ? candlesWithSma[candlesWithSma.length - 2] : null;

    const price = latest.close;
    const priceChangePercent = prev ? Number((((latest.close - prev.close) / prev.close) * 100).toFixed(2)) : 0;

    // RSI 14 Wilder's Smooth Method
    let rsi14: number | null = null;
    if (candlesWithSma.length >= 15) {
      let gains = 0;
      let losses = 0;
      const rsiPeriod = 14;
      const initialSlice = candlesWithSma.slice(-100);

      if (initialSlice.length >= rsiPeriod + 1) {
        for (let i = 1; i <= rsiPeriod; i++) {
          const diff = initialSlice[i].close - initialSlice[i - 1].close;
          if (diff >= 0) gains += diff;
          else losses += Math.abs(diff);
        }
        let avgGain = gains / rsiPeriod;
        let avgLoss = losses / rsiPeriod;

        for (let i = rsiPeriod + 1; i < initialSlice.length; i++) {
          const diff = initialSlice[i].close - initialSlice[i - 1].close;
          const gain = diff >= 0 ? diff : 0;
          const loss = diff < 0 ? Math.abs(diff) : 0;
          avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
          avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
        }
        if (avgLoss === 0) rsi14 = 100;
        else rsi14 = Number((100 - (100 / (1 + avgGain / avgLoss))).toFixed(2));
      }
    }

    // MACD Status
    let macd: { macd: number; signal: number; histogram: number } | null = null;
    if (candlesWithSma.length >= 26) {
      const closes = candlesWithSma.map((c) => c.close);
      const calculateEMA = (vals: number[], period: number) => {
        const k = 2 / (period + 1);
        const ema: number[] = [vals[0]];
        for (let i = 1; i < vals.length; i++) {
          ema.push(vals[i] * k + ema[i - 1] * (1 - k));
        }
        return ema;
      };

      const ema12 = calculateEMA(closes, 12);
      const ema26 = calculateEMA(closes, 26);
      const macdLine = ema12.map((val, idx) => val - ema26[idx]);
      const signalLine = calculateEMA(macdLine, 9);

      const lMacd = macdLine[macdLine.length - 1];
      const lSignal = signalLine[signalLine.length - 1];
      macd = {
        macd: Number(lMacd.toFixed(3)),
        signal: Number(lSignal.toFixed(3)),
        histogram: Number((lMacd - lSignal).toFixed(3)),
      };
    }

    // MA Alignment
    let maAlignment: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish' = 'Neutral';
    const sma20 = latest.sma20 || null;
    const sma50 = latest.sma50 || null;
    let sma200 = latest.sma200 || null;

    if (!sma200 && candlesWithSma.length >= 200) {
      const slice200 = candlesWithSma.slice(-200);
      const sum200 = slice200.reduce((acc, c) => acc + c.close, 0);
      sma200 = Number((sum200 / 200).toFixed(2));
    }

    if (sma20 && sma50 && sma200) {
      if (price > sma20 && sma20 > sma50 && sma50 > sma200) maAlignment = 'Strong Bullish';
      else if (price > sma50 && sma50 > sma200) maAlignment = 'Bullish';
      else if (price < sma20 && sma20 < sma50 && sma50 < sma200) maAlignment = 'Strong Bearish';
      else if (price < sma50 && sma50 < sma200) maAlignment = 'Bearish';
    } else if (sma20 && sma50) {
      if (price > sma20 && sma20 > sma50) maAlignment = 'Strong Bullish';
      else if (price > sma50) maAlignment = 'Bullish';
      else if (price < sma20 && sma20 < sma50) maAlignment = 'Strong Bearish';
      else if (price < sma50) maAlignment = 'Bearish';
    }

    // Tech Score (-5 to +7)
    let techScore = 0;
    if (rsi14 !== null) {
      if (rsi14 < 35) techScore += 2;
      else if (rsi14 > 65) techScore -= 2;
    }
    if (sma20 && price > sma20) techScore += 1;
    if (sma50 && price > sma50) techScore += 1;
    if (sma200) {
      if (price > sma200) techScore += 2;
      else techScore -= 2;
    }
    if (macd && macd.histogram > 0) techScore += 1;
    else if (macd && macd.histogram < 0) techScore -= 1;

    return {
      symbol,
      companyName,
      price,
      priceChangePercent,
      rsi14,
      macd,
      maAlignment,
      techScore,
      sma20,
      sma50,
      sma200,
      candles: candlesWithSma,
      loading: false,
      error: null,
    };
  };

  // Mass fetch Yahoo Finance historical daily bars for all enabled tickers
  const loadAllTickersData = useCallback(async () => {
    if (activeTickersList.length === 0) return;
    setLoadingAllData(true);
    setGlobalError(null);

    const updatedMap: Record<string, TickerIndicators> = {};

    try {
      // We query historical price series (1 year to ensure SMA 200 calculates correctly)
      const now = new Date();
      const startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      await Promise.all(
        activeTickersList.map(async (ticker) => {
          try {
            const rawCandles = await fetchYahooData(ticker.symbol, startDate, endDate);
            const indicators = computeIndicatorsForCandles(ticker.symbol, ticker.company_name || ticker.symbol, rawCandles);
            updatedMap[ticker.symbol] = indicators;
          } catch (err: any) {
            console.error(`Error loading indicators for ${ticker.symbol}:`, err);
            updatedMap[ticker.symbol] = {
              symbol: ticker.symbol,
              companyName: ticker.company_name || ticker.symbol,
              price: 0,
              priceChangePercent: 0,
              rsi14: null,
              macd: null,
              maAlignment: 'Neutral',
              techScore: 0,
              sma20: null,
              sma50: null,
              sma200: null,
              candles: [],
              loading: false,
              error: err.message || 'Failed to fetch historical prices',
            };
          }
        })
      );

      setTickerIndicatorsMap(updatedMap);
    } catch (err: any) {
      setGlobalError(err.message || 'An unexpected error occurred loading technical matrix.');
    } finally {
      setLoadingAllData(false);
    }
  }, [activeTickersList]);

  useEffect(() => {
    loadAllTickersData();
  }, [loadAllTickersData]);

  // Robust Mathematical Signals mapping function (gets custom AI signal or computes fallback)
  const getTickerAISignal = useCallback((symbol: string, ind?: TickerIndicators) => {
    // 1. Return user custom triggered live Gemini signal if exists
    if (customAISignalsMap[symbol]) {
      return customAISignalsMap[symbol];
    }

    // 2. Otherwise generate highly accurate mathematical multi-horizon signal based on calculated indicators
    if (!ind || ind.price === 0) {
      return {
        overallSignal: 'HOLD',
        confidenceScore: 50,
        nextDay: { signal: 'HOLD', confidence: 50, priceTarget: 0, stopLoss: 0, primaryReasoning: 'Data loading...' },
        swing: { signal: 'HOLD', confidence: 50, priceTarget: 0, stopLoss: 0, primaryReasoning: 'Data loading...' },
        longTerm: { signal: 'HOLD', confidence: 50, priceTarget: 0, stopLoss: 0, primaryReasoning: 'Data loading...' },
        overallPreferredHorizon: 'Swing',
        overallPreferredHorizonConfidence: 50,
        newsAnalysisSummary: 'Awaiting execution of Gemini live model scanner.',
        riskDisclaimer: 'DISCLAIMER: Model based on pure technical indicator math fallbacks.',
      };
    }

    const price = ind.price;
    const rsi = ind.rsi14 ?? 50;
    const score = ind.techScore;

    // Next day signal rules
    let nextDaySignal: 'BUY' | 'HOLD' | 'SELL' | 'CAUTION' = 'HOLD';
    let nextDayConf = 55;
    if (rsi < 35) {
      nextDaySignal = 'BUY';
      nextDayConf = Math.min(92, Math.round(50 + (35 - rsi) * 2.5));
    } else if (rsi > 65) {
      nextDaySignal = 'SELL';
      nextDayConf = Math.min(92, Math.round(50 + (rsi - 65) * 2.5));
    } else if (score >= 3) {
      nextDaySignal = 'BUY';
      nextDayConf = 68;
    } else if (score <= -2) {
      nextDaySignal = 'SELL';
      nextDayConf = 65;
    } else if (rsi > 58 || rsi < 42) {
      nextDaySignal = 'CAUTION';
      nextDayConf = 58;
    }

    // Swing signal rules
    let swingSignal: 'BUY' | 'HOLD' | 'SELL' | 'CAUTION' = 'HOLD';
    let swingConf = 55;
    if (score >= 4) {
      swingSignal = 'BUY';
      swingConf = Math.min(95, 60 + score * 5);
    } else if (score <= -3) {
      swingSignal = 'SELL';
      swingConf = Math.min(95, 60 + Math.abs(score) * 5);
    } else if (ind.maAlignment === 'Bullish' || ind.maAlignment === 'Strong Bullish') {
      swingSignal = 'BUY';
      swingConf = 72;
    } else if (ind.maAlignment === 'Bearish' || ind.maAlignment === 'Strong Bearish') {
      swingSignal = 'SELL';
      swingConf = 70;
    } else if (score === 1 || score === -1) {
      swingSignal = 'CAUTION';
      swingConf = 60;
    }

    // Long term signal rules
    let longTermSignal: 'BUY' | 'HOLD' | 'SELL' | 'CAUTION' = 'HOLD';
    let longTermConf = 50;
    if (ind.sma200) {
      if (price > ind.sma200) {
        longTermSignal = 'BUY';
        longTermConf = ind.maAlignment === 'Strong Bullish' ? 88 : 78;
      } else {
        longTermSignal = 'SELL';
        longTermConf = ind.maAlignment === 'Strong Bearish' ? 85 : 74;
      }
    } else if (score >= 2) {
      longTermSignal = 'BUY';
      longTermConf = 65;
    } else if (score <= -2) {
      longTermSignal = 'SELL';
      longTermConf = 62;
    }

    // Best / Preferred Horizon recommendation
    let overallPreferredHorizon: 'Next-Day' | 'Swing' | 'Long-Term' = 'Swing';
    let overallPreferredHorizonConfidence = swingConf;

    if (nextDayConf > swingConf && nextDayConf > longTermConf) {
      overallPreferredHorizon = 'Next-Day';
      overallPreferredHorizonConfidence = nextDayConf;
    } else if (longTermConf > swingConf) {
      overallPreferredHorizon = 'Long-Term';
      overallPreferredHorizonConfidence = longTermConf;
    }

    const nextDayTarget = Number((price * (nextDaySignal === 'BUY' ? 1.018 : nextDaySignal === 'SELL' ? 0.982 : 1.002)).toFixed(2));
    const nextDayStop = Number((price * (nextDaySignal === 'BUY' ? 0.991 : nextDaySignal === 'SELL' ? 1.009 : 0.994)).toFixed(2));

    const swingTarget = Number((price * (swingSignal === 'BUY' ? 1.09 : swingSignal === 'SELL' ? 0.91 : 1.01)).toFixed(2));
    const swingStop = Number((price * (swingSignal === 'BUY' ? 0.948 : swingSignal === 'SELL' ? 1.052 : 0.978)).toFixed(2));

    const longTermTarget = Number((price * (longTermSignal === 'BUY' ? 1.28 : longTermSignal === 'SELL' ? 0.72 : 1.02)).toFixed(2));
    const longTermStop = Number((price * (longTermSignal === 'BUY' ? 0.84 : longTermSignal === 'SELL' ? 1.16 : 0.915)).toFixed(2));

    const overallSignal = score >= 3 ? 'BUY' : score <= -2 ? 'SELL' : 'HOLD';

    return {
      overallSignal,
      confidenceScore: Math.max(nextDayConf, swingConf, longTermConf),
      nextDay: {
        signal: nextDaySignal,
        confidence: nextDayConf,
        priceTarget: nextDayTarget,
        stopLoss: nextDayStop,
        primaryReasoning: `Short-term posture is driven by momentum metrics. RSI trades at ${rsi.toFixed(1)} and the technical composite score stands at ${score > 0 ? '+' : ''}${score}.`,
      },
      swing: {
        signal: swingSignal,
        confidence: swingConf,
        priceTarget: swingTarget,
        stopLoss: swingStop,
        primaryReasoning: `Medium-term outlook shows trend characteristics. The moving averages alignment is configured as ${ind.maAlignment} with 20/50 SMA crossovers active.`,
      },
      longTerm: {
        signal: longTermSignal,
        confidence: longTermConf,
        priceTarget: longTermTarget,
        stopLoss: longTermStop,
        primaryReasoning: `Long-term posture is validated against the 200-day boundary ($${ind.sma200 || 'N/A'}). Currently trading ${price > (ind.sma200 || 0) ? 'above' : 'below'} this major indicator.`,
      },
      overallPreferredHorizon,
      overallPreferredHorizonConfidence,
      newsAnalysisSummary: 'Quantitative mathematical technical indicators suggest clear horizon support bounds.',
      riskDisclaimer: 'DISCLAIMER: Non-discretionary mathematical signal mapping model. Not personal advice.',
    };
  }, [customAISignalsMap]);

  // Execute Gemini AI Analysis for current active ticker
  const handleAnalyzeAIForTicker = async (symbol: string) => {
    const activeData = tickerIndicatorsMap[symbol];
    if (!activeData || activeData.candles.length === 0) return;

    setLoadingAI(true);
    setAiError(null);

    try {
      const latestInd = {
        price: activeData.price,
        open: activeData.candles[activeData.candles.length - 1].open,
        high: activeData.candles[activeData.candles.length - 1].high,
        low: activeData.candles[activeData.candles.length - 1].low,
        volume: activeData.candles[activeData.candles.length - 1].volume,
        date: activeData.candles[activeData.candles.length - 1].date,
        sma20: activeData.sma20,
        sma50: activeData.sma50,
        sma200: activeData.sma200,
        rsi14: activeData.rsi14,
        macd: activeData.macd,
      };

      const response = await fetchAISignalAnalysis(symbol, activeData.candles, latestInd);
      
      // Inject Preferred Horizon logic into AI Response
      let overallPreferredHorizon: 'Next-Day' | 'Swing' | 'Long-Term' = 'Swing';
      let overallPreferredHorizonConfidence = response.swing?.confidence || response.confidenceScore || 70;

      const ndConf = response.nextDay?.confidence || 0;
      const swConf = response.swing?.confidence || 0;
      const ltConf = response.longTerm?.confidence || 0;

      if (ndConf > swConf && ndConf > ltConf) {
        overallPreferredHorizon = 'Next-Day';
        overallPreferredHorizonConfidence = ndConf;
      } else if (ltConf > swConf) {
        overallPreferredHorizon = 'Long-Term';
        overallPreferredHorizonConfidence = ltConf;
      }

      const parsedWithPreferred = {
        ...response,
        overallPreferredHorizon,
        overallPreferredHorizonConfidence,
      };

      setCustomAISignalsMap(prev => ({
        ...prev,
        [symbol]: parsedWithPreferred
      }));
    } catch (err: any) {
      console.error('Failed to run AI Signal Engine:', err);
      setAiError(err.message || 'Failed to complete AI decision model.');
    } finally {
      setLoadingAI(false);
    }
  };

  // Run multi-horizon AI analysis on all active tickers
  const handleAnalyzeAllAI = async () => {
    const tickersToAnalyze = activeTickersList.filter(t => {
      const ind = tickerIndicatorsMap[t.symbol];
      return ind && ind.candles && ind.candles.length > 0;
    });

    if (tickersToAnalyze.length === 0) {
      setGlobalError("No active tickers have loaded price history yet. Please wait for the screener to finish syncing.");
      return;
    }

    setLoadingBatchAI(true);
    setBatchAISummary(null);
    setBatchAIProgress(`0 / ${tickersToAnalyze.length}`);

    let successCount = 0;
    let buyCount = 0;
    let holdCount = 0;
    let sellCount = 0;
    let cautionCount = 0;

    for (let i = 0; i < tickersToAnalyze.length; i++) {
      const ticker = tickersToAnalyze[i];
      setBatchAIProgress(`${i + 1} / ${tickersToAnalyze.length}`);

      const activeData = tickerIndicatorsMap[ticker.symbol];
      if (!activeData) continue;

      try {
        const latestInd = {
          price: activeData.price,
          open: activeData.candles[activeData.candles.length - 1].open,
          high: activeData.candles[activeData.candles.length - 1].high,
          low: activeData.candles[activeData.candles.length - 1].low,
          volume: activeData.candles[activeData.candles.length - 1].volume,
          date: activeData.candles[activeData.candles.length - 1].date,
          sma20: activeData.sma20,
          sma50: activeData.sma50,
          sma200: activeData.sma200,
          rsi14: activeData.rsi14,
          macd: activeData.macd,
        };

        const response = await fetchAISignalAnalysis(ticker.symbol, activeData.candles, latestInd);

        // Inject Preferred Horizon logic into AI Response
        let overallPreferredHorizon: 'Next-Day' | 'Swing' | 'Long-Term' = 'Swing';
        let overallPreferredHorizonConfidence = response.swing?.confidence || response.confidenceScore || 70;

        const ndConf = response.nextDay?.confidence || 0;
        const swConf = response.swing?.confidence || 0;
        const ltConf = response.longTerm?.confidence || 0;

        if (ndConf > swConf && ndConf > ltConf) {
          overallPreferredHorizon = 'Next-Day';
          overallPreferredHorizonConfidence = ndConf;
        } else if (ltConf > swConf) {
          overallPreferredHorizon = 'Long-Term';
          overallPreferredHorizonConfidence = ltConf;
        }

        const parsedWithPreferred = {
          ...response,
          overallPreferredHorizon,
          overallPreferredHorizonConfidence,
        };

        // Increment stats
        const stance = response.overallSignal || 'HOLD';
        if (stance === 'BUY') buyCount++;
        else if (stance === 'SELL') sellCount++;
        else if (stance === 'CAUTION') cautionCount++;
        else holdCount++;

        successCount++;

        // Update map progressively
        setCustomAISignalsMap(prev => ({
          ...prev,
          [ticker.symbol]: parsedWithPreferred
        }));

        // Tiny delay of 50ms to be safe with rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        console.warn(`[Batch AI] Failed ticker ${ticker.symbol}:`, err);
      }
    }

    setLoadingBatchAI(false);
    setBatchAIProgress('');
    setBatchAISummary(`${buyCount} BUY | ${holdCount} HOLD | ${sellCount} SELL ${cautionCount > 0 ? `| ${cautionCount} CAUTION` : ''}`);
  };

  // Helper to color signal badges (BUY / HOLD / SELL / CAUTION)
  const renderCellSignalBadge = (signal: 'BUY' | 'HOLD' | 'SELL' | 'CAUTION', confidence: number) => {
    let classes = 'bg-slate-800 text-slate-300 border border-slate-700';
    if (signal === 'BUY') {
      classes = 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60';
    } else if (signal === 'SELL') {
      classes = 'bg-rose-950/80 text-rose-400 border border-rose-800/60';
    } else if (signal === 'CAUTION') {
      classes = 'bg-amber-950/80 text-amber-400 border border-amber-800/60';
    }

    return (
      <div className="flex items-center">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${classes}`}>
          {signal}
        </span>
        <span className="text-[10px] font-bold text-slate-400 font-mono ml-1.5">{confidence}%</span>
      </div>
    );
  };

  // Full detailed AI state selector for inspection drawer
  const activeTickerIndicators = useMemo(() => {
    return tickerIndicatorsMap[activeTicker] || null;
  }, [tickerIndicatorsMap, activeTicker]);

  const activeTickerAISignal = useMemo(() => {
    return getTickerAISignal(activeTicker, activeTickerIndicators || undefined);
  }, [getTickerAISignal, activeTicker, activeTickerIndicators]);

  // Compute filtered rows
  const filteredTickers = useMemo(() => {
    return activeTickersList.filter((t) => {
      const indicators = tickerIndicatorsMap[t.symbol];
      
      // A. Text Search filter
      const searchMatch = searchQuery.trim() === '' || 
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.company_name && t.company_name.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!searchMatch) return false;

      // B. RSI filters
      if (rsiFilterPreset !== 'all' && indicators) {
        const rsi = indicators.rsi14;
        if (rsi === null) return false;
        if (rsiFilterPreset === 'oversold' && rsi >= 35) return false;
        if (rsiFilterPreset === 'overbought' && rsi <= 65) return false;
        if (rsiFilterPreset === 'neutral' && (rsi < 35 || rsi > 65)) return false;
      }

      // C. Tech Score filters
      if (techScoreFilterPreset !== 'all' && indicators) {
        const score = indicators.techScore;
        if (techScoreFilterPreset === 'bullish' && score < 3) return false;
        if (techScoreFilterPreset === 'bearish' && score >= 0) return false;
      }

      // D. AI Stance filters
      if (aiStanceFilterPreset !== 'all') {
        const sigObj = getTickerAISignal(t.symbol, indicators);
        if (aiStanceFilterPreset !== sigObj.overallSignal && aiStanceFilterPreset !== sigObj.nextDay.signal) {
          // If neither overall stance nor next-day matches
          return false;
        }
      }

      return true;
    });
  }, [activeTickersList, tickerIndicatorsMap, searchQuery, rsiFilterPreset, techScoreFilterPreset, aiStanceFilterPreset, getTickerAISignal]);

  // Sorting Handler
  const handleSort = useCallback((field: 'ticker' | 'price' | 'rsi' | 'macd' | 'ma' | 'score' | 'nextDay' | 'swing' | 'longTerm' | 'horizon') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to descending
    }
  }, [sortField]);

  // Compute sorted rows
  const sortedTickers = useMemo(() => {
    const list = [...filteredTickers];
    if (!sortField) return list;

    list.sort((a, b) => {
      const indA = tickerIndicatorsMap[a.symbol];
      const indB = tickerIndicatorsMap[b.symbol];
      
      let valA: any = null;
      let valB: any = null;

      if (sortField === 'ticker') {
        valA = a.symbol;
        valB = b.symbol;
      } else if (sortField === 'price') {
        valA = indA ? indA.price : 0;
        valB = indB ? indB.price : 0;
      } else if (sortField === 'rsi') {
        valA = indA && indA.rsi14 !== null ? indA.rsi14 : -1;
        valB = indB && indB.rsi14 !== null ? indB.rsi14 : -1;
      } else if (sortField === 'macd') {
        valA = indA && indA.macd ? indA.macd.histogram : -999;
        valB = indB && indB.macd ? indB.macd.histogram : -999;
      } else if (sortField === 'ma') {
        const maRank: Record<string, number> = {
          'Strong Bearish': 1,
          'Bearish': 2,
          'Neutral': 3,
          'Bullish': 4,
          'Strong Bullish': 5,
        };
        valA = indA ? (maRank[indA.maAlignment] || 3) : 3;
        valB = indB ? (maRank[indB.maAlignment] || 3) : 3;
      } else if (sortField === 'score') {
        valA = indA ? indA.techScore : -99;
        valB = indB ? indB.techScore : -99;
      } else if (sortField === 'nextDay') {
        const sigA = getTickerAISignal(a.symbol, indA);
        const sigB = getTickerAISignal(b.symbol, indB);
        const sigRank: Record<string, number> = { 'SELL': 1, 'CAUTION': 2, 'HOLD': 3, 'BUY': 4 };
        valA = (sigRank[sigA.nextDay.signal] || 0) * 1000 + (sigA.nextDay.confidence || 0);
        valB = (sigRank[sigB.nextDay.signal] || 0) * 1000 + (sigB.nextDay.confidence || 0);
      } else if (sortField === 'swing') {
        const sigA = getTickerAISignal(a.symbol, indA);
        const sigB = getTickerAISignal(b.symbol, indB);
        const sigRank: Record<string, number> = { 'SELL': 1, 'CAUTION': 2, 'HOLD': 3, 'BUY': 4 };
        valA = (sigRank[sigA.swing.signal] || 0) * 1000 + (sigA.swing.confidence || 0);
        valB = (sigRank[sigB.swing.signal] || 0) * 1000 + (sigB.swing.confidence || 0);
      } else if (sortField === 'longTerm') {
        const sigA = getTickerAISignal(a.symbol, indA);
        const sigB = getTickerAISignal(b.symbol, indB);
        const sigRank: Record<string, number> = { 'SELL': 1, 'CAUTION': 2, 'HOLD': 3, 'BUY': 4 };
        valA = (sigRank[sigA.longTerm.signal] || 0) * 1000 + (sigA.longTerm.confidence || 0);
        valB = (sigRank[sigB.longTerm.signal] || 0) * 1000 + (sigB.longTerm.confidence || 0);
      } else if (sortField === 'horizon') {
        const sigA = getTickerAISignal(a.symbol, indA);
        const sigB = getTickerAISignal(b.symbol, indB);
        valA = sigA.overallPreferredHorizon || 'Swing';
        valB = sigB.overallPreferredHorizon || 'Swing';
      }

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      let res = 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        res = valA.localeCompare(valB);
      } else {
        res = valA < valB ? -1 : 1;
      }

      return sortDirection === 'asc' ? res : -res;
    });

    return list;
  }, [filteredTickers, sortField, sortDirection, tickerIndicatorsMap, getTickerAISignal]);

  // SVG Chart rendering calculations for Selected Ticker Detail Card
  const detailSvgChart = useMemo(() => {
    if (!activeTickerIndicators || activeTickerIndicators.candles.length === 0) return null;

    // Viewport coords
    const width = 640;
    const height = 220;
    const paddingLeft = 50;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Filter candles based on selected detail chart timeframe
    let startIdx = 0;
    const totalCandles = activeTickerIndicators.candles.length;
    if (chartTimeframe === '3m') startIdx = Math.max(0, totalCandles - 90);
    else if (chartTimeframe === '6m') startIdx = Math.max(0, totalCandles - 180);
    else startIdx = Math.max(0, totalCandles - 365);

    const activeCandles = activeTickerIndicators.candles.slice(startIdx);

    const closes = activeCandles.map((c) => c.close);
    const highs = activeCandles.map((c) => c.high);
    const lows = activeCandles.map((c) => c.low);
    const smas = activeCandles.flatMap((c) => [c.sma20, c.sma50, c.sma200].filter((v): v is number => typeof v === 'number'));

    const minVal = Math.min(...lows, ...smas) * 0.99;
    const maxVal = Math.max(...highs, ...smas) * 1.01;
    const range = maxVal - minVal;

    const getX = (idx: number) => paddingLeft + (idx / (activeCandles.length - 1)) * chartWidth;
    const getY = (v: number) => height - paddingBottom - ((v - minVal) / range) * chartHeight;

    const renderedCandles = activeCandles.map((c, idx) => {
      const isBull = c.close >= c.open;
      const x = getX(idx);
      const yClose = getY(c.close);
      const yOpen = getY(c.open);
      const yHigh = getY(c.high);
      const yLow = getY(c.low);

      const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
      const bodyY = Math.min(yClose, yOpen);
      const cWidth = Math.max(1.5, Math.min(5, (chartWidth / activeCandles.length) * 0.6));

      return (
        <g key={idx}>
          <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={isBull ? '#34d399' : '#f87171'} strokeWidth={1} />
          <rect x={x - cWidth / 2} y={bodyY} width={cWidth} height={bodyHeight} fill={isBull ? '#10b981' : '#f43f5e'} />
        </g>
      );
    });

    // SMA lines paths
    const drawLine = (key: 'sma20' | 'sma50' | 'sma200') => {
      let d = '';
      let isFirst = true;
      activeCandles.forEach((c, idx) => {
        const val = c[key];
        if (typeof val === 'number') {
          const x = getX(idx);
          const y = getY(val);
          if (isFirst) {
            d = `M ${x} ${y}`;
            isFirst = false;
          } else {
            d += ` L ${x} ${y}`;
          }
        }
      });
      return d;
    };

    const sma20Path = drawLine('sma20');
    const sma50Path = drawLine('sma50');
    const sma200Path = drawLine('sma200');

    // Grid lines
    const gridLines: React.ReactNode[] = [];
    for (let i = 0; i < 4; i++) {
      const val = minVal + (i / 3) * range;
      const y = getY(val);
      gridLines.push(
        <g key={i}>
          <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#1e293b" strokeWidth={1} strokeDasharray="3 3" />
          <text x={paddingLeft - 6} y={y + 3} className="text-[9px] fill-slate-500 font-mono text-right" textAnchor="end">
            ${val.toFixed(1)}
          </text>
        </g>
      );
    }

    // Dates
    const dates: React.ReactNode[] = [];
    const stride = Math.floor(activeCandles.length / 4);
    for (let i = 0; i < 4; i++) {
      const idx = Math.min(activeCandles.length - 1, i * stride);
      const c = activeCandles[idx];
      const x = getX(idx);
      dates.push(
        <text key={i} x={x} y={height - 8} className="text-[9px] fill-slate-500 font-mono" textAnchor="middle">
          {new Date(c.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>
      );
    }

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full select-none">
        {gridLines}
        {renderedCandles}
        {sma20Path && <path d={sma20Path} fill="none" stroke="#6366f1" strokeWidth={1.5} />}
        {sma50Path && <path d={sma50Path} fill="none" stroke="#eab308" strokeWidth={1.5} />}
        {sma200Path && <path d={sma200Path} fill="none" stroke="#f43f5e" strokeWidth={1.5} />}
        {dates}
      </svg>
    );
  }, [activeTickerIndicators, chartTimeframe]);

  return (
    <div className="space-y-6 text-slate-100 bg-slate-950 p-6 rounded-3xl border border-slate-900 shadow-2xl" id="technical-signals-view-root">
      
      {/* Pinned custom scrollbars injection */}
      <style dangerouslySetInnerHTML={{__html: `
        .scrollbar-custom::-webkit-scrollbar {
          height: 6px;
          width: 6px;
        }
        .scrollbar-custom::-webkit-scrollbar-track {
          background: #020617;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb {
          background: #1e293b;
          border-radius: 3px;
        }
        .scrollbar-custom::-webkit-scrollbar-thumb:hover {
          background: #334155;
        }
      `}} />

      {/* 1. Header segment */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-900 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-black text-white tracking-tight uppercase">
              QuantSignal AI Technical Terminal
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Institutional-grade multi-horizon trade recommendations. Combining Wilder's RSI, MACD histograms, moving averages stacking, and real-time news scans.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs text-slate-400 text-right hidden lg:block mr-2">
            <span className="block">Active Tracked Assets: <strong className="text-white font-mono">{activeTickersList.length}</strong></span>
            <span className="block text-[10px] text-indigo-400 font-bold">GEMINI DECISION MODEL ACTIVE</span>
          </div>

          {/* Global Run Gemini AI Signal Button */}
          <button
            onClick={handleAnalyzeAllAI}
            disabled={loadingBatchAI || loadingAllData || activeTickersList.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-black bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl shadow-lg shadow-indigo-600/30 border border-indigo-500 transition cursor-pointer uppercase tracking-wider min-w-[200px] justify-center"
          >
            {loadingBatchAI ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white shrink-0" />
                <span>Analyzing {batchAIProgress}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-200 shrink-0" />
                <span>Run Gemini AI Signal</span>
              </>
            )}
          </button>

          <button
            onClick={loadAllTickersData}
            disabled={loadingAllData || loadingBatchAI}
            className="flex items-center gap-2 px-3.5 py-2.5 text-xs font-extrabold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 rounded-xl border border-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingAllData ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh Screener</span>
          </button>
        </div>
      </div>

      {globalError && (
        <div className="p-4 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div>
            <div className="font-bold">Screener Synchronization Failure</div>
            <div>{globalError}</div>
          </div>
        </div>
      )}

      {batchAISummary && (
        <div className="p-4 bg-indigo-950/40 border border-indigo-800/50 rounded-2xl text-indigo-300 text-xs flex items-center justify-between gap-2 shadow-lg shadow-indigo-500/5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="font-extrabold text-white uppercase tracking-wider text-[10px]">Gemini Batch Run Succeeded</div>
              <div className="text-slate-300 font-mono mt-0.5">Completed batch scan: {batchAISummary}</div>
            </div>
          </div>
          <button 
            onClick={() => setBatchAISummary(null)}
            className="text-slate-500 hover:text-white transition p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Interactive Table & Live Charts Side-by-Side layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Component: Master Summary Table */}
        <div className="xl:col-span-2 space-y-4">
          
          {/* Table Toolbar & Filtering Matrix */}
          <div className="bg-slate-900/60 border border-slate-900 p-4 rounded-2xl flex flex-col gap-3">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              
              {/* Search Ticker Input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Quick Search Symbol..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 font-mono"
                />
              </div>

              {/* RSI Filters Dropdown */}
              <select
                value={rsiFilterPreset}
                onChange={(e: any) => setRsiFilterPreset(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">RSI Status: All</option>
                <option value="oversold">RSI: Oversold (&lt; 35)</option>
                <option value="overbought">RSI: Overbought (&gt; 65)</option>
                <option value="neutral">RSI: Neutral (35 - 65)</option>
              </select>

              {/* Tech Score Filters Dropdown */}
              <select
                value={techScoreFilterPreset}
                onChange={(e: any) => setTechScoreFilterPreset(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">Tech Score: All</option>
                <option value="bullish">Tech Score: Bullish (&ge; +3)</option>
                <option value="bearish">Tech Score: Bearish (Negative)</option>
              </select>

              {/* AI Stance Filters Dropdown */}
              <select
                value={aiStanceFilterPreset}
                onChange={(e: any) => setAiStanceFilterPreset(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">AI Stance: All</option>
                <option value="BUY">Stance: BUY</option>
                <option value="HOLD">Stance: HOLD</option>
                <option value="SELL">Stance: SELL</option>
                <option value="CAUTION">Stance: CAUTION</option>
              </select>

            </div>

            {/* Total count indicator */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
              <span>Showing <strong>{filteredTickers.length}</strong> of <strong>{activeTickersList.length}</strong> enabled watchlist symbols</span>
              {(searchQuery || rsiFilterPreset !== 'all' || techScoreFilterPreset !== 'all' || aiStanceFilterPreset !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setRsiFilterPreset('all');
                    setTechScoreFilterPreset('all');
                    setAiStanceFilterPreset('all');
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-extrabold cursor-pointer"
                >
                  Clear Active Filters
                </button>
              )}
            </div>

          </div>

          {/* Master summary screener table with multi-horizon rendering */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl overflow-hidden">
            
            {loadingAllData ? (
              <div className="py-24 text-center space-y-4">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                <div className="text-sm font-bold text-slate-300">Synchronizing database cache values...</div>
                <p className="text-xs text-slate-500">Calculating technical scores and multi-horizon targets for enabled assets</p>
              </div>
            ) : filteredTickers.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <SlidersHorizontal className="w-8 h-8 text-slate-600 mx-auto" />
                <div className="text-sm font-bold text-slate-300">No screener rows match criteria</div>
                <p className="text-xs text-slate-500">Try modifying active filter drop-downs or add new tickers in manager.</p>
              </div>
            ) : (
              <div className="overflow-x-auto scrollbar-custom">
                <table className="w-full text-left border-collapse min-w-[1150px]">
                  
                  {/* Table Header matching screenshots precisely */}
                  <thead>
                    <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-wider select-none">
                      <th 
                        onClick={() => handleSort('ticker')}
                        className="py-3 px-4 font-black sticky left-0 bg-slate-900 border-r border-slate-800/80 z-20 w-[140px] min-w-[140px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Ticker</span>
                          {sortField === 'ticker' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>
                      
                      <th 
                        onClick={() => handleSort('price')}
                        className="py-3 px-3 font-black min-w-[100px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <span>Price / 1D %</span>
                          {sortField === 'price' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('rsi')}
                        className="py-3 px-3 font-black min-w-[85px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>RSI (14)</span>
                          {sortField === 'rsi' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('macd')}
                        className="py-3 px-3 font-black min-w-[110px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>MACD Status</span>
                          {sortField === 'macd' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('ma')}
                        className="py-3 px-3 font-black min-w-[120px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>MA Alignment</span>
                          {sortField === 'ma' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('score')}
                        className="py-3 px-2 font-black min-w-[80px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Tech Score</span>
                          {sortField === 'score' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('nextDay')}
                        className="py-3 px-2 font-black min-w-[135px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Next-Day</span>
                          {sortField === 'nextDay' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('swing')}
                        className="py-3 px-2 font-black min-w-[135px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Swing (1-4w)</span>
                          {sortField === 'swing' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('longTerm')}
                        className="py-3 px-2 font-black min-w-[135px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span>Long-Term (3m+)</span>
                          {sortField === 'longTerm' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>

                      <th 
                        onClick={() => handleSort('horizon')}
                        className="py-3 px-3 font-black text-center bg-indigo-950/20 border-l border-indigo-900/60 min-w-[125px] cursor-pointer hover:text-white transition-colors"
                      >
                        <div className="flex items-center justify-center gap-1.5">
                          <span>Preferred Horizon</span>
                          {sortField === 'horizon' ? (
                            sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-400 shrink-0" /> : <ArrowDown className="w-3 h-3 text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-40 shrink-0" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-slate-900 text-xs">
                    {sortedTickers.map((t) => {
                      const indicators = tickerIndicatorsMap[t.symbol];
                      const active = activeTicker === t.symbol;
                      const ai = getTickerAISignal(t.symbol, indicators);
 
                      // Calculate change direction styling
                      const isUp = (indicators?.priceChangePercent ?? 0) >= 0;
 
                      return (
                        <tr
                          key={t.id}
                          onClick={() => {
                            setActiveTicker(t.symbol);
                            onSelectTicker(t.symbol);
                          }}
                          className={`group hover:bg-slate-900/40 transition-colors cursor-pointer border-b border-slate-900 ${
                            active ? 'bg-slate-900/60' : ''
                          }`}
                        >
                          
                          {/* Symbol Column */}
                          <td className={`py-3 px-4 sticky left-0 border-r border-slate-800/80 z-10 transition-colors ${
                            active ? 'bg-slate-900 border-l-2 border-l-indigo-500 pl-3.5' : 'bg-slate-950 pl-4 group-hover:bg-slate-900/80'
                          }`}>
                            <div className="font-black text-white group-hover:text-indigo-400 transition-colors font-mono tracking-wider text-sm flex items-center gap-1.5">
                              {t.symbol}
                              {customAISignalsMap[t.symbol] && (
                                <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" title="Gemini Live Scanned" />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 max-w-[110px] truncate font-medium" title={t.company_name}>
                              {t.company_name || t.symbol}
                            </div>
                          </td>
 
                          {/* Price Column */}
                          <td className="py-3 px-3 text-right">
                            {indicators && indicators.price > 0 ? (
                              <>
                                <div className="font-bold font-mono text-slate-100">${indicators.price.toFixed(2)}</div>
                                <div className={`text-[10px] font-bold font-mono flex items-center justify-end ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isUp ? '+' : ''}{indicators.priceChangePercent}%
                                </div>
                              </>
                            ) : (
                              <span className="text-slate-600 font-mono">N/A</span>
                            )}
                          </td>
 
                          {/* RSI Column */}
                          <td className="py-3 px-3 text-center">
                            {indicators && indicators.rsi14 !== null ? (
                              <div className="inline-block">
                                <div className="font-bold font-mono text-slate-100">{indicators.rsi14.toFixed(1)}</div>
                                <div className="mt-0.5">
                                  {indicators.rsi14 < 35 ? (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-950 text-emerald-400 border border-emerald-900/40">OVERSOLD</span>
                                  ) : indicators.rsi14 > 65 ? (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-950 text-rose-400 border border-rose-900/40">OVERBOUGHT</span>
                                  ) : (
                                    <span className="px-1 py-0.5 rounded text-[8px] font-black bg-slate-800 text-slate-400 border border-slate-700">NEUTRAL</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-600 font-mono">N/A</span>
                            )}
                          </td>
 
                          {/* MACD Column */}
                          <td className="py-3 px-3">
                            {indicators && indicators.macd ? (
                              <div>
                                <span className={`text-[10px] font-black uppercase ${indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {indicators.macd.histogram >= 0 ? 'Bullish' : 'Bearish'}
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono ml-1.5">
                                  ({indicators.macd.histogram > 0 ? '+' : ''}{indicators.macd.histogram.toFixed(2)})
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-600">N/A</span>
                            )}
                          </td>
 
                          {/* MA Alignment Column */}
                          <td className="py-3 px-3">
                            {indicators ? (
                              <span className={`text-[10px] font-black uppercase ${
                                indicators.maAlignment.includes('Strong Bullish') ? 'text-emerald-400' :
                                indicators.maAlignment.includes('Bullish') ? 'text-emerald-500/80' :
                                indicators.maAlignment.includes('Strong Bearish') ? 'text-rose-400' :
                                indicators.maAlignment.includes('Bearish') ? 'text-rose-500/80' : 'text-slate-400'
                              }`}>
                                {indicators.maAlignment}
                              </span>
                            ) : (
                              <span className="text-slate-600">N/A</span>
                            )}
                          </td>
 
                          {/* Tech Score Column */}
                          <td className="py-3 px-2 text-center">
                            {indicators ? (
                              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black font-mono text-xs ${
                                indicators.techScore >= 3 ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40' :
                                indicators.techScore < 0 ? 'bg-rose-950/80 text-rose-400 border border-rose-800/40' :
                                'bg-slate-850 text-slate-300 border border-slate-800'
                              }`}>
                                {indicators.techScore > 0 ? '+' : ''}{indicators.techScore}
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono">N/A</span>
                            )}
                          </td>
 
                          {/* Next-Day Cell (Redesigned) */}
                          <td className="py-3 px-2">
                            <div className="space-y-1">
                              {renderCellSignalBadge(ai.nextDay.signal, ai.nextDay.confidence)}
                              <div className="text-[9.5px] text-slate-400 leading-none whitespace-nowrap">
                                {ai.nextDay.priceTarget > 0 ? (
                                  <>
                                    <span className="text-emerald-400/90 font-bold font-mono">T: ${ai.nextDay.priceTarget.toFixed(2)}</span>
                                    <span className="text-rose-400/90 font-bold font-mono ml-1.5">S: ${ai.nextDay.stopLoss.toFixed(2)}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-600 font-mono">Calculating...</span>
                                )}
                              </div>
                            </div>
                          </td>
 
                          {/* Swing Cell (Redesigned) */}
                          <td className="py-3 px-2">
                            <div className="space-y-1">
                              {renderCellSignalBadge(ai.swing.signal, ai.swing.confidence)}
                              <div className="text-[9.5px] text-slate-400 leading-none whitespace-nowrap">
                                {ai.swing.priceTarget > 0 ? (
                                  <>
                                    <span className="text-emerald-400/90 font-bold font-mono">T: ${ai.swing.priceTarget.toFixed(2)}</span>
                                    <span className="text-rose-400/90 font-bold font-mono ml-1.5">S: ${ai.swing.stopLoss.toFixed(2)}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-600 font-mono">Calculating...</span>
                                )}
                              </div>
                            </div>
                          </td>
 
                          {/* Long-Term Cell (Redesigned) */}
                          <td className="py-3 px-2">
                            <div className="space-y-1">
                              {renderCellSignalBadge(ai.longTerm.signal, ai.longTerm.confidence)}
                              <div className="text-[9.5px] text-slate-400 leading-none whitespace-nowrap">
                                {ai.longTerm.priceTarget > 0 ? (
                                  <>
                                    <span className="text-emerald-400/90 font-bold font-mono">T: ${ai.longTerm.priceTarget.toFixed(2)}</span>
                                    <span className="text-rose-400/90 font-bold font-mono ml-1.5">S: ${ai.longTerm.stopLoss.toFixed(2)}</span>
                                  </>
                                ) : (
                                  <span className="text-slate-600 font-mono">Calculating...</span>
                                )}
                              </div>
                            </div>
                          </td>
 
                          {/* Best Horizon Cell (Preferred Horizon - High-Visual Weight Highlight) */}
                          <td className="py-3 px-4 bg-indigo-950/20 border-l border-indigo-900/60 text-center">
                            <div className="bg-indigo-950/60 border border-indigo-800/40 rounded-xl px-2.5 py-1.5 shadow-xs shadow-indigo-500/10 text-center space-y-0.5 max-w-[120px] mx-auto">
                              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-wider block">
                                {ai.overallPreferredHorizon || 'Swing'}
                              </span>
                              <span className="text-xs font-black text-white font-mono block">
                                {ai.overallPreferredHorizonConfidence || ai.confidenceScore}% Conf
                              </span>
                            </div>
                          </td>
 
                        </tr>
                      );
                    })}
                  </tbody>
 
                </table>
              </div>
            )}

          </div>

        </div>

        {/* Right Component: Diagnostic Live Charts & AI Explanation Panel */}
        <div className="space-y-6">
          
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-5">
            
            {/* Header of details inspection pane */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest font-mono">AI Terminal Diagnostic Panel</span>
                <h3 className="text-lg font-black text-white font-mono tracking-wider">
                  ${activeTicker} Inspections
                </h3>
              </div>

              {customAISignalsMap[activeTicker] ? (
                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-950 text-indigo-300 border border-indigo-800/60 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>GEMINI OK</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[9px] font-black bg-slate-800 text-slate-400 border border-slate-700">
                  FALLBACK MATH
                </span>
              )}
            </div>

            {activeTickerIndicators ? (
              <div className="space-y-5">
                
                {/* Timeframe Selector & Candle Plot */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>OHLC Daily + Moving Averages</span>
                    <div className="flex bg-slate-950 rounded-lg p-0.5 border border-slate-800">
                      {(['3m', '6m', '1y'] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setChartTimeframe(tf)}
                          className={`px-2 py-0.5 text-[9px] font-black rounded transition-all cursor-pointer ${
                            chartTimeframe === tf ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {tf.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="h-44 w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden relative flex items-center justify-center p-2">
                    {activeTickerIndicators.loading ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
                    ) : activeTickerIndicators.error ? (
                      <span className="text-rose-400 text-[11px] px-4 text-center">{activeTickerIndicators.error}</span>
                    ) : (
                      detailSvgChart
                    )}
                  </div>
                </div>

                {/* Calculations status overview */}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 font-mono bg-slate-950/60 border border-slate-800/80 p-3 rounded-xl">
                  <div>
                    <span className="text-slate-500">SMA 20:</span> <strong className="text-white">${activeTickerIndicators.sma20?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">SMA 50:</span> <strong className="text-white">${activeTickerIndicators.sma50?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">SMA 200:</span> <strong className="text-white">${activeTickerIndicators.sma200?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">1D Vol:</span> <strong className="text-white">{(activeTickerIndicators.candles[activeTickerIndicators.candles.length - 1]?.volume / 1000000).toFixed(2)}M</strong>
                  </div>
                </div>

                {/* Run Gemini Trigger Button */}
                <div className="space-y-3">
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Trigger Google Gemini AI models to analyze combined technical indicator structures alongside RSS News sentiments for enhanced multi-horizon confidence weights.
                  </p>

                  <button
                    onClick={() => handleAnalyzeAIForTicker(activeTicker)}
                    disabled={loadingAI || activeTickerIndicators.candles.length === 0}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 font-black text-xs text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-xl shadow-lg shadow-indigo-500/20 transition cursor-pointer uppercase tracking-wider"
                  >
                    {loadingAI ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-300" />
                        <span>Running Joint Matrix...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                        <span>Run Gemini AI Signal</span>
                      </>
                    )}
                  </button>
                </div>

                {/* AI / Fallback Decisive Targets Block */}
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  
                  <div className="flex items-center justify-between bg-slate-950/40 p-2 border border-slate-800/60 rounded-xl">
                    <div>
                      <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Overall Stance</span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-black rounded-lg ${
                        activeTickerAISignal.overallSignal === 'BUY' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/60' :
                        activeTickerAISignal.overallSignal === 'SELL' ? 'bg-rose-950 text-rose-400 border border-rose-900/60' :
                        'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}>
                        {activeTickerAISignal.overallSignal}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[9px] uppercase font-black text-slate-400 block tracking-wider">Signal Conviction</span>
                      <span className="text-base font-mono font-black text-white">{activeTickerAISignal.confidenceScore}%</span>
                    </div>
                  </div>

                  {/* Summary reasoning */}
                  {activeTickerAISignal.newsAnalysisSummary && (
                    <div className="p-3 bg-indigo-950/20 border border-indigo-900/40 rounded-xl space-y-1">
                      <div className="text-[8px] font-black uppercase text-indigo-300 tracking-wider flex items-center gap-1">
                        <FileText className="w-3 h-3 text-indigo-400" />
                        <span>Joint Signal Explanation</span>
                      </div>
                      <p className="text-[10px] text-slate-300 leading-normal font-medium">
                        {activeTickerAISignal.newsAnalysisSummary}
                      </p>
                    </div>
                  )}

                  {/* Source News Feed Section */}
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-[8px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-slate-400" />
                        <span>Source News Feed ({activeTickerNews.length})</span>
                      </div>
                      {loadingNews && <RefreshCw className="w-2.5 h-2.5 animate-spin text-slate-500" />}
                    </div>
                    {activeTickerNews.length > 0 ? (
                      <div className="space-y-2 divide-y divide-slate-900">
                        {activeTickerNews.map((art) => {
                          let sentimentColor = 'text-slate-400 bg-slate-800 border-slate-700';
                          let sentimentText = 'Neutral';
                          if (art.sentiment_score !== undefined && art.sentiment_score !== null) {
                            if (art.sentiment_score > 15) {
                              sentimentColor = 'text-emerald-400 bg-emerald-950/80 border-emerald-900/40';
                              sentimentText = `Bullish (+${art.sentiment_score})`;
                            } else if (art.sentiment_score < -15) {
                              sentimentColor = 'text-rose-400 bg-rose-950/80 border-rose-900/40';
                              sentimentText = `Bearish (${art.sentiment_score})`;
                            } else {
                              sentimentColor = 'text-slate-400 bg-slate-800 border-slate-700';
                              sentimentText = `Neutral (${art.sentiment_score})`;
                            }
                          }
                          return (
                            <div 
                              key={art.id} 
                              onClick={() => onOpenArticlePreview?.(art)}
                              className="pt-2 first:pt-0 group cursor-pointer"
                            >
                              <div className="flex items-start justify-between gap-1.5">
                                <h4 className="text-[10px] font-black text-slate-200 group-hover:text-indigo-400 transition-colors line-clamp-2 leading-tight">
                                  {art.title}
                                </h4>
                                {art.sentiment_score !== undefined && (
                                  <span className={`px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border whitespace-nowrap ${sentimentColor}`}>
                                    {sentimentText}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-[8.5px] text-slate-500 font-medium">
                                <span>{art.publisher}</span>
                                <span>•</span>
                                <span>{new Date(art.published_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[9.5px] text-slate-500 text-center py-2 italic">
                        {loadingNews ? 'Fetching ticker news feed...' : 'No historical news retrieved for this ticker.'}
                      </div>
                    )}
                  </div>

                  {/* Multi Horizons List */}
                  <div className="space-y-3 pt-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider block">Target Horizon Parameters</span>
                    
                    {/* Next Day */}
                    <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-white">
                        <span>Next-Day Outlook</span>
                        {renderCellSignalBadge(activeTickerAISignal.nextDay.signal, activeTickerAISignal.nextDay.confidence)}
                      </div>
                      {activeTickerAISignal.nextDay.priceTarget > 0 && (
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono font-bold bg-slate-900/80 p-1.5 rounded text-center border border-slate-800">
                          <span className="text-emerald-400">Tgt: ${activeTickerAISignal.nextDay.priceTarget.toFixed(2)}</span>
                          <span className="text-rose-400">Stop: ${activeTickerAISignal.nextDay.stopLoss.toFixed(2)}</span>
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 leading-normal italic">{activeTickerAISignal.nextDay.primaryReasoning}</p>
                    </div>

                    {/* Swing */}
                    <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-white">
                        <span>Swing (1-4 weeks)</span>
                        {renderCellSignalBadge(activeTickerAISignal.swing.signal, activeTickerAISignal.swing.confidence)}
                      </div>
                      {activeTickerAISignal.swing.priceTarget > 0 && (
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono font-bold bg-slate-900/80 p-1.5 rounded text-center border border-slate-800">
                          <span className="text-emerald-400">Tgt: ${activeTickerAISignal.swing.priceTarget.toFixed(2)}</span>
                          <span className="text-rose-400">Stop: ${activeTickerAISignal.swing.stopLoss.toFixed(2)}</span>
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 leading-normal italic">{activeTickerAISignal.swing.primaryReasoning}</p>
                    </div>

                    {/* Long term */}
                    <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-white">
                        <span>Long-Term (3m+)</span>
                        {renderCellSignalBadge(activeTickerAISignal.longTerm.signal, activeTickerAISignal.longTerm.confidence)}
                      </div>
                      {activeTickerAISignal.longTerm.priceTarget > 0 && (
                        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono font-bold bg-slate-900/80 p-1.5 rounded text-center border border-slate-800">
                          <span className="text-emerald-400">Tgt: ${activeTickerAISignal.longTerm.priceTarget.toFixed(2)}</span>
                          <span className="text-rose-400">Stop: ${activeTickerAISignal.longTerm.stopLoss.toFixed(2)}</span>
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 leading-normal italic">{activeTickerAISignal.longTerm.primaryReasoning}</p>
                    </div>

                  </div>

                </div>

                {/* Risk warning */}
                <div className="text-[8px] text-slate-500 border-t border-slate-800 pt-3 italic leading-normal">
                  {activeTickerAISignal.riskDisclaimer}
                </div>

              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 text-xs">
                Select a ticker on the left to examine detailed charts and rationales.
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
