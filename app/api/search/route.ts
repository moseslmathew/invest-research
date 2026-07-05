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

// Yahoo search often returns mutual funds instead of equities for Indian
// queries (e.g. "hdfc" returns only mutual funds, not HDFCBANK.NS).
// This local fallback list covers popular NSE-listed stocks so users always
// get results even when Yahoo's search quality is poor.
const IN_POPULAR: { symbol: string; name: string }[] = [
  { symbol: "RELIANCE.NS", name: "Reliance Industries" },
  { symbol: "HDFCBANK.NS", name: "HDFC Bank" },
  { symbol: "ICICIBANK.NS", name: "ICICI Bank" },
  { symbol: "INFY.NS", name: "Infosys" },
  { symbol: "TCS.NS", name: "Tata Consultancy Services" },
  { symbol: "TATAMOTORS.NS", name: "Tata Motors" },
  { symbol: "TATASTEEL.NS", name: "Tata Steel" },
  { symbol: "TATAPOWER.NS", name: "Tata Power" },
  { symbol: "TATACONSUM.NS", name: "Tata Consumer Products" },
  { symbol: "SBIN.NS", name: "State Bank of India" },
  { symbol: "BHARTIARTL.NS", name: "Bharti Airtel" },
  { symbol: "ITC.NS", name: "ITC Limited" },
  { symbol: "LT.NS", name: "Larsen & Toubro" },
  { symbol: "ADANIPORTS.NS", name: "Adani Ports" },
  { symbol: "ADANIENT.NS", name: "Adani Enterprises" },
  { symbol: "ADANIGREEN.NS", name: "Adani Green Energy" },
  { symbol: "WIPRO.NS", name: "Wipro" },
  { symbol: "HCLTECH.NS", name: "HCL Technologies" },
  { symbol: "BAJFINANCE.NS", name: "Bajaj Finance" },
  { symbol: "BAJFINSV.NS", name: "Bajaj Finserv" },
  { symbol: "BAJAJ-AUTO.NS", name: "Bajaj Auto" },
  { symbol: "MARUTI.NS", name: "Maruti Suzuki" },
  { symbol: "SUNPHARMA.NS", name: "Sun Pharma" },
  { symbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories" },
  { symbol: "CIPLA.NS", name: "Cipla" },
  { symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank" },
  { symbol: "AXISBANK.NS", name: "Axis Bank" },
  { symbol: "INDUSINDBK.NS", name: "IndusInd Bank" },
  { symbol: "TECHM.NS", name: "Tech Mahindra" },
  { symbol: "POWERGRID.NS", name: "Power Grid Corporation" },
  { symbol: "NTPC.NS", name: "NTPC" },
  { symbol: "ONGC.NS", name: "ONGC" },
  { symbol: "COALINDIA.NS", name: "Coal India" },
  { symbol: "HINDALCO.NS", name: "Hindalco Industries" },
  { symbol: "JSWSTEEL.NS", name: "JSW Steel" },
  { symbol: "TITAN.NS", name: "Titan Company" },
  { symbol: "NESTLEIND.NS", name: "Nestle India" },
  { symbol: "HINDUNILVR.NS", name: "Hindustan Unilever" },
  { symbol: "ASIANPAINT.NS", name: "Asian Paints" },
  { symbol: "ULTRACEMCO.NS", name: "UltraTech Cement" },
  { symbol: "EICHERMOT.NS", name: "Eicher Motors" },
  { symbol: "HEROMOTOCO.NS", name: "Hero MotoCorp" },
  { symbol: "M&M.NS", name: "Mahindra & Mahindra" },
  { symbol: "DIVISLAB.NS", name: "Divi's Laboratories" },
  { symbol: "APOLLOHOSP.NS", name: "Apollo Hospitals" },
  { symbol: "SBILIFE.NS", name: "SBI Life Insurance" },
  { symbol: "HDFCLIFE.NS", name: "HDFC Life Insurance" },
  { symbol: "ZOMATO.NS", name: "Zomato" },
  { symbol: "PAYTM.NS", name: "Paytm (One97 Communications)" },
  { symbol: "IRCTC.NS", name: "IRCTC" },
  { symbol: "ATGL.NS", name: "Adani Total Gas" },
  { symbol: "ATHERENER.NS", name: "Ather Energy" },
];

function localIndianSearch(q: string): SearchResult[] {
  const lq = q.toLowerCase();
  return IN_POPULAR.filter(
    (s) =>
      s.symbol.toLowerCase().includes(lq) ||
      s.name.toLowerCase().includes(lq)
  )
    .slice(0, 8)
    .map((s) => ({ symbol: s.symbol, name: s.name, exchange: "NSE" }));
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
      `?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });

    let yahooResults: SearchResult[] = [];
    if (res.ok) {
      const data = (await res.json()) as { quotes?: YahooQuote[] };
      const seen = new Set<string>();
      for (const qt of data.quotes ?? []) {
        if (qt.quoteType !== "EQUITY" || !qt.symbol) continue;
        if (marketOf(qt.exchDisp) !== market) continue;
        if (seen.has(qt.symbol)) continue;
        seen.add(qt.symbol);
        yahooResults.push({
          symbol: qt.symbol,
          name: qt.shortname || qt.longname || qt.symbol,
          exchange: qt.exchDisp || "",
        });
        if (yahooResults.length >= 8) break;
      }
    }

    // For India: if Yahoo didn't return equity results, fall back to a
    // curated local list of popular NSE tickers with fuzzy matching.
    if (market === "IN" && yahooResults.length === 0) {
      yahooResults = localIndianSearch(q);
    }

    return NextResponse.json({ results: yahooResults });
  } catch (err) {
    console.error("Search failed:", err);
    // Even on total failure, try the local list for India
    if (market === "IN") {
      return NextResponse.json({ results: localIndianSearch(q) });
    }
    return NextResponse.json({ results: [], error: "failed" }, { status: 500 });
  }
}
