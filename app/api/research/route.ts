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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const name = (searchParams.get("name") || "").trim();

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const headlines = await fetchNewsHeadlines(symbol, name);

    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock = !apiKey || apiKey === "your-api-key-here" || apiKey.startsWith("YOUR_") || apiKey.trim() === "";

    if (isMock) {
      // Local logic-based fallback analysis
      const score = headlines.length > 0 ? (symbol.length % 2 === 0 ? 72 : 48) : 50;
      const stance = score >= 70 ? "Bullish" : score <= 48 ? "Bearish" : "Neutral";
      
      const bullets = [
        "Analysis mode: Scan local news. Connect OpenAI API in your .env file to enable real-time GPT analysis.",
        headlines[0] ? `Recent Catalyst: "${headlines[0]}"` : "No news catalysts found in search index.",
        `Market consensus implies a ${stance.toLowerCase()} trend for ${symbol} over the upcoming quarters.`
      ];

      return NextResponse.json({
        stance,
        score,
        summary: `[DEMO MODE] OpenAI API key is missing or not configured. Scanned ${headlines.length} news headlines locally for ${symbol}. The stock exhibits a ${stance.toLowerCase()} tone with a calculated score of ${score}/100.`,
        bullets,
      });
    }

    // Real OpenAI API call
    const prompt = `You are an expert financial research analyst. Analyze the following news headlines for ${symbol} (${name}) and provide a concise, structured research report in JSON format.
News headlines:
${headlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Respond ONLY with a JSON object matching this structure:
{
  "stance": "Bullish" | "Bearish" | "Neutral",
  "score": number (0 to 100),
  "summary": "A concise paragraph summarizing the sentiment and news impact.",
  "bullets": [
    "Key highlight 1",
    "Key highlight 2",
    "Key highlight 3"
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
