"use server";

import { revalidatePath } from "next/cache";
import {
  addWatchlistItem,
  createWatchlist,
  deleteWatchlist,
  deleteWatchlistItem,
} from "@/lib/watchlist";
import type { Market } from "@/lib/db";

export type ActionState = { ok: boolean; message?: string };

export async function addItemAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const market = String(formData.get("market") || "") as Market;
  let watchlistId = Number(formData.get("watchlistId"));
  // Fallback: when no list id is supplied (e.g. the AI Stocks list doesn't
  // exist for this market yet), create/get a list by name on the fly.
  const listName = String(formData.get("listName") || "").trim();
  const symbol = String(formData.get("symbol") || "").trim();
  const name = String(formData.get("name") || "").trim();

  if (market !== "US" && market !== "IN") {
    return { ok: false, message: "Invalid market." };
  }
  const hasId = Number.isFinite(watchlistId) && watchlistId > 0;
  if (!hasId && !listName) {
    return { ok: false, message: "Pick or create a watchlist first." };
  }
  if (!symbol) {
    return { ok: false, message: "Please enter a stock symbol." };
  }
  if (symbol.length > 24) {
    return { ok: false, message: "Symbol is too long." };
  }

  try {
    if (!hasId) {
      const list = await createWatchlist(market, listName);
      watchlistId = list.id;
    }
    await addWatchlistItem({ market, watchlistId, symbol, name });
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Could not save. Check your DB connection." };
  }

  revalidatePath("/");
  return { ok: true, message: `${symbol.toUpperCase()} added to watchlist.` };
}

export async function createWatchlistAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const market = String(formData.get("market") || "") as Market;
  const name = String(formData.get("name") || "").trim();

  if (market !== "US" && market !== "IN") {
    return { ok: false, message: "Invalid market." };
  }
  if (!name) {
    return { ok: false, message: "Enter a watchlist name." };
  }
  if (name.length > 40) {
    return { ok: false, message: "Name is too long (max 40 chars)." };
  }

  try {
    await createWatchlist(market, name);
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Could not create watchlist." };
  }

  revalidatePath("/");
  return { ok: true, message: `Watchlist "${name}" created.` };
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    await deleteWatchlistItem(id);
    revalidatePath("/");
  }
}

export async function deleteWatchlistAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (Number.isFinite(id) && id > 0) {
    await deleteWatchlist(id);
    revalidatePath("/");
  }
}
