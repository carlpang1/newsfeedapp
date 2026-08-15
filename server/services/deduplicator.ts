import crypto from 'crypto';
import { findArticleByHash, findArticleByUrl, insertArticle, linkTickerNews } from '../database.js';
import { RawArticle, NewsArticle } from '../types.js';
import { logger } from './logger.js';

export class ArticleDeduplicator {
  /**
   * Normalizes a URL to a canonical representation by stripping marketing and tracking query params,
   * removing fragments, stripping trailing slashes, and standardizing protocol/host.
   */
  public static normalizeUrl(rawUrl: string): string {
    if (!rawUrl || typeof rawUrl !== 'string') return '';

    try {
      const parsed = new URL(rawUrl.trim());
      // Remove query tracking parameters
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'guccounter',
        'guce_referrer',
        'guce_referrer_sig',
        'guc_consent_skip',
        'ncid',
        'soc_src',
        'soc_trk',
        'fbclid',
        'gclid',
      ];

      for (const p of trackingParams) {
        parsed.searchParams.delete(p);
      }

      // Yahoo Finance specific redirect unwrap if needed
      // (e.g. https://finance.yahoo.com/m/... or https://finance.yahoo.com/news/...)
      parsed.hash = '';

      let normalized = parsed.toString();
      // Remove trailing slash if not root
      if (normalized.endsWith('/') && parsed.pathname !== '/') {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      // Fallback clean-up if URL constructor fails
      return rawUrl.split('?')[0].split('#')[0].trim().replace(/\/+$/, '');
    }
  }

  /**
   * Generates a deterministic SHA-256 hash for an article based on canonical URL
   * or a composite key of title, publisher, and published date.
   */
  public static generateHash(article: RawArticle): string {
    const canonicalUrl = this.normalizeUrl(article.url);
    if (canonicalUrl && canonicalUrl.length > 10) {
      return crypto.createHash('sha256').update(`url:${canonicalUrl}`).digest('hex');
    }

    // Fallback composite key
    const cleanTitle = (article.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanPub = (article.publisher || '').trim().toLowerCase();
    const cleanDate = (article.published_at || '').substring(0, 10); // YYYY-MM-DD
    const contentKey = `title:${cleanTitle}|pub:${cleanPub}|date:${cleanDate}`;
    return crypto.createHash('sha256').update(contentKey).digest('hex');
  }

  /**
   * Processes a raw article:
   * 1. Generates canonical URL & hash.
   * 2. Checks if article already exists in SQLite news table.
   * 3. If exists: links ticker to existing news if not already linked, returns duplicate.
   * 4. If not exists: inserts article into news table and links to ticker, returns new.
   */
  public static async processAndStoreArticle(
    rawArticle: RawArticle,
    tickerId: number
  ): Promise<{
    isDuplicate: boolean;
    newsArticle: NewsArticle;
    newlyLinked: boolean;
  }> {
    const canonicalUrl = this.normalizeUrl(rawArticle.url);
    const hash = this.generateHash(rawArticle);
    const retrievedAt = new Date().toISOString();

    // Check existing by hash first, then by canonical URL
    let existing = await findArticleByHash(hash);
    if (!existing && canonicalUrl) {
      existing = await findArticleByUrl(canonicalUrl);
    }

    if (existing) {
      // Duplicate article detected! Link it to current ticker if not yet linked
      const newlyLinked = await linkTickerNews(tickerId, existing.id);
      logger.debug(
        `Duplicate news article detected for ticker ${rawArticle.symbol}: "${rawArticle.title.substring(0, 40)}..." (ID: ${existing.id}, newlyLinked: ${newlyLinked})`
      );
      return {
        isDuplicate: true,
        newsArticle: existing,
        newlyLinked,
      };
    }

    // New unique article: insert into news table
    const inserted = await insertArticle({
      title: rawArticle.title.trim(),
      publisher: (rawArticle.publisher || 'Yahoo Finance').trim(),
      url: canonicalUrl || rawArticle.url,
      published_at: rawArticle.published_at || new Date().toISOString(),
      summary: (rawArticle.summary || '').trim(),
      article_hash: hash,
      retrieved_at: retrievedAt,
    });

    // Link to ticker
    const newlyLinked = await linkTickerNews(tickerId, inserted.id);

    return {
      isDuplicate: false,
      newsArticle: inserted,
      newlyLinked,
    };
  }
}
