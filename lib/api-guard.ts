import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { rateLimit } from "./rate-limit";

// Default budgets. LLM-backed routes pass a tighter limit; cheap data-proxy
// routes can use the default.
const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW_MS = 60_000;

type GuardOptions = {
  limit?: number;
  windowMs?: number;
};

/**
 * Gate an API route behind a signed-in Clerk session and a per-user, per-route
 * fixed-window rate limit. Returns the authenticated `userId` on success, or a
 * ready-to-return `NextResponse` (401/429) that the caller should return as-is.
 *
 * Usage:
 *   const gate = await guardRequest(req, { limit: 20, windowMs: 60_000 });
 *   if (gate instanceof NextResponse) return gate;
 *   const { userId } = gate;
 */
export async function guardRequest(
  req: Request,
  opts: GuardOptions = {}
): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  const limit = opts.limit ?? DEFAULT_LIMIT;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const pathname = new URL(req.url).pathname;
  const allowed = rateLimit(`${userId}:${pathname}`, limit, windowMs);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down and try again shortly." },
      { status: 429 }
    );
  }

  return { userId };
}
