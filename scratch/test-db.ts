import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function getWatchlists(market: string, userId: string) {
  return await sql`
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
}

async function getWatchlistItems(watchlistId: number) {
  return await sql`
    SELECT id, market, watchlist_id, symbol, name, tier, sector, notes,
           sort_order, created_at
    FROM watchlist
    WHERE watchlist_id = ${watchlistId}
    ORDER BY
      CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
      sort_order ASC,
      created_at DESC
  `;
}

async function test() {
  console.log("Loading US market...");
  try {
    const userId = "user_3GS11iAt1Q3wXjsZVVIX26BZ1XB";
    const lists = await getWatchlists("US", userId);
    console.log("Lists loaded:", lists);
    
    for (const list of lists) {
      console.log(`Loading items for list ${list.id}...`);
      const items = await getWatchlistItems(list.id);
      console.log(`Items for list ${list.id}:`, items);
    }
    
    console.log("All done!");
  } catch (err) {
    console.error("Failed:", err);
  }
}

test();
