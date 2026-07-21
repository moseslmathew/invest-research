import { NextResponse, NextRequest } from "next/server";
import { guardRequest } from "@/lib/api-guard";
import { AI_CONFIG, executeAICall, cleanJsonResponseText, AIModel } from "@/lib/ai-config";

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

export async function GET(req: NextRequest) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const name = (searchParams.get("name") || "").trim();
    const requestedModel = (searchParams.get("model") || AI_CONFIG.RESEARCH_MODEL) as AIModel;

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
  "score": 75,
  "stance": "Bullish",
  "summary": "Executive summary paragraph...",
  "bullets": [
    "Highlight 1",
    "Highlight 2",
    "Highlight 3"
  ]
}`;

    const apiRes = await executeAICall({
      model: requestedModel,
      messages: [
        { role: "system", content: "You are a professional financial research analyst." },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("AI API error (research):", apiRes.status, errText);
      return NextResponse.json({ error: "Upstream AI service error" }, { status: 502 });
    }

    const data = (await apiRes.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty completion choice");
    }

    const cleanedContent = cleanJsonResponseText(content);
    const parsed = JSON.parse(cleanedContent);
    return NextResponse.json({ ...parsed, model: requestedModel });
  } catch (err: any) {
    console.error("Research API route error:", err);
    return NextResponse.json({ error: err.message || "Failed to generate research" }, { status: 500 });
  }
}
