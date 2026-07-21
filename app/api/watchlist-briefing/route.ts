import { NextResponse } from "next/server";
import { guardRequest } from "@/lib/api-guard";
import { AI_CONFIG } from "@/lib/ai-config";
import { safeUrl } from "@/lib/safe-url";

export const runtime = "edge";

function fetchWithTimeout(url: string, options: RequestInit & { timeout?: number }) {
  const { timeout = 8000, ...fetchOpts } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, {
    ...fetchOpts,
    signal: controller.signal
  }).finally(() => clearTimeout(id));
}

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

export async function POST(req: Request) {
  const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
  if (gate instanceof NextResponse) return gate;
  try {
    const itemsInput = await req.json() as { symbol: string; name: string }[];
    if (!Array.isArray(itemsInput) || itemsInput.length === 0) {
      return NextResponse.json({ briefing: [] });
    }

    const inputData: Record<string, StockInput> = {};

    await Promise.all(
      itemsInput.map(async (item) => {
        const sym = item.symbol;
        const name = item.name || sym;
        const query = name;
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
        
        try {
          const res = await fetchWithTimeout(url, { 
            next: { revalidate: 300 },
            timeout: 6000
          });
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
                url: safeUrl(link),
                dateStr: pubDateText,
                source: source.trim() || "Google News",
                ageHours,
              });
            }
          }

          // Generic relevance pre-filter to block matches on unrelated entities
          const filteredPool = items.filter(art => {
            const lTitle = art.title.toLowerCase();
            const cleanSymbol = sym.split(".")[0].toLowerCase();
            
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

          // Filter news within the last 48 hours
          const freshNews = filteredPool.filter((item) => item.ageHours <= 48).slice(0, 5);
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

    // News-only briefing built from the parsed Google News RSS above. Used when
    // no OpenAI key is set, AND as a graceful fallback if the model call fails —
    // so the tab always renders something instead of an error.
    const buildLocalBriefing = () =>
      itemsInput.map((item) => {
        const sym = item.symbol;
        const name = item.name || sym;
        const data = inputData[sym];
        if (!data || !data.hasFreshNews || data.news.length === 0) {
          return {
            company: name,
            symbol: sym,
            bullets: [
              {
                headline: "No significant news since last check",
                summary: "No significant news updates have been indexed in the last 24-48 hours.",
                source: "Google News",
                url: `https://news.google.com/search?q=${encodeURIComponent(name)}`,
              },
            ],
            noNews: true,
          };
        }
        const bullets = data.news.slice(0, 3).map((nItem) => ({
          headline: nItem.title,
          summary: `Recent report regarding ${name} highlights key market activity.`,
          source: nItem.source,
          url: nItem.url,
        }));
        return { company: name, symbol: sym, bullets, noNews: false };
      });

    if (isMock) {
      return NextResponse.json({ briefing: buildLocalBriefing() });
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

CRITICAL DISAMBIGUATION RULE: Strictly ensure each summary is directly about the business operations, financials, or stock performance of the target corporate entity. Reject any news regarding unrelated geographic places, sports venues, or politicians/individuals sharing a name with the company.

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

    // Try OpenAI for a higher-fidelity briefing; on ANY failure (timeout,
    // non-200, empty or non-JSON output) degrade to the news-only briefing.
    try {
      const apiRes = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          AI_CONFIG.createBody({
            model: AI_CONFIG.BRIEFING_MODEL,
            messages: [
              { role: "system", content: "You are a professional financial research assistant." },
              { role: "user", content: prompt },
            ],
            responseFormat: { type: "json_object" },
            temperature: 0.3,
          })
        ),
        timeout: 12000
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.error("OpenAI API error (watchlist-briefing):", apiRes.status, errText);
        return NextResponse.json({ briefing: buildLocalBriefing() });
      }

      const resData = await apiRes.json();
      const content = resData.choices?.[0]?.message?.content;
      if (!content) {
        console.error("watchlist-briefing: empty OpenAI response");
        return NextResponse.json({ briefing: buildLocalBriefing() });
      }

      const parsed = JSON.parse(content);
      // Guard against a malformed shape from the model.
      if (!parsed || !Array.isArray(parsed.briefing)) {
        return NextResponse.json({ briefing: buildLocalBriefing() });
      }
      return NextResponse.json(parsed);
    } catch (aiErr) {
      console.error("watchlist-briefing OpenAI fallback:", aiErr);
      return NextResponse.json({ briefing: buildLocalBriefing() });
    }
  } catch (err) {
    console.error("watchlist-briefing route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
