export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TechnicalIndicators {
  latestPrice: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  } | null;
}

/**
 * Calculates Simple Moving Average (SMA) for a given period.
 */
export function calculateSMA(candles: Candle[], period: number): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const sum = slice.reduce((acc, c) => acc + c.close, 0);
  return Number((sum / period).toFixed(2));
}

/**
 * Calculates Relative Strength Index (RSI) using Wilder's Smoothing Method.
 */
export function calculateRSI(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  // First RSI value calculations (initial period)
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) {
      gains += diff;
    } else {
      losses += Math.abs(diff);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Wilder's smoothing for subsequent values
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - (100 / (1 + rs))).toFixed(2));
}

/**
 * Calculates EMA series for a given period.
 */
export function calculateEMASeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // Seed EMA with the first value
  let currentEma = values[0];
  ema.push(currentEma);

  for (let i = 1; i < values.length; i++) {
    currentEma = values[i] * k + currentEma * (1 - k);
    ema.push(currentEma);
  }

  return ema;
}

/**
 * Calculates Moving Average Convergence Divergence (MACD 12, 26, 9).
 */
export function calculateMACD(candles: Candle[]): { macd: number; signal: number; histogram: number } | null {
  if (candles.length < 26) return null;

  const closes = candles.map((c) => c.close);
  const ema12 = calculateEMASeries(closes, 12);
  const ema26 = calculateEMASeries(closes, 26);

  // MACD Line is the difference between 12-day EMA and 26-day EMA
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  // Signal Line is a 9-day EMA of the MACD Line
  const signalLine = calculateEMASeries(macdLine, 9);

  // Latest values are the last elements of the computed arrays
  const latestMacd = macdLine[macdLine.length - 1];
  const latestSignal = signalLine[signalLine.length - 1];
  const latestHistogram = latestMacd - latestSignal;

  return {
    macd: Number(latestMacd.toFixed(4)),
    signal: Number(latestSignal.toFixed(4)),
    histogram: Number(latestHistogram.toFixed(4)),
  };
}

/**
 * Computes all technical indicators for a given set of candles.
 */
export function computeAllTechnicalIndicators(candles: Candle[]): TechnicalIndicators {
  if (candles.length === 0) {
    return {
      latestPrice: 0,
      sma20: null,
      sma50: null,
      sma200: null,
      rsi14: null,
      macd: null,
    };
  }

  const latestPrice = candles[candles.length - 1].close;
  return {
    latestPrice,
    sma20: calculateSMA(candles, 20),
    sma50: calculateSMA(candles, 50),
    sma200: calculateSMA(candles, 200),
    rsi14: calculateRSI(candles, 14),
    macd: calculateMACD(candles),
  };
}
