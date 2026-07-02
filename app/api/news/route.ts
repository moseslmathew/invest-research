import { NextResponse } from "next/server";

export const runtime = "edge";

interface NewsArticle {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  time: number;
  thumbnail: string | null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const name = (searchParams.get("name") || "").trim();

  // Prioritize company name search for high quality results, fallback to ticker symbol
  const query = name || symbol;

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    // Google News RSS feed search
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(url, {
      next: { revalidate: 300 }, // Cache results for 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Upstream error" }, { status: 502 });
    }

    const xml = await res.text();
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < 8) {
      const itemContent = match[1];
      const rawTitle = itemContent.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "";
      const link = itemContent.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "";
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

    return NextResponse.json({ articles });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
