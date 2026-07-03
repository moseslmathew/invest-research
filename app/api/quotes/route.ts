import { NextResponse } from "next/server";

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  currency: string;
  time: number | null;
  change3mPct?: number | null;
}

const MAX_SYMBOLS = 60;
const CONCURRENCY = 8;

interface CacheEntry {
  quote: Quote;
  timestamp: number;
}

const quoteCache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

async function fetchOne(symbol: string): Promise<[string, Quote] | null> {
  const cached = quoteCache[symbol];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return [symbol, cached.quote];
  }

  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/` +
      `${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: {
        result?: {
          meta?: Record<string, any>;
          indicators?: {
            quote?: { close?: (number | null)[] }[];
          };
        }[];
      };
    };
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) {
      return null;
    }
    const change = price - prev;
    
    // Compute 3-month change percentage
    const closePrices = result?.indicators?.quote?.[0]?.close || [];
    let startPrice: number | null = null;
    for (const p of closePrices) {
      if (p !== null && Number.isFinite(p) && p > 0) {
        startPrice = p;
        break;
      }
    }
    
    let change3mPct: number | null = null;
    if (startPrice && startPrice > 0) {
      change3mPct = ((price - startPrice) / startPrice) * 100;
    }

    const quote: Quote = {
      price,
      change,
      changePct: (change / prev) * 100,
      currency: String(meta?.currency ?? "USD"),
      time: Number(meta?.regularMarketTime) || null,
      change3mPct,
    };

    quoteCache[symbol] = { quote, timestamp: Date.now() };
    return [symbol, quote];
  } catch {
    return null;
  }
}

// Small concurrency-limited map so a big watchlist doesn't fan out 60 requests
// at once.
async function pooledMap(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  let i = 0;
  async function worker() {
    while (i < symbols.length) {
      const sym = symbols[i++];
      const entry = await fetchOne(sym);
      if (entry) out[entry[0]] = entry[1];
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, worker)
  );
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = (searchParams.get("symbols") || "").trim();
  if (!raw) return NextResponse.json({ quotes: {} });

  const symbols = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_SYMBOLS);

  const quotes = await pooledMap(symbols);
  return NextResponse.json({ quotes });
}
