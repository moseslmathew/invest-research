"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import PrismWaitIcon from "./PrismWaitIcon";
import { Icon, type IconName } from "./Icon";
import type { Quote } from "./api/quotes/route";
import type { Market, Watchlist, WatchlistItem } from "@/lib/db";

export interface MarketData {
  lists: Watchlist[];
  items: Record<number, WatchlistItem[]>;
}

type View = "watchlist" | "ai" | "trending" | "headlines";

const MARKETS: { id: Market; label: string; flag: string; code: string }[] = [
  { id: "US", label: "United States", flag: "🇺🇸", code: "US" },
  { id: "IN", label: "India", flag: "🇮🇳", code: "IN" },
];

// Compact "3h ago" / "just now" label for the trending cache timestamp.
function formatRelativeTime(iso: string | null): string {
  if (!iso) return "recently";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "recently";
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return diffDay === 1 ? "yesterday" : `${diffDay}d ago`;
}

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
  { id: "trending", label: "Trending", icon: "trending", view: "trending" },
  { id: "headlines", label: "Headlines", icon: "newspaper", view: "headlines" },
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
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!key) {
      setQuotes({});
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/quotes?symbols=${encodeURIComponent(key)}&t=${refreshCounter}`, {
      signal: ctrl.signal,
    })
      .then((r) => r.json())
      .then((d) => {
        setQuotes(d.quotes ?? {});
        setUpdatedAt(new Date().toISOString());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [key, refreshCounter]);

  return { quotes, loading, refetch, updatedAt };
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
  lastProcessedRef,
  className = "",
}: {
  state: ActionState;
  lastProcessedRef?: React.MutableRefObject<any>;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!state.message) return;
    if (lastProcessedRef) {
      if (lastProcessedRef.current === state) {
        return;
      }
      lastProcessedRef.current = state;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(t);
  }, [state, lastProcessedRef]);
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
  onLongPress?: (item: WatchlistItem) => void;
  filterInputRef?: React.RefObject<HTMLInputElement | null>;
}

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
      _day: day,
    });
  }
  // Sort most-recent first
  items.sort((a, b) => b._day - a._day);
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

function NewsDrawer({
  stock,
  onClose,
  quotes,
  onRemove,
}: {
  stock: WatchlistItem | null;
  onClose: () => void;
  quotes?: Record<string, Quote>;
  onRemove?: () => void;
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

  const [insiderTrades, setInsiderTrades] = useState<any[]>([]);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [insiderError, setInsiderError] = useState<string | null>(null);
  const [insiderNote, setInsiderNote] = useState<string>("");
  const [insiderVerified, setInsiderVerified] = useState(false);

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
    setInsiderTrades([]); // Reset insider trading on symbol change
    setInsiderNote("");
    setInsiderVerified(false);
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

  useEffect(() => {
    if (!stock || activeTab !== "events") return;
    setInsiderLoading(true);
    setInsiderError(null);
    const controller = new AbortController();
    const currentPrice = quotes?.[stock.symbol]?.price || "";
    fetch(
      `/api/insider?symbol=${encodeURIComponent(stock.symbol)}&name=${encodeURIComponent(
        stock.name || ""
      )}&price=${currentPrice}`,
      {
        signal: controller.signal,
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load insider activity");
        return res.json();
      })
      .then((data) => {
        setInsiderTrades(data.trades ?? []);
        setInsiderNote(data.note ?? "");
        setInsiderVerified(!!data.isAiVerified);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setInsiderError(e.message || "Failed to load insider activity");
        }
      })
      .finally(() => {
        setInsiderLoading(false);
      });
    return () => controller.abort();
  }, [stock, activeTab, quotes]);

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
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button className="drawer-close-btn" onClick={onClose} aria-label="Close drawer">
              ✕
            </button>
          </div>
        </div>

        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === "news" ? "active" : ""}`}
            onClick={() => setActiveTab("news")}
          >
            News
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
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                    <span className="inline-spin" style={{ width: "16px", height: "16px" }}></span>
                    <span>✨ AI is filtering & analyzing news...</span>
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="news-shimmer-card" />
                  ))}
                </div>
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
                    style={{ textDecoration: "none", display: "block" }}
                  >
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", width: "100%", justifyContent: "space-between" }}>
                      <div className="news-item-txt" style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                          <span className="news-item-meta" style={{ margin: 0 }}>{item.publisher}</span>
                          <span className="news-dot" style={{ margin: 0 }}>•</span>
                          <span className="news-item-meta" style={{ margin: 0 }}>{fmtRelativeTime(item.time)}</span>
                          {item.sentiment && (
                            <span className={`val-stance ${item.sentiment === "bullish" ? "undervalued" : item.sentiment === "bearish" ? "premium" : "neutral"}`} style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", fontWeight: 700, textTransform: "capitalize" }}>
                              {item.sentiment === "bullish" ? "🟢 Bullish" : item.sentiment === "bearish" ? "🔴 Bearish" : "⚪ Neutral"}
                            </span>
                          )}
                        </div>
                        <h3 className="news-item-title" style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text)", lineHeight: 1.4, margin: 0 }}>{item.title}</h3>
                        {item.valueRationale && (
                          <div className="news-item-rationale" style={{ marginTop: "8px", fontSize: "12px", color: "var(--muted)", fontStyle: "italic", borderLeft: "2px solid var(--border)", paddingLeft: "8px" }}>
                            💡 {item.valueRationale}
                          </div>
                        )}
                      </div>
                      {item.thumbnail && (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="news-item-thumb"
                          loading="lazy"
                          style={{ width: "60px", height: "60px", borderRadius: "8px", objectFit: "cover", flexShrink: 0 }}
                        />
                      )}
                    </div>
                  </a>
                ))
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 650, color: "var(--text)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                      👔 Insider Trading Activity (Last 3 Months)
                    </h4>
                    {insiderVerified && (
                      <span className="ai-badge" style={{ fontSize: "10.5px", background: "rgba(79, 70, 229, 0.08)", color: "var(--us)", padding: "2px 8px", borderRadius: "20px", fontWeight: 650, border: "1px solid rgba(79, 70, 229, 0.2)", display: "flex", alignItems: "center", gap: "4px" }}>
                        ✨ AI Verified
                      </span>
                    )}
                  </div>

                  {insiderLoading ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "10px 0" }}>
                      <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                        <span className="inline-spin" style={{ width: "16px", height: "16px" }}></span>
                        <span>✨ AI is scanning & verifying insider activity...</span>
                      </div>
                      <div className="news-shimmer-card" style={{ height: "80px" }} />
                    </div>
                  ) : insiderError ? (
                    <div className="news-empty-state" style={{ padding: "16px" }}>
                      <p>⚠️ {insiderError}</p>
                    </div>
                  ) : insiderTrades.length === 0 ? (
                    <div className="news-empty-state" style={{ padding: "16px" }}>
                      <p>No recent insider transactions reported.</p>
                    </div>
                  ) : (
                    <>
                      <div className="events-list">
                        {insiderTrades.map((trade, index) => {
                          const isBuy = trade.action === "Buy";
                          const facts = [
                            trade.shares && { label: "Qty", val: trade.shares },
                            trade.price && { label: "Price", val: trade.price },
                            trade.value && { label: "Value", val: trade.value },
                          ].filter(Boolean) as { label: string; val: string }[];
                          return (
                            <div key={index} className="event-card">
                              <div className="event-header" style={{ alignItems: "center" }}>
                                <span className="event-title" style={{ fontSize: "13.5px", fontWeight: 600 }}>{trade.executive}</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                  {trade.date && (
                                    <span className="event-date">{trade.date}</span>
                                  )}
                                  <span className={`val-stance ${isBuy ? "undervalued" : "premium"}`} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>
                                    {isBuy ? "Buy" : "Sale"}
                                  </span>
                                </span>
                              </div>
                              <div className="event-desc" style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "8px 12px", fontSize: "12px", color: "var(--muted)" }}>
                                {facts.length === 0 ? (
                                  <span>Transaction details not disclosed in source reports.</span>
                                ) : (
                                  facts.map((f, i) => (
                                    <span key={f.label}>
                                      {i > 0 && (
                                        <span aria-hidden style={{ marginRight: "12px", color: "var(--muted-2)" }}>
                                          •
                                        </span>
                                      )}
                                      {f.label}: <strong>{f.val}</strong>
                                    </span>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {insiderNote && (
                        <p style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic", marginTop: "10px", paddingLeft: "4px" }}>
                          ℹ️ {insiderNote}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {activeTab === "research" && (
            <>
              {researchLoading ? (
                <div className="val-section" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                    <span className="inline-spin" style={{ width: "16px", height: "16px" }}></span>
                    <span>✨ AI is drafting research summary & catalyst stances...</span>
                  </div>
                  <div className="news-shimmer-card" style={{ height: "100px" }} />
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

function useLongPress(
  onClick: (item: WatchlistItem) => void,
  onLongPress?: (item: WatchlistItem) => void
) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);
  const longPressFired = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchHasMoved = useRef(false);

  const start = (item: WatchlistItem) => {
    isLongPressRef.current = false;
    longPressFired.current = false;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      longPressFired.current = true;
      if (onLongPress) onLongPress(item);
    }, 600);
  };

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleTouchStart = (item: WatchlistItem, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchHasMoved.current = false;
    start(item);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current) return;
    const touch = e.touches[0];
    const diffX = Math.abs(touch.clientX - touchStartPos.current.x);
    const diffY = Math.abs(touch.clientY - touchStartPos.current.y);
    if (diffX > 8 || diffY > 8) {
      touchHasMoved.current = true;
      cancel();
    }
  };

  const handleRowClick = (item: WatchlistItem, e: React.MouseEvent) => {
    if (longPressFired.current || touchHasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressFired.current = false; // reset
      return;
    }
    cancel();
    onClick(item);
  };

  return (item: WatchlistItem) => ({
    onClick: (e: React.MouseEvent) => handleRowClick(item, e),
    onMouseDown: () => start(item),
    onMouseLeave: cancel,
    onTouchStart: (e: React.TouchEvent) => handleTouchStart(item, e),
    onTouchMove: handleTouchMove,
    onTouchEnd: () => cancel(),
    style: { cursor: "pointer", userSelect: "none" as const, WebkitUserSelect: "none" as const }
  });
}

/* Trending list — same card-row chrome as the AI Stocks ResearchTable
   (sentiment badge in place of a tier badge, no sector column since
   trending picks aren't categorized). */
function TrendingList({
  stocks,
  loading,
  market,
  onSelectStock,
}: {
  stocks: any[];
  loading: boolean;
  market: Market;
  onAddStock: (symbol: string, name: string) => void;
  onSelectStock: (stock: WatchlistItem) => void;
  activeWatchlistItems?: WatchlistItem[];
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [sortField, setSortField] = useState<
    "price" | "change" | "change3m" | "news" | null
  >(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  // Stock whose news-source breakdown popover is open (clicking the News count).
  const [newsPopoverStock, setNewsPopoverStock] = useState<any | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollRight(scrollWidth > clientWidth && scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkScroll);
    };
  }, [stocks, currentPage, showAll]);

  const handleSort = (field: "price" | "change" | "change3m" | "news") => {
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

  const sortedStocks = useMemo(() => {
    if (!sortField) return stocks;
    return [...stocks].sort((a, b) => {
      const key =
        sortField === "change"
          ? "changePct"
          : sortField === "change3m"
            ? "change3mPct"
            : sortField === "news"
              ? "newsCount"
              : "price";
      const valA = a[key] != null ? a[key] : -Infinity;
      const valB = b[key] != null ? b[key] : -Infinity;
      if (valA === valB) return 0;
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [stocks, sortField, sortOrder]);

  const pageSize = 10;
  const totalPages = Math.ceil(sortedStocks.length / pageSize);
  const displayedStocks = showAll
    ? sortedStocks
    : sortedStocks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [stocks]);

  const startIdx = (currentPage - 1) * pageSize + 1;
  const endIdx = Math.min(currentPage * pageSize, sortedStocks.length);

  if (loading) {
    return (
      <div className="panel empty prism-loading-panel">
        <PrismWaitIcon size={64} />
        <p>Analyzing news & loading trending stock performance...</p>
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="panel empty">
        <div className="ico">
          <Icon name="trending" />
        </div>
        <p>No trending stocks found in recent business headlines.</p>
      </div>
    );
  }

  return (
    <div className="panel table-panel ai-table-panel">
      <div className="ai-scroll-wrapper" style={{ position: "relative" }}>
        {canScrollRight && (
          <div className="ai-scroll-hint">
            <div className="ai-scroll-hint-pill">
              Swipe Right <span>➔</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} className="ai-list-scroll" onScroll={checkScroll}>
          <div className="ai-list">
            <div className="ai-row ai-header-row">
              <div className="ai-col-sentiment">Sentiment</div>
              <div className="ai-col-company">Company</div>
              <div className="ai-col-price">
                <span className="sortable-header" onClick={() => handleSort("price")}>
                  Price
                  {sortField === "price" && (
                    <span className="sort-indicator">{sortOrder === "asc" ? "▲" : "▼"}</span>
                  )}
                </span>
                <span className="sortable-header-divider">/</span>
                <span className="sortable-header" onClick={() => handleSort("change")}>
                  Chg
                  {sortField === "change" && (
                    <span className="sort-indicator">{sortOrder === "asc" ? "▲" : "▼"}</span>
                  )}
                </span>
              </div>
              <div className="ai-col-change3m">
                <span className="sortable-header" onClick={() => handleSort("change3m")}>
                  3M Chg
                  {sortField === "change3m" && (
                    <span className="sort-indicator">{sortOrder === "asc" ? "▲" : "▼"}</span>
                  )}
                </span>
              </div>
              <div className="ai-col-news">
                <span className="sortable-header" onClick={() => handleSort("news")}>
                  News
                  {sortField === "news" && (
                    <span className="sort-indicator">{sortOrder === "asc" ? "▲" : "▼"}</span>
                  )}
                </span>
              </div>
              <div className="ai-col-notes">Why in News</div>
            </div>

            {displayedStocks.map((s, i) => {
              const sentimentClass =
                s.sentiment === "bullish" ? "sent-bullish" : s.sentiment === "bearish" ? "sent-bearish" : "sent-neutral";

              const dummyItem: WatchlistItem = {
                id: -1,
                symbol: s.symbol,
                name: s.name,
                market,
                watchlist_id: -1,
                tier: null,
                sector: null,
                notes: s.rationale,
                sort_order: null,
                created_at: "",
              };

              return (
                <div key={`${s.symbol}-${i}`} className="ai-row" onClick={() => onSelectStock(dummyItem)}>
                  <div className="ai-col-sentiment">
                    <span className={`sent-badge ${sentimentClass}`}>{s.sentiment}</span>
                  </div>

                  <div className="ai-col-company">
                    <div className="ai-co-info">
                      <span className="ai-co-name">{s.name}</span>
                      <span className="ai-co-sub">{s.symbol}</span>
                    </div>
                  </div>

                  <div className="ai-col-price">
                    {s.price == null ? (
                      <span className="price-loading">...</span>
                    ) : (
                      <div className="ai-price-wrap">
                        <span className="ai-price">
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: market === "US" ? "USD" : "INR",
                            maximumFractionDigits: 2,
                          }).format(s.price)}
                        </span>
                        {s.changePct != null && (
                          <span className={`ai-price-change ${s.change >= 0 ? "up" : "down"}`}>
                            {s.change >= 0 ? "+" : ""}
                            {s.changePct.toFixed(2)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="ai-col-change3m">
                    {s.change3mPct == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span
                        className={`ai-price-change ${s.change3mPct >= 0 ? "up" : "down"}`}
                        style={{ fontSize: "14px", fontWeight: 700 }}
                      >
                        {s.change3mPct >= 0 ? "+" : ""}
                        {s.change3mPct.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <div className="ai-col-news">
                    {s.newsCount ? (
                      <button
                        type="button"
                        className="news-count news-count-btn"
                        title={`Referenced across ${s.newsCount} news article${s.newsCount === 1 ? "" : "s"} — click to see the channels`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewsPopoverStock(s);
                        }}
                      >
                        {s.newsCount}
                      </button>
                    ) : (
                      <span className="news-count">—</span>
                    )}
                  </div>

                  <div className="ai-col-notes">
                    <span className="ai-notes-bullet">✦</span>
                    <span className="ai-notes-text">
                      {s.rationale}
                      {s.source && (
                        <span className="ai-notes-source">{s.source}</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ai-footer">
        <div className="ai-footer-info">
          <Icon name="trending" className="sparkles-purple" />
          <span>
            Showing {showAll ? `1 to ${sortedStocks.length}` : `${startIdx} to ${endIdx}`} of {sortedStocks.length} stocks
          </span>
        </div>

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
      </div>

      {newsPopoverStock && (
        <NewsSourcesPopover
          stock={newsPopoverStock}
          onClose={() => setNewsPopoverStock(null)}
        />
      )}
    </div>
  );
}

/* Popover listing the news channels that referenced a trending stock, grouped
   by outlet with per-outlet mention counts — opened by clicking the News count
   in the trending table. */
function NewsSourcesPopover({
  stock,
  onClose,
}: {
  stock: any;
  onClose: () => void;
}) {
  const mentions: { title: string; source: string }[] = Array.isArray(stock.newsMentions)
    ? stock.newsMentions
    : [];

  // Group headlines by publishing channel, preserving first-seen order and
  // counting how many articles each channel contributed.
  const groups = useMemo(() => {
    const map = new Map<string, { source: string; titles: string[] }>();
    for (const m of mentions) {
      const name = (m.source || "").trim() || "Other sources";
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { source: name, titles: [] });
      if (m.title) map.get(key)!.titles.push(m.title);
    }
    return [...map.values()].sort((a, b) => b.titles.length - a.titles.length);
  }, [mentions]);

  const count = stock.newsCount ?? mentions.length;

  return (
    <>
      <div className="drawer-backdrop" style={{ zIndex: 200 }} onClick={onClose} />
      <div className="news-sources-popover" role="dialog" aria-modal="true">
        <div className="nsp-header">
          <div>
            <h3 className="nsp-title">{stock.name || stock.symbol}</h3>
            <p className="nsp-subtitle">
              Referenced across {count} article{count === 1 ? "" : "s"}
              {groups.length > 0 && ` from ${groups.length} channel${groups.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <button className="nsp-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="nsp-body">
          {groups.length === 0 ? (
            <p className="nsp-empty">
              Source-level detail isn&apos;t available for this pick.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.source} className="nsp-group">
                <div className="nsp-group-head">
                  <span className="nsp-channel">{g.source}</span>
                  <span className="nsp-badge">{g.titles.length}</span>
                </div>
                {g.titles.length > 0 && (
                  <ul className="nsp-titles">
                    {g.titles.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/* Top Headlines — the most cross-covered financial stories of the last 2 days,
   ranked by how many distinct news channels ran each story. */
function HeadlinesList({
  stories,
  loading,
}: {
  stories: any[];
  loading: boolean;
}) {
  const sentClass = (s?: string) =>
    s === "bullish" ? "sent-bullish" : s === "bearish" ? "sent-bearish" : "sent-neutral";

  if (loading) {
    return (
      <div className="panel empty prism-loading-panel">
        <PrismWaitIcon size={64} />
        <p>
          Clustering the most-covered stories across news channels…
        </p>
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="panel empty">
        <div className="ico">
          <Icon name="newspaper" />
        </div>
        <p>No headlines found in the last 2 days.</p>
      </div>
    );
  }

  return (
    <div className="panel table-panel ai-table-panel">
      <div className="ai-list-scroll">
        <div className="ai-list">
          <div className="ai-row ai-header-row hl-row">
            <div className="ai-col-index">#</div>
            <div className="hl-col-story">Story</div>
            <div className="ai-col-sentiment">Sentiment</div>
            <div className="hl-col-channels">Coverage</div>
          </div>
          {stories.map((s, i) => (
            <article key={`${s.headline}-${i}`} className="ai-row hl-row">
              <div className="ai-col-index">{i + 1}</div>
              <div className="hl-col-story">
                <div className="hl-story-top">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hl-headline hl-headline-link"
                    >
                      {s.headline}
                    </a>
                  ) : (
                    <h3 className="hl-headline">{s.headline}</h3>
                  )}
                  {s.category && (
                    <span className="hl-category">{s.category}</span>
                  )}
                </div>
                {s.summary && <p className="hl-summary">{s.summary}</p>}
              </div>
              <div className="ai-col-sentiment">
                <span className={`sent-badge ${sentClass(s.sentiment)}`}>
                  {s.sentiment || "neutral"}
                </span>
              </div>
              <div className="hl-col-channels">
                {Array.isArray(s.channels) &&
                  s.channels.length > 0 &&
                  s.channels.map((c: string, k: number) => (
                    <span key={k} className="hl-chip">
                      {c}
                    </span>
                  ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
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
  onLongPress,
}: TableProps) {
  const bindLongPress = useLongPress(onSelectStock, onLongPress);
  const [filterText, setFilterText] = useState("");
  const [sortField, setSortField] = useState<"price" | "change" | "change3m" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "price" | "change" | "change3m") => {
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
      } else if (sortField === "change3m") {
        valA = qA?.change3mPct != null ? qA.change3mPct : -999;
        valB = qB?.change3mPct != null ? qB.change3mPct : -999;
      }
      if (valA === valB) return 0;
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredItems, sortField, sortOrder, quotes]);

  return (
    <div className="panel table-panel">
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
                <th
                  className="col-num-r sortable"
                  onClick={() => handleSort("change3m")}
                >
                  3M Change
                  {sortField === "change3m" && (
                    <span className="sort-indicator">
                      {sortOrder === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </th>
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
                    {...bindLongPress(item)}
                  >
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
                    <td className="col-num-r">
                      {q && q.change3mPct != null ? (
                        <div className={`chg ${q.change3mPct >= 0 ? "up" : "down"}`}>
                          <span className="chg-pct">
                            <Icon name={q.change3mPct >= 0 ? "arrowUp" : "arrowDown"} />
                            {q.change3mPct >= 0 ? "+" : ""}
                            {q.change3mPct.toFixed(2)}%
                          </span>
                        </div>
                      ) : quotesLoading ? (
                        <span className="shimmer" />
                      ) : (
                        <span className="muted">—</span>
                      )}
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
  onLongPress,
  filterInputRef,
}: TableProps) {
  const bindLongPress = useLongPress(onSelectStock, onLongPress);
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [sortField, setSortField] = useState<"price" | "change" | "change3m" | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollRight(scrollWidth > clientWidth && scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  useEffect(() => {
    // Delay slightly to allow layout calculations to finish
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkScroll);
    };
  }, [items, filterText, currentPage, showAll]);

  const handleSort = (field: "price" | "change" | "change3m") => {
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
      } else if (sortField === "change3m") {
        valA = qA?.change3mPct != null ? qA.change3mPct : -999;
        valB = qB?.change3mPct != null ? qB.change3mPct : -999;
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
      <div className="ai-scroll-wrapper" style={{ position: "relative" }}>
        {canScrollRight && (
          <div className="ai-scroll-hint">
            <div className="ai-scroll-hint-pill">
              Swipe Right <span>➔</span>
            </div>
          </div>
        )}
        <div ref={scrollRef} className="ai-list-scroll" onScroll={checkScroll}>
          <div className="ai-list">
        {/* Table Header Row */}
        <div className="ai-row ai-header-row">
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
          <div className="ai-col-change3m">
            <span className="sortable-header" onClick={() => handleSort("change3m")}>
              3M Chg
              {sortField === "change3m" && (
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
              {...bindLongPress(item)}
            >
              {/* 2. Tier Badge */}
              <div className="ai-col-tier">
                <TierBadge tier={item.tier} />
              </div>              {/* 3. Company Details */}
              <div className="ai-col-company">
                <div className="ai-co-info">
                  <span className="ai-co-name">
                    {item.name || item.symbol}
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

              {/* 3M Change Column */}
              <div className="ai-col-change3m">
                {quotesLoading && !quotes?.[item.symbol] ? (
                  <span className="price-loading">...</span>
                ) : (() => {
                  const q = quotes?.[item.symbol];
                  if (!q || q.change3mPct == null) return <span className="muted">—</span>;
                  const isUp = q.change3mPct >= 0;
                  return (
                    <span className={`ai-price-change ${isUp ? "up" : "down"}`} style={{ fontSize: "14px", fontWeight: 700 }}>
                      {isUp ? "+" : ""}
                      {q.change3mPct.toFixed(2)}%
                    </span>
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
    </div>
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
  const [activeLongPressItem, setActiveLongPressItem] = useState<WatchlistItem | null>(null);
  const [, startDelete] = useTransition();
  const [, startAdd] = useTransition();

  const [addState, addAction, isAddPending] = useActionState<ActionState, FormData>(
    addItemAction,
    { ok: true }
  );
  const [createState, createAction] = useActionState<ActionState, FormData>(
    createWatchlistAction,
    { ok: true }
  );
  const lastAddStateRef = useRef<any>(null);
  const lastCreateStateRef = useRef<any>(null);

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
    if (sv === "watchlist" || sv === "ai" || sv === "trending" || sv === "headlines")
      setView(sv);
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
  const { quotes, loading: quotesLoading, refetch: refetchQuotes, updatedAt: quotesUpdatedAt } = useQuotes(quoteSymbols);

  // States & hooks for Trending stocks in news
  const [trendingRaw, setTrendingRaw] = useState<any[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingRefreshing, setTrendingRefreshing] = useState(false);
  const [trendingUpdatedAt, setTrendingUpdatedAt] = useState<string | null>(null);

  // Warm the server-side (DB) cache in the background on first load so the
  // Trending tab is instant when opened. Cheap — a cache hit returns instantly
  // and the expensive AI pass only runs once per day.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/trending?market=${market}`, { signal: ctrl.signal }).catch(() => {});
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTrending = useCallback(
    (force = false) => {
      const ctrl = new AbortController();
      if (force) setTrendingRefreshing(true);
      else setTrendingLoading(true);
      fetch(`/api/trending?market=${market}${force ? "&refresh=1" : ""}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then(async (data) => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (ctrl.signal.aborted) return;
          setTrendingRaw(data.stocks || []);
          setTrendingUpdatedAt(data.updatedAt || null);
        })
        .catch(() => {})
        .finally(() => {
          setTrendingLoading(false);
          setTrendingRefreshing(false);
        });
      return () => ctrl.abort();
    },
    [market]
  );

  useEffect(() => {
    if (view !== "trending") return;
    const abort = loadTrending(false);
    return abort;
  }, [view, market, loadTrending]);

  const trendingSymbols = useMemo(
    () => trendingRaw.map((s) => s.symbol),
    [trendingRaw]
  );
  
  const { quotes: trendingQuotes, loading: trendingQuotesLoading } = useQuotes(
    view === "trending" ? trendingSymbols : []
  );

  const trendingStocks = useMemo(() => {
    return trendingRaw.map((s) => {
      const q = trendingQuotes[s.symbol];
      return {
        ...s,
        price: q?.price,
        change: q?.change,
        changePct: q?.changePct,
        change3mPct: q?.change3mPct,
      };
    });
  }, [trendingRaw, trendingQuotes]);

  // States & hooks for Top Headlines (most cross-covered stories, last 2 days)
  const [headlines, setHeadlines] = useState<any[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(false);
  const [headlinesRefreshing, setHeadlinesRefreshing] = useState(false);
  const [headlinesUpdatedAt, setHeadlinesUpdatedAt] = useState<string | null>(null);

  const loadHeadlines = useCallback(
    (force = false) => {
      const ctrl = new AbortController();
      if (force) setHeadlinesRefreshing(true);
      else setHeadlinesLoading(true);
      fetch(`/api/headlines?market=${market}${force ? "&refresh=1" : ""}`, {
        signal: ctrl.signal,
      })
        .then((r) => r.json())
        .then(async (data) => {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (ctrl.signal.aborted) return;
          setHeadlines(data.stories || []);
          setHeadlinesUpdatedAt(data.updatedAt || null);
        })
        .catch(() => {})
        .finally(() => {
          setHeadlinesLoading(false);
          setHeadlinesRefreshing(false);
        });
      return () => ctrl.abort();
    },
    [market]
  );

  useEffect(() => {
    if (view !== "headlines") return;
    const abort = loadHeadlines(false);
    return abort;
  }, [view, market, loadHeadlines]);

  function handleAddTrendingStock(symbol: string, name: string) {
    let targetListId = currentListId;
    let listName = "";
    
    if (!targetListId) {
      if (personalLists.length > 0) {
        targetListId = personalLists[0].id;
      } else {
        listName = market === "US" ? "US Watchlist" : "India Watchlist";
      }
    }

    const fd = new FormData();
    fd.append("market", market);
    if (targetListId) {
      fd.append("watchlistId", String(targetListId));
    } else {
      fd.append("listName", listName);
    }
    fd.append("symbol", symbol);
    fd.append("name", name);

    startAdd(async () => {
      await addAction(fd);
    });
  }

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
            <img src="/assets/lumina-lockup-horizontal-light.svg" className="logo-light" alt="Lumina Logo" style={{ height: "58px", width: "auto" }} />
            <img src="/assets/lumina-lockup-horizontal-dark.svg" className="logo-dark" alt="Lumina Logo" style={{ height: "58px", width: "auto" }} />
          </div>
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
            <img src="/assets/lumina-lockup-horizontal-light.svg" className="logo-light" alt="Lumina Logo" style={{ height: "36px", width: "auto" }} />
            <img src="/assets/lumina-lockup-horizontal-dark.svg" className="logo-dark" alt="Lumina Logo" style={{ height: "36px", width: "auto" }} />
          </div>
        </div>

        {view === "watchlist" && (
          <div className="hl-header-compact">
            <div className="hl-header-left">
              <h2>
                <Icon name="bookmark" className="hl-header-icon" /> Watchlists
              </h2>
              <span className="hl-header-sub">
                Track and analyze your assets
              </span>
            </div>
            <div className="hl-header-actions">
              <div className="hero-market-seg seg" role="tablist" aria-label="Market">
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
                    <span className="seg-code">{m.code}</span>
                  </button>
                ))}
              </div>
              <span className="trending-updated">
                Updated {formatRelativeTime(quotesUpdatedAt)}
              </span>
              <button
                type="button"
                className="hl-refresh"
                onClick={refetchQuotes}
                disabled={quotesLoading}
                aria-label="Refresh watchlist quotes"
                title={quotesLoading ? "Refreshing…" : "Refresh"}
              >
                <Icon
                  name="refresh"
                  className={quotesLoading ? "spin" : undefined}
                />
              </button>
            </div>
          </div>
        )}

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
          <Toast state={createState} lastProcessedRef={lastCreateStateRef} className="inline-toast" />
        )}

        {/* Search card */}
        {view !== "ai" && view !== "trending" && view !== "headlines" && (
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

            <Toast state={addState} lastProcessedRef={lastAddStateRef} />
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

        {view === "trending" && (
          <div className="hl-header-compact">
            <div className="hl-header-left">
              <h2>
                <Icon name="trending" className="hl-header-icon" /> Trending Stocks
              </h2>
              <span className="hl-header-sub">
                Most-discussed stocks · past month
              </span>
            </div>
            <div className="hl-header-actions">
                  <div className="hero-market-seg seg" role="tablist" aria-label="Market">
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
                        <span className="seg-code">{m.code}</span>
                      </button>
                    ))}
                  </div>
                  <span className="trending-updated">
                    Updated {formatRelativeTime(trendingUpdatedAt)}
                  </span>
                  <button
                    type="button"
                    className="hl-refresh"
                    onClick={() => loadTrending(true)}
                    disabled={trendingRefreshing || trendingLoading}
                    aria-label="Refresh trending stocks"
                    title={trendingRefreshing ? "Refreshing…" : "Refresh"}
                  >
                    <Icon
                      name="refresh"
                      className={trendingRefreshing ? "spin" : undefined}
                    />
                  </button>
            </div>
          </div>
        )}

        {view === "headlines" && (
          <div className="hl-header-compact">
            <div className="hl-header-left">
              <h2>
                <Icon name="newspaper" className="hl-header-icon" /> Top Headlines
              </h2>
              <span className="hl-header-sub">
                Most-covered stories · last 2 days
              </span>
            </div>
            <div className="hl-header-actions">
              <div className="hero-market-seg seg" role="tablist" aria-label="Market">
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
                    <span className="seg-code">{m.code}</span>
                  </button>
                ))}
              </div>
              <span className="trending-updated">
                Updated {formatRelativeTime(headlinesUpdatedAt)}
              </span>
              <button
                type="button"
                className="hl-refresh"
                onClick={() => loadHeadlines(true)}
                disabled={headlinesRefreshing || headlinesLoading}
                aria-label="Refresh headlines"
                title={headlinesRefreshing ? "Refreshing…" : "Refresh"}
              >
                <Icon
                  name="refresh"
                  className={headlinesRefreshing ? "spin" : undefined}
                />
              </button>
            </div>
          </div>
        )}

        {view === "trending" ? (
          <TrendingList
            stocks={trendingStocks}
            loading={trendingLoading || trendingQuotesLoading}
            market={market}
            onAddStock={handleAddTrendingStock}
            onSelectStock={setSelectedStock}
            activeWatchlistItems={items}
          />
        ) : view === "headlines" ? (
          <HeadlinesList stories={headlines} loading={headlinesLoading} />
        ) : view === "watchlist" && currentListId == null ? (
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
            onLongPress={setActiveLongPressItem}
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
            onLongPress={setActiveLongPressItem}
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
        onRemove={selectedStock ? () => {
          removeItem(selectedStock.id);
          setSelectedStock(null);
        } : undefined}
      />

      {activeLongPressItem && (
        <>
          <div
            className="drawer-backdrop"
            style={{ zIndex: 100 }}
            onClick={() => setActiveLongPressItem(null)}
          />
          <div
            className="longpress-drawer"
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
              left: "50%",
              transform: "translateX(-50%)",
              width: "calc(100% - 32px)",
              maxWidth: "400px",
              background: "var(--surface-solid)",
              border: "1px solid var(--border)",
              borderRadius: "20px",
              boxShadow: "0 20px 40px rgba(15, 23, 42, 0.2)",
              padding: "20px",
              zIndex: 101,
              animation: "slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text)" }}>
                  {activeLongPressItem.name || activeLongPressItem.symbol}
                </h3>
                <span className="ticker" style={{ fontSize: "11px", marginTop: "4px", display: "inline-block" }}>
                  {activeLongPressItem.symbol}
                </span>
              </div>
              <button
                onClick={() => setActiveLongPressItem(null)}
                style={{
                  border: "none",
                  background: "var(--bg)",
                  color: "var(--muted)",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "12px",
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  removeItem(activeLongPressItem.id);
                  setActiveLongPressItem(null);
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  background: "rgba(239, 68, 68, 0.06)",
                  color: "rgb(239, 68, 68)",
                  borderRadius: "12px",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.12)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)"}
              >
                🗑️ Delete from Watchlist
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
