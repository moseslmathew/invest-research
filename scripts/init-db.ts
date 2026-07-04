import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to your .env file.");
  }
  const sql = neon(process.env.DATABASE_URL);

  await sql`
    CREATE TABLE IF NOT EXISTS watchlist (
      id          SERIAL PRIMARY KEY,
      market      TEXT NOT NULL CHECK (market IN ('US', 'IN')),
      symbol      TEXT NOT NULL,
      name        TEXT,
      tier        TEXT,
      sector      TEXT,
      notes       TEXT,
      sort_order  INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, symbol)
    )
  `;
  // Backfill columns on existing tables (safe to re-run).
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS tier TEXT`;
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sector TEXT`;
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sort_order INTEGER`;

  // Daily-refreshed cache of AI-ranked trending stocks, keyed by market.
  await sql`
    CREATE TABLE IF NOT EXISTS trending_cache (
      market      TEXT PRIMARY KEY CHECK (market IN ('US', 'IN')),
      stocks      JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("✅ watchlist + trending_cache tables are ready.");
}

main().catch((err) => {
  console.error("❌ Failed to initialize database:", err);
  process.exit(1);
});
