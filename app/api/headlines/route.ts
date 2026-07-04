import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Market } from "@/lib/db";

// Node.js runtime (not edge): a cold recompute clusters the last-2-days feed via
// an OpenAI call, which can run past the edge time limit.
export const runtime = "nodejs";
export const maxDuration = 60;

// A single trending story, ranked by how many distinct outlets covered it.
interface TopStory {
  headline: string;
  summary: string;
  category?: string;
  sentiment?: "bullish" | "bearish" | "neutral";
  // The distinct outlets/channels that ran this story (dedup, display names).
  channels: string[];
  channelCount: number;
  // Best-effort representative article (matched back to the raw feed).
  url?: string;
  time?: number;
}

interface RawItem {
  title: string;
  source: string;
  link: string;
  time: number;
}

// Cached results are fresh for 3h; the 2-day headline window moves fast, so we
// recompute a few times a day (a manual ?refresh=1 bypasses this immediately).
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;

// Only the last two days of coverage, per the product spec.
const NEWS_WINDOW = "when:2d";

// We surface at least this many top stories per market.
const TARGET_COUNT = 10;

// Cap on the deduped raw-headline pool fed to the clustering model.
const MAX_ITEMS = 140;

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
  "cnbctv18.com",
  "etnownews.com",
  "ndtvprofit.com",
  "bqprime.com",
  "businesstoday.in",
  "zeebiz.com",
  "moneycontrol.com",
  "economictimes.indiatimes.com",
  "livemint.com",
  "business-standard.com",
  "financialexpress.com",
  "groww.in",
  "zerodha.com",
];

/* ---------- Mock fallback (no OpenAI key) ---------- */

const MOCK_US: Omit<TopStory, "channelCount">[] = [
  { headline: "Fed holds rates steady, signals cautious path on future cuts", summary: "Markets digest the central bank's latest guidance as officials weigh sticky inflation against a cooling labor market.", category: "Macro", sentiment: "neutral", channels: ["CNBC", "Bloomberg", "Reuters", "The Wall Street Journal", "MarketWatch", "Barron's"] },
  { headline: "Nvidia extends AI rally as Blackwell demand stays red-hot", summary: "Chip leader gains after fresh analyst upgrades and reports of sustained hyperscaler orders.", category: "Technology", sentiment: "bullish", channels: ["CNBC", "Reuters", "Yahoo Finance", "Business Insider", "The Motley Fool"] },
  { headline: "Big banks kick off earnings season with mixed results", summary: "Trading revenue beats offset softer loan growth as lenders set the tone for Q results.", category: "Earnings", sentiment: "neutral", channels: ["Bloomberg", "Reuters", "The Wall Street Journal", "CNBC"] },
  { headline: "Oil slides as demand worries outweigh supply cuts", summary: "Crude retreats on softer global growth signals despite OPEC+ production restraint.", category: "Commodities", sentiment: "bearish", channels: ["Reuters", "Bloomberg", "MarketWatch", "Investing.com"] },
  { headline: "Tesla deliveries beat estimates on China strength", summary: "EV maker tops forecasts, easing concerns about demand in a key growth market.", category: "Autos", sentiment: "bullish", channels: ["CNBC", "Reuters", "Yahoo Finance", "Barron's"] },
  { headline: "Apple pre-orders point to strong iPhone cycle", summary: "Early demand signals lift sentiment ahead of the company's next earnings report.", category: "Technology", sentiment: "bullish", channels: ["MarketWatch", "Bloomberg", "Business Insider"] },
  { headline: "S&P 500 notches record close on tech leadership", summary: "Megacap gains push the benchmark to fresh highs as breadth improves.", category: "Markets", sentiment: "bullish", channels: ["CNBC", "Reuters", "Yahoo Finance"] },
  { headline: "Microsoft expands Copilot amid cloud licensing scrutiny", summary: "New AI features roll out even as regulators examine the company's cloud terms.", category: "Technology", sentiment: "neutral", channels: ["Bloomberg", "The Wall Street Journal", "Reuters"] },
  { headline: "Jobs report comes in hotter than expected", summary: "Stronger payrolls complicate the rate outlook and lift Treasury yields.", category: "Macro", sentiment: "neutral", channels: ["Reuters", "CNBC", "MarketWatch"] },
  { headline: "Amazon ramps data-center buildout for AI workloads", summary: "AWS expands capacity to capture rising enterprise demand for AI compute.", category: "Technology", sentiment: "bullish", channels: ["Barron's", "CNBC", "Business Insider"] },
];

const MOCK_IN: Omit<TopStory, "channelCount">[] = [
  { headline: "Sensex, Nifty hit record highs on strong FII inflows", summary: "Benchmarks close at lifetime highs as foreign buying and IT strength drive the rally.", category: "Markets", sentiment: "bullish", channels: ["CNBC-TV18", "ET NOW", "Moneycontrol", "The Economic Times", "Mint", "Business Standard"] },
  { headline: "RBI keeps repo rate unchanged, retains stance", summary: "The central bank holds steady while flagging inflation risks and steady growth.", category: "Macro", sentiment: "neutral", channels: ["CNBC-TV18", "Moneycontrol", "The Economic Times", "Zee Business", "NDTV Profit"] },
  { headline: "Reliance gains as Jio ARPU growth beats expectations", summary: "Telecom momentum and retail plans lift the conglomerate's shares.", category: "Telecom", sentiment: "bullish", channels: ["The Economic Times", "Moneycontrol", "Mint", "Business Standard"] },
  { headline: "HCL Tech surges on $1.14 billion mega AI deal", summary: "The IT major becomes the top Nifty gainer after a large digital transformation win.", category: "IT", sentiment: "bullish", channels: ["Moneycontrol", "CNBC-TV18", "Business Standard", "Financial Express"] },
  { headline: "TCS results in focus as IT earnings season begins", summary: "Investors watch guidance for signs of a recovery in global tech spending.", category: "Earnings", sentiment: "neutral", channels: ["ET NOW", "Moneycontrol", "Mint", "Zee Business"] },
  { headline: "Tata Motors rallies on JLR recovery and EV push", summary: "Domestic EV expansion and JLR sales lift the automaker's outlook.", category: "Autos", sentiment: "bullish", channels: ["Moneycontrol", "The Economic Times", "CNBC-TV18"] },
  { headline: "Adani group stocks rise on port volume growth", summary: "Container volumes climb double digits following recent acquisitions.", category: "Infrastructure", sentiment: "bullish", channels: ["Moneycontrol", "Business Standard", "Mint"] },
  { headline: "SBI hits lows on NPAs as loan growth stays robust", summary: "Asset quality improves further while credit growth remains strong.", category: "Banking", sentiment: "bullish", channels: ["The Economic Times", "Moneycontrol", "CNBC-TV18"] },
  { headline: "Infosys guidance calms nervous IT investors", summary: "Reaffirmed outlook eases concerns about cautious enterprise spending.", category: "IT", sentiment: "neutral", channels: ["Business Standard", "Moneycontrol", "ET NOW"] },
  { headline: "Maruti Suzuki gains on festive-season demand hopes", summary: "Strong booking trends support the automaker ahead of the festive quarter.", category: "Autos", sentiment: "bullish", channels: ["Zee Business", "Moneycontrol", "Mint"] },
];

const mockFor = (market: Market): TopStory[] =>
  (market === "IN" ? MOCK_IN : MOCK_US).map((s) => ({
    ...s,
    channelCount: s.channels.length,
  }));

/* ---------- DB cache (best-effort; degrades gracefully) ---------- */

async function ensureCacheTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS headlines_cache (
      market      TEXT PRIMARY KEY CHECK (market IN ('US', 'IN')),
      stories     JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function readCache(
  market: Market
): Promise<{ stories: TopStory[]; updatedAt: string } | null> {
  try {
    const rows = await sql`
      SELECT stories, updated_at FROM headlines_cache WHERE market = ${market}
    `;
    if (!rows.length) return null;
    return {
      stories: rows[0].stories as TopStory[],
      updatedAt: new Date(rows[0].updated_at as string).toISOString(),
    };
  } catch {
    return null;
  }
}

async function writeCache(market: Market, stories: TopStory[]): Promise<string> {
  const updatedAt = new Date().toISOString();
  try {
    await ensureCacheTable();
    await sql`
      INSERT INTO headlines_cache (market, stories, updated_at)
      VALUES (${market}, ${JSON.stringify(stories)}, ${updatedAt})
      ON CONFLICT (market) DO UPDATE
        SET stories = EXCLUDED.stories, updated_at = EXCLUDED.updated_at
    `;
  } catch {
    /* caching is optional — ignore write failures */
  }
  return updatedAt;
}

/* ---------- Headline aggregation ---------- */

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

function parseItems(xml: string): RawItem[] {
  const items: RawItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    let title = decodeEntities(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    let source = decodeEntities(block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "");
    const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "").trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
    const time = Math.floor(Date.parse(pubDate) / 1000) || Math.floor(Date.now() / 1000);
    // Google News appends " - Publisher" to the title; strip it and use as the
    // source when the explicit <source> tag is missing.
    const parts = title.split(" - ");
    if (parts.length > 1) {
      const trailing = parts.pop() as string;
      title = parts.join(" - ");
      if (!source) source = trailing.trim();
    }
    if (title.trim())
      items.push({ title: title.trim(), source: source.trim(), link, time });
  }
  return items;
}

// Fan out several Google News queries (last 2 days) across the tracked outlets
// plus broad market queries, then merge/dedupe into one raw pool.
async function fetchRawItems(market: Market): Promise<RawItem[]> {
  const sources = market === "IN" ? IN_SOURCES : US_SOURCES;
  const locale = market === "IN" ? "hl=en-IN&gl=IN&ceid=IN:en" : "hl=en-US&gl=US&ceid=US:en";

  // Keep the pool to genuinely financial stories so cross-coverage is measured
  // over market news, not general headlines from these outlets.
  const topic =
    market === "IN"
      ? "(stock OR shares OR market OR Sensex OR Nifty OR NSE OR earnings OR results OR RBI OR IPO)"
      : "(stock OR shares OR market OR Nasdaq OR earnings OR Fed OR economy OR \"Wall Street\")";

  // Restrict every query to the tracked top financial outlets (via site:), so
  // the channels we rank coverage across are all reputable financial channels.
  // Small site: OR groups return more reliably than one long OR chain.
  const CHUNK = 4;
  const queries: string[] = [];
  for (let i = 0; i < sources.length; i += CHUNK) {
    const group = sources.slice(i, i + CHUNK);
    queries.push(
      `(${group.map((s) => `site:${s}`).join(" OR ")}) ${topic} ${NEWS_WINDOW}`
    );
  }
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
  const items: RawItem[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled" || !r.value) continue;
    for (const it of parseItems(r.value)) {
      const key = it.title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(it);
      if (items.length >= MAX_ITEMS) return items;
    }
  }
  return items;
}

// Token-overlap match: find the raw item whose title best matches a story
// headline, so we can attach a representative link + timestamp.
function bestMatch(headline: string, items: RawItem[]): RawItem | undefined {
  const tokens = new Set(
    headline.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 4)
  );
  if (tokens.size === 0) return undefined;
  let best: RawItem | undefined;
  let bestScore = 0;
  for (const it of items) {
    const t = it.title.toLowerCase();
    let score = 0;
    for (const tok of tokens) if (t.includes(tok)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = it;
    }
  }
  // Require at least two shared distinctive tokens to avoid spurious matches.
  return bestScore >= 2 ? best : undefined;
}

/* ---------- AI clustering ---------- */

// Cluster the raw feed into the most-covered stories of the last two days,
// ranked by the number of distinct outlets carrying each story.
async function computeHeadlines(
  market: Market
): Promise<{ stories: TopStory[]; mock: boolean } | null> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const isMock =
    !apiKey ||
    apiKey === "your-api-key-here" ||
    apiKey.startsWith("YOUR_") ||
    apiKey.trim() === "";
  if (isMock) return { stories: mockFor(market), mock: true };

  const items = await fetchRawItems(market);
  if (items.length === 0) return null;

  const prompt = `You are a financial news editor reviewing the LAST 2 DAYS of business-news headlines for the market: ${
    market === "US" ? "United States (US)" : "India (IN)"
  }. Each headline is tagged with the outlet that published it.

Cluster these headlines into DISTINCT news stories (the same underlying event reported by different outlets = one story). Then rank the stories by HOW WIDELY COVERED they are — i.e. the number of DIFFERENT outlets/channels that reported the same story. The most cross-covered stories are the top headlines.

Return the TOP ${Math.max(TARGET_COUNT, 12)} stories, most widely covered first. For each story provide:
1. "headline": a clean, concise headline for the story (not a verbatim copy — a neutral summary title).
2. "summary": one sentence explaining what happened and why it matters.
3. "category": a short topic label (e.g. "Macro", "Earnings", "Technology", "Banking", "Autos", "Commodities", "Markets", "IPO").
4. "sentiment": overall market sentiment of the story — 'bullish', 'bearish', or 'neutral'.
5. "channels": the list of DISTINCT outlet names (from the "source" fields below) that covered this story. Use the exact outlet names as they appear. Include every outlet you grouped into the story.

Prefer genuinely market-relevant stories (macro, earnings, big moves, deals, regulation) over generic filler. Only use outlet names that actually appear in the data.

Headlines (last 2 days):
${JSON.stringify(items.map((i) => ({ title: i.title, source: i.source })), null, 2)}

Respond ONLY with JSON:
{
  "stories": [
    { "headline": "string", "summary": "string", "category": "string", "sentiment": "bullish" | "bearish" | "neutral", "channels": ["string"] }
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
        { role: "system", content: "You are a professional financial news editor." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });
  if (!apiRes.ok) return null;

  const resData = await apiRes.json();
  const content = resData.choices?.[0]?.message?.content;
  if (!content) return null;

  const parsed = JSON.parse(content);
  if (!Array.isArray(parsed.stories) || parsed.stories.length === 0) return null;

  const stories: TopStory[] = parsed.stories
    .map((s: TopStory) => {
      // Dedupe channel names case-insensitively, keep first-seen display form.
      const byKey = new Map<string, string>();
      for (const c of Array.isArray(s.channels) ? s.channels : []) {
        const name = (c || "").trim();
        if (name) byKey.set(name.toLowerCase(), name);
      }
      const channels = [...byKey.values()];
      const rep = bestMatch(s.headline, items);
      return {
        headline: s.headline,
        summary: s.summary,
        category: s.category,
        sentiment: s.sentiment,
        channels,
        channelCount: channels.length,
        url: rep?.link || undefined,
        time: rep?.time,
      };
    })
    .filter((s: TopStory) => s.headline && s.channelCount >= 1)
    // Most widely covered first; break ties by recency.
    .sort((a: TopStory, b: TopStory) =>
      b.channelCount !== a.channelCount
        ? b.channelCount - a.channelCount
        : (b.time ?? 0) - (a.time ?? 0)
    );

  if (stories.length === 0) return null;
  return { stories, mock: false };
}

/* ---------- Route ---------- */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") || "US") as Market;
  const forceRefresh = searchParams.get("refresh") === "1";

  if (!forceRefresh) {
    const cached = await readCache(market);
    if (cached && Date.now() - new Date(cached.updatedAt).getTime() < CACHE_TTL_MS) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  try {
    const computed = await computeHeadlines(market);
    if (computed && computed.stories.length > 0) {
      const updatedAt = computed.mock
        ? new Date().toISOString()
        : await writeCache(market, computed.stories);
      return NextResponse.json({ stories: computed.stories, updatedAt, cached: false });
    }
  } catch (err) {
    console.error("Headlines compute error:", err);
  }

  // Compute failed — fall back to any (possibly stale) cache, then mock data.
  const stale = await readCache(market);
  if (stale) return NextResponse.json({ ...stale, cached: true, stale: true });
  return NextResponse.json({
    stories: mockFor(market),
    updatedAt: new Date().toISOString(),
    cached: false,
  });
}
