export type EventType =
  | 'earnings'
  | 'guidance'
  | 'acquisition'
  | 'merger'
  | 'partnership'
  | 'product'
  | 'regulatory'
  | 'legal'
  | 'management'
  | 'analyst_rating'
  | 'analyst_target'
  | 'contract'
  | 'restructuring'
  | 'layoffs'
  | 'financing'
  | 'insider'
  | 'market'
  | 'industry'
  | 'other';

export type SourceTier = 1 | 2 | 3;

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
  eventType: EventType;
  sourceTier: SourceTier;
  signalsMatched: string[];
}

export interface NewsAnalysisResult {
  importanceScore: number; // 0 - 100
  relevanceScore: number;  // 0 - 100
  eventType: EventType;
  sourceTier: SourceTier;
  duplicateGroupId: string;
  explanation: ScoreExplanation;
  classificationVersion: string;
}

export class NewsIntelligenceEngine {
  public static readonly VERSION_V1 = 'v1.0-rules';
  public static readonly VERSION_V2 = 'v2.0-rules';
  public static readonly VERSION = 'v2.0-rules';

  public static readonly RULE_CHANGES_V2 = [
    'Enhanced listicle and clickbait dampeners (e.g. "Forget X", "3 Stocks to Buy", "Why X is moving") from -15 to -25 points to suppress promotional noise.',
    'Separated Forward Guidance/Forecast updates from reported historical quarterly earnings.',
    'Added high-conviction boosts (+25 pts) for major Tier 1 Breaking earnings beats/misses, $10B+ M&A acquisitions, and DOJ/SEC antitrust lawsuits.',
    'Enhanced Relevance Scoring with strict macro commentary penalty (-35 pts) for market roundups with 4+ tickers where the target company is merely a passing mention.',
    'Improved Syndication Clustering with aggressive stop-word normalization and wire suffix stripping (- Reuters, | CNBC, via PR Newswire) within 48-hour epoch windows.',
    'Refined C-suite management departure vs appointment classification and large-scale workforce restructuring patterns.',
  ];

  // Configurable Source Tier mappings (case-insensitive prefixes/exact matches)
  private static readonly TIER_1_PUBLISHERS = [
    'reuters',
    'bloomberg',
    'wsj',
    'the wall street journal',
    'wall street journal',
    'cnbc',
    'financial times',
    'ft',
    'sec',
    'sec edgar',
    'company filings',
    'official announcements',
    'pr newswire',
    'business wire',
    'globenewswire',
  ];

  private static readonly TIER_2_PUBLISHERS = [
    'yahoo finance',
    'yahoo',
    'marketwatch',
    'barron\'s',
    'barrons',
    'the motley fool',
    'motley fool',
    'seeking alpha',
    'investor\'s business daily',
    'ibd',
    'forbes',
    'benzinga',
    'zacks',
    'zacks investment research',
    'morningstar',
    'tipranks',
    'thestreet',
  ];

  /**
   * Determines the publisher's quality tier:
   * Tier 1 (+15 importance pts): Wire services, primary filings, Tier-1 financial presses
   * Tier 2 (+8 importance pts): Mainstream financial portals and analytical outlets
   * Tier 3 (+3 importance pts): Other/niche aggregators
   */
  public static classifySourceTier(publisher: string): SourceTier {
    if (!publisher || typeof publisher !== 'string') return 3;
    const clean = publisher.trim().toLowerCase();

    for (const t1 of this.TIER_1_PUBLISHERS) {
      if (clean === t1 || clean.includes(t1)) return 1;
    }
    for (const t2 of this.TIER_2_PUBLISHERS) {
      if (clean === t2 || clean.includes(t2)) return 2;
    }
    return 3;
  }

  /**
   * Deterministic event classification rules.
   */
  public static classifyEventType(
    headline: string,
    summary: string = '',
    version: string = this.VERSION
  ): EventType {
    const text = `${headline} ${summary}`.toLowerCase();
    const titleLower = headline.toLowerCase();

    // 1. Guidance & Forecasts (V2 checks guidance before earnings to avoid false-classifying pure guidance changes as earnings results)
    if (
      /\b(raises?\s+guidance|cuts?\s+guidance|lowers?\s+guidance|updates?\s+guidance|boosts?\s+guidance)\b/i.test(titleLower) ||
      /\b(full-year\s+outlook|revenue\s+warning|profit\s+warning|cuts?\s+forecast|raises?\s+forecast|sales\s+outlook)\b/i.test(titleLower) ||
      /\b(sees\s+(full-year|q[1-4])\s+(revenue|profit|sales|eps))\b/i.test(titleLower) ||
      /\b(guidance\s+(raised|lowered|slashed|hiked|boosted))\b/i.test(titleLower)
    ) {
      return 'guidance';
    }

    // 2. Earnings & Financial Results
    if (
      /\b(reports?\s+(quarterly|q[1-4]|fourth-quarter|third-quarter|second-quarter|first-quarter|annual|fiscal)\s+earnings)\b/i.test(titleLower) ||
      /\b(quarterly\s+earnings|q[1-4]\s+earnings|earnings\s+(beat|miss|tops?|falls?|surges?|plunges?))\b/i.test(titleLower) ||
      /\b(beats?\s+(earnings\s+)?estimates|misses\s+(earnings\s+)?estimates|eps\s+of\s+\$|net\s+income\s+(rises|falls|jumps|plunges|up|down))\b/i.test(titleLower) ||
      /\b(earnings\s+results|quarterly\s+results|q[1-4]\s+results|posts\s+q[1-4]\s+profit|posts\s+q[1-4]\s+loss)\b/i.test(titleLower) ||
      (/\bearnings\b/i.test(titleLower) && /\b(report|quarter|results|beat|miss|profit|revenue)\b/i.test(titleLower))
    ) {
      return 'earnings';
    }

    // 3. Acquisition
    if (
      /\b(acquires|to\s+acquire|acquisition\s+of|completes\s+acquisition|takeover\s+bid|agrees?\s+to\s+buy|buys\s+[A-Z0-9\s]+for\s+\$|all-cash\s+deal)\b/i.test(titleLower) ||
      /\b(acquisition\s+(deal|agreement|talks))\b/i.test(titleLower)
    ) {
      return 'acquisition';
    }

    // 4. Merger
    if (
      /\b(merger\s+with|to\s+merge\s+with|merger\s+deal|merges\s+with|all-stock\s+merger|merger\s+agreement)\b/i.test(titleLower)
    ) {
      return 'merger';
    }

    // 5. Major Layoffs & Workforce Reductions
    if (
      /\b(layoffs|laying\s+off|cuts?\s+[0-9,]+\s+jobs|to\s+cut\s+[0-9,]+\s+jobs|workforce\s+reduction|slashes?\s+[0-9,]+\s+jobs|headcount\s+reduction|staff\s+cuts)\b/i.test(titleLower) ||
      /\b(job\s+cuts|lay\s+off\s+[0-9%]+|cuts?\s+[0-9]+%\s+of\s+workforce)\b/i.test(titleLower)
    ) {
      return 'layoffs';
    }

    // 6. Restructuring & Bankruptcy
    if (
      /\b(bankruptcy|chapter\s+11|files?\s+for\s+bankruptcy|insolvent|insolvency)\b/i.test(titleLower) ||
      /\b(restructuring\s+plan|major\s+restructuring|reorganization\s+plan|spins?\s+off|spin-off|divestiture|divests)\b/i.test(titleLower)
    ) {
      return 'restructuring';
    }

    // 7. Regulatory & Government Decisions
    if (
      /\b(sec\s+investigation|sec\s+probes?|sec\s+charges?|doj\s+probe|doj\s+investigation|ftc\s+antitrust|antitrust\s+(lawsuit|probe|ruling))\b/i.test(titleLower) ||
      /\b(fda\s+approves|fda\s+approval|fda\s+clears|fda\s+rejects|fda\s+halts|fda\s+panel|fda\s+advisory)\b/i.test(titleLower) ||
      /\b(regulatory\s+approval|regulators?\s+approve|regulators?\s+reject|subpoenaed\s+by|sanctions?|government\s+decision|government\s+probe|eu\s+fines)\b/i.test(titleLower)
    ) {
      return 'regulatory';
    }

    // 8. Legal & Lawsuits
    if (
      /\b(lawsuit|sues|sued\s+by|class\s+action|settles?\s+suit|settlement\s+of\s+\$|court\s+rules|legal\s+battle|patent\s+dispute|pleads?\s+guilty|verdict)\b/i.test(titleLower)
    ) {
      return 'legal';
    }

    // 9. Management & Leadership
    if (
      /\b(ceo\s+(resigns|steps\s+down|departs|leaves|ousted|appointed|named|fired|quits))\b/i.test(titleLower) ||
      /\b(cfo\s+(resigns|steps\s+down|departs|leaves|appointed|named))\b/i.test(titleLower) ||
      /\b(new\s+ceo|appoints\s+ceo|executive\s+departure|board\s+ousts|leadership\s+shakeup|founder\s+steps\s+down|veteran\s+ceo\s+steps\s+down)\b/i.test(titleLower)
    ) {
      return 'management';
    }

    // 10. Major Partnerships & Strategic Alliances
    if (
      /\b(partners?\s+with|partnership\s+with|strategic\s+alliance|joint\s+venture|teams?\s+up\s+with|collaborates?\s+with|multi-year\s+deal\s+with|signs?\s+deal\s+with)\b/i.test(titleLower)
    ) {
      return 'partnership';
    }

    // 11. Major Contracts
    if (
      /\b(wins?\s+(\$[0-9.]+[mb]\s+)?contract|awarded\s+(\$[0-9.]+[mb]\s+)?contract|signs?\s+supply\s+deal|major\s+contract|defense\s+contract|procurement\s+deal)\b/i.test(titleLower)
    ) {
      return 'contract';
    }

    // 12. Analyst Rating
    if (
      /\b(upgraded?\s+(to|by)|downgraded?\s+(to|by)|initiates?\s+coverage|initiates?\s+at|reiterates?\s+buy|raised\s+to\s+buy|cut\s+to\s+(neutral|sell|underperform)|analyst\s+upgrade|analyst\s+downgrade|rating\s+upgrade|rating\s+downgrade)\b/i.test(titleLower)
    ) {
      return 'analyst_rating';
    }

    // 13. Analyst Target
    if (
      /\b(price\s+target|pt\s+raised|pt\s+lowered|target\s+price|raises?\s+price\s+target|lowers?\s+price\s+target|price\s+objective)\b/i.test(titleLower)
    ) {
      return 'analyst_target';
    }

    // 14. Product & Technology Releases / Recalls
    if (
      /\b(launches|unveils|unveiled|announces?\s+new|releases?\s+new|new\s+(gpu|chip|processor|architecture|model|platform|device|software|vehicle|ai\s+chip))\b/i.test(titleLower) ||
      /\b(recalls?\s+[0-9,]+\s+vehicles|safety\s+recall|product\s+launch|next-gen\s+architecture|blackwell|m4\s+chip)\b/i.test(titleLower)
    ) {
      return 'product';
    }

    // 15. Financing & Capital Structure
    if (
      /\b(stock\s+offering|share\s+offering|secondary\s+offering|debt\s+offering|share\s+buyback|stock\s+buyback|repurchase\s+program|dividend\s+hike|raises?\s+quarterly\s+dividend|cuts?\s+dividend|credit\s+facility)\b/i.test(titleLower)
    ) {
      return 'financing';
    }

    // 16. Insider Activity
    if (
      /\b(insider\s+buying|insider\s+sells?|form\s+4|director\s+buys|executive\s+sells|stake\s+purchase)\b/i.test(titleLower)
    ) {
      return 'insider';
    }

    // 17. Broad Market Commentary
    if (
      /\b(wall\s+street|s&p\s+500|sp500|nasdaq|dow\s+jones|stocks\s+(rally|slide|sink|rise|fall|tumble|gain)|futures\s+(rise|fall|slide)|market\s+wrap|morning\s+brief|fed\s+rate|treasury\s+yields|market\s+update)\b/i.test(titleLower)
    ) {
      return 'market';
    }

    // 18. Industry Developments
    if (
      /\b(sector|industry\s+trends|semiconductor\s+industry|ev\s+market|cloud\s+market|banking\s+sector)\b/i.test(titleLower)
    ) {
      return 'industry';
    }

    return 'other';
  }

  /**
   * Calculates the Importance Score (0–100) using transparent, explainable deterministic signals.
   */
  public static calculateImportanceScore(params: {
    headline: string;
    summary: string;
    publisher: string;
    publishedAt: string;
    eventType: EventType;
    sourceTier: SourceTier;
    tickerSymbols?: string[];
    version?: string;
  }): {
    score: number;
    breakdown: ScoreSignalBreakdown[];
    signalsMatched: string[];
  } {
    const { headline, publisher, publishedAt, eventType, sourceTier, tickerSymbols = [], version = this.VERSION } = params;
    const titleLower = headline.toLowerCase();
    const breakdown: ScoreSignalBreakdown[] = [];
    const signalsMatched: string[] = [];

    const isV2 = version === this.VERSION_V2 || version === 'v2';

    // 1. Event Type Base Weighting
    let eventBase = 10;
    if (
      [
        'earnings',
        'guidance',
        'acquisition',
        'merger',
        'regulatory',
        'legal',
        'management',
        'layoffs',
        'restructuring',
        'contract',
      ].includes(eventType)
    ) {
      eventBase = 30;
      breakdown.push({ signal: `High-impact event category (${eventType.replace('_', ' ')})`, points: 30 });
      signalsMatched.push(`event:${eventType}`);
    } else if (['partnership', 'product', 'analyst_rating', 'analyst_target', 'financing', 'insider', 'industry'].includes(eventType)) {
      eventBase = 20;
      breakdown.push({ signal: `Medium-impact event category (${eventType.replace('_', ' ')})`, points: 20 });
      signalsMatched.push(`event:${eventType}`);
    } else {
      eventBase = 5;
      breakdown.push({ signal: `General or market category (${eventType})`, points: 5 });
    }

    // 2. High-Value Headline Signals
    if (/\b(beats?\s+(earnings\s+)?estimates|quarterly\s+beat|tops?\s+estimates|record\s+revenue|profit\s+surge)\b/i.test(titleLower)) {
      const pts = isV2 ? 22 : 20;
      breakdown.push({ signal: 'High-value signal: Beats estimates / strong quarterly results', points: pts });
      signalsMatched.push('signal:beats_estimates');
    }
    if (/\b(misses?\s+(earnings\s+)?estimates|quarterly\s+miss|falls?\ short|profit\s+drop|revenue\s+miss)\b/i.test(titleLower)) {
      const pts = isV2 ? 22 : 20;
      breakdown.push({ signal: 'High-value signal: Misses estimates / weak quarterly results', points: pts });
      signalsMatched.push('signal:misses_estimates');
    }
    if (/\b(raises?\s+guidance|boosts?\s+outlook|ups?\s+forecast)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Raises guidance / positive outlook', points: 20 });
      signalsMatched.push('signal:raises_guidance');
    }
    if (/\b(cuts?\s+guidance|lowers?\s+guidance|revenue\s+warning|profit\s+warning)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Cuts guidance / profit warning', points: 20 });
      signalsMatched.push('signal:cuts_guidance');
    }
    if (/\b(acquires|to\s+acquire|completes\s+acquisition|all-cash\s+deal|takeover\s+bid)\b/i.test(titleLower)) {
      const pts = isV2 ? 18 : 15;
      breakdown.push({ signal: 'High-value signal: M&A / Corporate acquisition', points: pts });
      signalsMatched.push('signal:acquisition');
    }
    if (/\b(ceo\s+(resigns|steps\s+down|departs|fired)|cfo\s+(resigns|departs)|leadership\s+departure|veteran\s+ceo\s+steps\s+down)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Executive C-suite departure', points: 18 });
      signalsMatched.push('signal:executive_departure');
    }
    if (/\b(fda\s+approves|fda\s+approval|sec\s+investigation|doj\s+probe|antitrust\s+suit|doj\s+files\s+antitrust)\b/i.test(titleLower)) {
      const pts = isV2 ? 20 : 18;
      breakdown.push({ signal: 'High-value signal: Major regulatory/FDA/SEC decision', points: pts });
      signalsMatched.push('signal:regulatory_action');
    }
    if (/\b(layoffs|cuts?\s+[0-9,]+\s+jobs|slashes?\s+workforce|cuts?\s+[0-9]+%\s+of\s+workforce)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Large-scale workforce layoffs', points: 15 });
      signalsMatched.push('signal:layoffs');
    }
    if (/\b(bankruptcy|chapter\s+11|files?\s+for\s+bankruptcy)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Bankruptcy filing', points: 25 });
      signalsMatched.push('signal:bankruptcy');
    }
    if (/\b(upgraded?\s+to|downgraded?\s+to|analyst\s+upgrade|analyst\s+downgrade)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'Medium signal: Major analyst rating change', points: 12 });
      signalsMatched.push('signal:analyst_rating');
    }
    if (/\b(raises?\s+price\s+target|lowers?\s+price\s+target|price\s+target)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'Medium signal: Price target revision', points: 10 });
      signalsMatched.push('signal:price_target');
    }
    if (/\b(wins?\s+contract|awarded\s+contract|major\s+deal|multi-billion\s+dollar\s+deal)\b/i.test(titleLower)) {
      breakdown.push({ signal: 'High-value signal: Major customer/defense contract', points: 14 });
      signalsMatched.push('signal:major_contract');
    }

    // 3. Source Quality Tier Multiplier
    if (sourceTier === 1) {
      breakdown.push({ signal: `Tier 1 publisher authority (${publisher || 'Primary Wire'})`, points: 15 });
    } else if (sourceTier === 2) {
      breakdown.push({ signal: `Tier 2 financial outlet (${publisher || 'Financial Media'})`, points: 8 });
    } else {
      breakdown.push({ signal: `Tier 3 publisher (${publisher || 'General Web'})`, points: 3 });
    }

    // 4. Specificity in Headline
    const hasSymbolInTitle = tickerSymbols.some((sym) => {
      const symRegex = new RegExp(`\\b(${sym}|\\$${sym})\\b`, 'i');
      return symRegex.test(headline);
    });
    if (hasSymbolInTitle) {
      breakdown.push({ signal: 'Company ticker directly featured in headline', points: 10 });
    }

    // 5. Recency Factor
    if (publishedAt) {
      const pubTime = new Date(publishedAt).getTime();
      const ageHours = (Date.now() - pubTime) / (1000 * 60 * 60);
      if (!isNaN(ageHours) && ageHours >= 0) {
        if (ageHours <= 24) {
          breakdown.push({ signal: 'Breaking / Published within 24 hours', points: 10 });
        } else if (ageHours <= 48) {
          breakdown.push({ signal: 'Recent / Published within 48 hours', points: 6 });
        } else if (ageHours <= 168) {
          breakdown.push({ signal: 'Published within past 7 days', points: 3 });
        }
      }
    }

    // 6. Generic noise dampeners (Enhanced in v2)
    if (
      /\b(3\s+stocks\s+to\s+buy|stocks\s+to\s+watch|why\s+[a-z0-9]+\s+is\s+moving|top\s+stocks\s+for|best\s+etfs|forget\s+[a-z0-9]+|is\s+[a-z0-9]+\s+a\s+buy|better\s+buy\s+than)\b/i.test(titleLower)
    ) {
      const dampPts = isV2 ? -25 : -15;
      breakdown.push({ signal: 'Noise dampener: Generic commentary / listicle / promotional format', points: dampPts });
    }

    // Calculate raw sum and clamp strictly to [0, 100]
    let total = breakdown.reduce((sum, item) => sum + item.points, 0);
    total = Math.max(0, Math.min(100, Math.round(total)));

    return {
      score: total,
      breakdown,
      signalsMatched,
    };
  }

  /**
   * Calculates the Relevance Score (0–100) evaluating how specifically an article pertains
   * to a given ticker vs broad market macro news.
   */
  public static calculateRelevanceScore(params: {
    headline: string;
    summary: string;
    tickerSymbol?: string;
    companyName?: string;
    allArticleTickers?: string[];
    version?: string;
  }): {
    score: number;
    breakdown: ScoreSignalBreakdown[];
  } {
    const { headline, summary, tickerSymbol, companyName, allArticleTickers = [], version = this.VERSION } = params;
    const titleLower = headline.toLowerCase();
    const summaryLower = (summary || '').toLowerCase();
    const breakdown: ScoreSignalBreakdown[] = [];
    const isV2 = version === this.VERSION_V2 || version === 'v2';

    const sym = tickerSymbol ? tickerSymbol.toUpperCase() : '';
    const compNameClean = companyName
      ? companyName.replace(/(\bInc\.?|\bCorp\.?|\bCorporation|\bCo\.?|\bLtd\.?|\bLLC|\bClass [A-C])\b/gi, '').trim().toLowerCase()
      : '';

    let symbolInTitle = false;
    let companyInTitle = false;

    if (sym) {
      const symRegex = new RegExp(`\\b(${sym}|\\$${sym}|\\(${sym}\\))\\b`, 'i');
      if (symRegex.test(headline)) {
        symbolInTitle = true;
        breakdown.push({ signal: `Ticker symbol ($${sym}) explicitly in headline`, points: 40 });
      }
    }

    if (compNameClean && compNameClean.length >= 3) {
      if (titleLower.includes(compNameClean)) {
        companyInTitle = true;
        breakdown.push({ signal: `Company name (${compNameClean.toUpperCase()}) in headline`, points: 40 });
      }
    }

    // Check if the ticker/company is the opening subject of the headline
    if (symbolInTitle || companyInTitle) {
      const words = headline.trim().split(/\s+/).slice(0, 4).join(' ').toLowerCase();
      if ((sym && words.includes(sym.toLowerCase())) || (compNameClean && words.includes(compNameClean))) {
        breakdown.push({ signal: 'Company/symbol is primary subject of headline', points: 15 });
      }
    }

    // Mention in summary / body
    if (!symbolInTitle && !companyInTitle) {
      let mentionedInSummary = false;
      if (sym && new RegExp(`\\b(${sym}|\\$${sym})\\b`, 'i').test(summaryLower)) {
        mentionedInSummary = true;
      } else if (compNameClean && summaryLower.includes(compNameClean)) {
        mentionedInSummary = true;
      }

      if (mentionedInSummary) {
        breakdown.push({ signal: 'Company or ticker referenced in article summary', points: 25 });
      } else {
        breakdown.push({ signal: 'No direct ticker or company mention found in headline', points: 10 });
      }
    }

    // Single ticker exclusivity bonus vs multi-ticker dilution penalty
    if (allArticleTickers.length === 1 && (symbolInTitle || companyInTitle)) {
      breakdown.push({ signal: 'Dedicated coverage focused on single company', points: 10 });
    } else if (allArticleTickers.length >= 4) {
      const penalty = isV2 ? -25 : -15;
      breakdown.push({ signal: 'Broad market article covering multiple tickers', points: penalty });
    }

    // Broad macro market title penalty if company is only one of many
    if (
      /\b(technology\s+stocks|market\s+rally|wall\s+street|s&p\s+500|futures\s+surge|morning\s+brief|stocks\s+gain|stocks\s+fall)\b/i.test(titleLower) &&
      !companyInTitle
    ) {
      const penalty = isV2 ? -30 : -20;
      breakdown.push({ signal: 'Macro market commentary penalty', points: penalty });
    }

    let total = breakdown.reduce((sum, item) => sum + item.points, 0);
    total = Math.max(0, Math.min(100, Math.round(total)));

    return {
      score: total,
      breakdown,
    };
  }

  /**
   * Generates a deterministic duplicate/syndication group cluster ID.
   */
  public static generateDuplicateGroupId(headline: string, publishedAt: string): string {
    if (!headline) return 'dup_unknown';

    // Strip trailing publisher attributions, e.g. " - Reuters", " | CNBC", " - MarketWatch", " [Updated]"
    let clean = headline
      .replace(/\s*[-–—|]\s*(reuters|bloomberg|cnbc|marketwatch|the motley fool|motley fool|seeking alpha|barron'?s|investor'?s business daily|ibd|zacks|benzinga|yahoo finance|ap news|wsj)\s*$/i, '')
      .replace(/\s*\(via\s+pr\s+newswire\)|\s*\(via\s+business\s+wire\)|\s*\(via\s+globenewswire\)/gi, '')
      .replace(/\[(updated|breaking|update)\]/gi, '')
      .replace(/[^\w\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Remove common filler words for stable clustering
    const stopWords = new Set(['a', 'an', 'the', 'is', 'in', 'at', 'of', 'on', 'for', 'to', 'with', 'by', 'as', 'and', 'from', 'into']);
    const tokens = clean
      .split(' ')
      .filter((w) => w.length > 1 && !stopWords.has(w))
      .slice(0, 8)
      .join('_');

    // 48-hour epoch bucket
    let timeBucket = 'general';
    if (publishedAt) {
      const pubTime = new Date(publishedAt).getTime();
      if (!isNaN(pubTime)) {
        const bucketIndex = Math.floor(pubTime / (48 * 60 * 60 * 1000));
        timeBucket = String(bucketIndex);
      }
    }

    return `dup_${timeBucket}_${tokens.slice(0, 40)}`;
  }

  /**
   * Fully analyzes an article and returns its comprehensive intelligence model.
   */
  public static analyzeArticle(
    params: {
      headline: string;
      summary: string;
      publisher: string;
      publishedAt: string;
      tickerSymbol?: string;
      companyName?: string;
      allArticleTickers?: string[];
      version?: string;
    },
    explicitVersion?: string
  ): NewsAnalysisResult {
    const version = explicitVersion || params.version || this.VERSION;
    const sourceTier = this.classifySourceTier(params.publisher);
    const eventType = this.classifyEventType(params.headline, params.summary, version);

    const importanceRes = this.calculateImportanceScore({
      headline: params.headline,
      summary: params.summary,
      publisher: params.publisher,
      publishedAt: params.publishedAt,
      eventType,
      sourceTier,
      tickerSymbols: params.allArticleTickers || (params.tickerSymbol ? [params.tickerSymbol] : []),
      version,
    });

    const relevanceRes = this.calculateRelevanceScore({
      headline: params.headline,
      summary: params.summary,
      tickerSymbol: params.tickerSymbol,
      companyName: params.companyName,
      allArticleTickers: params.allArticleTickers || (params.tickerSymbol ? [params.tickerSymbol] : []),
      version,
    });

    const duplicateGroupId = this.generateDuplicateGroupId(params.headline, params.publishedAt);

    const explanation: ScoreExplanation = {
      importance: {
        total: importanceRes.score,
        base: 0,
        breakdown: importanceRes.breakdown,
      },
      relevance: {
        total: relevanceRes.score,
        breakdown: relevanceRes.breakdown,
      },
      eventType,
      sourceTier,
      signalsMatched: importanceRes.signalsMatched,
    };

    return {
      importanceScore: importanceRes.score,
      relevanceScore: relevanceRes.score,
      eventType,
      sourceTier,
      duplicateGroupId,
      explanation,
      classificationVersion: version,
    };
  }
}
