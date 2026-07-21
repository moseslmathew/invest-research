import { NextResponse, NextRequest } from "next/server";
import { guardRequest } from "@/lib/api-guard";
import { AI_CONFIG, executeAICall, cleanJsonResponseText, AIModel } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

/** Recent news headlines used to ground the SWOT in current catalysts. */
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
    while ((match = itemRegex.exec(xml)) !== null && headlines.length < 10) {
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
      if (title.trim()) headlines.push(title.trim());
    }
    return headlines;
  } catch {
    return [];
  }
}

/** A light fundamental snapshot from Yahoo's chart meta (price, 52w range). */
async function fetchSnapshot(symbol: string): Promise<Record<string, unknown> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      currency: meta.currency,
      price: meta.regularMarketPrice,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      exchange: meta.fullExchangeName,
    };
  } catch {
    return null;
  }
}

const DIMENSIONS = [
  "Management Quality",
  "Product & Service Quality",
  "Financial Health",
  "Market Position & Moat",
];

export async function GET(req: NextRequest) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const [headlines, snapshot] = await Promise.all([
      fetchNewsHeadlines(symbol, name),
      fetchSnapshot(symbol),
    ]);

    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock =
      !apiKey ||
      apiKey === "your-api-key-here" ||
      apiKey.startsWith("YOUR_") ||
      apiKey.trim() === "";

    if (isMock) {
      const overall = symbol.length % 2 === 0 ? 68 : 54;
      return NextResponse.json({
        demo: true,
        overview: `[DEMO MODE] Connect an OpenAI API key in your .env file to enable a full AI-generated SWOT analysis. This is a placeholder scaffold for ${name || symbol} covering management, product, financials, and market position.`,
        overallScore: overall,
        overallVerdict: overall >= 65 ? "Structurally Sound" : "Mixed Signals",
        dimensions: DIMENSIONS.map((d, i) => ({
          name: d,
          rating: 50 + ((symbol.length + i * 7) % 40),
          verdict: "Analysis pending",
          commentary:
            "Placeholder assessment. Real analysis of leadership track record, product differentiation, balance-sheet strength, and competitive moat requires an active OpenAI API key.",
        })),
        strengths: [
          { point: "Add an OpenAI key to unlock analysis", detail: "Management, product, and financial strengths will be synthesized from public data and recent news.", category: "Management" },
        ],
        weaknesses: [
          { point: "Demo mode active", detail: "Weaknesses such as margin pressure, governance concerns, or product gaps will appear here.", category: "Financials" },
        ],
        opportunities: [
          { point: "Market expansion signals", detail: "Growth vectors from new products, geographies, or secular tailwinds will be listed here.", category: "Market" },
        ],
        threats: [
          { point: "Competitive & macro risks", detail: "Regulatory, competitive, and macroeconomic threats will be surfaced here.", category: "Market" },
        ],
      });
    }

    const prompt = `You are a senior equity research analyst producing an in-depth, institutional-grade SWOT analysis for ${name} (${symbol}).

Analyze the ENTIRE spectrum of the company. At minimum cover, but do not limit yourself to:
1. Management quality — leadership track record, capital allocation, governance, insider alignment, execution history.
2. Product or service quality — differentiation, innovation, brand strength, customer stickiness, pricing power.
3. Financial health — revenue growth, margins, profitability, balance-sheet strength, cash flow, leverage, valuation.
4. Market position & moat — competitive advantages, market share, industry structure, secular tailwinds/headwinds.

Ground your analysis in your knowledge of the company plus the recent context below.

Recent news headlines:
${headlines.length ? headlines.map((h, i) => `${i + 1}. ${h}`).join("\n") : "(none retrieved)"}

Market snapshot:
${snapshot ? JSON.stringify(snapshot) : "(unavailable)"}

Respond ONLY with a JSON object matching this exact structure:
{
  "overview": "A concise 2-3 sentence overview of the company and the overall SWOT verdict.",
  "overallScore": number (0-100, overall fundamental quality of the business),
  "overallVerdict": "A 2-4 word verdict, e.g. 'High-Quality Compounder', 'Turnaround in Progress', 'Structurally Challenged'.",
  "dimensions": [
    { "name": "Management Quality", "rating": number (0-100), "verdict": "2-4 word verdict", "commentary": "2-3 sentence assessment." },
    { "name": "Product & Service Quality", "rating": number, "verdict": "...", "commentary": "..." },
    { "name": "Financial Health", "rating": number, "verdict": "...", "commentary": "..." },
    { "name": "Market Position & Moat", "rating": number, "verdict": "...", "commentary": "..." }
  ],
  "strengths": [ { "point": "Short title", "detail": "One-sentence explanation.", "category": "Management" | "Product" | "Financials" | "Market" } ],
  "weaknesses": [ { "point": "...", "detail": "...", "category": "..." } ],
  "opportunities": [ { "point": "...", "detail": "...", "category": "..." } ],
  "threats": [ { "point": "...", "detail": "...", "category": "..." } ]
};`;

    const requestedModel = (searchParams.get("model") || AI_CONFIG.RESEARCH_MODEL) as AIModel;

    const apiRes = await executeAICall({
      model: requestedModel,
      messages: [
        { role: "system", content: "You are a professional equity research analyst who produces rigorous, balanced SWOT analyses." },
        { role: "user", content: prompt },
      ],
      responseFormat: { type: "json_object" },
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("AI API error (swot):", apiRes.status, errText);
      return NextResponse.json({ error: "Upstream AI service unavailable" }, { status: 502 });
    }

    const resData = (await apiRes.json()) as any;
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 502 });
    }

    const cleanedContent = cleanJsonResponseText(content);
    const parsed = JSON.parse(cleanedContent);
    return NextResponse.json(parsed);
  } catch (error) {
    console.error("swot route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
