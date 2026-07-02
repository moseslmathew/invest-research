import { NextResponse } from "next/server";

export interface Quote {
  price: number;
  change: number;
  changePct: number;
  currency: string;
  time: number | null;
}

const MAX_SYMBOLS = 60;
const CONCURRENCY = 8;

// Yahoo's batched /v7/finance/quote endpoint now requires an auth crumb, but the
// per-symbol /v8/finance/chart endpoint is open and carries the fields we need.
async function fetchOneYahooBackup(symbol: string): Promise<[string, Quote] | null> {
  try {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/` +
      `${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      chart?: { result?: { meta?: Record<string, number | string> }[] };
    };
    const meta = data.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) {
      return null;
    }
    const change = price - prev;
    return [
      symbol,
      {
        price,
        change,
        changePct: (change / prev) * 100,
        currency: String(meta?.currency ?? "USD"),
        time: Number(meta?.regularMarketTime) || null,
      },
    ];
  } catch {
    return null;
  }
}

async function fetchOne(symbol: string): Promise<[string, Quote] | null> {
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

    if (!res.ok) {
      return fetchOneYahooBackup(symbol);
    }

    const html = await res.text();
    const pattern = new RegExp(`"${sym}","[^"]+"\\],"([^"]+)",\\d+,"([^"]+)",\\[(\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),`);
    const match = html.match(pattern);

    if (!match) {
      return fetchOneYahooBackup(symbol);
    }

    const price = parseFloat(match[3]);
    const change = parseFloat(match[4]);
    const changePct = parseFloat(match[5]);
    const currency = match[2];

    return [
      symbol,
      {
        price,
        change,
        changePct,
        currency,
        time: Math.floor(Date.now() / 1000),
      },
    ];
  } catch {
    return fetchOneYahooBackup(symbol);
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
