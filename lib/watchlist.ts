import { sql, type Market, type Watchlist, type WatchlistItem } from "./db";

export async function getWatchlists(market: Market, userId: string): Promise<Watchlist[]> {
  const rows = await sql`
    SELECT
      w.id,
      w.user_id,
      w.market,
      w.name,
      COUNT(i.id)::int AS item_count
    FROM watchlists w
    LEFT JOIN watchlist i ON i.watchlist_id = w.id
    WHERE w.market = ${market} AND w.user_id = ${userId}
    GROUP BY w.id, w.user_id, w.market, w.name, w.created_at
    ORDER BY w.created_at ASC
  `;
  if (rows.length === 0) {
    const defaultList = await createWatchlist(market, "Watchlist", userId);
    return [defaultList];
  }
  return rows as Watchlist[];
}

export async function createWatchlist(
  market: Market,
  name: string,
  userId: string
): Promise<Watchlist> {
  const rows = await sql`
    INSERT INTO watchlists (user_id, market, name)
    VALUES (${userId}, ${market}, ${name.trim()})
    ON CONFLICT (user_id, market, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id, user_id, market, name, 0 AS item_count
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
  userId: string;
  symbol: string;
  name?: string | null;
  notes?: string | null;
}): Promise<WatchlistItem> {
  const symbol = input.symbol.trim().toUpperCase();
  const name = input.name?.trim() || null;
  const notes = input.notes?.trim() || null;

  // Ensure the user owns this watchlist
  const ownerCheck = await sql`SELECT id FROM watchlists WHERE id = ${input.watchlistId} AND user_id = ${input.userId}`;
  if (ownerCheck.length === 0) {
    throw new Error("Unauthorized to add item to this watchlist.");
  }

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

export async function deleteWatchlistItem(id: number, userId: string): Promise<void> {
  // Ensure the item belongs to a watchlist owned by the user
  await sql`
    DELETE FROM watchlist 
    WHERE id = ${id} 
    AND watchlist_id IN (SELECT id FROM watchlists WHERE user_id = ${userId})
  `;
}

export async function deleteWatchlist(id: number, userId: string): Promise<void> {
  // Check ownership first
  const ownerCheck = await sql`SELECT id FROM watchlists WHERE id = ${id} AND user_id = ${userId}`;
  if (ownerCheck.length === 0) return;

  // Remove the list's items first, then the list itself (no FK cascade assumed).
  await sql`DELETE FROM watchlist WHERE watchlist_id = ${id}`;
  await sql`DELETE FROM watchlists WHERE id = ${id}`;
}
