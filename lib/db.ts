import { neon } from "@neondatabase/serverless";

export const sql = (() => {
  if (process.env.DATABASE_URL) {
    return neon(process.env.DATABASE_URL);
  }
  if (typeof window === "undefined") {
    console.warn("DATABASE_URL is not set. Copy .env.example to .env and configure Neon database connection details.");
  }
  const mockSql = (async () => []) as any;
  return mockSql;
})();

export type Market = "US" | "IN";

export interface Watchlist {
  id: number;
  user_id: string;
  market: Market;
  name: string;
  item_count: number;
}

export interface WatchlistItem {
  id: number;
  market: Market;
  watchlist_id: number;
  symbol: string;
  name: string | null;
  tier: string | null;
  sector: string | null;
  notes: string | null;
  sort_order: number | null;
  created_at: string;
}
