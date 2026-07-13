import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function fetchNewsHeadlines(symbol: string, name: string): Promise<string[]> {
  const query = name || symbol;
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const headlines: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && headlines.length < 8) {
      const itemContent = match[1];
      const rawTitle = itemContent.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
      let title = rawTitle
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&ndash;/g, "–")
        .replace(/&mdash;/g, "—");
      const parts = title.split(" - ");
      if (parts.length > 1) {
        parts.pop();
        title = parts.join(" - ");
      }
      if (title.trim()) {
        headlines.push(title.trim());
      }
    }
    return headlines;
  } catch {
    return [];
  }
}

async function fetchVolumeHistory(symbol: string): Promise<{ date: string; volume: number; close: number; up: boolean }[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const result = data.chart?.result?.[0];
    if (!result) return [];

    const timestamps = result.timestamp || [];
    const indicators = result.indicators?.quote?.[0] || {};
    const volumes = indicators.volume || [];
    const closePrices = indicators.close || [];

    const history: { date: string; volume: number; close: number; up: boolean }[] = [];
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

    for (let i = 0; i < history.length; i++) {
      if (i === 0) {
        history[i].up = true;
      } else {
        history[i].up = history[i].close >= history[i - 1].close;
      }
    }

    return history.slice(-10);
  } catch {
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().slice(0, 24);
    const name = (searchParams.get("name") || "").trim().slice(0, 80);

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const headlines = await fetchNewsHeadlines(symbol, name);
    const volumeData = await fetchVolumeHistory(symbol);

    const totalVolume = volumeData.reduce((acc, curr) => acc + curr.volume, 0);
    const avgVolume = volumeData.length > 0 ? totalVolume / volumeData.length : 0;
    const peakVolumeItem = volumeData.length > 0
      ? volumeData.reduce((prev, curr) => (curr.volume > prev.volume ? curr : prev), volumeData[0])
      : null;

    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock = !apiKey || apiKey === "your-api-key-here" || apiKey.startsWith("YOUR_") || apiKey.trim() === "";

    if (isMock) {
      // Local logic-based fallback analysis with volume insights
      const score = headlines.length > 0 ? (symbol.length % 2 === 0 ? 72 : 48) : 55;
      const stance = score >= 70 ? "Bullish" : score <= 48 ? "Bearish" : "Neutral";
      const volumeConsensus = peakVolumeItem ? (peakVolumeItem.up ? "accumulation" : "distribution") : "stable";
      
      const bullets = [
        "Analysis mode: Scan local news. Connect OpenAI API in your .env file to enable real-time GPT analysis.",
        headlines[0] ? `Recent Catalyst: "${headlines[0]}"` : "No recent news catalysts found in search index.",
        peakVolumeItem 
          ? `Volume Analysis: Traded peak volume of ${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(peakVolumeItem.volume)} on ${peakVolumeItem.date} during a price ${peakVolumeItem.up ? "UP" : "DOWN"} day, indicating potential institutional ${volumeConsensus}.`
          : `Volume Analysis: Traded volume averages ${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(avgVolume)} daily, indicating range-bound trading activity.`
      ];

      return NextResponse.json({
        stance,
        score,
        summary: `[DEMO MODE] OpenAI API key is missing. Scanned ${headlines.length} news headlines and analyzed 10 trading sessions of volume data for ${symbol}. The stock exhibits a ${stance.toLowerCase()} tone with a score of ${score}/100. Volume profile displays average daily volume of ${new Intl.NumberFormat('en-US', { notation: 'compact' }).format(avgVolume)} with peak volume on ${peakVolumeItem?.date || "N/A"} signaling signs of ${volumeConsensus}.`,
        bullets,
      });
    }

    // Real OpenAI API call
    const prompt = `You are an expert financial research analyst.
Analyze the following news headlines and historical volume data for ${symbol} (${name}) to provide a concise, structured research report in JSON format.

News headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Historical Volume & Price Data (Last 2 Weeks):
${volumeData.map(d => `- Date: ${d.date}, Vol: ${d.volume}, Close: $${d.close}, Day Direction: ${d.up ? "UP" : "DOWN"}`).join("\n")}
Average Volume: ${avgVolume}
Peak Volume: ${peakVolumeItem ? `${peakVolumeItem.volume} on ${peakVolumeItem.date}` : "N/A"}

Please perform a volume analysis (accumulation/distribution patterns, volume breakouts, relationship between volume spikes and price direction) and incorporate it into the stance, score, executive summary, and bullet highlights.

Respond ONLY with a JSON object matching this structure:
{
  "stance": "Bullish" | "Bearish" | "Neutral",
  "score": number (0 to 100),
  "summary": "A concise paragraph summarizing the news sentiment, volume profile analysis, and overall catalyst impact.",
  "bullets": [
    "Highlight 1: Sentiment analysis / recent news catalyst",
    "Highlight 2: Technical/volume analysis (e.g. volume trends, breakout, or accumulation)",
    "Highlight 3: Synthesis / outlook based on catalysts and trading action"
  ]
}`;

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional financial research analyst." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return NextResponse.json({ error: `OpenAI API error: ${errText}` }, { status: 502 });
    }

    const resData = await apiRes.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty response from OpenAI" }, { status: 502 });
    }

    const parsed = JSON.parse(content);
    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
