import { NextResponse, NextRequest } from "next/server";
import { guardRequest } from "@/lib/api-guard";
import { AI_CONFIG, executeAICall, cleanJsonResponseText, AIModel } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

async function fetchLivePrice(symbol: string): Promise<number> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return 100;
    const data = await res.json() as any;
    const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
    return Number.isFinite(price) ? price : 100;
  } catch {
    return 100;
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

    const price = await fetchLivePrice(symbol);

    const prompt = `You are a professional quantitative and technical market analyst.
Analyze the technical setup for ${symbol} (${name}) whose current trading price is $${price}.
Generate a professional technical analysis report in JSON format.

Respond ONLY with a JSON object matching this structure:
{
  "stance": "Strong Buy" | "Buy" | "Neutral" | "Sell" | "Strong Sell",
  "rsi": number (between 0 and 100),
  "macd": "Bullish Crossover" | "Bearish Crossover" | "Neutral" | "Bullish Divergence" | "Bearish Divergence",
  "movingAverages": {
    "sma20": number (typical 20-day simple moving average relative to price of $${price}),
    "sma50": number (typical 50-day SMA relative to price of $${price}),
    "sma200": number (typical 200-day SMA relative to price of $${price}),
    "trend": "Bullish" | "Bearish" | "Neutral"
  },
  "support": number (nearest key horizontal support level below $${price}),
  "resistance": number (nearest key horizontal resistance level above $${price}),
  "summary": "A concise paragraph summarizing the technical indicator readings, support/resistance layout, and trend outlook.",
  "bullets": [
    "Brief highlight 1 regarding momentum or chart patterns",
    "Brief highlight 2 regarding key moving average levels",
    "Brief highlight 3 regarding immediate resistance/support breakout potential"
  ]
}`;

    const apiRes = await executeAICall({
      model: requestedModel,
      messages: [{ role: "user", content: prompt }],
      responseFormat: { type: "json_object" },
    });

    if (!apiRes.ok) {
      throw new Error(`AI API returned status ${apiRes.status}`);
    }

    const chatData = await apiRes.json() as any;
    const content = chatData.choices?.[0]?.message?.content || "{}";
    const cleanedContent = cleanJsonResponseText(content);
    const parsed = JSON.parse(cleanedContent);
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
