import "dotenv/config";
import { neon } from "@neondatabase/serverless";

/**
 * Introduces named watchlists within each market.
 *
 * - Creates a `watchlists` table (id, market, name).
 * - Adds `watchlist_id` to the existing `watchlist` items table.
 * - Backfills: any US items not yet assigned go into a US "AI" watchlist.
 *
 * Safe to re-run.
 */
async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to your .env file.");
  }
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS watchlists (
      id          SERIAL PRIMARY KEY,
      market      TEXT NOT NULL CHECK (market IN ('US', 'IN')),
      name        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, name)
    )
  `;

  await sql`
    ALTER TABLE watchlist
      ADD COLUMN IF NOT EXISTS watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE
  `;

  // The old UNIQUE(market, symbol) blocks the same symbol living in two
  // watchlists. Scope uniqueness to the watchlist instead.
  await sql`ALTER TABLE watchlist DROP CONSTRAINT IF EXISTS watchlist_market_symbol_key`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS watchlist_list_symbol_key
      ON watchlist (watchlist_id, symbol)
  `;

  // Ensure a US "AI" watchlist exists and grab its id.
  const [ai] = (await sql`
    INSERT INTO watchlists (market, name)
    VALUES ('US', 'AI')
    ON CONFLICT (market, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `) as { id: number }[];

  // Backfill: any US items with no watchlist go into AI.
  const assigned = (await sql`
    UPDATE watchlist
      SET watchlist_id = ${ai.id}
    WHERE market = 'US' AND watchlist_id IS NULL
    RETURNING id
  `) as { id: number }[];

  console.log(
    `✅ Migration complete. US "AI" watchlist id=${ai.id}; ${assigned.length} item(s) assigned.`
  );
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
