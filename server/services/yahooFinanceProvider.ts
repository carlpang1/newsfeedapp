import { XMLParser } from 'fast-xml-parser';
import { INewsProvider, RawArticle } from '../types.js';
import { logger } from './logger.js';

export class YahooFinanceNewsProvider implements INewsProvider {
  public name: 'yahoo' = 'yahoo';
  private xmlParser: XMLParser;
  private timeoutMs: number;
  private lastSuccessfulFetch?: string;
  private lastError?: string;
  private lastStatus: 'connected' | 'error' | 'idle' = 'idle';

  constructor() {
    this.timeoutMs = parseInt(process.env.REQUEST_TIMEOUT || '20000', 10);
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      trimValues: true,
      parseTagValue: true,
    });
  }

  public getHealth(): {
    provider: 'yahoo';
    status: 'connected' | 'error' | 'idle';
    lastSuccessfulFetch?: string;
    lastError?: string;
    lastChecked: string;
  } {
    return {
      provider: 'yahoo',
      status: this.lastStatus,
      lastSuccessfulFetch: this.lastSuccessfulFetch,
      lastError: this.lastError,
      lastChecked: new Date().toISOString(),
    };
  }

  public async probeHealth(): Promise<{
    provider: 'yahoo';
    status: 'connected' | 'error';
    latencyMs: number;
    lastSuccessfulFetch?: string;
    lastError?: string;
    lastChecked: string;
  }> {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        this.lastStatus = 'error';
        this.lastError = `HTTP ${response.status}: ${response.statusText}`;
        return {
          provider: 'yahoo',
          status: 'error',
          latencyMs,
          lastSuccessfulFetch: this.lastSuccessfulFetch,
          lastError: this.lastError,
          lastChecked: new Date().toISOString(),
        };
      }

      this.lastStatus = 'connected';
      this.lastSuccessfulFetch = new Date().toISOString();
      this.lastError = undefined;

      return {
        provider: 'yahoo',
        status: 'connected',
        latencyMs,
        lastSuccessfulFetch: this.lastSuccessfulFetch,
        lastChecked: new Date().toISOString(),
      };
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      this.lastStatus = 'error';
      this.lastError = err.message || 'Connection failed';
      return {
        provider: 'yahoo',
        status: 'error',
        latencyMs,
        lastSuccessfulFetch: this.lastSuccessfulFetch,
        lastError: this.lastError,
        lastChecked: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetches RSS news for a given ticker symbol from Yahoo Finance RSS headline endpoint.
   */
  public async fetchNewsForTicker(
    symbol: string,
    options: { startDate?: string; endDate?: string } = {}
  ): Promise<RawArticle[]> {
    const cleanSymbol = symbol.trim().toUpperCase();
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(cleanSymbol)}&region=US&lang=en-US`;

    logger.info(`Fetching Yahoo Finance news for ${cleanSymbol}...`);

    let responseText = '';
    let attempt = 0;
    const maxRetries = 2;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          logger.warn(`Yahoo Finance rate limited (429) for ${cleanSymbol}, retry attempt ${attempt}...`);
          if (attempt <= maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * attempt));
            continue;
          }
          this.lastStatus = 'error';
          this.lastError = 'HTTP 429 (Rate Limited)';
          throw new Error(`Yahoo Finance rate limit reached (HTTP 429)`);
        }

        if (!response.ok) {
          this.lastStatus = 'error';
          this.lastError = `HTTP ${response.status}: ${response.statusText}`;
          throw new Error(`Yahoo Finance HTTP error ${response.status}: ${response.statusText}`);
        }

        responseText = await response.text();
        this.lastStatus = 'connected';
        this.lastSuccessfulFetch = new Date().toISOString();
        this.lastError = undefined;
        break;
      } catch (err: any) {
        if (attempt <= maxRetries && err.name !== 'AbortError') {
          logger.warn(`Fetch error for ${cleanSymbol} (${err.message}), retrying...`);
          await new Promise((r) => setTimeout(r, 500 * attempt));
        } else {
          this.lastStatus = 'error';
          this.lastError = err.name === 'AbortError' ? `Timeout (${this.timeoutMs}ms)` : err.message;
          if (err.name === 'AbortError') {
            throw new Error(`Yahoo Finance request timed out after ${this.timeoutMs}ms for ticker ${cleanSymbol}`);
          }
          throw err;
        }
      }
    }

    return this.parseRssFeed(responseText, cleanSymbol, options);
  }

  /**
   * Parses XML RSS feed string into structured RawArticle objects with date filtering.
   */
  public parseRssFeed(
    xmlContent: string,
    symbol: string,
    options: { startDate?: string; endDate?: string } = {}
  ): RawArticle[] {
    if (!xmlContent || !xmlContent.trim()) {
      return [];
    }

    let parsed: any;
    try {
      parsed = this.xmlParser.parse(xmlContent);
    } catch (err: any) {
      logger.error(`Failed to parse XML response for ${symbol}: ${err.message}`);
      throw new Error(`Malformed XML response from Yahoo Finance: ${err.message}`);
    }

    const channel = parsed?.rss?.channel;
    if (!channel) {
      // Empty or unexpected XML structure
      return [];
    }

    let items = channel.item;
    if (!items) {
      return [];
    }

    if (!Array.isArray(items)) {
      items = [items];
    }

    const startTs = options.startDate ? new Date(options.startDate).getTime() : 0;
    const endTs = options.endDate ? new Date(options.endDate).getTime() : Infinity;

    const articles: RawArticle[] = [];

    for (const item of items) {
      try {
        const title = this.stripHtml(item.title || '');
        const rawLink = item.link || item.guid || '';
        const link = typeof rawLink === 'object' ? rawLink['#text'] || '' : String(rawLink);
        const description = this.stripHtml(item.description || item.summary || '');
        const pubDateRaw = item.pubDate || item.published || '';

        if (!title || !link) continue;

        let publishedAt: string;
        let itemTime = 0;

        if (pubDateRaw) {
          const d = new Date(pubDateRaw);
          if (!isNaN(d.getTime())) {
            publishedAt = d.toISOString();
            itemTime = d.getTime();
          } else {
            publishedAt = new Date().toISOString();
            itemTime = Date.now();
          }
        } else {
          publishedAt = new Date().toISOString();
          itemTime = Date.now();
        }

        // Apply Date Range Filter if requested
        if (startTs > 0 && itemTime < startTs) {
          continue;
        }
        if (endTs < Infinity && itemTime > endTs) {
          continue;
        }

        // Determine publisher from source or URL
        let publisher = 'Yahoo Finance';
        if (item.source) {
          publisher = typeof item.source === 'object' ? item.source['#text'] || 'Yahoo Finance' : String(item.source);
        } else if (link.includes('reuters.com')) {
          publisher = 'Reuters';
        } else if (link.includes('bloomberg.com')) {
          publisher = 'Bloomberg';
        } else if (link.includes('cnbc.com')) {
          publisher = 'CNBC';
        } else if (link.includes('wsj.com')) {
          publisher = 'The Wall Street Journal';
        } else if (link.includes('marketwatch.com')) {
          publisher = 'MarketWatch';
        } else if (link.includes('fool.com')) {
          publisher = 'The Motley Fool';
        } else if (link.includes('barrons.com')) {
          publisher = "Barron's";
        } else if (link.includes('investors.com')) {
          publisher = "Investor's Business Daily";
        }

        articles.push({
          title,
          publisher: this.stripHtml(publisher),
          url: link.trim(),
          published_at: publishedAt,
          summary: description,
          symbol: symbol.toUpperCase(),
        });
      } catch (err: any) {
        logger.warn(`Error parsing item in RSS feed for ${symbol}: ${err.message}`);
      }
    }

    return articles;
  }

  private stripHtml(html: string): string {
    if (!html) return '';
    return String(html)
      .replace(/<[^>]*>?/gm, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .trim();
  }
}
