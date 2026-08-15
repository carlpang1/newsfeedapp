import { INewsProvider } from '../types.js';
import { YahooFinanceNewsProvider } from './yahooFinanceProvider.js';
import { MockNewsProvider } from './mockNewsProvider.js';
import { logger } from './logger.js';

let activeProviderType: 'yahoo' | 'mock' = (process.env.NEWS_PROVIDER as 'yahoo' | 'mock') || 'yahoo';

const yahooProvider = new YahooFinanceNewsProvider();
const mockProvider = new MockNewsProvider();

export function getNewsProvider(overrideType?: 'yahoo' | 'mock'): INewsProvider {
  const type = overrideType || activeProviderType;
  if (type === 'mock') {
    return mockProvider;
  }
  return yahooProvider;
}

export function setActiveProviderType(type: 'yahoo' | 'mock'): void {
  activeProviderType = type;
  logger.info(`Active news provider switched to: ${type.toUpperCase()}`);
}

export function getActiveProviderType(): 'yahoo' | 'mock' {
  return activeProviderType;
}

export async function getProviderHealth(probe = false): Promise<{
  activeProvider: 'yahoo' | 'mock';
  status: 'connected' | 'error' | 'idle';
  lastSuccessfulFetch?: string;
  lastError?: string;
  lastChecked: string;
  latencyMs?: number;
}> {
  if (activeProviderType === 'mock') {
    return {
      activeProvider: 'mock',
      status: 'connected',
      lastSuccessfulFetch: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      latencyMs: 1,
    };
  }

  if (probe) {
    const probeResult = await yahooProvider.probeHealth();
    return {
      activeProvider: 'yahoo',
      status: probeResult.status,
      lastSuccessfulFetch: probeResult.lastSuccessfulFetch,
      lastError: probeResult.lastError,
      lastChecked: probeResult.lastChecked,
      latencyMs: probeResult.latencyMs,
    };
  }

  const h = yahooProvider.getHealth();
  return {
    activeProvider: 'yahoo',
    status: h.status,
    lastSuccessfulFetch: h.lastSuccessfulFetch,
    lastError: h.lastError,
    lastChecked: h.lastChecked,
  };
}
