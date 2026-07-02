import { sql, type Market, type Watchlist, type WatchlistItem } from "./db";

export async function getWatchlists(market: Market): Promise<Watchlist[]> {
  const rows = await sql`
    SELECT
      w.id,
      w.market,
      w.name,
      COUNT(i.id)::int AS item_count
    FROM watchlists w
    LEFT JOIN watchlist i ON i.watchlist_id = w.id
    WHERE w.market = ${market}
    GROUP BY w.id, w.market, w.name, w.created_at
    ORDER BY w.created_at ASC
  `;
  return rows as Watchlist[];
}

export async function createWatchlist(
  market: Market,
  name: string
): Promise<Watchlist> {
  const rows = await sql`
    INSERT INTO watchlists (market, name)
    VALUES (${market}, ${name.trim()})
    ON CONFLICT (market, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, market, name, 0 AS item_count
  `;
  return rows[0] as Watchlist;
}

export async function getWatchlistItems(
  watchlistId: number
): Promise<WatchlistItem[]> {
  const rows = await sql`
    SELECT id, market, watchlist_id, symbol, name, tier, sector, notes,
           sort_order, created_at
    FROM watchlist
    WHERE watchlist_id = ${watchlistId}
    ORDER BY
      CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
      sort_order ASC,
      created_at DESC
  `;
  return rows as WatchlistItem[];
}

export async function addWatchlistItem(input: {
  market: Market;
  watchlistId: number;
  symbol: string;
  name?: string | null;
  notes?: string | null;
}): Promise<WatchlistItem> {
  const symbol = input.symbol.trim().toUpperCase();
  const name = input.name?.trim() || null;
  const notes = input.notes?.trim() || null;

  const rows = await sql`
    INSERT INTO watchlist (market, watchlist_id, symbol, name, notes, sort_order)
    VALUES (
      ${input.market}, ${input.watchlistId}, ${symbol}, ${name}, ${notes},
      (SELECT COALESCE(MAX(sort_order), 0) + 1
         FROM watchlist WHERE watchlist_id = ${input.watchlistId})
    )
    ON CONFLICT (watchlist_id, symbol) DO UPDATE
      SET name = COALESCE(EXCLUDED.name, watchlist.name),
          notes = COALESCE(EXCLUDED.notes, watchlist.notes)
    RETURNING id, market, watchlist_id, symbol, name, tier, sector, notes,
              sort_order, created_at
  `;
  return rows[0] as WatchlistItem;
}

export async function deleteWatchlistItem(id: number): Promise<void> {
  await sql`DELETE FROM watchlist WHERE id = ${id}`;
}

export async function deleteWatchlist(id: number): Promise<void> {
  // Remove the list's items first, then the list itself (no FK cascade assumed).
  await sql`DELETE FROM watchlist WHERE watchlist_id = ${id}`;
  await sql`DELETE FROM watchlists WHERE id = ${id}`;
}
