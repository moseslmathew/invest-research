import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
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
        const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

    // Keep only the last 10 trading days (2 weeks of business days)
    const slicedHistory = history.slice(-10);

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
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
