import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Market } from "@/lib/db";

export const runtime = "edge";

interface TrendingStock {
  symbol: string;
  name: string;
  sentiment: "bullish" | "bearish" | "neutral";
  rationale: string;
  source?: string;
}

interface Headline {
  title: string;
  source: string;
}

// Cached results are considered fresh for 24h; after that the next request
// recomputes (a manual refresh via ?refresh=1 bypasses this immediately).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Business-news domains aggregated per market (Google News `site:` filters).
const US_SOURCES = [
  "cnbc.com",
  "bloomberg.com",
  "reuters.com",
  "wsj.com",
  "marketwatch.com",
  "finance.yahoo.com",
  "investing.com",
  "barrons.com",
  "fool.com",
  "businessinsider.com",
];
const IN_SOURCES = [
  "economictimes.indiatimes.com",
  "moneycontrol.com",
  "livemint.com",
  "business-standard.com",
  "financialexpress.com",
  "cnbctv18.com",
  "thehindubusinessline.com",
  "ndtvprofit.com",
  "zeebiz.com",
  "bseindia.com",
];

const MOCK_US_STOCKS: TrendingStock[] = [
  { symbol: "NVDA", name: "Nvidia", sentiment: "bullish", rationale: "Surges on high demand for Blackwell AI chips and positive analyst price target upgrades.", source: "CNBC" },
  { symbol: "TSLA", name: "Tesla", sentiment: "bullish", rationale: "Beats quarterly delivery estimates driven by strong expansion in the Chinese market.", source: "Reuters" },
  { symbol: "MSFT", name: "Microsoft", sentiment: "neutral", rationale: "Announces further Copilot AI additions amid investigations into cloud licensing policies.", source: "Bloomberg" },
  { symbol: "AAPL", name: "Apple", sentiment: "bullish", rationale: "Gains momentum following reports of robust pre-order demand for new iPhone lineups.", source: "MarketWatch" },
  { symbol: "AMZN", name: "Amazon", sentiment: "bullish", rationale: "AWS cloud division expands datacenter footprint to capture rising enterprise AI workloads.", source: "Barron's" },
  { symbol: "META", name: "Meta", sentiment: "bullish", rationale: "Shares hit records after launching high-performing open Llama models for developers.", source: "The Wall Street Journal" },
  { symbol: "GOOGL", name: "Alphabet", sentiment: "neutral", rationale: "Maintains search dominance while facing regulatory antitrust challenges in adtech divisions.", source: "Reuters" },
  { symbol: "AMD", name: "AMD", sentiment: "bullish", rationale: "Unveils new MI325X AI accelerators to directly compete with Nvidia's hardware stack.", source: "CNBC" },
  { symbol: "NFLX", name: "Netflix", sentiment: "bullish", rationale: "Stock rallies on strong subscriber additions and higher ad-tier subscription conversion.", source: "MarketWatch" },
  { symbol: "AVGO", name: "Broadcom", sentiment: "bullish", rationale: "Receives buy ratings from major analysts on custom TPU design wins with cloud hyperscalers.", source: "Bloomberg" },
];

const MOCK_IN_STOCKS: TrendingStock[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries", sentiment: "bullish", rationale: "Jio Infocomm registers strong ARPU growth and plans a potential retail listing spin-off.", source: "The Economic Times" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors", sentiment: "bullish", rationale: "JLR sales recovery and expansion of domestic EV fleet drive record quarterly revenues.", source: "Moneycontrol" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank", sentiment: "neutral", rationale: "Focuses on credit-to-deposit ratio improvements after merger integration phases.", source: "Mint" },
  { symbol: "INFY.NS", name: "Infosys", sentiment: "neutral", rationale: "Guidance confirmation calms investors amid cautious global enterprise IT spending.", source: "Business Standard" },
  { symbol: "SBIN.NS", name: "State Bank of India", sentiment: "bullish", rationale: "NPA levels drop to historic lows alongside robust loan credit growth across divisions.", source: "The Economic Times" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports", sentiment: "bullish", rationale: "Container volumes rise by double-digits following key acquisitions in domestic shipping hubs.", source: "Moneycontrol" },
  { symbol: "LT.NS", name: "Larsen & Toubro", sentiment: "bullish", rationale: "Secures mega infrastructure orders in Middle East power transmission and refinery sectors.", source: "CNBC-TV18" },
  { symbol: "ITC.NS", name: "ITC Limited", sentiment: "neutral", rationale: "Board approves hotel division demerger plan, prompting mixed analyst evaluations.", source: "Financial Express" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank", sentiment: "bullish", rationale: "Maintains industry-leading net interest margins (NIMs) with strong asset growth.", source: "Mint" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel", sentiment: "bullish", rationale: "Rides on recent mobile tariff revisions and rising 5G adoption in rural sectors.", source: "Business Standard" },
];

const mockFor = (market: Market) => (market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS);

/* ---------- DB cache (best-effort; degrades gracefully) ---------- */

async function ensureCacheTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS trending_cache (
      market      TEXT PRIMARY KEY CHECK (market IN ('US', 'IN')),
      stocks      JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function readCache(
  market: Market
): Promise<{ stocks: TrendingStock[]; updatedAt: string } | null> {
  try {
    const rows = await sql`
      SELECT stocks, updated_at FROM trending_cache WHERE market = ${market}
    `;
    if (!rows.length) return null;
    return {
      stocks: rows[0].stocks as TrendingStock[],
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeCache(market: Market, stocks: TrendingStock[]): Promise<string> {
  const updatedAt = new Date().toISOString();
  try {
    await ensureCacheTable();
    await sql`
      INSERT INTO trending_cache (market, stocks, updated_at)
      VALUES (${market}, ${JSON.stringify(stocks)}, ${updatedAt})
      ON CONFLICT (market) DO UPDATE
        SET stocks = EXCLUDED.stocks, updated_at = EXCLUDED.updated_at
    `;
  } catch {
    /* caching is optional — ignore write failures */
  }
  return updatedAt;
}

/* ---------- News aggregation ---------- */

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—");
}

function parseItems(xml: string): Headline[] {
  const items: Headline[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    let title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    // Google News tags each item with its publisher in a <source> element and
    // also appends " - Publisher" to the title. Prefer the explicit tag.
    let source = decodeEntities(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "");
    const parts = title.split(" - ");
    if (parts.length > 1) {
      const trailing = parts.pop() as string;
      title = parts.join(" - ");
      if (!source) source = trailing.trim();
    }
    if (title.trim()) items.push({ title: title.trim(), source: source.trim() });
  }
  return items;
}

// Aggregate the last two weeks of headlines from 8–10 outlets. We run a few
// parallel Google News queries (a broad market query plus site-filtered
// groups) and merge + dedupe the results for wider coverage.
async function fetchHeadlines(market: Market): Promise<Headline[]> {
  const sources = market === "IN" ? IN_SOURCES : US_SOURCES;
  const locale = market === "IN" ? "hl=en-IN&gl=IN&ceid=IN:en" : "hl=en-US&gl=US&ceid=US:en";
  const general =
    market === "IN"
      ? "(Indian stock market OR Sensex OR Nifty OR NSE earnings) when:14d"
      : "(US stock market OR Wall Street OR earnings OR shares) when:14d";

  const half = Math.ceil(sources.length / 2);
  const siteQueries = [sources.slice(0, half), sources.slice(half)].map(
    (group) => `(${group.map((s) => `site:${s}`).join(" OR ")}) when:14d`
  );

  const queries = [general, ...siteQueries];
  const urls = queries.map(
    (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${locale}`
  );

  const results = await Promise.allSettled(
    urls.map((u) =>
      fetch(u, {
        next: { revalidate: 1800 },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }).then((r) => (r.ok ? r.text() : ""))
    )
  );

  const seen = new Set<string>();
  const headlines: Headline[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    for (const h of parseItems(r.value)) {
      const key = h.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      headlines.push(h);
      if (headlines.length >= 40) return headlines;
    }
  }
  return headlines;
}

/* ---------- AI extraction ---------- */

// Returns fresh trending picks, or null on failure. `mock` indicates the
// result is placeholder data (no OpenAI key), which we don't persist.
async function computeTrending(
  market: Market
): Promise<{ stocks: TrendingStock[]; mock: boolean } | null> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isMock =
    !apiKey ||
    apiKey === "your-api-key-here" ||
    apiKey.startsWith("YOUR_") ||
    apiKey.trim() === "";
  if (isMock) return { stocks: mockFor(market), mock: true };

  const headlines = await fetchHeadlines(market);
  if (headlines.length === 0) return null;

  const prompt = `You are a financial analyst reviewing the last TWO WEEKS of business-news headlines aggregated from 8-10 major outlets for the market: ${
    market === "US" ? "United States (US)" : "India (IN)"
  }.

From the headlines below (each tagged with the outlet that published it), identify the 10 publicly traded companies that are currently the most discussed or most materially impacted. Weigh companies that recur across multiple headlines/outlets more heavily.

For each company provide:
1. The stock ticker — it MUST be a valid Yahoo Finance symbol.
   - India (IN): symbol MUST end in .NS (e.g. RELIANCE.NS, TATAMOTORS.NS). Use .BO only if BSE-only.
   - US: standard symbols (e.g. NVDA, TSLA, AAPL).
2. The official or short company name.
3. Sentiment from the coverage: 'bullish', 'bearish', or 'neutral'.
4. A concise 1-sentence rationale for why it's in the news.
5. "source": the outlet that published the single most relevant headline for this company. Use EXACTLY one of the outlet names shown in the "source" fields below — do not invent a source. If unsure, use the source of the headline your rationale is based on.

Only include real, currently listed companies you can confidently map to a ticker. Return exactly up to 10, most prominent first.

Headlines (last 14 days):
${JSON.stringify(headlines, null, 2)}

Respond ONLY with JSON:
{
  "stocks": [
    { "symbol": "string", "name": "string", "sentiment": "bullish" | "bearish" | "neutral", "rationale": "string", "source": "string" }
  ]
}`;

  const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional financial research analyst." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });
  if (!apiRes.ok) return null;

  const resData = await apiRes.json();
  const content = resData.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.stocks) || parsed.stocks.length === 0) return null;

  // Only trust a source the model actually saw in the feed; drop hallucinations.
  const validSources = new Map(
    headlines.filter((h) => h.source).map((h) => [h.source.toLowerCase(), h.source])
  );
  const stocks: TrendingStock[] = parsed.stocks.slice(0, 10).map((s: TrendingStock) => {
    const canonical = s.source ? validSources.get(s.source.trim().toLowerCase()) : undefined;
    return { ...s, source: canonical };
  });
  return { stocks, mock: false };
}

/* ---------- Route ---------- */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") || "US") as Market;
  const forceRefresh = searchParams.get("refresh") === "1";

  // Serve a fresh cache hit unless a manual refresh was requested.
  if (!forceRefresh) {
    const cached = await readCache(market);
    if (cached && Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  try {
    const computed = await computeTrending(market);
    if (computed && computed.stocks.length > 0) {
      // Persist real results so the next visitor is served instantly and the
      // expensive analysis only reruns once per day (or on manual refresh).
      const updatedAt = computed.mock
        ? new Date().toISOString()
        : await writeCache(market, computed.stocks);
      return NextResponse.json({ stocks: computed.stocks, updatedAt, cached: false });
    }
  } catch (err) {
    console.error("Trending compute error:", err);
  }

  // Compute failed — fall back to any (possibly stale) cache, then mock data.
  const stale = await readCache(market);
  if (stale) return NextResponse.json({ ...stale, cached: true, stale: true });
  return NextResponse.json({ stocks: mockFor(market), updatedAt: new Date().toISOString(), cached: false });
}
