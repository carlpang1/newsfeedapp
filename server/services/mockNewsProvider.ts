import { INewsProvider, RawArticle } from '../types.js';
import { logger } from './logger.js';

export class MockNewsProvider implements INewsProvider {
  public name: 'mock' = 'mock';

  // Configurable mock failure triggers for unit/integration testing
  public simulateErrorMode: 'none' | 'network' | 'timeout' | 'empty' | 'malformed' = 'none';

  public async fetchNewsForTicker(
    symbol: string,
    options: { startDate?: string; endDate?: string } = {}
  ): Promise<RawArticle[]> {
    const clean = symbol.toUpperCase().trim();
    logger.info(`[MOCK] Generating simulated financial news for ${clean}...`);

    // Simulated short delay (50ms) to feel real
    await new Promise((r) => setTimeout(r, 60));

    if (this.simulateErrorMode === 'network') {
      throw new Error(`[MOCK ERROR] Network connection refused to Yahoo Finance servers (ECONNREFUSED)`);
    }
    if (this.simulateErrorMode === 'timeout') {
      throw new Error(`[MOCK ERROR] Request timed out after 20000ms`);
    }
    if (this.simulateErrorMode === 'empty') {
      return [];
    }

    const now = new Date();
    const articles = this.getMockArticlesForTicker(clean, now);

    // Filter by date range if provided
    const startTs = options.startDate ? new Date(options.startDate).getTime() : 0;
    const endTs = options.endDate ? new Date(options.endDate).getTime() : Infinity;

    return articles.filter((a) => {
      const pubTs = new Date(a.published_at).getTime();
      return pubTs >= startTs && pubTs <= endTs;
    });
  }

  private getMockArticlesForTicker(symbol: string, now: Date): RawArticle[] {
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
    const daysAgo = (d: number, hourOffset = 0) =>
      new Date(now.getTime() - (d * 24 + hourOffset) * 60 * 60 * 1000).toISOString();

    // Specific ticker mock sets + cross-ticker shared stories
    const crossTickerStory1: RawArticle = {
      title: 'Mega-Cap Tech Rally: AI Infrastructure Spend Surges Across Big Tech Leaders',
      publisher: 'Reuters',
      url: 'https://finance.yahoo.com/news/mega-cap-tech-ai-spending-surge-140022881.html?utm_source=rss&guccounter=1',
      published_at: hoursAgo(3),
      summary:
        'Capital expenditure on next-generation artificial intelligence data centers reaches record levels as major hyperscalers expand hardware procurement and computing clusters.',
      symbol: symbol,
      relatedSymbols: ['NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META'],
    };

    const crossTickerStory2: RawArticle = {
      title: 'Federal Reserve Policy Shift Sparks Massive Rotation in US Equities and Semiconductor Stocks',
      publisher: 'Bloomberg',
      url: 'https://finance.yahoo.com/news/fed-rate-policy-rotation-equities-093011452.html?ncid=txtlnkusaolp00000618',
      published_at: daysAgo(2, 4),
      summary:
        'Institutional investors realign portfolios following updated macroeconomic commentary from central bank officials, impacting technology valuations.',
      symbol: symbol,
      relatedSymbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'JPM'],
    };

    const crossTickerStory3: RawArticle = {
      title: 'Global Supply Chain and Consumer Electronics Demand Index Shows Resilient Rebound',
      publisher: 'The Wall Street Journal',
      url: 'https://finance.yahoo.com/news/global-supply-chain-electronics-rebound-112233445.html',
      published_at: daysAgo(5, 2),
      summary:
        'Leading manufacturers report improved component availability and heightened order volumes ahead of the upcoming holiday product launch cycle.',
      symbol: symbol,
      relatedSymbols: ['AAPL', 'AMZN', 'WMT', 'DIS'],
    };

    const tickerSpecificMap: Record<string, RawArticle[]> = {
      AAPL: [
        {
          title: 'Apple Unveils Next-Gen Silicon Architecture with Enhanced On-Device Neural Engines',
          publisher: 'CNBC',
          url: 'https://finance.yahoo.com/news/apple-unveils-m5-silicon-on-device-ai-130044551.html',
          published_at: hoursAgo(1),
          summary:
            'Apple Inc announced significant advancements in custom silicon designed to power local AI models across iPhones, iPads, and MacBooks with industry-leading power efficiency.',
          symbol: 'AAPL',
        },
        {
          title: 'Apple Services Revenue Sets New Quarterly All-Time High Amid App Store & Cloud Growth',
          publisher: "Barron's",
          url: 'https://finance.yahoo.com/news/apple-services-revenue-all-time-high-172033441.html',
          published_at: daysAgo(1, 2),
          summary:
            'Paid subscriptions across Apple music, cloud, and payment platforms surged past 1.2 billion, reinforcing recurring revenue margins.',
          symbol: 'AAPL',
        },
        {
          title: 'Foxconn Ramps Production Lines for Anticipated High-Volume Smartphone Refresh',
          publisher: 'Reuters',
          url: 'https://finance.yahoo.com/news/foxconn-ramps-production-iphone-refresh-084511223.html',
          published_at: daysAgo(6, 1),
          summary:
            'Key manufacturing partners expand hiring and assembly capacity in Zhengzhou and Tamil Nadu facilities in preparation for flagship hardware distribution.',
          symbol: 'AAPL',
        },
        {
          title: 'Analyst Upgrades Apple Price Target to $260 on Strong Enterprise AI Adoption',
          publisher: 'MarketWatch',
          url: 'https://finance.yahoo.com/news/analyst-upgrades-aapl-target-enterprise-141522334.html',
          published_at: daysAgo(12, 5),
          summary:
            'Wall Street researchers highlight corporate device upgrade cycles and proprietary security architecture as primary catalysts.',
          symbol: 'AAPL',
        },
      ],
      NVDA: [
        {
          title: 'NVIDIA Delivers Record Data Center Quarterly Performance as Blackwell Shipments Expand',
          publisher: 'Bloomberg',
          url: 'https://finance.yahoo.com/news/nvidia-record-datacenter-blackwell-revenue-180011221.html',
          published_at: hoursAgo(2),
          summary:
            'CEO Jensen Huang highlighted unconstrained customer appetite for accelerated computing platforms, liquid cooling racks, and NVLink interconnects.',
          symbol: 'NVDA',
        },
        {
          title: 'Cloud Providers Double Down on NVIDIA Accelerated Superclusters for Frontier Model Training',
          publisher: 'CNBC',
          url: 'https://finance.yahoo.com/news/cloud-providers-nvidia-superclusters-frontier-114522991.html',
          published_at: daysAgo(1, 5),
          summary:
            'Enterprise demand for Blackwell GPU architectures accelerates as tier-one cloud providers deploy multi-node AI clusters across North America and Europe.',
          symbol: 'NVDA',
        },
        {
          title: 'NVIDIA Expands Automotive and Robotics Autonomous Systems Ecosystem',
          publisher: 'Reuters',
          url: 'https://finance.yahoo.com/news/nvidia-robotics-drive-thor-automotive-091533221.html',
          published_at: daysAgo(8, 3),
          summary:
            'Major automotive OEMs integrate Drive Thor system-on-a-chip hardware for generative physical AI and Level 3+ automated driving platforms.',
          symbol: 'NVDA',
        },
      ],
      MSFT: [
        {
          title: 'Microsoft Azure Cloud Revenue Grows 33% Powered by Enterprise Generative AI Workloads',
          publisher: 'The Wall Street Journal',
          url: 'https://finance.yahoo.com/news/microsoft-azure-revenue-growth-ai-enterprise-201500112.html',
          published_at: hoursAgo(4),
          summary:
            'Microsoft reports accelerating adoption of Microsoft 365 Copilot and Azure OpenAI services among Fortune 500 customers.',
          symbol: 'MSFT',
        },
        {
          title: 'Microsoft Signs Landmark Long-Term Clean Energy Power Purchase for AI Data Centers',
          publisher: 'Reuters',
          url: 'https://finance.yahoo.com/news/microsoft-clean-energy-nuclear-ppa-datacenter-152011442.html',
          published_at: daysAgo(3, 1),
          summary:
            'To meet carbon reduction commitments alongside computing expansion, Microsoft finalizes agreements for 1.5 gigawatts of zero-carbon baseload electricity.',
          symbol: 'MSFT',
        },
      ],
      TSLA: [
        {
          title: 'Tesla Robotaxi Autonomous Fleet Pilot Launches in Select Metropolitan Test Corridors',
          publisher: 'Bloomberg',
          url: 'https://finance.yahoo.com/news/tesla-robotaxi-pilot-autonomous-fleet-160033119.html',
          published_at: hoursAgo(6),
          summary:
            'Tesla initiated initial passenger validation runs for its specialized autonomous cybercab network following regulatory review filings.',
          symbol: 'TSLA',
        },
        {
          title: 'Tesla Megapack Energy Storage Deployments Double Year-Over-Year',
          publisher: 'CNBC',
          url: 'https://finance.yahoo.com/news/tesla-energy-storage-megapack-growth-103044112.html',
          published_at: daysAgo(4, 2),
          summary:
            'Utility-scale battery manufacturing in Lathrop and Shanghai reaches record GWh capacity output with high operating margin contributions.',
          symbol: 'TSLA',
        },
      ],
      AMZN: [
        {
          title: 'Amazon Web Services Announces New High-Performance Trainium & Inferentia Custom AI Chips',
          publisher: 'Reuters',
          url: 'https://finance.yahoo.com/news/aws-trainium-custom-silicon-cost-advantage-131522001.html',
          published_at: hoursAgo(5),
          summary:
            'AWS introduced next-generation custom accelerators delivering 40% improved price-performance for deep learning inference workloads.',
          symbol: 'AMZN',
        },
        {
          title: 'Amazon Same-Day Delivery Speed Reaches Record Efficiencies with Automated Fulfillment Robotics',
          publisher: 'The Motley Fool',
          url: 'https://finance.yahoo.com/news/amazon-same-day-delivery-robotics-efficiency-190011445.html',
          published_at: daysAgo(2, 3),
          summary:
            'Regionalized distribution networks reduce fulfillment costs per unit while expanding prime member retention across North American markets.',
          symbol: 'AMZN',
        },
      ],
      GOOGL: [
        {
          title: 'Alphabet Integrates Multimodal Gemini Search Overview across 100+ Global Markets',
          publisher: 'The Wall Street Journal',
          url: 'https://finance.yahoo.com/news/google-gemini-search-expansion-global-120033441.html',
          published_at: hoursAgo(7),
          summary:
            'Google parent Alphabet reports query volume increases and higher ad engagement as AI-powered reasoning overviews roll out worldwide.',
          symbol: 'GOOGL',
        },
      ],
      META: [
        {
          title: 'Meta Open-Source AI Model Ecosystem Crosses 500 Million Global Developer Downloads',
          publisher: 'CNBC',
          url: 'https://finance.yahoo.com/news/meta-llama-developer-downloads-ai-momentum-143011991.html',
          published_at: hoursAgo(8),
          summary:
            'Mark Zuckerberg emphasized open weights momentum and hardware optimization partners as Meta integrates smart assistants across WhatsApp and Instagram.',
          symbol: 'META',
        },
      ],
    };

    const tickerList = tickerSpecificMap[symbol] || [];

    // Generic fallback articles if custom ticker not in specific map
    const genericArticles: RawArticle[] = [
      {
        title: `${symbol} Reports Strong Quarterly Balance Sheet Resilience and Margin Expansion`,
        publisher: 'MarketWatch',
        url: `https://finance.yahoo.com/news/${symbol.toLowerCase()}-quarterly-financial-strength-091522001.html`,
        published_at: hoursAgo(4),
        summary: `Institutional filings indicate steady institutional accumulation in ${symbol} following robust execution in core operating units and cost optimization.`,
        symbol: symbol,
      },
      {
        title: `Industry Sector Review: Market Drivers and Growth Forecasts for ${symbol}`,
        publisher: 'Yahoo Finance',
        url: `https://finance.yahoo.com/news/${symbol.toLowerCase()}-sector-outlook-growth-drivers-114511223.html`,
        published_at: daysAgo(3, 1),
        summary: `Comprehensive equity research note examining the competitive moat, valuation multiples, and product roadmap for ${symbol}.`,
        symbol: symbol,
      },
      {
        title: `${symbol} Board Approves Share Repurchase Program and Dividend Reaffirmation`,
        publisher: "Investor's Business Daily",
        url: `https://finance.yahoo.com/news/${symbol.toLowerCase()}-board-capital-return-program-150033441.html`,
        published_at: daysAgo(10, 2),
        summary: `Executive leadership reaffirms disciplined capital allocation strategy prioritizing high-return investments and shareholder returns.`,
        symbol: symbol,
      },
    ];

    const result = [...tickerList, ...genericArticles];

    // Always include cross-ticker shared stories for popular symbols to test and demonstrate deduplication!
    if (['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'WMT'].includes(symbol)) {
      result.unshift(crossTickerStory1);
      result.push(crossTickerStory2);
      result.push(crossTickerStory3);
    }

    return result;
  }
}
