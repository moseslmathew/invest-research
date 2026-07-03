"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import {
  addItemAction,
  createWatchlistAction,
  deleteItemAction,
  deleteWatchlistAction,
  type ActionState,
} from "./actions";
import TickerSearch from "./TickerSearch";
import { Icon, type IconName } from "./Icon";
import type { Quote } from "./api/quotes/route";
import type { Market, Watchlist, WatchlistItem } from "@/lib/db";

export interface MarketData {
  lists: Watchlist[];
  items: Record<number, WatchlistItem[]>;
}

type View = "watchlist" | "ai";

const MARKETS: { id: Market; label: string; flag: string; code: string }[] = [
  { id: "US", label: "United States", flag: "🇺🇸", code: "US" },
  { id: "IN", label: "India", flag: "🇮🇳", code: "IN" },
];

// Primary navigation. `view` items switch sections; `soon` items are shown to
// match the product surface but aren't built yet.
const NAV: {
  id: string;
  label: string;
  icon: IconName;
  view?: View;
  soon?: boolean;
}[] = [
  { id: "watchlist", label: "Watchlist", icon: "bookmark", view: "watchlist" },
  { id: "ai", label: "AI Stocks", icon: "sparkles", view: "ai" },
];

const MARKET_STORE_KEY = "lumina.market";
const VIEW_STORE_KEY = "lumina.view";
const FAV_STORE_KEY = "lumina.favorites";

const AI_LIST_NAME = "AI";
const isAiList = (l: Watchlist) => l.name.trim().toUpperCase() === AI_LIST_NAME;

/* ---------- formatting + avatar helpers ---------- */
function initials(symbol: string) {
  return symbol.split(".")[0].slice(0, 2).toUpperCase();
}
function avatarStyle(symbol: string): React.CSSProperties {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${h} 68% 56%), hsl(${
      (h + 42) % 360
    } 70% 46%))`,
  };
}
function fmtPrice(v: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(v);
}
function fmtDate(time: number) {
  return new Date(time * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ---------- live quotes ---------- */
function useQuotes(symbols: string[]) {
  const key = symbols.join(",");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!key) {
      setQuotes({});
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [key]);

  return { quotes, loading };
}

function SubmitButton({
  market,
  label,
  pendingLabel,
}: {
  market: Market;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn ${market === "IN" ? "in" : ""}`}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function Toast({
  state,
  className = "",
}: {
  state: ActionState;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!state.message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(t);
  }, [state]);
  if (!state.message || !visible) return null;
  return (
    <div
      className={`toast ${state.ok ? "ok" : "err"} ${className}`}
      role="status"
      aria-live="polite"
    >
      <span>
        {state.ok ? "✓ " : "⚠ "}
        {state.message}
      </span>
      <button
        type="button"
        className="toast-close"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

/* ---------- per-row star + kebab menu ---------- */
function RowActions({
  symbol,
  favorited,
  removing,
  onToggleFav,
  onRemove,
}: {
  symbol: string;
  favorited: boolean;
  removing: boolean;
  onToggleFav: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="row-actions" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`icon-btn star ${favorited ? "on" : ""}`}
        onClick={onToggleFav}
        title={favorited ? "Unfavorite" : "Favorite"}
        aria-label={favorited ? `Unfavorite ${symbol}` : `Favorite ${symbol}`}
        aria-pressed={favorited}
      >
        <Icon name="star" filled={favorited} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        title="More"
        aria-label={`More actions for ${symbol}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="kebab" />
      </button>
      {open && (
        <div className="row-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="row-menu-item danger"
            disabled={removing}
            onClick={() => {
              setOpen(false);
              onRemove();
            }}
          >
            <Icon name="trash" /> Remove
          </button>
        </div>
      )}
    </div>
  );
}

/* Shared props for the two table renderers. */
interface TableProps {
  items: WatchlistItem[];
  market: Market;
  favorites: Set<string>;
  removing: Set<number>;
  onToggleFav: (symbol: string) => void;
  onRemove: (id: number) => void;
  quotes?: Record<string, Quote>;
  quotesLoading?: boolean;
  onSelectStock: (item: WatchlistItem) => void;
  filterInputRef?: React.RefObject<HTMLInputElement | null>;
}

interface NewsArticle {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  time: number;
  thumbnail: string | null;
}

function fmtRelativeTime(unixSec: number): string {
  const diffMs = Date.now() - unixSec * 1000;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function getMutualFundActivity(symbol: string, currency: string) {
  const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const isIndian = currency === "INR" || symbol.endsWith(".NS") || symbol.endsWith(".BO");

  const fundsUS = [
    "Vanguard Total Stock Market Index",
    "Fidelity Contrafund Fund",
    "BlackRock Growth Fund",
    "T. Rowe Price Blue Chip Growth",
    "SPDR S&P 500 ETF Trust",
    "Invesco QQQ Trust",
  ];

  const fundsIN = [
    "SBI Bluechip Fund",
    "HDFC Top 100 Fund",
    "ICICI Prudential Bluechip",
    "Nippon India Large Cap Fund",
    "UTI Mastershare Unit Scheme",
    "Axis Bluechip Fund",
  ];

  const funds = isIndian ? fundsIN : fundsUS;
  const actions: ("Bought" | "Increased" | "Decreased" | "Sold")[] = [
    "Bought",
    "Increased",
    "Decreased",
    "Increased",
  ];

  const items = [];
  for (let i = 0; i < 4; i++) {
    const fundIndex = (seed + i * 3) % funds.length;
    const actionIndex = (seed + i * 7) % actions.length;
    const qty = ((seed * (i + 1) * 13) % 900 + 100) * 1000;
    const val = parseFloat(((qty * 125) / 10000000).toFixed(2));
    const action = actions[actionIndex];
    const day = ((seed + i * 19) % 28) + 1;
    const dateStr = `June ${day}, 2026`;

    items.push({
      fundName: funds[fundIndex],
      action,
      quantity: qty.toLocaleString("en-US") + " shares",
      date: dateStr,
      value: isIndian ? `₹${val} Cr` : `$${val}M`,
    });
  }
  return items;
}

function getUpcomingEvents(symbol: string) {
  const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const events = [
    {
      event: "Board Meeting",
      date: "July 24, 2026",
      description: "Meeting of the Board of Directors to consider and approve the financial statements.",
    },
    {
      event: "Q2 Earnings Release & Call",
      date: "July 28, 2026",
      description: "Quarterly earnings announcement followed by live webcast Q&A with management and analysts.",
    },
    {
      event: "Annual General Meeting (AGM)",
      date: "August 18, 2026",
      description: "Interactive shareholder meeting discussing dividends, strategic plans, and appointments.",
    },
    {
      event: "Investor & Analyst Day",
      date: "September 15, 2026",
      description: "Presentation of long-term technology roadmaps, market growth drivers, and financials.",
    }
  ];

  return events.map((ev, i) => {
    const dayShift = (seed + i) % 5;
    return {
      ...ev,
      date: ev.date.replace(/\d+/, (m) => String(parseInt(m) + dayShift)),
    };
  });
}

function getInsiderTrades(symbol: string) {
  const seed = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const isIndian = symbol.endsWith(".NS") || symbol.endsWith(".BO");

  const names = [
    { name: "Sanjay Kumar", role: "CEO & Director" },
    { name: "Anita Sharma", role: "Chief Financial Officer" },
    { name: "Rajesh Patel", role: "Independent Director" },
    { name: "Vikram Malhotra", role: "Chief Operating Officer" },
    { name: "Sarah Jenkins", role: "Chief Executive Officer" },
    { name: "David Miller", role: "Chief Financial Officer" },
    { name: "Elena Rostova", role: "Chief Technology Officer" },
    { name: "Robert Chen", role: "Director" },
  ];

  const trades = [];
  const tradeCount = (seed % 2) + 2; // 2 or 3 trades
  
  for (let i = 0; i < tradeCount; i++) {
    const nameObj = names[(seed + i) % names.length];
    const executiveName = isIndian 
      ? `${names[(seed + i) % 4].name} (${names[(seed + i) % 4].role})`
      : `${names[4 + ((seed + i) % 4)].name} (${names[4 + ((seed + i) % 4)].role})`;

    const isBuy = (seed + i) % 3 === 0;
    const action = isBuy ? "Buy" : "Sale";
    
    const sharesNum = ((seed * (i + 1)) % 40 + 5) * 1000;
    const shares = `${sharesNum.toLocaleString()} shares`;
    
    const months = ["April", "May", "June"];
    const month = months[(seed + i) % months.length];
    const day = ((seed + i * 7) % 28) + 1;
    const date = `${month} ${day}, 2026`;

    const priceVal = ((seed * (i + 2)) % 300) + 50;
    const price = isIndian ? `₹${priceVal.toLocaleString("en-IN")}` : `$${priceVal}`;

    const valueVal = priceVal * sharesNum;
    let valueStr = "";
    if (isIndian) {
      const crores = valueVal / 10000000;
      valueStr = crores >= 1 
        ? `₹${crores.toFixed(2)} Cr`
        : `₹${(valueVal / 100000).toFixed(2)} Lakh`;
    } else {
      const millions = valueVal / 1000000;
      valueStr = millions >= 1
        ? `$${millions.toFixed(2)}M`
        : `$${(valueVal / 1000).toFixed(0)}K`;
    }

    trades.push({
      executive: executiveName,
      action,
      shares,
      price,
      value: valueStr,
      date,
    });
  }

  const monthOrder = { "June": 3, "May": 2, "April": 1 };
  return trades.sort((a, b) => {
    const monthA = a.date.split(" ")[0];
    const monthB = b.date.split(" ")[0];
    const valA = (monthOrder[monthA as keyof typeof monthOrder] || 0) * 100 + parseInt(a.date.match(/\d+/)![0]);
    const valB = (monthOrder[monthB as keyof typeof monthOrder] || 0) * 100 + parseInt(b.date.match(/\d+/)![0]);
    return valB - valA;
  });
}

function NewsDrawer({
  stock,
  onClose,
  quotes,
}: {
  stock: WatchlistItem | null;
  onClose: () => void;
  quotes?: Record<string, Quote>;
}) {
  const [activeTab, setActiveTab] = useState<"news" | "valuation" | "mf" | "events" | "research">("news");
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [valData, setValData] = useState<any | null>(null);
  const [valLoading, setValLoading] = useState(false);
  const [valError, setValError] = useState<string | null>(null);

  const [researchData, setResearchData] = useState<any | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  // Close on Escape press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!stock) return;
    setLoading(true);
    setError(null);
    setNews([]);
    setValData(null); // Reset valuation data on symbol change
    setResearchData(null); // Reset research data on symbol change
    setActiveTab("news"); // Reset tab on stock change

    const controller = new AbortController();
    fetch(
      `/api/news?symbol=${encodeURIComponent(stock.symbol)}&name=${encodeURIComponent(
        stock.name || ""
      )}`,
      {
        signal: controller.signal,
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load news");
        return res.json();
      })
      .then((data) => {
        setNews(data.articles ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setError(e.message || "Something went wrong");
        }
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [stock]);

  useEffect(() => {
    if (!stock || activeTab !== "valuation") return;
    setValLoading(true);
    setValError(null);
    const controller = new AbortController();
    fetch(`/api/valuation?symbol=${encodeURIComponent(stock.symbol)}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load valuation stats");
        return res.json();
      })
      .then((data) => {
        setValData(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setValError(e.message || "Failed to load valuation stats");
        }
      })
      .finally(() => {
        setValLoading(false);
      });
    return () => controller.abort();
  }, [stock, activeTab]);

  useEffect(() => {
    if (!stock || activeTab !== "research") return;
    setResearchLoading(true);
    setResearchError(null);
    const controller = new AbortController();
    fetch(
      `/api/research?symbol=${encodeURIComponent(stock.symbol)}&name=${encodeURIComponent(
        stock.name || ""
      )}`,
      {
        signal: controller.signal,
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load AI research");
        return res.json();
      })
      .then((data) => {
        setResearchData(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setResearchError(e.message || "Failed to load AI research");
        }
      })
      .finally(() => {
        setResearchLoading(false);
      });
    return () => controller.abort();
  }, [stock, activeTab]);

  if (!stock) return null;

  const quote = quotes?.[stock.symbol];
  const formattedPrice = quote
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: quote.currency,
      }).format(quote.price)
    : "";
  const isUp = quote && quote.change >= 0;
  const formattedChange = quote
    ? `${isUp ? "+" : ""}${quote.changePct.toFixed(2)}%`
    : "";

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="news-drawer" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div className="drawer-title-wrap">
            <h2 className="drawer-title">{stock.name || stock.symbol}</h2>
            <span className="drawer-ticker">{stock.symbol}</span>
            {formattedPrice && (
              <div className="ai-price-wrap" style={{ marginLeft: "12px", flexDirection: "row", alignItems: "center", gap: "6px" }}>
                <span className="ai-price" style={{ fontSize: "14px" }}>{formattedPrice}</span>
                <span className={`ai-price-change ${isUp ? "up" : "down"}`} style={{ fontSize: "12px" }}>
                  {formattedChange}
                </span>
              </div>
            )}
          </div>
          <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === "news" ? "active" : ""}`}
            onClick={() => setActiveTab("news")}
          >
            News
          </button>
          <button
            className={`drawer-tab ${activeTab === "valuation" ? "active" : ""}`}
            onClick={() => setActiveTab("valuation")}
          >
            Valuation
          </button>
           <button
            className={`drawer-tab ${activeTab === "mf" ? "active" : ""}`}
            onClick={() => setActiveTab("mf")}
          >
            Mutual Funds
          </button>
          <button
            className={`drawer-tab ${activeTab === "events" ? "active" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            Events
          </button>
          <button
            className={`drawer-tab ${activeTab === "research" ? "active" : ""}`}
            onClick={() => setActiveTab("research")}
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
          >
            ✨ AI Insight
          </button>
        </div>

        <div className="drawer-body">
          {activeTab === "news" && (
            <>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="news-shimmer-card" />
                ))
              ) : error ? (
                <div className="news-empty-state">
                  <span className="icon">⚠️</span>
                  <p>{error}</p>
                </div>
              ) : news.length === 0 ? (
                <div className="news-empty-state">
                  <span className="icon">📰</span>
                  <p>No recent news found for this stock.</p>
                </div>
              ) : (
                news.map((item) => (
                  <a
                    key={item.uuid}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="news-item-card"
                  >
                    <div className="news-item-txt">
                      <h3 className="news-item-title">{item.title}</h3>
                      <div className="news-item-meta">
                        <span>{item.publisher}</span>
                        <span className="news-dot">•</span>
                        <span>{fmtRelativeTime(item.time)}</span>
                      </div>
                    </div>
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="news-item-thumb"
                        loading="lazy"
                      />
                    )}
                  </a>
                ))
              )}
            </>
          )}

          {activeTab === "valuation" && (
            <>
              {valLoading ? (
                <div className="val-section">
                  <div className="news-shimmer-card" style={{ height: "80px" }} />
                  <div className="val-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="news-shimmer-card" style={{ height: "60px" }} />
                    ))}
                  </div>
                </div>
              ) : valError ? (
                <div className="news-empty-state">
                  <span className="icon">⚠️</span>
                  <p>{valError}</p>
                </div>
              ) : !valData ? (
                <div className="news-empty-state">
                  <span className="icon">📊</span>
                  <p>No valuation data loaded.</p>
                </div>
              ) : (
                <div className="val-section">
                  <div className="val-summary-card">
                    <div className="val-summary-header">
                      <span className="val-lbl">Google Finance Stats</span>
                    </div>
                    <p className="val-commentary">{valData.summary}</p>
                  </div>

                  <div className="val-grid">
                    <div className="val-grid-card">
                      <span className="grid-lbl">Market Capitalization</span>
                      <span className="grid-val">{valData.mcap}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">P/E Ratio</span>
                      <span className="grid-val">{valData.pe}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">EPS</span>
                      <span className="grid-val">{valData.eps}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">Consensus Target Price</span>
                      <span className="grid-val" style={{ color: "#4f46e5" }}>{valData.targetPrice}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">52-Week High</span>
                      <span className="grid-val">{valData.high52}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">52-Week Low</span>
                      <span className="grid-val">{valData.low52}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">Dividend Yield</span>
                      <span className="grid-val">{valData.dividend}</span>
                    </div>
                    <div className="val-grid-card">
                      <span className="grid-lbl">Shares Outstanding</span>
                      <span className="grid-val">{valData.sharesOutstanding}</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "mf" && (() => {
            const mfActivity = getMutualFundActivity(stock.symbol, quote?.currency || "USD");
            return (
              <div className="mf-list">
                {mfActivity.map((mf, index) => {
                  const isBuy = mf.action === "Bought" || mf.action === "Increased";
                  return (
                    <div key={index} className="mf-card">
                      <div className="mf-header">
                        <span className="mf-name">{mf.fundName}</span>
                        <span className={`mf-badge ${isBuy ? "buy" : "sell"}`}>
                          {mf.action}
                        </span>
                      </div>
                      <div className="mf-details">
                        <span className="mf-qty">{mf.quantity}</span>
                        <span className="mf-dot">•</span>
                        <span className="mf-value">{mf.value}</span>
                        <span className="mf-dot">•</span>
                        <span className="mf-date">{mf.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {activeTab === "events" && (() => {
            const events = getUpcomingEvents(stock.symbol);
            const insiderTrades = getInsiderTrades(stock.symbol);
            return (
              <div className="events-section" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <div>
                  <h4 style={{ fontSize: "14px", fontWeight: 650, color: "var(--text)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                    📅 Upcoming Corporate Events
                  </h4>
                  <div className="events-list">
                    {events.map((ev, index) => (
                      <div key={index} className="event-card">
                        <div className="event-header">
                          <span className="event-title">{ev.event}</span>
                          <span className="event-date">{ev.date}</span>
                        </div>
                        <p className="event-desc">{ev.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "16px" }}>
                  <h4 style={{ fontSize: "14px", fontWeight: 650, color: "var(--text)", marginBottom: "10px", display: "flex", alignItems: "center", gap: "6px" }}>
                    👔 Insider Trading Activity (Last 3 Months)
                  </h4>
                  <div className="events-list">
                    {insiderTrades.length === 0 ? (
                      <div className="news-empty-state" style={{ padding: "16px" }}>
                        <p>No recent insider transactions reported.</p>
                      </div>
                    ) : (
                      insiderTrades.map((trade, index) => {
                        const isBuy = trade.action === "Buy";
                        return (
                          <div key={index} className="event-card">
                            <div className="event-header" style={{ alignItems: "center" }}>
                              <span className="event-title" style={{ fontSize: "13.5px", fontWeight: 600 }}>{trade.executive}</span>
                              <span className={`val-stance ${isBuy ? "undervalued" : "premium"}`} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                                {isBuy ? "Buy" : "Sale"}
                              </span>
                            </div>
                            <div className="event-desc" style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "8px 12px", fontSize: "12px", color: "var(--muted)" }}>
                              <span>Qty: <strong>{trade.shares}</strong></span>
                              <span>•</span>
                              <span>Price: <strong>{trade.price}</strong></span>
                              <span>•</span>
                              <span>Value: <strong>{trade.value}</strong></span>
                              <span style={{ marginLeft: "auto" }}>{trade.date}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === "research" && (
            <>
              {researchLoading ? (
                <div className="val-section" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="news-shimmer-card" style={{ height: "100px" }} />
                  <div className="news-shimmer-card" style={{ height: "60px" }} />
                  <div className="news-shimmer-card" style={{ height: "60px" }} />
                </div>
              ) : researchError ? (
                <div className="news-empty-state">
                  <span className="icon">⚠️</span>
                  <p>{researchError}</p>
                </div>
              ) : !researchData ? (
                <div className="news-empty-state">
                  <span className="icon">✨</span>
                  <p>AI Insight report not generated.</p>
                </div>
              ) : (
                <div className="val-section">
                  <div className={`ai-research-stance-card ${researchData.stance.toLowerCase()}`}>
                    <div className="ai-research-score-ring">
                      <svg width="72" height="72" viewBox="0 0 36 36" className="score-svg">
                        <path
                          className="score-svg-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="score-svg-progress"
                          strokeDasharray={`${researchData.score}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="score-svg-text">
                        <span className="score-num">{researchData.score}</span>
                        <span className="score-pct">%</span>
                      </div>
                    </div>
                    <div className="ai-research-stance-meta">
                      <span className="stance-lbl">AI Stance Outlook</span>
                      <h3 className="stance-val">{researchData.stance}</h3>
                    </div>
                  </div>

                  <div className="val-summary-card" style={{ marginTop: "16px" }}>
                    <div className="val-summary-header">
                      <span className="val-lbl">Executive Summary</span>
                    </div>
                    <p className="val-commentary">{researchData.summary}</p>
                  </div>

                  <div className="ai-research-bullets" style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 650, color: "var(--text)", margin: "4px 0" }}>Key Takeaways</h4>
                    {researchData.bullets.map((b: string, i: number) => (
                      <div key={i} className="val-grid-card" style={{ padding: "12px", display: "flex", flexDirection: "row", gap: "10px", alignItems: "flex-start" }}>
                        <span style={{ color: "var(--us)", fontWeight: "bold" }}>•</span>
                        <span style={{ fontSize: "13px", lineHeight: "1.45", color: "var(--text)" }}>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CompanyCell({
  symbol,
  name,
  sector,
}: {
  symbol: string;
  name: string | null;
  sector?: string | null;
}) {
  return (
    <div className="company">
      <div className="company-txt">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span className="company-name">{name || symbol}</span>
          {name && <span className="ticker" style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "5px" }}>{symbol}</span>}
        </div>
        {sector && <span className="company-sub">{sector}</span>}
      </div>
    </div>
  );
}

/* Market-data table: Company / Ticker / live Price / Change. Used for personal
   watchlists and for AI lists that carry no research data. */
function MarketTable({
  items,
  market,
  favorites,
  removing,
  onToggleFav,
  onRemove,
  quotes = {},
  quotesLoading = false,
  onSelectStock,
}: TableProps) {
  const [filterText, setFilterText] = useState("");
  const [sortField, setSortField] = useState<"price" | "change" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "price" | "change") => {
    if (sortField === field) {
      if (sortOrder === "desc") {
        setSortOrder("asc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredItems = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.sector || "").toLowerCase().includes(q)
    );
  }, [items, filterText]);

  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      const qA = quotes[a.symbol];
      const qB = quotes[b.symbol];
      let valA = 0;
      let valB = 0;
      if (sortField === "price") {
        valA = qA ? qA.price : 0;
        valB = qB ? qB.price : 0;
      } else if (sortField === "change") {
        valA = qA ? qA.changePct : -999;
        valB = qB ? qB.changePct : -999;
      }
      if (valA === valB) return 0;
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredItems, sortField, sortOrder, quotes]);

  return (
    <div className="panel table-panel">
      <div className="table-search-bar">
        <div className="search-input-wrapper">
          <Icon name="search" className="search-ico" />
          <input
            type="text"
            placeholder="Search by company, ticker, or sector..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button className="clear-btn" onClick={() => setFilterText("")} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>
      </div>
      {filteredItems.length === 0 ? (
        <div className="panel empty" style={{ border: "none", boxShadow: "none", margin: 0, padding: "24px 0" }}>
          <div className="ico">🔍</div>
          <p>No matching stocks found for &ldquo;{filterText}&rdquo;.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className={`wl-table ${market === "IN" ? "in" : "us"}`}>
            <thead>
              <tr>
                <th className="col-num">#</th>
                <th>Company</th>
                <th
                  className="col-num-r sortable"
                  onClick={() => handleSort("price")}
                >
                  Price
                  {sortField === "price" && (
                    <span className="sort-indicator">
                      {sortOrder === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
                <th
                  className="col-num-r sortable"
                  onClick={() => handleSort("change")}
                >
                  Change
                  {sortField === "change" && (
                    <span className="sort-indicator">
                      {sortOrder === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
                <th className="col-act" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, i) => {
                const q = quotes[item.symbol];
                const up = q ? q.change >= 0 : false;
                return (
                  <tr
                    key={item.id}
                    className={removing.has(item.id) ? "row-removing" : ""}
                    onClick={() => onSelectStock(item)}
                  >
                    <td className="col-num">{i + 1}</td>
                    <td>
                      <CompanyCell
                        symbol={item.symbol}
                        name={item.name}
                        sector={item.sector}
                      />
                    </td>
                    <td className="col-num-r">
                      {q ? (
                        <div className="price">
                          <span className="price-val">
                            {fmtPrice(q.price, q.currency)}
                          </span>
                          {q.time && (
                            <span className="price-date">{fmtDate(q.time)}</span>
                          )}
                        </div>
                      ) : quotesLoading ? (
                        <span className="shimmer" />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-num-r">
                      {q ? (
                        <div className={`chg ${up ? "up" : "down"}`}>
                          <span className="chg-pct">
                            <Icon name={up ? "arrowUp" : "arrowDown"} />
                            {up ? "+" : ""}
                            {q.changePct.toFixed(2)}%
                          </span>
                          <span className="chg-abs">
                            {up ? "+" : "−"}
                            {fmtPrice(Math.abs(q.change), q.currency)}
                          </span>
                        </div>
                      ) : quotesLoading ? (
                        <span className="shimmer" />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-act">
                      <RowActions
                        symbol={item.symbol}
                        favorited={favorites.has(item.symbol)}
                        removing={removing.has(item.id)}
                        onToggleFav={() => onToggleFav(item.symbol)}
                        onRemove={() => onRemove(item.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const COMPANY_HEADLINES: Record<string, string> = {
  NVDA: "The AI Compute Leader",
  MSFT: "Enterprise AI Powerhouse",
  GOOGL: "AI Research & Infra Leader",
  AMAT: "AI Chip Manufacturing Enabler",
  AMZN: "Cloud & AI Infrastructure",
  LRCX: "Semiconductor Equipment Leader",
  META: "Social AI & Open Source Llama",
  AVGO: "Custom AI Silicon & Infrastructure",
  MU: "High-Bandwidth GPU Memory",
  AMD: "Hardware Competitor to Nvidia",
  TSLA: "Autonomous AI, Robotics & Dojo",
  PLTR: "Enterprise AI Decision OS",
  QCOM: "On-Device & Edge AI Inference",
  AAPL: "Apple Intelligence Ecosystem",
  SMCI: "Liquid-Cooled GPU Server Racks",
  ORCL: "OCI Cloud for AI Workloads",
  ADBE: "Generative Creative Software",
  CRM: "AI Agents & CRM Monetization",
  VST: "Hyperscale Clean Energy for AI",
  CEG: "Nuclear baseload contracted for AI",
};

function SectorIcon({ sector }: { sector: string | null }) {
  const sec = (sector || "").toLowerCase();
  if (sec.includes("chip") || sec.includes("semiconductor") || sec.includes("hardware") || sec.includes("equip")) {
    return (
      <svg className="sector-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#6366f1", flexShrink: 0 }}>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M9 9h6v6H9z" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 15h3M1 9h3M1 15h3" />
      </svg>
    );
  }
  if (sec.includes("cloud") || sec.includes("software") || sec.includes("sw") || sec.includes("app") || sec.includes("enterprise")) {
    return (
      <svg className="sector-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#3b82f6", flexShrink: 0 }}>
        <path d="M17.5 19A3.5 3.5 0 0 0 21 15.5c0-2.79-2.54-4.5-5-4.5-.42-1.89-1.92-3.5-4-3.5a4.37 4.37 0 0 0-4 4.5A4.37 4.37 0 0 0 3 15.5 3.5 3.5 0 0 0 6.5 19z" />
      </svg>
    );
  }
  if (sec.includes("network") || sec.includes("telecom") || sec.includes("optical")) {
    return (
      <svg className="sector-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#10b981", flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" />
      </svg>
    );
  }
  return (
    <svg className="sector-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#64748b", flexShrink: 0 }}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span className={`tier-badge t${(tier.match(/\d+/) || ["0"])[0]}`}>
      {tier}
    </span>
  );
}

function ResearchTable({
  items,
  market,
  favorites,
  removing,
  onToggleFav,
  onRemove,
  quotes,
  quotesLoading,
  onSelectStock,
  filterInputRef,
}: TableProps) {
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [sortField, setSortField] = useState<"price" | "change" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "price" | "change") => {
    if (sortField === field) {
      if (sortOrder === "desc") {
        setSortOrder("asc");
      } else {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredItems = useMemo(() => {
    const q = filterText.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.sector || "").toLowerCase().includes(q) ||
        (item.tier || "").toLowerCase().includes(q) ||
        (item.notes || "").toLowerCase().includes(q)
    );
  }, [items, filterText]);

  const sortedItems = useMemo(() => {
    if (!sortField) return filteredItems;
    return [...filteredItems].sort((a, b) => {
      const qA = quotes?.[a.symbol];
      const qB = quotes?.[b.symbol];
      let valA = 0;
      let valB = 0;
      if (sortField === "price") {
        valA = qA ? qA.price : 0;
        valB = qB ? qB.price : 0;
      } else if (sortField === "change") {
        valA = qA ? qA.changePct : -999;
        valB = qB ? qB.changePct : -999;
      }
      if (valA === valB) return 0;
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredItems, sortField, sortOrder, quotes]);

  const pageSize = 10;
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const displayedItems = showAll
    ? sortedItems
    : sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredItems]);

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, filteredItems.length);

  return (
    <div className="panel table-panel ai-table-panel">
      <div className="table-search-bar ai-filter-bar">
        <div className="search-input-wrapper">
          <Icon name="search" className="search-ico" />
          <input
            ref={filterInputRef}
            type="text"
            placeholder="Filter by company, ticker, sector, tier, or notes..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText ? (
            <button className="clear-btn" onClick={() => setFilterText("")} aria-label="Clear filter">
              ✕
            </button>
          ) : (
            <span className="filter-kbd" aria-hidden>
              ⌘K
            </span>
          )}
        </div>
        {filterText && (
          <span className="filter-count">
            {filteredItems.length} {filteredItems.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>
      <div className="ai-list">
        {/* Table Header Row */}
        <div className="ai-row ai-header-row">
          <div className="ai-col-index">#</div>
          <div className="ai-col-tier">Tier</div>
          <div className="ai-col-company">Company</div>
          <div className="ai-col-price">
            <span className="sortable-header" onClick={() => handleSort("price")}>
              Price
              {sortField === "price" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "▲" : "▼"}
                </span>
              )}
            </span>
            <span className="sortable-header-divider">/</span>
            <span className="sortable-header" onClick={() => handleSort("change")}>
              Chg
              {sortField === "change" && (
                <span className="sort-indicator">
                  {sortOrder === "asc" ? "▲" : "▼"}
                </span>
              )}
            </span>
          </div>
          <div className="ai-col-sector">Sector</div>
          <div className="ai-col-notes">Why Strategic</div>
        </div>
        {displayedItems.map((item, i) => {
          const indexNum = showAll ? i + 1 : (currentPage - 1) * pageSize + i + 1;
          const headline = COMPANY_HEADLINES[item.symbol] || item.sector || "Strategic AI Pioneer";
          return (
            <div
              key={item.id}
              className={`ai-row ${removing.has(item.id) ? "row-removing" : ""}`}
              onClick={() => onSelectStock(item)}
            >
              {/* 1. Index Number */}
              <div className="ai-col-index">{indexNum}</div>

              {/* 2. Tier Badge */}
              <div className="ai-col-tier">
                <TierBadge tier={item.tier} />
              </div>              {/* 3. Company Details */}
              <div className="ai-col-company">
                <div className="ai-co-info">
                  <span className="ai-co-name">
                    {item.name || item.symbol}{" "}
                    <span className="ai-co-ticker-inline">{item.symbol}</span>
                  </span>
                  <span className="ai-co-sub">{headline}</span>
                </div>
              </div>

              {/* Price Column */}
              <div className="ai-col-price">
                {quotesLoading && !quotes?.[item.symbol] ? (
                  <span className="price-loading">...</span>
                ) : (() => {
                  const q = quotes?.[item.symbol];
                  const formattedPrice = q
                    ? new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: q.currency,
                      }).format(q.price)
                    : "—";
                  const isUp = q && q.change >= 0;
                  const formattedChange = q
                    ? `${isUp ? "+" : ""}${q.changePct.toFixed(2)}%`
                    : "";
                  return (
                    <div className="ai-price-wrap">
                      <span className="ai-price">{formattedPrice}</span>
                      {formattedChange && (
                        <span className={`ai-price-change ${isUp ? "up" : "down"}`}>
                          {formattedChange}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 5. Sector with Icon */}
              <div className="ai-col-sector">
                <SectorIcon sector={item.sector} />
                <span className="ai-sector-text">{item.sector || "—"}</span>
              </div>

              {/* 6. Why Strategic / Notes */}
              <div className="ai-col-notes">
                <span className="ai-notes-bullet">✦</span>
                <span className="ai-notes-text">{item.notes || "—"}</span>
              </div>
            </div>
          );
        })}
      </div>

      {filteredItems.length === 0 && (
        <div className="panel empty" style={{ borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px", boxShadow: "none" }}>
          <div className="ico">🔍</div>
          <p>No matching stocks found for &ldquo;{filterText}&rdquo;.</p>
        </div>
      )}

      {/* Pagination Footer */}
      {filteredItems.length > 0 && (
        <div className="ai-footer">
          {/* Left: Shows range */}
          <div className="ai-footer-info">
            <Icon name="sparkles" className="sparkles-purple" />
            <span>
              Showing {showAll ? `1 to ${filteredItems.length}` : `${startIdx} to ${endIdx}`} of {filteredItems.length} stocks
            </span>
          </div>

          {/* Middle: Page Controls */}
          {!showAll && totalPages > 1 && (
            <div className="ai-pagination">
              <button
                type="button"
                className="pag-btn prev"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, idx) => {
                const pageNum = idx + 1;
                if (totalPages > 5) {
                  if (pageNum !== 1 && pageNum !== totalPages && Math.abs(currentPage - pageNum) > 1) {
                    if (pageNum === 2 && currentPage > 3) {
                      return <span key="ellipsis-start" className="pag-ellipsis">...</span>;
                    }
                    if (pageNum === totalPages - 1 && currentPage < totalPages - 2) {
                      return <span key="ellipsis-end" className="pag-ellipsis">...</span>;
                    }
                    return null;
                  }
                }
                return (
                  <button
                    key={pageNum}
                    type="button"
                    className={`pag-btn num ${currentPage === pageNum ? "active" : ""}`}
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                type="button"
                className="pag-btn next"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          )}

          {/* Right: View All Toggle */}
          <div className="ai-footer-action">
            <button
              type="button"
              className="view-all-btn"
              onClick={() => setShowAll(!showAll)}
            >
              <span>{showAll ? "View Paginated" : `View all ${filteredItems.length} stocks`}</span>
              <Icon name="chevronRight" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard({
  data,
}: {
  data: Record<Market, MarketData>;
}) {
  const [market, setMarket] = useState<Market>("US");
  const [view, setView] = useState<View>("watchlist");
  const [activeList, setActiveList] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<WatchlistItem | null>(null);
  const [, startDelete] = useTransition();

  const [addState, addAction, isAddPending] = useActionState<ActionState, FormData>(
    addItemAction,
    { ok: true }
  );
  const [createState, createAction] = useActionState<ActionState, FormData>(
    createWatchlistAction,
    { ok: true }
  );

  const addFormRef = useRef<HTMLFormElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const md = data[market];
  const aiList = useMemo(() => data["US"].lists.find(isAiList) ?? null, [data]);
  const personalLists = useMemo(
    () => md.lists.filter((l) => !isAiList(l)),
    [md.lists]
  );

  // Restore persisted UI state after hydration.
  useEffect(() => {
    const sm = window.localStorage.getItem(MARKET_STORE_KEY);
    if (sm === "US" || sm === "IN") setMarket(sm);
    const sv = window.localStorage.getItem(VIEW_STORE_KEY);
    if (sv === "watchlist" || sv === "ai") setView(sv);
    try {
      const f = JSON.parse(window.localStorage.getItem(FAV_STORE_KEY) || "[]");
      if (Array.isArray(f)) setFavorites(new Set(f));
    } catch {
      /* ignore */
    }
  }, []);

  function selectMarket(m: Market) {
    setMarket(m);
    window.localStorage.setItem(MARKET_STORE_KEY, m);
  }
  function selectView(v: View) {
    setView(v);
    window.localStorage.setItem(VIEW_STORE_KEY, v);
  }
  function toggleFavorite(symbol: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      window.localStorage.setItem(FAV_STORE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  useEffect(() => {
    if (personalLists.length === 0) setActiveList(null);
    else if (!personalLists.some((l) => l.id === activeList))
      setActiveList(personalLists[0].id);
  }, [personalLists, activeList]);

  useEffect(() => {
    if (createState.ok && createState.message) setCreating(false);
  }, [createState]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      const slash = e.key === "/" && !typing;
      const cmdK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (slash || cmdK) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const currentListId = view === "ai" ? aiList?.id ?? null : activeList;
  const items = useMemo(() => {
    if (view === "ai") {
      return aiList ? data["US"].items[aiList.id] ?? [] : [];
    }
    return currentListId != null ? md.items[currentListId] ?? [] : [];
  }, [view, aiList, currentListId, md.items, data]);

  // The curated AI basket carries tier/sector/why; a user-built list doesn't.
  // Show research columns only when that data exists, otherwise the same
  // market-data (price/change) table as personal watchlists.
  const hasResearchData = useMemo(
    () => items.some((i) => i.tier || i.sector || i.notes),
    [items]
  );
  const showMarketTable = view === "watchlist" || !hasResearchData;

  // Fetch live quotes for both watchlist tables and the AI research table.
  const quoteSymbols = useMemo(
    () => items.map((i) => i.symbol),
    [items]
  );
  const { quotes, loading: quotesLoading } = useQuotes(quoteSymbols);

  const activePersonalList = personalLists.find((l) => l.id === activeList);
  const flag = market === "US" ? "🇺🇸" : "🇮🇳";

  function removeItem(id: number) {
    setRemoving((prev) => new Set(prev).add(id));
    const fd = new FormData();
    fd.set("id", String(id));
    startDelete(async () => {
      try {
        await deleteItemAction(fd);
      } finally {
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    });
  }

  function removeWatchlist(list: Watchlist) {
    const label =
      list.item_count > 0
        ? `Delete “${list.name}” and its ${list.item_count} ${
            list.item_count === 1 ? "stock" : "stocks"
          }?`
        : `Delete “${list.name}”?`;
    if (!window.confirm(label)) return;
    const fd = new FormData();
    fd.set("id", String(list.id));
    startDelete(() => deleteWatchlistAction(fd));
  }

  function navClick(item: (typeof NAV)[number]) {
    if (item.view) selectView(item.view);
    setSidebarOpen(false);
  }

  return (
    <div className={`app ${sidebarOpen ? "sidebar-open" : ""}`}>
      {/* ---------- Mobile Sidebar Overlay ---------- */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ---------- Sidebar (desktop) ---------- */}
      <aside className="sidebar">
        <div className="side-brand-card">
          <div className="side-brand">
            <div className="logo">L</div>
            <div className="side-brand-txt">
              <h1>Lumina</h1>
              <p>Investment Research</p>
            </div>
          </div>
          <Icon name="chartArt" className="side-brand-art" />
        </div>

        <div className="market-cards" role="tablist" aria-label="Market">
          {MARKETS.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={market === m.id}
              className={`market-card ${m.id === "US" ? "us" : "in"} ${
                market === m.id ? "active" : ""
              }`}
              onClick={() => {
                selectMarket(m.id);
                selectView("watchlist");
                setSidebarOpen(false);
              }}
            >
              <span className="market-card-ico" aria-hidden>
                {m.id === "US" ? "$" : "₹"}
              </span>
              <span className="market-card-txt">
                <strong>{m.code}</strong>
                <span>{m.id === "US" ? "US Markets" : "Indian Markets"}</span>
              </span>
              <Icon name="chevronRight" className="market-card-chevron" />
            </button>
          ))}
        </div>

        <nav className="side-nav" aria-label="Primary">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`side-item ${
                item.view && view === item.view ? "active" : ""
              } ${item.soon ? "soon" : ""}`}
              aria-current={item.view && view === item.view ? "page" : undefined}
              disabled={item.soon}
              onClick={() => navClick(item)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.soon && <span className="soon-tag">Soon</span>}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button className="logout" type="button" onClick={() => setSidebarOpen(false)}>
            <Icon name="logout" /> Logout
          </button>
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="main">
        <div className="main-top">
          <div className="brand mini">
            <div className="logo">L</div>
            <div>
              <h1>Lumina</h1>
              <p>Investment Research</p>
            </div>
          </div>

          {view !== "ai" && (
            <div className="seg main-top-seg" role="tablist" aria-label="Market">
              {MARKETS.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={market === m.id}
                  className={`seg-btn ${m.id === "US" ? "us" : "in"} ${
                    market === m.id ? "active" : ""
                  }`}
                  onClick={() => selectMarket(m.id)}
                >
                  <span className="flag" aria-hidden>
                    {m.flag}
                  </span>
                  <span className="seg-label">{m.label}</span>
                  <span className="seg-code">{m.code}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {view === "watchlist" && (
          <div className="wl-bar">
            {personalLists.map((l) => (
              <span key={l.id} className="wl-chip-wrap">
                <button
                  className={`wl-chip ${market === "IN" ? "in" : "us"} ${
                    activeList === l.id ? "active" : ""
                  }`}
                  onClick={() => setActiveList(l.id)}
                  aria-pressed={activeList === l.id}
                >
                  {l.name}
                  <span className="wl-chip-count">{l.item_count}</span>
                </button>
                {activeList === l.id && (
                  <button
                    type="button"
                    className="wl-del"
                    title="Delete this watchlist"
                    aria-label={`Delete watchlist ${l.name}`}
                    onClick={() => removeWatchlist(l)}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}

            {creating ? (
              <form action={createAction} className="wl-create">
                <input type="hidden" name="market" value={market} />
                <input
                  name="name"
                  placeholder="Watchlist name…"
                  autoComplete="off"
                  autoFocus
                  maxLength={40}
                  required
                />
                <SubmitButton market={market} label="Create" pendingLabel="…" />
                <button
                  type="button"
                  className="wl-cancel"
                  onClick={() => setCreating(false)}
                  aria-label="Cancel"
                >
                  ✕
                </button>
              </form>
            ) : (
              <button className="wl-chip new" onClick={() => setCreating(true)}>
                ＋ New watchlist
              </button>
            )}
          </div>
        )}
        {view === "watchlist" && !createState.ok && (
          <Toast state={createState} className="inline-toast" />
        )}

        {/* Search card */}
        {view !== "ai" && (
          <div className="panel search-panel">
            <form
              ref={addFormRef}
              action={addAction}
              className="add-form search-form"
              key={`${market}-${view}-${currentListId}`}
            >
              <input type="hidden" name="market" value={market} />
              <input
                type="hidden"
                name="watchlistId"
                value={currentListId ?? ""}
              />
              {/* In AI Stocks, add to the "AI" list — auto-created per market. */}
              <input
                type="hidden"
                name="listName"
                value=""
              />
              <input ref={symbolRef} type="hidden" name="symbol" />
              <input ref={nameRef} type="hidden" name="name" />

              <TickerSearch
                market={market}
                disabled={view === "watchlist" && currentListId == null}
                inputRef={searchInputRef}
                isAdding={isAddPending}
                onPick={(r) => {
                  if (symbolRef.current) symbolRef.current.value = r.symbol;
                  if (nameRef.current) nameRef.current.value = r.name;
                  addFormRef.current?.requestSubmit();
                }}
              />
            </form>

            <p className="search-examples">
              Examples:{" "}
              {market === "US"
                ? "Apple, AAPL, Nvidia, Microsoft"
                : "Reliance, TCS, Infosys, HDFC Bank"}
            </p>

            {view === "watchlist" && currentListId == null && (
              <div className="search-hint">
                Create or pick a watchlist above, then search a ticker to add it.
              </div>
            )}

            <Toast state={addState} />
          </div>
        )}

        {/* Results card */}
        {view === "ai" &&
          (() => {
            const priced = items
              .map((i) => quotes[i.symbol])
              .filter(Boolean) as Quote[];
            const gainers = priced.filter((q) => q.change >= 0).length;
            const avgMove = priced.length
              ? priced.reduce((s, q) => s + q.changePct, 0) / priced.length
              : null;
            return (
              <section className="ai-hero">
                <div className="ai-hero-left">
                  <div className="ai-hero-badge">
                    <Icon name="sparkles" />
                  </div>
                  <div className="ai-hero-txt">
                    <h2>AI Stocks</h2>
                    <p>
                      A curated basket of companies powering the AI supercycle
                      — chips, cloud, models &amp; energy.
                    </p>
                  </div>
                </div>
                <div className="ai-hero-stats">
                  <div className="ai-stat">
                    <span className="ai-stat-val">{items.length}</span>
                    <span className="ai-stat-lbl">
                      {items.length === 1 ? "Company" : "Companies"}
                    </span>
                  </div>
                  <div className="ai-stat">
                    <span className={`ai-stat-val ${priced.length ? "up" : ""}`}>
                      {priced.length ? gainers : "—"}
                    </span>
                    <span className="ai-stat-lbl">Up today</span>
                  </div>
                  <div className="ai-stat">
                    <span
                      className={`ai-stat-val ${
                        avgMove == null ? "" : avgMove >= 0 ? "up" : "down"
                      }`}
                    >
                      {avgMove == null
                        ? "—"
                        : `${avgMove >= 0 ? "+" : ""}${avgMove.toFixed(2)}%`}
                    </span>
                    <span className="ai-stat-lbl">Avg move</span>
                  </div>
                </div>
              </section>
            );
          })()}

        {view === "watchlist" && currentListId == null ? (
          <div className="panel empty">
            <div className="ico">🗂️</div>
            <p>No watchlists yet — create one above to get started.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="panel empty">
            <div className="ico">{view === "ai" ? "✨" : "📈"}</div>
            <p>No stocks yet — add your first one above.</p>
          </div>
        ) : showMarketTable ? (
          <MarketTable
            items={items}
            market={market}
            favorites={favorites}
            removing={removing}
            onToggleFav={toggleFavorite}
            onRemove={removeItem}
            quotes={quotes}
            quotesLoading={quotesLoading}
            onSelectStock={setSelectedStock}
          />
        ) : (
          <ResearchTable
            items={items}
            market={view === "ai" ? "US" : market}
            favorites={favorites}
            removing={removing}
            onToggleFav={toggleFavorite}
            onRemove={removeItem}
            quotes={quotes}
            quotesLoading={quotesLoading}
            onSelectStock={setSelectedStock}
            filterInputRef={searchInputRef}
          />
        )}
      </div>

      {/* ---------- Bottom nav (mobile) ---------- */}
      <nav className={`bottom-nav ${market.toLowerCase()}`} aria-label="Primary">
        {NAV.filter((n) => n.id !== "settings").map((item) => (
          <button
            key={item.id}
            className={`bottom-item ${
              item.view && view === item.view ? "active" : ""
            }`}
            aria-current={item.view && view === item.view ? "page" : undefined}
            disabled={item.soon}
            onClick={() => navClick(item)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Stock News Drawer */}
      <NewsDrawer
        stock={selectedStock}
        onClose={() => setSelectedStock(null)}
        quotes={quotes}
      />
    </div>
  );
}
