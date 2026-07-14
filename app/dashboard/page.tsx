import Dashboard, { type MarketData } from "../Dashboard";
import { auth } from "@clerk/nextjs/server";
import { getWatchlists, getWatchlistItems } from "@/lib/watchlist";
import type { Market } from "@/lib/db";

export const dynamic = "force-dynamic";

async function loadMarket(market: Market, userId: string | null): Promise<MarketData> {
  if (!userId) {
    return { lists: [], items: {} };
  }
  const lists = await getWatchlists(market, userId);
  const items: MarketData["items"] = {};
  await Promise.all(
    lists.map(async (l) => {
      items[l.id] = await getWatchlistItems(l.id);
    })
  );
  return { lists, items };
}

export default async function DashboardPage() {
  let data: Record<Market, MarketData> = {
    US: { lists: [], items: {} },
    IN: { lists: [], items: {} },
  };

  const { userId } = await auth();

  try {
    const [us, india] = await Promise.all([
      loadMarket("US", userId),
      loadMarket("IN", userId),
    ]);
    data = { US: us, IN: india };
  } catch (err) {
    // DB not configured yet — render empty state instead of crashing.
    console.error("Watchlist fetch failed:", err);
  }

  return <Dashboard data={data} />;
}
