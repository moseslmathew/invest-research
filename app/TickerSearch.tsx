"use client";

import { useEffect, useRef, useState } from "react";
import type { Market } from "@/lib/db";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

interface Watchlist {
  id: number;
  name: string;
}

export default function TickerSearch({
  market,
  disabled,
  onPick,
  inputRef,
  isAdding,
  watchlists,
  onAddToWatchlist,
}: {
  market: Market;
  disabled?: boolean;
  onPick: (r: SearchResult) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  isAdding?: boolean;
  watchlists?: Watchlist[];
  onAddToWatchlist?: (r: SearchResult, watchlistId: number) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(term)}&market=${market}`,
          { signal: ctrl.signal }
        );
        const data = await res.json();
        setResults(data.results ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, market]);

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(r: SearchResult) {
    onPick(r);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-box" ref={boxRef}>
      <label htmlFor="ticker-search">
        Search ticker or company
        <kbd className="search-kbd" aria-hidden>
          /
        </kbd>
      </label>
      <div className="search-input-wrap">
        <span className="search-ico" aria-hidden>
          {isAdding ? "⏳" : "🔍"}
        </span>
        <input
          id="ticker-search"
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={isAdding ? "Adding stock..." : "Search by ticker or company name"}
          autoComplete="off"
          disabled={disabled || isAdding}
          role="combobox"
          aria-expanded={open}
          aria-controls="search-listbox"
          aria-activedescendant={
            open && results.length ? `search-opt-${active}` : undefined
          }
        />
        {(loading || isAdding) && <span className="search-spin" aria-hidden />}
      </div>

      {open && (
        <ul className="search-results" id="search-listbox" role="listbox">
          {results.length === 0 && !loading ? (
            <li className="search-empty">
              No matches found.
            </li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.symbol}
                id={`search-opt-${i}`}
                role="option"
                aria-selected={i === active}
                className={`search-item ${i === active ? "active" : ""} ${openDropdownIdx === i ? "dropdown-open" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest(".add-to-wl-container")) {
                    return;
                  }
                  e.preventDefault();
                  pick(r);
                }}
              >
                <div className="search-item-info">
                  <span className="search-sym">{r.symbol}</span>
                  <span className="search-name">{r.name}</span>
                  <span className="search-exch">{r.exchange}</span>
                </div>

                {watchlists && watchlists.length > 0 && (
                  <div className="add-to-wl-container" onMouseDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="add-to-wl-trigger"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenDropdownIdx(openDropdownIdx === i ? null : i);
                      }}
                    >
                      ＋ Add to List
                    </button>
                    {openDropdownIdx === i && (
                      <div className="add-to-wl-dropdown">
                        <div className="add-to-wl-dropdown-header">Add to Watchlist</div>
                        <ul className="add-to-wl-dropdown-list">
                          {watchlists.map((wl) => (
                            <li
                              key={wl.id}
                              className="add-to-wl-dropdown-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onAddToWatchlist?.(r, wl.id);
                                setOpenDropdownIdx(null);
                              }}
                            >
                              {wl.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
