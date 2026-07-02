import { NextResponse } from "next/server";
import type { Market } from "@/lib/db";

export const runtime = "edge";

interface YahooQuote {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  quoteType?: string;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

// Which exchanges count as "US" vs "India".
const US_EXCH = new Set(["NASDAQ", "NYSE", "NYSEArca", "NYSE American", "OQB", "OQX", "PNK", "BATS"]);
const IN_EXCH = new Set(["NSE", "Bombay", "BSE"]);

function marketOf(exch: string | undefined): Market | null {
  if (!exch) return null;
  if (US_EXCH.has(exch)) return "US";
  if (IN_EXCH.has(exch)) return "IN";
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const market = (searchParams.get("market") || "US") as Market;

  if (q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      // Cache identical queries briefly to be gentle on the upstream API.
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ results: [], error: "upstream" }, { status: 502 });
    }

    const data = (await res.json()) as { quotes?: YahooQuote[] };
    const results: SearchResult[] = (data.quotes ?? [])
      .filter((qt) => qt.quoteType === "EQUITY" && qt.symbol)
      .filter((qt) => marketOf(qt.exchDisp) === market)
      .map((qt) => ({
        symbol: qt.symbol,
        name: qt.shortname || qt.longname || qt.symbol,
        exchange: qt.exchDisp || "",
      }))
      .slice(0, 8);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Search failed:", err);
    return NextResponse.json({ results: [], error: "failed" }, { status: 500 });
  }
}
