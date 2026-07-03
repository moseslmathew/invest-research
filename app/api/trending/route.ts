import { NextResponse } from "next/server";
import type { Market } from "@/lib/db";

export const runtime = "edge";

interface TrendingStock {
  symbol: string;
  name: string;
  sentiment: "bullish" | "bearish" | "neutral";
  rationale: string;
}

const MOCK_US_STOCKS: TrendingStock[] = [
  {
    symbol: "NVDA",
    name: "Nvidia",
    sentiment: "bullish",
    rationale: "Surges on high demand for Blackwell AI chips and positive analyst price target upgrades."
  },
  {
    symbol: "TSLA",
    name: "Tesla",
    sentiment: "bullish",
    rationale: "Beats quarterly delivery estimates driven by strong expansion in the Chinese market."
  },
  {
    symbol: "MSFT",
    name: "Microsoft",
    sentiment: "neutral",
    rationale: "Announces further Copilot AI additions amid investigations into cloud licensing policies."
  },
  {
    symbol: "AAPL",
    name: "Apple",
    sentiment: "bullish",
    rationale: "Gains momentum following reports of robust pre-order demand for new iPhone lineups."
  },
  {
    symbol: "AMZN",
    name: "Amazon",
    sentiment: "bullish",
    rationale: "AWS cloud division expands datacenter footprint to capture rising enterprise AI workloads."
  },
  {
    symbol: "META",
    name: "Meta",
    sentiment: "bullish",
    rationale: "Shares hit records after launching high-performing open Llama models for developers."
  },
  {
    symbol: "GOOGL",
    name: "Alphabet",
    sentiment: "neutral",
    rationale: "Maintains search dominance while facing regulatory antitrust challenges in adtech divisions."
  },
  {
    symbol: "AMD",
    name: "AMD",
    sentiment: "bullish",
    rationale: "Unveils new MI325X AI accelerators to directly compete with Nvidia's hardware stack."
  },
  {
    symbol: "NFLX",
    name: "Netflix",
    sentiment: "bullish",
    rationale: "Stock rallies on strong subscriber additions and higher ad-tier subscription conversion."
  },
  {
    symbol: "AVGO",
    name: "Broadcom",
    sentiment: "bullish",
    rationale: "Receives buy ratings from major analysts on custom TPU design wins with cloud hyperscalers."
  }
];

const MOCK_IN_STOCKS: TrendingStock[] = [
  {
    symbol: "RELIANCE.NS",
    name: "Reliance Industries",
    sentiment: "bullish",
    rationale: "Jio Infocomm registers strong ARPU growth and plans a potential retail listing spin-off."
  },
  {
    symbol: "TATAMOTORS.NS",
    name: "Tata Motors",
    sentiment: "bullish",
    rationale: "JLR sales recovery and expansion of domestic EV fleet drive record quarterly revenues."
  },
  {
    symbol: "HDFCBANK.NS",
    name: "HDFC Bank",
    sentiment: "neutral",
    rationale: "Focuses on credit-to-deposit ratio improvements after merger integration phases."
  },
  {
    symbol: "INFY.NS",
    name: "Infosys",
    sentiment: "neutral",
    rationale: "Guidance confirmation calms investors amid cautious global enterprise IT spending."
  },
  {
    symbol: "SBIN.NS",
    name: "State Bank of India",
    sentiment: "bullish",
    rationale: "NPA levels drop to historic lows alongside robust loan credit growth across divisions."
  },
  {
    symbol: "ADANIPORTS.NS",
    name: "Adani Ports",
    sentiment: "bullish",
    rationale: "Container volumes rise by double-digits following key acquisitions in domestic shipping hubs."
  },
  {
    symbol: "LT.NS",
    name: "Larsen & Toubro",
    sentiment: "bullish",
    rationale: "Secures mega infrastructure orders in Middle East power transmission and refinery sectors."
  },
  {
    symbol: "ITC.NS",
    name: "ITC Limited",
    sentiment: "neutral",
    rationale: "Board approves hotel division demerger plan, prompting mixed analyst evaluations."
  },
  {
    symbol: "ICICIBANK.NS",
    name: "ICICI Bank",
    sentiment: "bullish",
    rationale: "Maintains industry-leading net interest margins (NIMs) with strong asset growth."
  },
  {
    symbol: "BHARTIALRT.NS",
    name: "Bharti Airtel",
    sentiment: "bullish",
    rationale: "Rides on recent mobile tariff revisions and rising 5G adoption in rural sectors."
  }
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get("market") || "US") as Market;

  try {
    const url =
      market === "IN"
        ? "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-IN&gl=IN&ceid=IN:en"
        : "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en";

    const res = await fetch(url, {
      next: { revalidate: 1800 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
    }

    const xml = await res.text();
    const titles: string[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && titles.length < 25) {
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
        titles.push(title.trim());
      }
    }

    if (titles.length === 0) {
      return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
    }

    const apiKey = process.env.OPENAI_API_KEY || "";
    const isMock =
      !apiKey ||
      apiKey === "your-api-key-here" ||
      apiKey.startsWith("YOUR_") ||
      apiKey.trim() === "";

    if (isMock) {
      return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
    }

    const prompt = `You are a financial analyst analyzing current business news headlines for the market: ${
      market === "US" ? "United States (US)" : "India (IN)"
    }.
Below is a list of recent headlines from major business news feeds.
Your goal is to extract the top 10 publicly traded companies currently most discussed or impacted by this news.

For each company, provide:
1. The standard stock ticker symbol. 
   - CRITICAL REQUIREMENT: The ticker symbol MUST be a valid Yahoo Finance symbol.
   - For India (IN), the symbol MUST end in .NS (e.g. RELIANCE.NS, TATAMOTORS.NS, HDFCBANK.NS). If a symbol is BSE-only, it can end in .BO, but .NS is preferred.
   - For US, use standard symbols (e.g. NVDA, TSLA, AAPL).
2. The official or short company name.
3. The sentiment toward this company based on the news ('bullish', 'bearish', or 'neutral').
4. A concise 1-sentence rationale explaining why they are in the news.

Business News Headlines:
${JSON.stringify(titles, null, 2)}

Respond ONLY with a JSON object matching this structure:
{
  "stocks": [
    {
      "symbol": "string",
      "name": "string",
      "sentiment": "bullish" | "bearish" | "neutral",
      "rationale": "string"
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
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!apiRes.ok) {
      return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
    }

    const resData = await apiRes.json();
    const content = resData.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
    }

    const parsed = JSON.parse(content);
    return NextResponse.json({ stocks: parsed.stocks || [] });
  } catch (err) {
    console.error("Trending fetch error:", err);
    return NextResponse.json({ stocks: market === "IN" ? MOCK_IN_STOCKS : MOCK_US_STOCKS });
  }
}
