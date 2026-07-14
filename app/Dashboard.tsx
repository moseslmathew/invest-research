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

import { useUser, useClerk, SignInButton, UserButton } from "@clerk/nextjs";
import type { Quote } from "./api/quotes/route";
import type { Market, Watchlist, WatchlistItem } from "@/lib/db";

export interface MarketData {
  lists: Watchlist[];
  items: Record<number, WatchlistItem[]>;
}

type View = "research" | "watchlist" | "ai" | "trending" | "headlines";

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
  { id: "research", label: "AI Research", icon: "search", view: "research" },
  { id: "watchlist", label: "Watchlist", icon: "bookmark", view: "watchlist" },
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
function fmtVolume(vol: number | null | undefined): string {
  if (vol == null) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 2,
  }).format(vol);
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
  const [activeTab, setActiveTab] = useState<"news" | "charts" | "valuation" | "mf" | "events" | "research" | "technicals" | "volume">("news");
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [valData, setValData] = useState<any | null>(null);
  const [valLoading, setValLoading] = useState(false);
  const [valError, setValError] = useState<string | null>(null);

  const [researchData, setResearchData] = useState<any | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const [techData, setTechData] = useState<any | null>(null);
  const [techLoading, setTechLoading] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);

  const [insiderTrades, setInsiderTrades] = useState<any[]>([]);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [insiderError, setInsiderError] = useState<string | null>(null);
  const [insiderNote, setInsiderNote] = useState<string>("");
  const [insiderVerified, setInsiderVerified] = useState(false);

  const [volumeHistory, setVolumeHistory] = useState<any[]>([]);
  const [volumeStats, setVolumeStats] = useState<any | null>(null);
  const [volLoading, setVolLoading] = useState(false);
  const [volError, setVolError] = useState<string | null>(null);
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [volumeRange, setVolumeRange] = useState<"2w" | "1m" | "3m" | "1y">("2w");
  const [expandedChart, setExpandedChart] = useState<"price" | "volume" | null>(null);

  // Reset expanded chart on stock change
  useEffect(() => {
    setExpandedChart(null);
  }, [stock]);

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
    setVolumeHistory([]); // Reset volume history on symbol change
    setVolumeStats(null); // Reset volume stats on symbol change
    setVolumeRange("2w"); // Reset volume range on symbol change
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
    if (!stock || (activeTab !== "research" && activeTab !== "volume")) return;
    if (researchData) return;
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
  }, [stock, activeTab, researchData]);

  useEffect(() => {
    if (!stock || activeTab !== "technicals") return;
    setTechLoading(true);
    setTechError(null);
    const controller = new AbortController();
    fetch(
      `/api/technicals?symbol=${encodeURIComponent(stock.symbol)}&name=${encodeURIComponent(
        stock.name || ""
      )}`,
      {
        signal: controller.signal,
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load technical analysis");
        return res.json();
      })
      .then((data) => {
        setTechData(data);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setTechError(e.message || "Failed to load technical analysis");
        }
      })
      .finally(() => {
        setTechLoading(false);
      });
    return () => controller.abort();
  }, [stock, activeTab]);

  useEffect(() => {
    if (!stock || (activeTab !== "volume" && activeTab !== "charts")) return;
    setVolLoading(true);
    setVolError(null);
    const controller = new AbortController();
    fetch(`/api/volume?symbol=${encodeURIComponent(stock.symbol)}&range=${volumeRange}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load volume history");
        return res.json();
      })
      .then((data) => {
        setVolumeHistory(data.history ?? []);
        setVolumeStats(data.stats ?? null);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setVolError(e.message || "Failed to load volume history");
        }
      })
      .finally(() => {
        setVolLoading(false);
      });
    return () => controller.abort();
  }, [stock, activeTab, volumeRange]);

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
            className={`drawer-tab ${activeTab === "charts" ? "active" : ""}`}
            onClick={() => setActiveTab("charts")}
          >
            Charts
          </button>
          <button
            className={`drawer-tab ${activeTab === "events" ? "active" : ""}`}
            onClick={() => setActiveTab("events")}
          >
            Events
          </button>
          <button
            className={`drawer-tab ${activeTab === "technicals" ? "active" : ""}`}
            onClick={() => setActiveTab("technicals")}
          >
            Technicals
          </button>
          <button
            className={`drawer-tab ${activeTab === "volume" ? "active" : ""}`}
            onClick={() => setActiveTab("volume")}
          >
            Volume
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
          {activeTab === "charts" && (
            <div className="volume-tab-container">
              {volLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                    <PrismWaitIcon size={34} />
                    <span>Analyzing chart patterns...</span>
                  </div>
                  <div className="news-shimmer-card" style={{ height: "180px" }} />
                </div>
              ) : volError ? (
                <div className="news-empty-state">
                  <span className="icon">⚠️</span>
                  <p>{volError}</p>
                </div>
              ) : volumeHistory.length === 0 ? (
                <div className="news-empty-state">
                  <span className="icon">📈</span>
                  <p>No historical price chart data available.</p>
                </div>
              ) : (
                <>
                  {/* SVG Price Chart */}
                  <div className="volume-chart-section">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h3 className="volume-chart-title" style={{ margin: 0 }}>Historical Price Chart</h3>
                      <div className="volume-range-selectors" style={{ display: "flex", gap: "6px", background: "var(--bg)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                        {["2w", "1m", "3m", "1y"].map((r) => (
                          <button
                            key={r}
                            className={`volume-range-btn ${volumeRange === r ? "active" : ""}`}
                            onClick={() => setVolumeRange(r as any)}
                            style={{
                              border: "none",
                              background: volumeRange === r ? "var(--surface-solid)" : "transparent",
                              color: volumeRange === r ? "var(--accent)" : "var(--muted)",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: "pointer",
                              boxShadow: volumeRange === r ? "0 2px 6px rgba(0, 0, 0, 0.05)" : "none",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {r.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className="volume-chart-wrapper"
                      onClick={() => setExpandedChart("price")}
                      style={{ cursor: "zoom-in" }}
                      title="Click to expand price chart"
                    >
                      <svg viewBox="0 0 600 300" className="volume-svg-chart" style={{ width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id="priceUpGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                          <linearGradient id="priceDownGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {(() => {
                          const prices = volumeHistory.map(d => d.close);
                          const minPrice = Math.min(...prices);
                          const maxPrice = Math.max(...prices);
                          const priceRange = maxPrice - minPrice || 1;
                          const paddedMin = minPrice - (priceRange * 0.08);
                          const paddedMax = maxPrice + (priceRange * 0.08);
                          const paddedRange = paddedMax - paddedMin || 1;

                          const chartHeight = 220;
                          const chartWidth = 520;
                          const startX = 60;
                          
                          const points = volumeHistory.map((d, index) => {
                            const x = startX + index * (chartWidth / (volumeHistory.length - 1 || 1));
                            const y = 250 - ((d.close - paddedMin) / paddedRange) * chartHeight;
                            return { x, y, date: d.date, close: d.close };
                          });

                          const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                          const areaPath = `${linePath} L${points[points.length - 1].x},250 L${points[0].x},250 Z`;

                          // Overall trend color
                          const firstPrice = prices[0];
                          const lastPrice = prices[prices.length - 1];
                          const isUpTrend = lastPrice >= firstPrice;
                          const trendColor = isUpTrend ? "#10b981" : "#ef4444";
                          const trendGrad = isUpTrend ? "url(#priceUpGrad)" : "url(#priceDownGrad)";

                          const gridLines = [0, 0.25, 0.5, 0.75, 1];

                          return (
                            <>
                              {/* Grid lines */}
                              {gridLines.map((ratio, idx) => {
                                const yPos = 250 - (ratio * chartHeight);
                                const labelVal = paddedMin + (ratio * paddedRange);
                                return (
                                  <g key={idx}>
                                    <line
                                      x1="60"
                                      y1={yPos}
                                      x2="580"
                                      y2={yPos}
                                      stroke="var(--border)"
                                      strokeWidth="1"
                                      strokeDasharray="4 4"
                                      opacity="0.6"
                                    />
                                    <text
                                      x="50"
                                      y={yPos + 4}
                                      textAnchor="end"
                                      fontSize="12.5"
                                      fill="var(--text)"
                                      fontWeight="600"
                                    >
                                      {fmtPrice(labelVal, quote?.currency || "USD")}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Area under curve */}
                              <path d={areaPath} fill={trendGrad} />

                              {/* Trend Line */}
                              <path d={linePath} fill="none" stroke={trendColor} strokeWidth="2.5" />

                              {/* Interactive Hover Areas */}
                              {points.map((p, index) => {
                                const rectWidth = chartWidth / (volumeHistory.length - 1 || 1);
                                return (
                                  <rect
                                    key={index}
                                    x={p.x - rectWidth / 2}
                                    y="30"
                                    width={rectWidth}
                                    height={chartHeight}
                                    fill="transparent"
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={() => setHoveredBarIndex(index)}
                                    onMouseLeave={() => setHoveredBarIndex(null)}
                                  />
                                );
                              })}

                              {/* Hover indicators */}
                              {hoveredBarIndex !== null && (() => {
                                const p = points[hoveredBarIndex];
                                return (
                                  <>
                                    <line
                                      x1={p.x}
                                      y1="30"
                                      x2={p.x}
                                      y2="250"
                                      stroke="var(--border)"
                                      strokeWidth="1.5"
                                      strokeDasharray="3 3"
                                    />
                                    <circle
                                      cx={p.x}
                                      cy={p.y}
                                      r="5"
                                      fill={trendColor}
                                      stroke="var(--surface-solid)"
                                      strokeWidth="2.5"
                                      style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.15))" }}
                                    />
                                  </>
                                );
                              })()}

                              {/* X-Axis Date Labels */}
                              {points.map((p, index) => {
                                let showDate = true;
                                if (points.length > 50) {
                                  showDate = index % 8 === 0;
                                } else if (points.length > 25) {
                                  showDate = index % 4 === 0;
                                } else if (points.length > 12) {
                                  showDate = index % 2 === 0;
                                }
                                return (
                                  showDate && (
                                    <text
                                      key={index}
                                      x={p.x}
                                      y="274"
                                      textAnchor="middle"
                                      fontSize="12.5"
                                      fill="var(--text)"
                                      fontWeight="600"
                                    >
                                      {p.date}
                                    </text>
                                  )
                                );
                              })}

                              {/* Custom interactive Tooltip */}
                              {hoveredBarIndex !== null && (() => {
                                const p = points[hoveredBarIndex];
                                const tooltipWidth = 160;
                                const tooltipX = p.x + tooltipWidth > 580 ? p.x - tooltipWidth - 10 : p.x + 10;
                                return (
                                  <g pointerEvents="none">
                                    <rect
                                      x={tooltipX}
                                      y="40"
                                      width={tooltipWidth}
                                      height="88"
                                      rx="6"
                                      fill="var(--surface-solid)"
                                      stroke="var(--border)"
                                      strokeWidth="1.5"
                                      style={{ filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.08))" }}
                                    />
                                    <text x={tooltipX + 14} y="62" fontSize="13" fontWeight="bold" fill="var(--text)">
                                      {p.date}
                                    </text>
                                    <text x={tooltipX + 14} y="85" fontSize="12" fill="var(--muted)">
                                      Close: <tspan fontWeight="bold" fill={trendColor}>
                                        {fmtPrice(p.close, quote?.currency || "USD")}
                                      </tspan>
                                    </text>
                                    <text x={tooltipX + 14} y="108" fontSize="12" fill="var(--muted)">
                                      Volume: <tspan fontWeight="bold" fill="var(--text)">
                                        {fmtVolume(volumeHistory[hoveredBarIndex].volume)}
                                      </tspan>
                                    </text>
                                  </g>
                                );
                              })()}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "news" && (
            <>
              {loading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                    <PrismWaitIcon size={34} />
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

          {activeTab === "events" && (() => {
            const events = getUpcomingEvents(stock.symbol);
            const mfActivity = getMutualFundActivity(stock.symbol, quote?.currency || "USD");
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
                    📈 Mutual Fund Activity (Last 3 Months)
                  </h4>
                  <div className="mf-list">
                    {mfActivity.length === 0 ? (
                      <div className="news-empty-state" style={{ padding: "16px" }}>
                        <p>No recent mutual fund transactions reported.</p>
                      </div>
                    ) : (
                      mfActivity.map((mf, index) => {
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
                      })
                    )}
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
                        <PrismWaitIcon size={34} />
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
                    <PrismWaitIcon size={34} />
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

          {activeTab === "technicals" && (
            <>
              {techLoading ? (
                <div className="val-section" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="search-spin-wrap" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", background: "rgba(79, 70, 229, 0.05)", border: "1px solid rgba(79, 70, 229, 0.1)", borderRadius: "8px", color: "var(--us)", fontSize: "13px", fontWeight: 600 }}>
                    <PrismWaitIcon size={34} />
                    <span>✨ AI is computing technical indicators & levels...</span>
                  </div>
                  <div className="news-shimmer-card" style={{ height: "100px" }} />
                  <div className="news-shimmer-card" style={{ height: "120px" }} />
                </div>
              ) : techError ? (
                <div className="news-empty-state">
                  <span className="icon">⚠️</span>
                  <p>{techError}</p>
                </div>
              ) : !techData ? (
                <div className="news-empty-state">
                  <span className="icon">📊</span>
                  <p>Technical analysis report not generated.</p>
                </div>
              ) : (
                <div className="val-section">
                  {/* Stance Indicator */}
                  <div className={`ai-research-stance-card ${
                    techData.stance.toLowerCase().includes("buy") ? "bullish" :
                    techData.stance.toLowerCase().includes("sell") ? "bearish" : "neutral"
                  }`} style={{ marginBottom: "16px" }}>
                    <div className="ai-research-score-ring">
                      <div className="score-svg-text" style={{ position: "static", transform: "none" }}>
                        <span className="score-num" style={{ fontSize: "20px" }}>
                          {techData.stance.toLowerCase().includes("strong buy") ? "🚀" :
                           techData.stance.toLowerCase().includes("buy") ? "📈" :
                           techData.stance.toLowerCase().includes("strong sell") ? "💥" :
                           techData.stance.toLowerCase().includes("sell") ? "📉" : "⚖️"}
                        </span>
                      </div>
                    </div>
                    <div className="ai-research-stance-meta">
                      <span className="stance-lbl">Technical Consensus</span>
                      <h3 className="stance-val">{techData.stance}</h3>
                    </div>
                  </div>

                  {/* Indicators Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                    {/* RSI Card */}
                    <div className="val-grid-card" style={{ padding: "12px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                        RSI (14)
                      </span>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "8px" }}>
                        <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)" }}>{techData.rsi}</span>
                        <span style={{ fontSize: "11px", color: "var(--muted)" }}>/ 100</span>
                      </div>
                      <div style={{ width: "100%", height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden", position: "relative" }}>
                        <div style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: `${techData.rsi}%`,
                          background: techData.rsi > 70 ? "var(--premium)" : techData.rsi < 30 ? "var(--undervalued)" : "var(--us)"
                        }} />
                      </div>
                      <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginTop: "6px" }}>
                        {techData.rsi > 70 ? "Overbought" : techData.rsi < 30 ? "Oversold" : "Neutral"}
                      </span>
                    </div>

                    {/* MACD Card */}
                    <div className="val-grid-card" style={{ padding: "12px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "6px" }}>
                        MACD Signal
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className={`val-stance ${
                          techData.macd.toLowerCase().includes("bullish") ? "undervalued" :
                          techData.macd.toLowerCase().includes("bearish") ? "premium" : "neutral"
                        }`} style={{ fontSize: "12px", padding: "4px 8px", borderRadius: "6px", fontWeight: 700 }}>
                          {techData.macd}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Moving Averages Card */}
                  <div className="val-summary-card" style={{ marginBottom: "16px" }}>
                    <div className="val-summary-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="val-lbl">Moving Averages</span>
                      <span className={`val-stance ${
                        techData.movingAverages?.trend.toLowerCase() === "bullish" ? "undervalued" :
                        techData.movingAverages?.trend.toLowerCase() === "bearish" ? "premium" : "neutral"
                      }`} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px" }}>
                        {techData.movingAverages?.trend} Trend
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px" }}>
                        <span style={{ color: "var(--muted)" }}>SMA (20)</span>
                        <strong style={{ color: "var(--text)" }}>{quote?.currency === "INR" ? "₹" : "$"}{techData.movingAverages?.sma20}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", borderTop: "1px dashed var(--border)", paddingTop: "8px" }}>
                        <span style={{ color: "var(--muted)" }}>SMA (50)</span>
                        <strong style={{ color: "var(--text)" }}>{quote?.currency === "INR" ? "₹" : "$"}{techData.movingAverages?.sma50}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", borderTop: "1px dashed var(--border)", paddingTop: "8px" }}>
                        <span style={{ color: "var(--muted)" }}>SMA (200)</span>
                        <strong style={{ color: "var(--text)" }}>{quote?.currency === "INR" ? "₹" : "$"}{techData.movingAverages?.sma200}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Support and Resistance */}
                  <div className="val-grid-card" style={{ padding: "14px", marginBottom: "16px" }}>
                    <span style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: "10px" }}>
                      Key Price Levels
                    </span>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                      <div style={{ flex: 1, textAlign: "left" }}>
                        <span style={{ fontSize: "10px", color: "var(--muted)", display: "block" }}>Support Floor</span>
                        <strong style={{ fontSize: "15px", color: "var(--undervalued)" }}>
                          {quote?.currency === "INR" ? "₹" : "$"}{techData.support}
                        </strong>
                      </div>
                      <div style={{ width: "2px", height: "30px", background: "var(--border)" }} />
                      <div style={{ flex: 1, textAlign: "right" }}>
                        <span style={{ fontSize: "10px", color: "var(--muted)", display: "block" }}>Resistance Ceiling</span>
                        <strong style={{ fontSize: "15px", color: "var(--premium)" }}>
                          {quote?.currency === "INR" ? "₹" : "$"}{techData.resistance}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Commentary Summary */}
                  <div className="val-summary-card" style={{ marginBottom: "16px" }}>
                    <div className="val-summary-header">
                      <span className="val-lbl">Technical Summary</span>
                    </div>
                    <p className="val-commentary">{techData.summary}</p>
                  </div>

                  {/* Bullet points Takeaways */}
                  <div className="ai-research-bullets" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 650, color: "var(--text)", margin: "4px 0" }}>Takeaways</h4>
                    {techData.bullets.map((b: string, i: number) => (
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

          {activeTab === "volume" && (
            <div className="volume-tab-container">
              {volLoading ? (
                <div className="panel empty" style={{ border: "none", boxShadow: "none", padding: "40px 0" }}>
                  <PrismWaitIcon size={48} />
                  <p>Loading historical volume data...</p>
                </div>
              ) : volError ? (
                <div className="panel empty" style={{ border: "none", boxShadow: "none", color: "var(--danger)", padding: "40px 0" }}>
                  <span style={{ fontSize: "24px", marginBottom: "8px" }}>⚠️</span>
                  <p>{volError}</p>
                </div>
              ) : volumeHistory.length === 0 ? (
                <div className="panel empty" style={{ border: "none", boxShadow: "none", padding: "40px 0" }}>
                  <span style={{ fontSize: "24px", marginBottom: "8px" }}>📈</span>
                  <p>No historical volume data available.</p>
                </div>
              ) : (
                <>
                  {/* Summary Grid */}
                  {volumeStats && (
                    <div className="volume-stats-grid">
                      <div className="volume-stat-card">
                        <span className="volume-stat-label">Avg Daily Vol ({volumeRange.toUpperCase()})</span>
                        <span className="volume-stat-val">{fmtVolume(volumeStats.avgVolume)}</span>
                      </div>
                      <div className="volume-stat-card">
                        <span className="volume-stat-label">Peak Vol Traded</span>
                        <span className="volume-stat-val" style={{ color: "var(--accent)" }}>
                          {fmtVolume(volumeStats.peakVolume)}
                        </span>
                        <span className="volume-stat-sub">on {volumeStats.peakVolumeDate}</span>
                      </div>
                      <div className="volume-stat-card">
                        <span className="volume-stat-label">Total Traded ({volumeRange.toUpperCase()})</span>
                        <span className="volume-stat-val">{fmtVolume(volumeStats.totalVolume)}</span>
                      </div>
                    </div>
                  )}

                  {/* SVG Bar Chart */}
                  <div className="volume-chart-section">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <h3 className="volume-chart-title" style={{ margin: 0 }}>Daily Traded Volume</h3>
                      <div className="volume-range-selectors" style={{ display: "flex", gap: "6px", background: "var(--bg)", padding: "4px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                        {["2w", "1m", "3m", "1y"].map((r) => (
                          <button
                            key={r}
                            className={`volume-range-btn ${volumeRange === r ? "active" : ""}`}
                            onClick={() => setVolumeRange(r as any)}
                            style={{
                              border: "none",
                              background: volumeRange === r ? "var(--surface-solid)" : "transparent",
                              color: volumeRange === r ? "var(--accent)" : "var(--muted)",
                              padding: "6px 12px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: "pointer",
                              boxShadow: volumeRange === r ? "0 2px 6px rgba(0, 0, 0, 0.05)" : "none",
                              transition: "all 0.15s ease",
                            }}
                          >
                            {r.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className="volume-chart-wrapper"
                      onClick={() => setExpandedChart("volume")}
                      style={{ cursor: "zoom-in" }}
                      title="Click to expand volume chart"
                    >
                      <svg viewBox="0 0 600 300" className="volume-svg-chart" style={{ width: "100%", height: "100%" }}>
                        <defs>
                          <linearGradient id="volUpGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="#047857" stopOpacity="0.85" />
                          </linearGradient>
                          <linearGradient id="volDownGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
                            <stop offset="100%" stopColor="#b91c1c" stopOpacity="0.85" />
                          </linearGradient>
                        </defs>

                        {(() => {
                          const maxVol = volumeStats?.peakVolume || Math.max(...volumeHistory.map(d => d.volume)) || 1;
                          const gridLines = [0, 0.25, 0.5, 0.75, 1];
                          const chartHeight = 230;
                          const chartWidth = 520;
                          const barWidth = volumeHistory.length > 50 ? 5 : (volumeHistory.length > 25 ? 9 : (volumeHistory.length > 12 ? 14 : 32));
                          const spacing = (chartWidth - (volumeHistory.length * barWidth)) / (volumeHistory.length - 1 || 1);

                          return (
                            <>
                              {gridLines.map((ratio, idx) => {
                                const yPos = 250 - (ratio * chartHeight);
                                const labelVal = ratio * maxVol;
                                return (
                                  <g key={idx}>
                                    <line
                                      x1="60"
                                      y1={yPos}
                                      x2="580"
                                      y2={yPos}
                                      stroke="var(--border)"
                                      strokeWidth="1"
                                      strokeDasharray="4 4"
                                      opacity="0.6"
                                    />
                                    <text
                                      x="50"
                                      y={yPos + 4}
                                      textAnchor="end"
                                      fontSize="12.5"
                                      fill="var(--text)"
                                      fontWeight="600"
                                    >
                                      {fmtVolume(labelVal)}
                                    </text>
                                  </g>
                                );
                              })}

                              {volumeHistory.map((d, index) => {
                                const barHeight = (d.volume / maxVol) * chartHeight;
                                const xPos = 60 + index * (barWidth + spacing) + spacing / 2;
                                const yPos = 250 - barHeight;

                                return (
                                  <g
                                    key={index}
                                    onMouseEnter={() => setHoveredBarIndex(index)}
                                    onMouseLeave={() => setHoveredBarIndex(null)}
                                    style={{ cursor: "pointer" }}
                                  >
                                    <rect
                                      x={xPos - 5}
                                      y="20"
                                      width={barWidth + 10}
                                      height={chartHeight}
                                      fill="transparent"
                                    />
                                    <rect
                                      x={xPos}
                                      y={yPos}
                                      width={barWidth}
                                      height={Math.max(barHeight, 2)}
                                      rx="3"
                                      fill={d.up ? "url(#volUpGrad)" : "url(#volDownGrad)"}
                                      className="volume-bar"
                                      style={{ transition: "all 0.2s ease" }}
                                    />
                                    {(() => {
                                      let showDate = true;
                                      if (volumeHistory.length > 50) {
                                        showDate = index % 8 === 0;
                                      } else if (volumeHistory.length > 25) {
                                        showDate = index % 4 === 0;
                                      } else if (volumeHistory.length > 12) {
                                        showDate = index % 2 === 0;
                                      }
                                      return (
                                        showDate && (
                                          <text
                                            x={xPos + barWidth / 2}
                                            y="274"
                                            textAnchor="middle"
                                            fontSize="12.5"
                                            fill="var(--text)"
                                            fontWeight="600"
                                          >
                                            {d.date}
                                          </text>
                                        )
                                      );
                                    })()}
                                  </g>
                                );
                              })}

                              {hoveredBarIndex !== null && (() => {
                                const d = volumeHistory[hoveredBarIndex];
                                const xPos = 60 + hoveredBarIndex * (barWidth + spacing) + spacing / 2 + barWidth / 2;
                                const tooltipWidth = 160;
                                const tooltipX = xPos + tooltipWidth > 580 ? xPos - tooltipWidth - 10 : xPos + 10;
                                return (
                                  <g pointerEvents="none">
                                    <rect
                                      x={tooltipX}
                                      y="40"
                                      width={tooltipWidth}
                                      height="88"
                                      rx="6"
                                      fill="var(--surface-solid)"
                                      stroke="var(--border)"
                                      strokeWidth="1.5"
                                      style={{ filter: "drop-shadow(0 4px 12px rgba(0, 0, 0, 0.08))" }}
                                    />
                                    <text x={tooltipX + 14} y="62" fontSize="13" fontWeight="bold" fill="var(--text)">
                                      {d.date}
                                    </text>
                                    <text x={tooltipX + 14} y="85" fontSize="12" fill="var(--muted)">
                                      Volume: <tspan fontWeight="bold" fill="var(--text)">{fmtVolume(d.volume)}</tspan>
                                    </text>
                                    <text x={tooltipX + 14} y="108" fontSize="12" fill="var(--muted)">
                                      Close: <tspan fontWeight="bold" fill={d.up ? "var(--green)" : "var(--red)"}>
                                        {fmtPrice(d.close, quote?.currency || "USD")}
                                      </tspan>
                                    </text>
                                  </g>
                                );
                              })()}
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                  </div>

                  {/* AI Volume Insight Box */}
                  <div className="ai-volume-insight-card">
                    <h3 className="ai-volume-insight-title">
                      <span>✨ AI Volume Insight</span>
                    </h3>
                    {researchLoading ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--muted)", fontSize: "13px", padding: "6px 0" }}>
                        <PrismWaitIcon size={20} />
                        <span>Analyzing volume patterns...</span>
                      </div>
                    ) : researchError ? (
                      <p style={{ fontSize: "12.5px", color: "var(--danger)" }}>Could not load volume insights.</p>
                    ) : researchData ? (
                      <div className="ai-volume-insight-text">
                        {(() => {
                          const volBullet = researchData.bullets.find((b: string) => b.toLowerCase().includes("volume") || b.toLowerCase().includes("traded"));
                          const rawText = volBullet || researchData.summary;
                          const cleanedText = rawText
                            .replace(/^(Highlight|Key highlight|Key takeaway|Takeaway|Bullet|Highlighting)\s*\d*:\s*/i, "")
                            .replace(/^•\s*/, "")
                            .trim();
                          return cleanedText;
                        })()}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12.5px", color: "var(--muted)" }}>No insight generated yet.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Groww-style Chart Popup ── */}
      {expandedChart && (() => {
        const prices = volumeHistory.map(d => d.close);
        const lastPrice = prices[prices.length - 1] ?? 0;
        const firstPrice = prices[0] ?? 0;
        const priceDiff = lastPrice - firstPrice;
        const pctDiff = firstPrice ? (priceDiff / firstPrice) * 100 : 0;
        const isUp = priceDiff >= 0;
        const trendColor = isUp ? "#10b981" : "#ef4444";

        // X-axis date labels
        const startDate = volumeHistory[0]?.date || "";
        const endDate = volumeHistory[volumeHistory.length - 1]?.date || "";
        const midDate = volumeHistory[Math.floor(volumeHistory.length / 2)]?.date || "";

        // Y-axis labels (3 intervals)
        let yLabels: string[] = [];
        if (expandedChart === "price") {
          const minP = Math.min(...prices);
          const maxP = Math.max(...prices);
          const range = maxP - minP || 1;
          yLabels = [
            fmtPrice(maxP, quote?.currency || "USD"),
            fmtPrice(minP + range * 0.5, quote?.currency || "USD"),
            fmtPrice(minP, quote?.currency || "USD")
          ];
        } else {
          const vols = volumeHistory.map(d => d.volume);
          const maxV = Math.max(...vols) || 1;
          yLabels = [
            fmtVolume(maxV),
            fmtVolume(maxV * 0.5),
            "0"
          ];
        }

        return (
          <>
            <div
              className="drawer-backdrop"
              style={{ zIndex: 1200 }}
              onClick={() => setExpandedChart(null)}
            />
            <div className="groww-chart-popup" role="dialog" aria-modal="true">
              {/* ── Top: Back + Company Info ── */}
              <div className="gcp-header">
                <button className="gcp-back" onClick={() => setExpandedChart(null)} aria-label="Close">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
                </button>
                <div className="gcp-info">
                  <span className="gcp-ticker">{stock.symbol}</span>
                  <span className="gcp-name">{stock.name || stock.symbol}</span>
                </div>
              </div>

              {/* ── Price Display ── */}
              <div className="gcp-price-section">
                <span className="gcp-price">
                  {fmtPrice(lastPrice, quote?.currency || "USD")}
                </span>
                <span className={`gcp-change ${isUp ? "up" : "down"}`}>
                  {isUp ? "+" : ""}{fmtPrice(Math.abs(priceDiff), quote?.currency || "USD")} ({isUp ? "+" : ""}{pctDiff.toFixed(2)}%)
                  <span className="gcp-range-label">{volumeRange.toUpperCase()}</span>
                </span>
              </div>

              {/* ── Edge-to-edge Chart ── */}
              <div className="gcp-chart-area">
                {/* Y Axis (Desktop only) */}
                <div className="gcp-y-axis">
                  <div className="gcp-axis-label">{yLabels[0]}</div>
                  <div className="gcp-axis-label">{yLabels[1]}</div>
                  <div className="gcp-axis-label">{yLabels[2]}</div>
                </div>

                <div className="gcp-svg-container">
                  <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid meet" className="gcp-svg">
                    <defs>
                      <linearGradient id="gcpGradUp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="gcpGradDown" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {expandedChart === "price" ? (() => {
                      const minP = Math.min(...prices);
                      const maxP = Math.max(...prices);
                      const range = maxP - minP || 1;
                      const padMin = minP - range * 0.05;
                      const padMax = maxP + range * 0.05;
                      const padRange = padMax - padMin || 1;

                      const pts = volumeHistory.map((d, i) => {
                        const x = (i / (volumeHistory.length - 1 || 1)) * 400;
                        const y = 200 - ((d.close - padMin) / padRange) * 190;
                        return { x, y: Math.max(5, Math.min(195, y)) };
                      });

                      const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
                      const area = `${line} L400,200 L0,200 Z`;

                      return (
                        <>
                          <path d={area} fill={isUp ? "url(#gcpGradUp)" : "url(#gcpGradDown)"} />
                          <path d={line} fill="none" stroke={trendColor} strokeWidth="2" />

                          {/* Touch / hover hit areas */}
                          {pts.map((p, i) => (
                            <rect
                              key={i}
                              x={p.x - 200 / (volumeHistory.length || 1)}
                              y="0"
                              width={400 / (volumeHistory.length || 1)}
                              height="200"
                              fill="transparent"
                              onMouseEnter={() => setHoveredBarIndex(i)}
                              onMouseLeave={() => setHoveredBarIndex(null)}
                              onTouchStart={() => setHoveredBarIndex(i)}
                              onTouchEnd={() => setHoveredBarIndex(null)}
                            />
                          ))}

                          {hoveredBarIndex !== null && (() => {
                            const p = pts[hoveredBarIndex];
                            return (
                              <>
                                <line x1={p.x} y1="0" x2={p.x} y2="200" stroke={trendColor} strokeWidth="0.8" opacity="0.5" />
                                <circle cx={p.x} cy={p.y} r="3.5" fill={trendColor} stroke="var(--surface-solid)" strokeWidth="1.5" />
                              </>
                            );
                          })()}
                        </>
                      );
                    })() : (() => {
                      // Volume bars
                      const vols = volumeHistory.map(d => d.volume);
                      const maxV = Math.max(...vols) || 1;

                      return (
                        <>
                          {volumeHistory.map((d, i) => {
                            const barW = 400 / volumeHistory.length * 0.7;
                            const gap = 400 / volumeHistory.length * 0.3;
                            const xPos = i * (barW + gap) + gap / 2;
                            const barH = (d.volume / maxV) * 185;
                            const yPos = 200 - barH;
                            return (
                              <g
                                key={i}
                                onMouseEnter={() => setHoveredBarIndex(i)}
                                onMouseLeave={() => setHoveredBarIndex(null)}
                                onTouchStart={() => setHoveredBarIndex(i)}
                                onTouchEnd={() => setHoveredBarIndex(null)}
                              >
                                <rect x={xPos} y="0" width={barW} height="200" fill="transparent" />
                                <rect
                                  x={xPos}
                                  y={yPos}
                                  width={barW}
                                  height={Math.max(barH, 1)}
                                  rx="2"
                                  fill={d.up ? "#10b981" : "#ef4444"}
                                  opacity={hoveredBarIndex === i ? 1 : 0.7}
                                />
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                </div>

                {/* X Axis (Desktop only) */}
                <div className="gcp-x-axis">
                  <div className="gcp-axis-label">{startDate}</div>
                  <div className="gcp-axis-label">{midDate}</div>
                  <div className="gcp-axis-label">{endDate}</div>
                </div>

                {/* Hover info overlay */}
                {hoveredBarIndex !== null && (() => {
                  const d = volumeHistory[hoveredBarIndex];
                  return (
                    <div className="gcp-hover-pill">
                      <span className="gcp-hover-date">{d.date}</span>
                      <span className="gcp-hover-val">{fmtPrice(d.close, quote?.currency || "USD")}</span>
                      <span className="gcp-hover-vol">Vol: {fmtVolume(d.volume)}</span>
                    </div>
                  );
                })()}
              </div>

              {/* ── Range Selectors (bottom, Groww-style) ── */}
              <div className="gcp-ranges">
                {["2w", "1m", "3m", "1y"].map((r) => (
                  <button
                    key={r}
                    className={`gcp-range-btn ${volumeRange === r ? "active" : ""}`}
                    onClick={() => setVolumeRange(r as any)}
                  >
                    {r.toUpperCase()}
                  </button>
                ))}
                {/* Chart type toggle */}
                <button
                  className="gcp-range-btn gcp-type-toggle"
                  onClick={() => setExpandedChart(expandedChart === "price" ? "volume" : "price")}
                  title={expandedChart === "price" ? "Switch to Volume" : "Switch to Price"}
                >
                  {expandedChart === "price" ? "📊" : "📈"}
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </>
  );
}

/* ─────────────────────────────────────────────
   AI Research Page — full-page research experience
   ───────────────────────────────────────────── */
/* Compact animated prism for the research hero: a dashed beam marches into
   the glass and four insight rays flow out — one per research capability.
   Reuses the global lp-dash / lp-flow / lp-spark / lp-halo keyframes. */

function AIResearchPage({
  market,
  quotes,
}: {
  market: Market;
  quotes: Record<string, Quote>;
}) {
  const [researchStock, setResearchStock] = useState<{ symbol: string; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"news" | "valuation" | "events" | "research" | "technicals">("research");
  const searchRef = useRef<HTMLInputElement>(null);

  // ─── data states ───
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [researchData, setResearchData] = useState<any | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const [techData, setTechData] = useState<any | null>(null);
  const [techLoading, setTechLoading] = useState(false);
  const [techError, setTechError] = useState<string | null>(null);

  const [insiderTrades, setInsiderTrades] = useState<any[]>([]);
  const [insiderLoading, setInsiderLoading] = useState(false);
  const [insiderError, setInsiderError] = useState<string | null>(null);
  const [insiderNote, setInsiderNote] = useState<string>("");
  const [insiderVerified, setInsiderVerified] = useState(false);

  // Reset on stock change
  useEffect(() => {
    if (!researchStock) return;
    setActiveTab("research");
    setNews([]);
    setNewsError(null);
    setResearchData(null);
    setResearchError(null);
    setTechData(null);
    setTechError(null);
    setInsiderTrades([]);
    setInsiderNote("");
    setInsiderVerified(false);
  }, [researchStock?.symbol]);

  // Fetch news
  useEffect(() => {
    if (!researchStock || activeTab !== "news") return;
    setNewsLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/news?symbol=${encodeURIComponent(researchStock.symbol)}&name=${encodeURIComponent(researchStock.name)}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => setNews(d.articles ?? []))
      .catch(e => { if (e.name !== "AbortError") setNewsError(e.message); })
      .finally(() => setNewsLoading(false));
    return () => ctrl.abort();
  }, [researchStock, activeTab]);

  // Fetch AI research
  useEffect(() => {
    if (!researchStock || activeTab !== "research") return;
    setResearchLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/research?symbol=${encodeURIComponent(researchStock.symbol)}&name=${encodeURIComponent(researchStock.name)}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => setResearchData(d))
      .catch(e => { if (e.name !== "AbortError") setResearchError(e.message); })
      .finally(() => setResearchLoading(false));
    return () => ctrl.abort();
  }, [researchStock, activeTab]);

  // Fetch technicals
  useEffect(() => {
    if (!researchStock || activeTab !== "technicals") return;
    setTechLoading(true);
    const ctrl = new AbortController();
    fetch(`/api/technicals?symbol=${encodeURIComponent(researchStock.symbol)}&name=${encodeURIComponent(researchStock.name)}`, { signal: ctrl.signal })
      .then(r => r.json()).then(d => setTechData(d))
      .catch(e => { if (e.name !== "AbortError") setTechError(e.message); })
      .finally(() => setTechLoading(false));
    return () => ctrl.abort();
  }, [researchStock, activeTab]);

  // Fetch events/insider
  useEffect(() => {
    if (!researchStock || activeTab !== "events") return;
    setInsiderLoading(true);
    const ctrl = new AbortController();
    const currentPrice = quotes?.[researchStock.symbol]?.price || "";
    fetch(`/api/insider?symbol=${encodeURIComponent(researchStock.symbol)}&name=${encodeURIComponent(researchStock.name)}&price=${currentPrice}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => { setInsiderTrades(d.trades ?? []); setInsiderNote(d.note ?? ""); setInsiderVerified(!!d.isAiVerified); })
      .catch(e => { if (e.name !== "AbortError") setInsiderError(e.message); })
      .finally(() => setInsiderLoading(false));
    return () => ctrl.abort();
  }, [researchStock, activeTab, quotes]);

  const quote = researchStock ? quotes?.[researchStock.symbol] : null;
  const isUp = quote && quote.change >= 0;
  const formattedPrice = quote ? new Intl.NumberFormat("en-US", { style: "currency", currency: quote.currency }).format(quote.price) : null;
  const formattedChange = quote ? `${isUp ? "+" : ""}${quote.changePct.toFixed(2)}%` : null;

  const TABS: { id: typeof activeTab; label: string; icon: IconName }[] = [
    { id: "research", label: "AI Insight", icon: "sparkles" },
    { id: "news", label: "News", icon: "newspaper" },
    { id: "technicals", label: "Technicals", icon: "trending" },
    { id: "events", label: "Events & Insider", icon: "crown" },
  ];

  return (
    <div className="rp-root">
      {/* ── Landing page (no stock selected) ── */}
      {!researchStock && (
        <div className="rp-hero">
          <div className="rp-hero-halo" aria-hidden />

          <h1 className="rp-hero-title">
            Research, <span className="rp-hero-accent">distilled</span>.
          </h1>
          <p className="rp-hero-sub">
            Search any stock to get instant AI research, key news, technicals, and insider trade signals.
          </p>

          <div className="rp-hero-search">
            <div className="rp-search-shell">
              <div className="rp-search-wrap">
                <TickerSearch
                  market={market}
                  inputRef={searchRef}
                  isAdding={false}
                  onPick={(r) => setResearchStock({ symbol: r.symbol, name: r.name })}
                />
              </div>
            </div>
          </div>

          <div className="rp-hero-grid">
            {[
              {
                icon: "sparkles" as IconName,
                color: "#8b5cf6",
                title: "AI Insight",
                body: "Conviction score, stance and an executive brief.",
              },
              {
                icon: "newspaper" as IconName,
                color: "#0ea5e9",
                title: "Curated news",
                body: "Headlines filtered and tagged bullish or bearish.",
              },
              {
                icon: "trending" as IconName,
                color: "#6366f1",
                title: "Technicals",
                body: "RSI, MACD, moving averages and key levels.",
              },
              {
                icon: "crown" as IconName,
                color: "#10b981",
                title: "Events & insider",
                body: "Corporate calendar, fund flows and insider trades.",
              },
            ].map((f, i) => (
              <button
                key={f.title}
                type="button"
                className="rp-hero-card"
                style={{ ["--card-accent" as string]: f.color }}
                onClick={() => searchRef.current?.focus()}
              >
                <span className="rp-hero-card-icon">
                  <Icon name={f.icon} width={18} height={18} />
                </span>
                <span className="rp-hero-card-txt">
                  <span className="rp-hero-card-title">{f.title}</span>
                  <span className="rp-hero-card-body">{f.body}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Research dashboard (stock selected) ── */}
      {researchStock && (
        <div className="rp-dashboard">
          {/* Identity header — top of the research card */}
          <div className="rp-active-header">
            <div className="rp-head-id">
              <h2 className="rp-head-name">{researchStock.name || researchStock.symbol}</h2>
              <span className="rp-head-ticker">{researchStock.symbol}</span>
            </div>
            {formattedPrice && (
              <div className="rp-head-price">
                <span className="rp-head-price-val">{formattedPrice}</span>
                <span className={`rp-head-chg ${isUp ? "up" : "down"}`}>
                  {isUp ? "▲" : "▼"} {formattedChange}
                </span>
              </div>
            )}
            <button
              className="rp-chip-close"
              onClick={() => setResearchStock(null)}
              aria-label="Close research"
            >✕</button>
          </div>

          {/* Tab rail */}
          <div className="rp-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`rp-tab ${activeTab === t.id ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                <Icon name={t.icon} width={15} height={15} />
                <span className="rp-tab-label">{t.label}</span>
              </button>
            ))}
          </div>

          {/* ── AI Insight Tab ── */}
          {activeTab === "research" && (
            <div className="rp-panel">
              {researchLoading ? (
                <div className="rp-loading">
                  <PrismWaitIcon size={48} />
                  <p>✨ AI is drafting research summary &amp; catalyst stances…</p>
                </div>
              ) : researchError ? (
                <div className="rp-error"><span>⚠️</span><p>{researchError}</p></div>
              ) : !researchData ? (
                <div className="rp-error"><span>✨</span><p>Report not generated.</p></div>
              ) : (
                <div className="rp-research-content">
                  {/* Stance card */}
                  <div className={`rp-stance-card ${researchData.stance?.toLowerCase()}`}>
                    <div className="rp-stance-ring">
                      <svg width="88" height="88" viewBox="0 0 36 36">
                        <path className="score-svg-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="score-svg-progress" strokeDasharray={`${researchData.score}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="score-svg-text">
                        <span className="score-num">{researchData.score}</span>
                        <span className="score-pct">%</span>
                      </div>
                    </div>
                    <div className="rp-stance-meta">
                      <span className="rp-stance-lbl">AI Conviction Score</span>
                      <h2 className="rp-stance-val">{researchData.stance}</h2>
                      <p className="rp-stance-desc">Based on fundamentals, momentum &amp; market context</p>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rp-card">
                    <div className="rp-card-header">
                      <span className="rp-card-icon">📋</span>
                      <span className="rp-card-title">Executive Summary</span>
                    </div>
                    <p className="rp-card-body">{researchData.summary}</p>
                  </div>

                  {/* Bullets */}
                  <div className="rp-card">
                    <div className="rp-card-header">
                      <span className="rp-card-icon">💡</span>
                      <span className="rp-card-title">Key Takeaways</span>
                    </div>
                    <div className="rp-bullets">
                      {researchData.bullets?.map((b: string, i: number) => (
                        <div key={i} className="rp-bullet">
                          <span className="rp-bullet-dot">▸</span>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── News Tab ── */}
          {activeTab === "news" && (
            <div className="rp-panel">
              {newsLoading ? (
                <div className="rp-loading">
                  <PrismWaitIcon size={48} />
                  <p>✨ AI is filtering &amp; analyzing news…</p>
                </div>
              ) : newsError ? (
                <div className="rp-error"><span>⚠️</span><p>{newsError}</p></div>
              ) : news.length === 0 ? (
                <div className="rp-error"><span>📰</span><p>No recent news found.</p></div>
              ) : (
                <div className="rp-news-grid">
                  {news.map((item, i) => (
                    <a
                      key={item.uuid}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rp-news-card ${i === 0 ? "featured" : ""}`}
                    >
                      {item.thumbnail && i === 0 && (
                        <div className="rp-news-thumb-wrap">
                          <img src={item.thumbnail} alt="" className="rp-news-thumb" loading="lazy" />
                        </div>
                      )}
                      <div className="rp-news-body">
                        <div className="rp-news-meta">
                          <span>{item.publisher}</span>
                          <span>·</span>
                          <span>{fmtRelativeTime(item.time)}</span>
                          {item.sentiment && (
                            <span className={`rp-sentiment ${item.sentiment}`}>
                              {item.sentiment === "bullish" ? "🟢 Bullish" : item.sentiment === "bearish" ? "🔴 Bearish" : "⚪ Neutral"}
                            </span>
                          )}
                        </div>
                        <h3 className="rp-news-title">{item.title}</h3>
                        {item.valueRationale && (
                          <p className="rp-news-rationale">💡 {item.valueRationale}</p>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Technicals Tab ── */}
          {activeTab === "technicals" && (
            <div className="rp-panel">
              {techLoading ? (
                <div className="rp-loading">
                  <PrismWaitIcon size={48} />
                  <p>✨ AI is computing technical indicators &amp; levels…</p>
                </div>
              ) : techError ? (
                <div className="rp-error"><span>⚠️</span><p>{techError}</p></div>
              ) : !techData ? (
                <div className="rp-error"><span>📊</span><p>Technical analysis not generated.</p></div>
              ) : (
                <div className="rp-research-content">
                  {/* Stance */}
                  <div className={`rp-stance-card ${techData.stance?.toLowerCase().includes("buy") ? "bullish" : techData.stance?.toLowerCase().includes("sell") ? "bearish" : "neutral"}`}>
                    <div className="rp-stance-ring" style={{ background: "transparent", border: "none" }}>
                      <span style={{ fontSize: "36px" }}>
                        {techData.stance?.toLowerCase().includes("strong buy") ? "🚀"
                          : techData.stance?.toLowerCase().includes("buy") ? "📈"
                          : techData.stance?.toLowerCase().includes("strong sell") ? "💥"
                          : techData.stance?.toLowerCase().includes("sell") ? "📉" : "⚖️"}
                      </span>
                    </div>
                    <div className="rp-stance-meta">
                      <span className="rp-stance-lbl">Technical Consensus</span>
                      <h2 className="rp-stance-val">{techData.stance}</h2>
                    </div>
                  </div>

                  {/* Indicators grid */}
                  <div className="rp-tech-grid">
                    <div className="rp-tech-card">
                      <span className="rp-tech-label">RSI (14)</span>
                      <span className="rp-tech-val">{techData.rsi}</span>
                      <div className="rp-tech-bar">
                        <div className="rp-tech-bar-fill" style={{ width: `${techData.rsi}%`, background: techData.rsi > 70 ? "var(--red)" : techData.rsi < 30 ? "var(--green)" : "var(--us)" }} />
                      </div>
                      <span className="rp-tech-sub">{techData.rsi > 70 ? "Overbought" : techData.rsi < 30 ? "Oversold" : "Neutral"}</span>
                    </div>
                    <div className="rp-tech-card">
                      <span className="rp-tech-label">MACD Signal</span>
                      <span className={`val-stance ${techData.macd?.toLowerCase().includes("bullish") ? "undervalued" : techData.macd?.toLowerCase().includes("bearish") ? "premium" : "neutral"}`} style={{ fontSize: "13px", padding: "4px 10px", borderRadius: "8px", fontWeight: 700 }}>
                        {techData.macd}
                      </span>
                    </div>
                    <div className="rp-tech-card">
                      <span className="rp-tech-label">Support Floor</span>
                      <span className="rp-tech-val" style={{ color: "var(--green)" }}>
                        {quote?.currency === "INR" ? "₹" : "$"}{techData.support}
                      </span>
                    </div>
                    <div className="rp-tech-card">
                      <span className="rp-tech-label">Resistance Ceiling</span>
                      <span className="rp-tech-val" style={{ color: "var(--red)" }}>
                        {quote?.currency === "INR" ? "₹" : "$"}{techData.resistance}
                      </span>
                    </div>
                  </div>

                  {/* Moving Averages */}
                  <div className="rp-card">
                    <div className="rp-card-header">
                      <span className="rp-card-icon">📉</span>
                      <span className="rp-card-title">Moving Averages</span>
                      <span className={`val-stance ${techData.movingAverages?.trend?.toLowerCase() === "bullish" ? "undervalued" : techData.movingAverages?.trend?.toLowerCase() === "bearish" ? "premium" : "neutral"}`} style={{ marginLeft: "auto", fontSize: "11px", padding: "2px 8px", borderRadius: "4px" }}>
                        {techData.movingAverages?.trend} Trend
                      </span>
                    </div>
                    <div className="rp-ma-rows">
                      {[["SMA (20)", techData.movingAverages?.sma20], ["SMA (50)", techData.movingAverages?.sma50], ["SMA (200)", techData.movingAverages?.sma200]].map(([lbl, val]) => (
                        <div key={lbl as string} className="rp-ma-row">
                          <span>{lbl}</span>
                          <strong>{quote?.currency === "INR" ? "₹" : "$"}{val}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rp-card">
                    <div className="rp-card-header">
                      <span className="rp-card-icon">📝</span>
                      <span className="rp-card-title">Technical Summary</span>
                    </div>
                    <p className="rp-card-body">{techData.summary}</p>
                  </div>

                  {/* Bullets */}
                  {techData.bullets?.length > 0 && (
                    <div className="rp-card">
                      <div className="rp-card-header">
                        <span className="rp-card-icon">🎯</span>
                        <span className="rp-card-title">Takeaways</span>
                      </div>
                      <div className="rp-bullets">
                        {techData.bullets.map((b: string, i: number) => (
                          <div key={i} className="rp-bullet">
                            <span className="rp-bullet-dot">▸</span>
                            <span>{b}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Events & Insider Tab ── */}
          {activeTab === "events" && (() => {
            const events = getUpcomingEvents(researchStock.symbol);
            const mfActivity = getMutualFundActivity(researchStock.symbol, quote?.currency || "USD");
            return (
              <div className="rp-panel">
                {/* Corporate events */}
                <div className="rp-card">
                  <div className="rp-card-header">
                    <span className="rp-card-icon">📅</span>
                    <span className="rp-card-title">Upcoming Corporate Events</span>
                  </div>
                  <div className="rp-events-list">
                    {events.map((ev, i) => (
                      <div key={i} className="rp-event-card">
                        <div className="rp-event-header">
                          <span className="rp-event-title">{ev.event}</span>
                          <span className="rp-event-date">{ev.date}</span>
                        </div>
                        <p className="rp-event-desc">{ev.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mutual fund activity */}
                <div className="rp-card">
                  <div className="rp-card-header">
                    <span className="rp-card-icon">📈</span>
                    <span className="rp-card-title">Mutual Fund Activity</span>
                    <span className="rp-card-sub">Last 3 months</span>
                  </div>
                  <div className="rp-mf-list">
                    {mfActivity.map((mf, i) => {
                      const isBuy = mf.action === "Bought" || mf.action === "Increased";
                      return (
                        <div key={i} className="rp-mf-card">
                          <div className="rp-mf-header">
                            <span className="rp-mf-name">{mf.fundName}</span>
                            <span className={`mf-badge ${isBuy ? "buy" : "sell"}`}>{mf.action}</span>
                          </div>
                          <div className="rp-mf-meta">
                            <span>{mf.quantity}</span>
                            <span>·</span>
                            <span>{mf.value}</span>
                            <span>·</span>
                            <span>{mf.date}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Insider trading */}
                <div className="rp-card">
                  <div className="rp-card-header">
                    <span className="rp-card-icon">👔</span>
                    <span className="rp-card-title">Insider Trading</span>
                    {insiderVerified && <span className="ai-badge" style={{ marginLeft: "auto", fontSize: "10.5px", background: "rgba(79,70,229,0.08)", color: "var(--us)", padding: "2px 8px", borderRadius: "20px", fontWeight: 650, border: "1px solid rgba(79,70,229,0.2)", display: "flex", alignItems: "center", gap: "4px" }}>✨ AI Verified</span>}
                  </div>
                  {insiderLoading ? (
                    <div className="rp-loading" style={{ padding: "24px 0" }}>
                      <PrismWaitIcon size={36} />
                      <p>✨ AI is scanning insider activity…</p>
                    </div>
                  ) : insiderError ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px", padding: "12px 0" }}>⚠️ {insiderError}</p>
                  ) : insiderTrades.length === 0 ? (
                    <p style={{ color: "var(--muted)", fontSize: "13px", padding: "12px 0" }}>No recent insider transactions.</p>
                  ) : (
                    <div className="rp-events-list">
                      {insiderTrades.map((trade, i) => {
                        const isBuy = trade.action === "Buy";
                        return (
                          <div key={i} className="rp-event-card">
                            <div className="rp-event-header">
                              <span className="rp-event-title">{trade.executive}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {trade.date && <span className="rp-event-date">{trade.date}</span>}
                                <span className={`val-stance ${isBuy ? "undervalued" : "premium"}`} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>{isBuy ? "Buy" : "Sale"}</span>
                              </div>
                            </div>
                            {(trade.shares || trade.price || trade.value) && (
                              <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--muted)", flexWrap: "wrap", marginTop: "4px" }}>
                                {trade.shares && <span>Qty: <strong>{trade.shares}</strong></span>}
                                {trade.price && <span>Price: <strong>{trade.price}</strong></span>}
                                {trade.value && <span>Value: <strong>{trade.value}</strong></span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {insiderNote && <p style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic", marginTop: "6px" }}>ℹ️ {insiderNote}</p>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
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
    "price" | "change" | "change3m" | "news" | "volume" | null
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

  const handleSort = (field: "price" | "change" | "change3m" | "news" | "volume") => {
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
              : sortField === "volume"
                ? "volume"
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
              <div className="ai-col-volume">
                <span className="sortable-header" onClick={() => handleSort("volume")}>
                  Volume
                  {sortField === "volume" && (
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

                  <div className="ai-col-volume">
                    {s.volume == null ? (
                      <span className="muted">—</span>
                    ) : (
                      <span style={{ fontSize: "14px", fontWeight: 700 }}>
                        {fmtVolume(s.volume)}
                      </span>
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
  }, [stories]);

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
  const [sortField, setSortField] = useState<"price" | "change" | "change3m" | "volume" | null>(null);
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
    const timer = setTimeout(checkScroll, 100);
    window.addEventListener("resize", checkScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkScroll);
    };
  }, [items]);

  const handleSort = (field: "price" | "change" | "change3m" | "volume") => {
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
      } else if (sortField === "volume") {
        valA = qA?.volume != null ? qA.volume : -1;
        valB = qB?.volume != null ? qB.volume : -1;
      }
      if (valA === valB) return 0;
      return sortOrder === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
  }, [filteredItems, sortField, sortOrder, quotes]);

  return (
    <div className="panel table-panel" style={{ position: "relative" }}>
      {canScrollRight && (
        <div className="ai-scroll-hint">
          <div className="ai-scroll-hint-pill">
            Swipe Right <span>➔</span>
          </div>
        </div>
      )}
      {filteredItems.length === 0 ? (
        <div className="panel empty" style={{ border: "none", boxShadow: "none", margin: 0, padding: "24px 0" }}>
          <div className="ico">🔍</div>
          <p>No matching stocks found for &ldquo;{filterText}&rdquo;.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="table-scroll" onScroll={checkScroll}>
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
                  onClick={() => handleSort("volume")}
                >
                  Volume
                  {sortField === "volume" && (
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
                      {q && q.volume != null ? (
                        <span style={{ fontWeight: 600 }}>{fmtVolume(q.volume)}</span>
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
  const [sortField, setSortField] = useState<"price" | "change" | "change3m" | "volume" | null>(null);
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

  const handleSort = (field: "price" | "change" | "change3m" | "volume") => {
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
      } else if (sortField === "volume") {
        valA = qA?.volume != null ? qA.volume : -1;
        valB = qB?.volume != null ? qB.volume : -1;
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
          <div className="ai-col-volume">
            <span className="sortable-header" onClick={() => handleSort("volume")}>
              Volume
              {sortField === "volume" && (
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

              {/* Volume Column */}
              <div className="ai-col-volume">
                {quotesLoading && !quotes?.[item.symbol] ? (
                  <span className="price-loading">...</span>
                ) : (() => {
                  const q = quotes?.[item.symbol];
                  if (!q || q.volume == null) return <span className="muted">—</span>;
                  return (
                    <span style={{ fontSize: "14px", fontWeight: 700 }}>
                      {fmtVolume(q.volume)}
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

function WatchlistBriefing({ items }: { items: WatchlistItem[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<any[]>([]);

  useEffect(() => {
    if (items.length === 0) return;
    let active = true;
    setLoading(true);
    setError(null);
    const symbols = items.map(i => i.symbol).join(",");
    fetch(`/api/watchlist-briefing?symbols=${encodeURIComponent(symbols)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load AI briefing");
        return res.json();
      })
      .then(data => {
        if (active) {
          setBriefing(data.briefing || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (active) {
          setError(err.message || "Something went wrong");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [items]);

  if (loading) {
    return (
      <div className="panel empty" style={{ border: "none", boxShadow: "none", padding: "60px 0" }}>
        <PrismWaitIcon size={48} />
        <p style={{ marginTop: "12px", fontSize: "15px", fontWeight: 600 }}>Analyzing recent news catalysts...</p>
        <p style={{ color: "var(--muted)", fontSize: "13px" }}>Finding events in the last 24–48 hours for {items.length} companies</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel empty" style={{ border: "none", boxShadow: "none", color: "var(--danger)", padding: "60px 0" }}>
        <span style={{ fontSize: "28px", marginBottom: "8px" }}>⚠️</span>
        <p style={{ fontWeight: 650 }}>Failed to compile briefing</p>
        <p style={{ fontSize: "13px" }}>{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            const symbols = items.map(i => i.symbol).join(",");
            fetch(`/api/watchlist-briefing?symbols=${encodeURIComponent(symbols)}`)
              .then(res => res.json())
              .then(data => {
                setBriefing(data.briefing || []);
                setLoading(false);
              })
              .catch(err => {
                setError(err.message || "Failed to load");
                setLoading(false);
              });
          }}
          style={{
            marginTop: "12px",
            padding: "8px 16px",
            borderRadius: "6px",
            background: "var(--surface-solid)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            color: "var(--text)",
            fontWeight: 700,
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  const allSources: { name: string; url: string }[] = [];
  briefing.forEach(b => {
    b.bullets.forEach((bullet: any) => {
      if (bullet.url && !bullet.headline.toLowerCase().includes("no significant news")) {
        const alreadyExists = allSources.some(s => s.url === bullet.url);
        if (!alreadyExists) {
          allSources.push({ name: bullet.source || "Source", url: bullet.url });
        }
      }
    });
  });

  return (
    <div className="ai-briefing-view" style={{ padding: "0 24px 40px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className="ai-briefing-cards" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {briefing.map((comp, idx) => {
          const isNoNews = comp.noNews || comp.bullets.some((b: any) => b.headline.toLowerCase().includes("no significant news"));
          return (
            <div
              key={idx}
              className="val-summary-card"
              style={{
                padding: "20px",
                opacity: isNoNews ? 0.75 : 1,
                borderLeft: isNoNews ? "3px solid var(--border)" : "3px solid var(--accent)",
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 800, color: "var(--text)" }}>
                  {comp.company}
                </h4>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    background: isNoNews ? "rgba(148, 163, 184, 0.1)" : "rgba(16, 185, 129, 0.1)",
                    color: isNoNews ? "var(--muted)" : "#10b981",
                    textTransform: "uppercase",
                  }}
                >
                  {comp.symbol}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {comp.bullets.map((bullet: any, bIdx: number) => {
                  const bulletNoNews = bullet.headline.toLowerCase().includes("no significant news");
                  return (
                    <div key={bIdx} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <span style={{ color: bulletNoNews ? "var(--muted)" : "var(--accent)", fontWeight: "bold", fontSize: "14px", marginTop: "-1px" }}>
                        {bulletNoNews ? "✓" : "•"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>
                          {bullet.headline}
                        </span>
                        {!bulletNoNews && (
                          <>
                            <span style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: 1.45 }}>
                              {bullet.summary}
                            </span>
                            <div style={{ marginTop: "2px" }}>
                              <a
                                href={bullet.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "4px",
                                  padding: "2px 8px",
                                  borderRadius: "4px",
                                  background: "rgba(15, 23, 42, 0.04)",
                                  color: "var(--accent)",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  textDecoration: "none",
                                }}
                              >
                                🔗 {bullet.source}
                              </a>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {allSources.length > 0 && (
        <div className="val-summary-card" style={{ padding: "20px", marginTop: "8px" }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 800, color: "var(--text)" }}>
            Sources
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }}>
            {allSources.map((src, sIdx) => (
              <a
                key={sIdx}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: "12px",
                  color: "var(--accent)",
                  textDecoration: "none",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                📰 {src.name}
              </a>
            ))}
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
  const { user } = useUser();
  const { signOut } = useClerk();
  const [market, setMarket] = useState<Market>("US");
  const [view, setView] = useState<View>("watchlist");
  const [activeList, setActiveList] = useState<number | null>(null);
  const [watchlistTab, setWatchlistTab] = useState<"table" | "briefing">("table");
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
    if (sv === "research" || sv === "watchlist" || sv === "ai" || sv === "trending" || sv === "headlines")
      setView(sv);
    try {
      const f = JSON.parse(window.localStorage.getItem(FAV_STORE_KEY) || "[]");
      if (Array.isArray(f)) setFavorites(new Set(f));
    } catch {
      /* ignore */
    }
  }, []);

  // Reset watchlistTab to table when active watchlist or view changes
  useEffect(() => {
    setWatchlistTab("table");
  }, [view, activeList]);

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
        .then((data) => {
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
        volume: q?.volume,
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
        .then((data) => {
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
            <img src="/assets/lumina-lockup-horizontal-light.svg" className="logo-light" alt="Lumina Logo" style={{ height: "72px", width: "auto", marginLeft: "-14px" }} />
            <img src="/assets/lumina-lockup-horizontal-dark.svg" className="logo-dark" alt="Lumina Logo" style={{ height: "72px", width: "auto", marginLeft: "-14px" }} />
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

        <div className="side-profile">
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: { width: 36, height: 36 },
                  }
                }} 
              />
              <span className="side-profile-info" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <span className="side-profile-name" style={{ fontSize: '14px', fontWeight: 600 }}>{user.fullName || user.username}</span>
                <span className="side-profile-sub" style={{ fontSize: '12px', color: 'var(--muted)', textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap", maxWidth: "120px" }}>
                  {user.primaryEmailAddress?.emailAddress}
                </span>
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  signOut({ redirectUrl: "/" });
                }}
                className="side-profile-logout"
                aria-label="Log out"
                title="Log out"
                style={{ border: "none", background: "none", cursor: "pointer", padding: 0 }}
              >
                <Icon name="logout" />
              </button>
            </div>
          ) : (
            <SignInButton mode="modal">
              <button className="btn w-full" style={{ justifyContent: 'center' }}>Sign In</button>
            </SignInButton>
          )}
        </div>
      </aside>

      {/* ---------- Main ---------- */}
      <div className="main">
        <div className="main-top">
          <div className="brand mini">
            <img src="/assets/lumina-lockup-horizontal-light.svg" className="logo-light" alt="Lumina Logo" style={{ height: "56px", width: "auto", marginLeft: "-10px" }} />
            <img src="/assets/lumina-lockup-horizontal-dark.svg" className="logo-dark" alt="Lumina Logo" style={{ height: "56px", width: "auto", marginLeft: "-10px" }} />
          </div>
          <div className="mobile-profile-wrap">
            {user ? (
              <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: { width: 36, height: 36 },
                  }
                }} 
              />
            ) : (
              <SignInButton mode="modal">
                <button className="btn" style={{ padding: '6px 12px', fontSize: '12px' }}>Sign In</button>
              </SignInButton>
            )}
          </div>
        </div>



        {view === "watchlist" && !user && (
          <div className="news-empty-state" style={{ marginTop: '40px' }}>
            <span className="icon">🔒</span>
            <p>Sign In to view and manage your personal watchlists.</p>
            <div style={{ marginTop: '16px' }}>
              <SignInButton mode="modal">
                <button className="btn">Sign In</button>
              </SignInButton>
            </div>
          </div>
        )}

        {view === "watchlist" && user && (
          <div className="wl-bar">
            {/* Left side: Tabs & New Watchlist Trigger */}
            <div className="wl-tabs-left">
              {personalLists.map((l) => (
                <span
                  key={l.id}
                  className={`wl-tab-wrap ${activeList === l.id ? "active" : ""}`}
                >
                  <button
                    className="wl-tab"
                    onClick={() => setActiveList(l.id)}
                    aria-pressed={activeList === l.id}
                  >
                    {l.name}
                    <span className="wl-tab-count">{l.item_count}</span>
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
                <button type="button" className="wl-new-link" onClick={() => setCreating(true)}>
                  + New watchlist
                </button>
              )}
            </div>

            {/* Right side: Market segments switcher & Relative updated status */}
            <div className="wl-actions-right">
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

              <div className="wl-status-row">
                <span className="trending-updated">
                  {quotesLoading ? "updating..." : `updated ${formatRelativeTime(quotesUpdatedAt)}`}
                </span>
                <button
                  type="button"
                  className="hl-refresh"
                  onClick={refetchQuotes}
                  disabled={quotesLoading}
                  aria-label="Refresh watchlist quotes"
                  title={quotesLoading ? "Refreshing…" : "Refresh"}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  {quotesLoading ? (
                    <PrismWaitIcon size={18} duration="1.6s" />
                  ) : (
                    <Icon name="refresh" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
        {view === "watchlist" && !createState.ok && (
          <Toast state={createState} lastProcessedRef={lastCreateStateRef} className="inline-toast" />
        )}

        {/* Search card */}
        {view !== "ai" && view !== "trending" && view !== "headlines" && view !== "research" && (
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
                    {trendingRefreshing || trendingLoading ? "updating..." : `Updated ${formatRelativeTime(trendingUpdatedAt)}`}
                  </span>
                  <button
                    type="button"
                    className="hl-refresh"
                    onClick={() => loadTrending(true)}
                    disabled={trendingRefreshing || trendingLoading}
                    aria-label="Refresh trending stocks"
                    title={trendingRefreshing ? "Refreshing…" : "Refresh"}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {trendingRefreshing ? (
                      <PrismWaitIcon size={18} duration="1.6s" />
                    ) : (
                      <Icon name="refresh" />
                    )}
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
                {headlinesRefreshing || headlinesLoading ? "updating..." : `Updated ${formatRelativeTime(headlinesUpdatedAt)}`}
              </span>
              <button
                type="button"
                className="hl-refresh"
                onClick={() => loadHeadlines(true)}
                disabled={headlinesRefreshing || headlinesLoading}
                aria-label="Refresh headlines"
                title={headlinesRefreshing ? "Refreshing…" : "Refresh"}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                {headlinesRefreshing ? (
                  <PrismWaitIcon size={18} duration="1.6s" />
                ) : (
                  <Icon name="refresh" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* AI Research Page */}
        {view === "research" && (
          <AIResearchPage market={market} quotes={quotes} />
        )}

        {/* Watchlist Sub-Tabs (Table vs AI Briefing) */}
        {view === "watchlist" && currentListId != null && items.length > 0 && (
          <div className="wl-sub-tabs" style={{ display: "flex", gap: "8px", margin: "0 24px 20px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
            <button
              className={`wl-sub-tab ${watchlistTab === "table" ? "active" : ""}`}
              onClick={() => setWatchlistTab("table")}
              style={{
                border: "none",
                background: "transparent",
                color: watchlistTab === "table" ? "var(--text)" : "var(--muted)",
                fontSize: "14px",
                fontWeight: 750,
                cursor: "pointer",
                padding: "4px 8px",
                borderBottom: watchlistTab === "table" ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-10px",
                transition: "all 0.15s ease",
              }}
            >
              📋 Stocks List
            </button>
            <button
              className={`wl-sub-tab ${watchlistTab === "briefing" ? "active" : ""}`}
              onClick={() => setWatchlistTab("briefing")}
              style={{
                border: "none",
                background: "transparent",
                color: watchlistTab === "briefing" ? "var(--text)" : "var(--muted)",
                fontSize: "14px",
                fontWeight: 750,
                cursor: "pointer",
                padding: "4px 8px",
                borderBottom: watchlistTab === "briefing" ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: "-10px",
                transition: "all 0.15s ease",
              }}
            >
              ✨ AI Briefing
            </button>
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
        ) : view === "research" ? null : view === "watchlist" && currentListId == null ? (
          <div className="panel empty">
            <div className="ico">🗂️</div>
            <p>No watchlists yet — create one above to get started.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="panel empty">
            <div className="ico">{view === "ai" ? "✨" : "📈"}</div>
            <p>No stocks yet — add your first one above.</p>
          </div>
        ) : view === "watchlist" && watchlistTab === "briefing" ? (
          <WatchlistBriefing items={items} />
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
