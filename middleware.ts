import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

// Define protected routes
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api(.*)"]);

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "unknown";
}

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // Let Clerk handle route protection
  if (isProtectedRoute(req)) {
    await auth.protect();
  }

  // Rate limit check for API requests
  const isApi = pathname.startsWith("/api/");
  if (isApi) {
    const ip = clientIp(req);
    if (!rateLimit(`api:${ip}`, 300, 60_000)) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.[\\w]+$|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
