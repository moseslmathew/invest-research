import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/api-guard";
import { safeUrl } from "@/lib/safe-url";

export const runtime = "edge";

interface NewsArticle {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  time: number;
  thumbnail: string | null;
  sentiment?: "bullish" | "bearish" | "neutral";
  valueRationale?: string;
}

export async function GET(req: Request) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const name = (searchParams.get("name") || "").trim();

  // Prioritize company name search for high quality results, fallback to ticker symbol
  const query = name || symbol;

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    // Google News RSS feed search - Fetch up to 15 articles to filter down
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    
    // Add custom User-Agent to prevent 403 blocks from Google News RSS feed
    const res = await fetch(url, {
      next: { revalidate: 300 }, // Cache results for 5 minutes
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream news search error" }, { status: 502 });
    }

    const xml = await res.text();
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < 15) {
      const itemContent = match[1];
      const rawTitle = itemContent.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
      const link = safeUrl(itemContent.match(/<link>([\s\S]*?)<\/link>/)?.[1]);
      const pubDate = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "";
      const source = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] || "News";

      // Clean HTML/XML entities from titles
      let title = rawTitle
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&ndash;/g, "–")
        .replace(/&mdash;/g, "—");

      // Extract publisher from title if appended in format "Title - Publisher"
      let publisher = source;
      const parts = title.split(" - ");
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1].trim();
        if (
          lastPart.toLowerCase() === source.toLowerCase() ||
          source.toLowerCase().includes(lastPart.toLowerCase())
        ) {
          parts.pop();
          title = parts.join(" - ");
          publisher = lastPart;
        }
      }

      const time = Math.floor(Date.parse(pubDate) / 1000) || Math.floor(Date.now() / 1000);
      const uuid = Math.random().toString(36).substring(2);

      articles.push({
        uuid,
        title,
        publisher,
        link,
        time,
        thumbnail: null,
      });
    }

    if (articles.length === 0) {
      return NextResponse.json({ articles: [] });
    }

    // Generic relevance pre-filter to block matches on unrelated entities
    const filteredPool = articles.filter(art => {
      const lTitle = art.title.toLowerCase();
      const cleanSymbol = symbol.split(".")[0].toLowerCase();
      
      const stopWords = new Set([
        "limited", "ltd", "inc", "corp", "corporation", "co", "company", 
        "india", "plc", "sa", "group", "holdings", "solutions", "technologies"
      ]);
      const nameTokens = name
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(t => t.length > 2 && t !== cleanSymbol && !stopWords.has(t));
        
      if (nameTokens.length > 0) {
        return nameTokens.some(t => lTitle.includes(t));
      }
      return lTitle.includes(cleanSymbol);
    });

    if (filteredPool.length === 0) {
      return NextResponse.json({ articles: [] });
    }

    // Show the most recent coverage first everywhere
    const byLatest = (a: NewsArticle, b: NewsArticle) => (b.time ?? 0) - (a.time ?? 0);
    filteredPool.sort(byLatest);

    // Connect OpenAI to filter & analyze news sentiment
    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock = !apiKey || apiKey === "your-api-key-here" || apiKey.startsWith("YOUR_") || apiKey.trim() === "";

    if (isMock) {
      // Local Heuristic Filter & Mock Sentiment Fallback
      const filtered: NewsArticle[] = filteredPool.slice(0, 6).map((art) => {
        const ltitle = art.title.toLowerCase();
        let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
        let rationale = "[Demo Mode] General industry update or sector correlation.";

        if (ltitle.includes("grow") || ltitle.includes("rise") || ltitle.includes("profit") || ltitle.includes("bull") || ltitle.includes("beat")) {
          sentiment = "bullish";
          rationale = "[Demo Mode] Positive financials or catalysts indicating potential demand expansion.";
        } else if (ltitle.includes("fall") || ltitle.includes("drop") || ltitle.includes("loss") || ltitle.includes("bear") || ltitle.includes("slip")) {
          sentiment = "bearish";
          rationale = "[Demo Mode] Negative correction or catalyst showing potential margin compression.";
        } else {
          rationale = "[Demo Mode] Typical operational news or analyst rating confirmation.";
        }

        return {
          ...art,
          sentiment,
          valueRationale: rationale,
        };
      });

      return NextResponse.json({ articles: filtered });
    }

    // Call OpenAI GPT-4o-mini to filter articles and determine sentiment
    const prompt = `You are a financial analyst filtering and evaluating news for the stock: ${symbol} (${name}).
Below is a list of recent raw news articles fetched from search feeds.
Your goals:
1. Filter out duplicates, irrelevant mentions, and low-value clickbait. Only select articles that add real value (e.g. key financials, major partnerships, product releases, regulatory actions, leadership shifts).
2. For each kept article, determine the sentiment ('bullish', 'bearish', or 'neutral') and write a 1-sentence business value rationale.

CRITICAL DISAMBIGUATION RULE: Strictly evaluate whether each article is about the actual corporate entity represented by the stock ticker ${symbol} (${name}). Reject any articles about unrelated geographic places, politicians/individuals sharing a name, sports venues, or different companies with overlapping names. The articles MUST directly report on the target company's business operations, financials, partnerships, products, or stock performance.

Raw Articles:
${JSON.stringify(filteredPool.map(a => ({ uuid: a.uuid, title: a.title, publisher: a.publisher })), null, 2)}

Respond ONLY with a JSON object matching this structure:
{
  "articles": [
    {
      "uuid": "string",
      "sentiment": "bullish" | "bearish" | "neutral",
      "valueRationale": "A concise 1-sentence explanation of why this news is valuable/impactful for the company."
    }
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
        temperature: 0.2,
      }),
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      console.error("OpenAI API error (news):", apiRes.status, errText);
      throw new Error("OpenAI request failed");
    }

    const resData = await apiRes.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const aiArticles: { uuid: string; sentiment: "bullish" | "bearish" | "neutral"; valueRationale: string }[] = parsed.articles || [];

    // Map AI analysis back to matching original articles
    const filteredArticles: NewsArticle[] = [];
    for (const aiArt of aiArticles) {
      const original = filteredPool.find(a => a.uuid === aiArt.uuid);
      if (original) {
        filteredArticles.push({
          ...original,
          sentiment: aiArt.sentiment,
          valueRationale: aiArt.valueRationale,
        });
      }
    }

    // If OpenAI returns empty or parsing errors, return raw slice
    if (filteredArticles.length === 0) {
      return NextResponse.json({
        articles: filteredPool.slice(0, 6).map(a => ({
          ...a,
          sentiment: "neutral",
          valueRationale: "Relevance validation failed. Listed as general industry news.",
        }))
      });
    }

    // Re-sort: the AI returns articles in its own order, so order by recency.
    filteredArticles.sort(byLatest);
    return NextResponse.json({ articles: filteredArticles });
  } catch (e) {
    console.error("news route error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
