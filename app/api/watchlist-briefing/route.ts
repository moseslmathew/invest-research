import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

interface NewsItem {
  title: string;
  url: string;
  dateStr: string;
  source: string;
  ageHours: number;
}

interface StockInput {
  symbol: string;
  hasFreshNews: boolean;
  news: NewsItem[];
}

export async function GET(req: Request) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(req.url);
    const symbolsStr = searchParams.get("symbols") || "";
    const symbols = symbolsStr
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (symbols.length === 0) {
      return NextResponse.json({ briefing: [] });
    }

    const inputData: Record<string, StockInput> = {};

    await Promise.all(
      symbols.map(async (sym) => {
        const query = sym;
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
        
        try {
          const res = await fetch(url, { next: { revalidate: 300 } });
          if (!res.ok) {
            inputData[sym] = { symbol: sym, hasFreshNews: false, news: [] };
            return;
          }
          const xml = await res.text();
          const items: NewsItem[] = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;

          while ((match = itemRegex.exec(xml)) !== null) {
            const block = match[1];
            let title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
            const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
            const pubDateText = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
            let source = block.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "";

            // Clean entities
            title = title
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&apos;/g, "'")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&#39;/g, "'");

            const parts = title.split(" - ");
            if (parts.length > 1) {
              const trailing = parts.pop() as string;
              title = parts.join(" - ");
              if (!source) source = trailing.trim();
            }

            const pubDate = Date.parse(pubDateText);
            const ageHours = pubDate ? (Date.now() - pubDate) / (1000 * 60 * 60) : 999;

            if (title.trim() && link) {
              items.push({
                title: title.trim(),
                url: link.trim(),
                dateStr: pubDateText,
                source: source.trim() || "Google News",
                ageHours,
              });
            }
          }

          // Filter news within the last 48 hours
          const freshNews = items.filter((item) => item.ageHours <= 48).slice(0, 5);
          inputData[sym] = {
            symbol: sym,
            hasFreshNews: freshNews.length > 0,
            news: freshNews,
          };
        } catch {
          inputData[sym] = { symbol: sym, hasFreshNews: false, news: [] };
        }
      })
    );

    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock =
      !apiKey ||
      apiKey === "your-api-key-here" ||
      apiKey.startsWith("YOUR_") ||
      apiKey.trim() === "";

    if (isMock) {
      // Logic-based local fallback that returns actual parsed Google News RSS headlines
      const briefing = symbols.map((sym) => {
        const data = inputData[sym];
        if (!data || !data.hasFreshNews || data.news.length === 0) {
          return {
            company: sym,
            symbol: sym,
            bullets: [
              {
                headline: "No significant news since last check",
                summary: "No significant news updates have been indexed in the last 24-48 hours.",
                source: "Google News",
                url: `https://news.google.com/search?q=${encodeURIComponent(sym)}`,
              },
            ],
            noNews: true,
          };
        }

        // Return up to 3 fresh bulletins
        const bullets = data.news.slice(0, 3).map((item) => ({
          headline: item.title,
          summary: `Recent report regarding ${sym} highlights key market activity.`,
          source: item.source,
          url: item.url,
        }));

        return {
          company: sym,
          symbol: sym,
          bullets,
          noNews: false,
        };
      });

      return NextResponse.json({ briefing });
    }

    // Call OpenAI for high-fidelity briefings
    const prompt = `You are a professional financial assistant drafting a daily watchlist briefing.
For each company in the list below, synthesize the provided recent headlines (from the last 24-48 hours) into a concise briefing.

Follow these strict rules:
1. For each company, output the company name.
2. Under each company, provide 1 to 3 bullet-point headlines.
3. For each bullet point, write a clear, one-sentence summary explaining the news, and include the exact source name and link provided.
4. If a company is marked as having "hasFreshNews": false, write exactly: "No significant news since last check" as the bullet point, and do not invent any news.
5. Keep it skimmable, concise, and objective. Do not include long-winded analysis, intro text, outro text, or investment advice.

Input data:
${JSON.stringify(inputData, null, 2)}

Format the response as a JSON object:
{
  "briefing": [
    {
      "company": "Company Name",
      "symbol": "SYMBOL",
      "bullets": [
        { "headline": "Headline Text", "summary": "One-sentence summary", "source": "Source Name", "url": "URL" }
      ],
      "noNews": boolean
    }
  ]
}`;

    const apiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional financial research assistant." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("OpenAI API error (watchlist-briefing):", apiRes.status, errText);
      return NextResponse.json({ error: "Upstream briefing service is unavailable." }, { status: 502 });
    }

    const resData = await apiRes.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "Empty response from OpenAI" }, { status: 502 });
    }

    return NextResponse.json(JSON.parse(content));
  } catch (err) {
    console.error("watchlist-briefing route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
