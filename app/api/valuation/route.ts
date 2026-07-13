import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function fetchPage(url: string) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      next: { revalidate: 300 }, // Cache for 5 minutes
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchGoogleFinancePage(symbol: string) {
  const sym = symbol.split(".")[0].toUpperCase();
  if (symbol.endsWith(".NS")) {
    return fetchPage(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}:NSE`);
  }
  if (symbol.endsWith(".BO")) {
    return fetchPage(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}:BOM`);
  }
  
  // Try NASDAQ first
  let html = await fetchPage(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}:NASDAQ`);
  if (html && !html.includes("Page Not Found") && html.includes("Mkt. cap")) {
    return html;
  }
  
  // Try NYSE next
  html = await fetchPage(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}:NYSE`);
  if (html && !html.includes("Page Not Found") && html.includes("Mkt. cap")) {
    return html;
  }
  
  // Plain fallback
  return fetchPage(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}`);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const html = await fetchGoogleFinancePage(symbol);
    if (!html) {
      return NextResponse.json({ error: "Failed to load Google Finance page" }, { status: 500 });
    }

    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    const fragments: string[] = [];
    const regex = />([^<]{1,120})</g;
    let match;
    while ((match = regex.exec(cleanHtml)) !== null) {
      const text = match[1].replace(/&amp;/g, "&").trim();
      if (text) fragments.push(text);
    }

    function findVal(label: string) {
      const idx = fragments.findIndex((f) => f.toLowerCase() === label.toLowerCase());
      if (idx !== -1 && idx + 1 < fragments.length) {
        return fragments[idx + 1];
      }
      return "—";
    }

    let targetPrice = "—";
    const targetIdx = fragments.findIndex((f) => f.toLowerCase() === "12-month forecast");
    if (targetIdx !== -1) {
      const subList = fragments.slice(targetIdx, targetIdx + 50);
      const avgIdx = subList.findIndex((f) => f.toLowerCase() === "average");
      if (avgIdx !== -1 && avgIdx + 1 < subList.length) {
        targetPrice = subList[avgIdx + 1];
      }
    }

    let mcap = findVal("Mkt. cap");
    const isIndian = symbol.endsWith(".NS") || symbol.endsWith(".BO");
    if (isIndian && mcap !== "—") {
      const cleaned = mcap.replace(/[^\d.TBMKtbmk]/g, "");
      const mcapMatch = cleaned.match(/^(\d+(?:\.\d+)?)([TBMK])$/i);
      if (mcapMatch) {
        const num = parseFloat(mcapMatch[1]);
        const suffix = mcapMatch[2].toUpperCase();
        let rawVal = 0;
        if (suffix === "T") rawVal = num * 1000000000000;
        else if (suffix === "B") rawVal = num * 1000000000;
        else if (suffix === "M") rawVal = num * 1000000;
        else if (suffix === "K") rawVal = num * 1000;
        else rawVal = num;

        const crores = rawVal / 10000000;
        if (crores >= 100000) {
          mcap = `₹${(crores / 100000).toFixed(2)}L Cr`;
        } else {
          mcap = `₹${Math.round(crores).toLocaleString("en-IN")} Cr`;
        }
      }
    }

    const pe = findVal("P/E ratio");
    const eps = findVal("EPS");
    const dividend = findVal("Dividend");
    const exDivDate = findVal("Ex-dividend date");
    const high52 = findVal("52-wk high");
    const low52 = findVal("52-wk low");
    const sharesOutstanding = findVal("Shares outstanding");

    // Dynamic descriptive text based on real values
    let summary = "";
    if (mcap !== "—" || pe !== "—" || targetPrice !== "—") {
      const parts = [];
      parts.push(`${symbol} has a market capitalization of ${mcap}`);
      if (pe !== "—") parts.push(`a P/E ratio of ${pe}`);
      if (eps !== "—") parts.push(`an EPS of ${eps}`);
      if (targetPrice !== "—") parts.push(`an average 12-month consensus target price of ${targetPrice}`);
      summary = parts.join(", ") + ".";
    } else {
      summary = `Valuation data retrieved from Google Finance for ${symbol}.`;
    }

    return NextResponse.json({
      symbol,
      mcap,
      pe,
      eps,
      targetPrice,
      dividend,
      exDivDate,
      high52,
      low52,
      sharesOutstanding,
      summary,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
