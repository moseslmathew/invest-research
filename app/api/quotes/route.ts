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
  price: number;
  change: number;
  changePct: number;
  currency: string;
  time: number | null;
  change3mPct?: number | null;
  liveTimestamp: number;
  histTimestamp: number;
}

const quoteCache: Record<string, CacheEntry> = {};
const LIVE_TTL_MS = 3 * 60 * 1000; // 3 minutes for live price/change
const HIST_TTL_MS = 60 * 60 * 1000; // 1 hour for 3M historical performance

async function fetchGoogleFinance(symbol: string): Promise<{ price: number; change: number; changePct: number; currency: string; time: number } | null> {
  try {
    const sym = symbol.split(".")[0].toUpperCase();
    let url = `https://www.google.com/finance/quote/${encodeURIComponent(sym)}`;
    if (symbol.endsWith(".NS")) {
      url = `https://www.google.com/finance/quote/${encodeURIComponent(sym)}:NSE`;
    } else if (symbol.endsWith(".BO")) {
      url = `https://www.google.com/finance/quote/${encodeURIComponent(sym)}:BOM`;
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const pattern = new RegExp(`"${sym}","[^"]+"\\],"([^"]+)",\\d+,"([^"]+)",\\[(\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),`);
    const match = html.match(pattern);
    if (!match) return null;

    return {
      price: parseFloat(match[3]),
      change: parseFloat(match[4]),
      changePct: parseFloat(match[5]),
      currency: match[2],
      time: Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

async function fetchYahooFinanceChart(symbol: string, range = "3mo"): Promise<{
  price: number;
  change: number;
  changePct: number;
  currency: string;
  time: number | null;
  change3mPct: number | null;
} | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/` +
      `${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const result = data.chart?.result?.[0];
    const meta = result?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) {
      return null;
    }
    const change = price - prev;

    let change3mPct: number | null = null;
    if (range === "3mo") {
      const closePrices = result?.indicators?.quote?.[0]?.close || [];
      let startPrice: number | null = null;
      for (const p of closePrices) {
        if (p !== null && Number.isFinite(p) && p > 0) {
          startPrice = p;
          break;
        }
      }
      if (startPrice && startPrice > 0) {
        change3mPct = ((price - startPrice) / startPrice) * 100;
      }
    }

    return {
      price,
      change,
      changePct: (change / prev) * 100,
      currency: String(meta?.currency ?? "USD"),
      time: Number(meta?.regularMarketTime) || null,
      change3mPct,
    };
  } catch {
    return null;
  }
}

async function fetchOne(symbol: string): Promise<[string, Quote] | null> {
  const now = Date.now();
  const cached = quoteCache[symbol];

  // 1. If cache is fully fresh, return it
  if (cached && (now - cached.liveTimestamp < LIVE_TTL_MS) && (now - cached.histTimestamp < HIST_TTL_MS)) {
    return [symbol, cached];
  }

  // Determine if we need to fetch historical 3M change
  const needHist = !cached || (now - cached.histTimestamp >= HIST_TTL_MS);
  
  let liveQuote: any = null;
  let fetchedFromYahoo = false;

  if (needHist) {
    // If we need historical 3M change, we MUST hit Yahoo Finance (with range=3mo)
    const yf = await fetchYahooFinanceChart(symbol, "3mo");
    if (yf) {
      liveQuote = yf;
      fetchedFromYahoo = true;
    }
  }

  // 2. If we didn't fetch from Yahoo yet, or if it failed, get the live quote
  if (!liveQuote) {
    // Alternating between Google Finance and Yahoo Finance (1d range) to load-balance hits
    const useGoogle = Math.random() > 0.5;
    if (useGoogle) {
      liveQuote = await fetchGoogleFinance(symbol);
    }
    
    // Fallback if google failed or if we chose Yahoo
    if (!liveQuote) {
      liveQuote = await fetchYahooFinanceChart(symbol, "1d");
      fetchedFromYahoo = true;
    }
    
    // Final fallback if Yahoo 1d failed
    if (!liveQuote && !useGoogle) {
      liveQuote = await fetchGoogleFinance(symbol);
    }
  }

  if (!liveQuote) {
    // If all fetch attempts failed, return cached value if any, or null
    return cached ? [symbol, cached] : null;
  }

  // Resolve 3M change percentage
  let change3mPct: number | null | undefined = null;
  let histTimestamp = cached ? cached.histTimestamp : 0;

  if (fetchedFromYahoo && liveQuote.change3mPct != null) {
    change3mPct = liveQuote.change3mPct;
    histTimestamp = now;
  } else if (cached) {
    change3mPct = cached.change3mPct;
  } else {
    // If we have no cached 3M performance yet and didn't fetch from Yahoo, fetch it now
    const yfHist = await fetchYahooFinanceChart(symbol, "3mo");
    if (yfHist) {
      change3mPct = yfHist.change3mPct;
      histTimestamp = now;
    }
  }

  const quote: Quote = {
    price: liveQuote.price,
    change: liveQuote.change,
    changePct: liveQuote.changePct,
    currency: liveQuote.currency,
    time: liveQuote.time,
    change3mPct,
  };

  // Cache the result
  quoteCache[symbol] = {
    ...quote,
    liveTimestamp: now,
    histTimestamp,
  };

  return [symbol, quote];
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
