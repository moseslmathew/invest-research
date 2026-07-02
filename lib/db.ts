import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string."
  );
}

// `sql` is a tagged-template query function backed by Neon's serverless driver.
export const sql = neon(process.env.DATABASE_URL);

export type Market = "US" | "IN";

export interface Watchlist {
  id: number;
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
