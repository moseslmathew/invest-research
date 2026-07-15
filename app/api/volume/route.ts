import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await guardRequest(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const range = (searchParams.get("range") || "2w").toLowerCase();

    // Yahoo's chart API only accepts a fixed set of ranges (…1y, 2y, 5y, 10y,
    // max). "3y" isn't one of them, so fetch 5y weekly and slice it below.
    let yahooRange = "1mo";
    let interval = "1d";
    if (range === "3m") {
      yahooRange = "3mo";
    } else if (range === "1y") {
      yahooRange = "1y";
      interval = "1wk";
    } else if (range === "3y" || range === "5y") {
      yahooRange = "5y";
      interval = "1wk";
    } else if (range === "all") {
      yahooRange = "max";
      interval = "1mo";
    }

    // Multi-year spans need the year in the axis label to stay unambiguous.
    const showYear = range === "3y" || range === "5y" || range === "all";

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${yahooRange}&interval=${interval}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch volume data from Yahoo Finance" }, { status: 502 });
    }

    const data = (await res.json()) as any;
    const result = data.chart?.result?.[0];
    if (!result) {
      return NextResponse.json({ error: "No data found for symbol" }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const indicators = result.indicators?.quote?.[0] || {};
    const volumes = indicators.volume || [];
    const closePrices = indicators.close || [];

    const history: { date: string; volume: number; close: number; up: boolean }[] = [];

    // Map the historical data points
    for (let i = 0; i < timestamps.length; i++) {
      const vol = volumes[i];
      const close = closePrices[i];
      const time = timestamps[i];

      if (vol != null && Number.isFinite(vol) && close != null && Number.isFinite(close) && time != null) {
        const dateObj = new Date(time * 1000);
        const dateStr = showYear
          ? dateObj.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
          : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        history.push({
          date: dateStr,
          volume: vol,
          close: Number(close.toFixed(2)),
          up: false,
        });
      }
    }

    // Determine if the price went up or down compared to the prior day
    for (let i = 0; i < history.length; i++) {
      if (i === 0) {
        history[i].up = true;
      } else {
        history[i].up = history[i].close >= history[i - 1].close;
      }
    }

    // 2w → last 10 trading days; 3y → last ~156 weeks of the 5y weekly series;
    // everything else uses the full fetched series.
    const slicedHistory =
      range === "2w" ? history.slice(-10) : range === "3y" ? history.slice(-156) : history;

    if (slicedHistory.length === 0) {
      return NextResponse.json({ error: "No valid volume data points available" }, { status: 404 });
    }

    // Calculate summary statistics
    const totalVolume = slicedHistory.reduce((acc, curr) => acc + curr.volume, 0);
    const avgVolume = totalVolume / slicedHistory.length;
    const peakVolumeItem = slicedHistory.reduce((prev, curr) => (curr.volume > prev.volume ? curr : prev), slicedHistory[0]);

    return NextResponse.json({
      history: slicedHistory,
      stats: {
        totalVolume,
        avgVolume,
        peakVolume: peakVolumeItem.volume,
        peakVolumeDate: peakVolumeItem.date,
      },
    });
  } catch (err: any) {
    console.error("volume route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
