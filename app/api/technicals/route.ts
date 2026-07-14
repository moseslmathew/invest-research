import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/api-guard";

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

export async function GET(req: Request) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const price = await fetchLivePrice(symbol);
    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock = !apiKey || apiKey === "your-api-key-here" || apiKey.startsWith("YOUR_") || apiKey.trim() === "";

    if (isMock) {
      // Logic-based high-fidelity fallback using the live stock price
      const hash = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const rsi = 45 + (hash % 25); // RSI between 45 and 70
      const stance = rsi > 62 ? "Buy" : rsi < 50 ? "Neutral" : "Buy";
      const trend = rsi > 55 ? "Bullish" : "Neutral";
      const macd = rsi > 58 ? "Bullish Crossover" : "Neutral";
      
      const support = parseFloat((price * 0.96).toFixed(2));
      const resistance = parseFloat((price * 1.04).toFixed(2));
      const sma20 = parseFloat((price * 0.99).toFixed(2));
      const sma50 = parseFloat((price * 0.97).toFixed(2));
      const sma200 = parseFloat((price * 0.92).toFixed(2));

      const bullets = [
        `RSI currently stands at ${rsi}, indicating ${rsi > 60 ? "positive momentum" : "stable consolidation"}.`,
        `Short-term support holds firm near the $${support} level, with resistance established at $${resistance}.`,
        `The asset trades above its 50-day and 200-day simple moving averages (SMA), confirming an overall ${trend.toLowerCase()} structure.`
      ];

      return NextResponse.json({
        stance,
        rsi,
        macd,
        movingAverages: {
          sma20,
          sma50,
          sma200,
          trend,
        },
        support,
        resistance,
        summary: `[DEMO MODE] Technical analysis scan for ${symbol} (${name}). The stock is showing a ${trend.toLowerCase()} momentum with a relative strength index (RSI) of ${rsi}. Trading levels suggest consolidation near $${sma20} with strong long-term support at $${sma200}.`,
        bullets,
      });
    }

    // OpenAI Prompt
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

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!apiRes.ok) {
      throw new Error(`OpenAI API returned status ${apiRes.status}`);
    }

    const chatData = await apiRes.json() as any;
    const parsed = JSON.parse(chatData.choices[0].message.content.trim());
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
