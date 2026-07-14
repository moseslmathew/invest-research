# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it
privately. **Do not open a public GitHub issue for security problems.**

- Email: moseslmathew@gmail.com
- Please include steps to reproduce, the affected route or component, and the
  potential impact.

You can expect an acknowledgement within a few business days. If the issue is
confirmed, we will work on a fix and coordinate a disclosure timeline with you.

## Scope

This is a Next.js application that proxies public market data and uses
[Clerk](https://clerk.com) for authentication and [Neon](https://neon.tech)
Postgres for storage.

Security-sensitive areas:

- **Authentication / session handling** — Clerk middleware (`middleware.ts`) and
  server actions (`app/actions.ts`).
- **Authorization** — per-user ownership checks in `lib/watchlist.ts`.
- **API routes** (`app/api/*`) — all require an authenticated session and are
  rate limited per user (`lib/api-guard.ts`, `lib/rate-limit.ts`).
- **Secrets** — never commit `.env`. All keys (`DATABASE_URL`,
  `CLERK_SECRET_KEY`, `OPENAI_API_KEY`) are provided via environment variables.

## Best Practices for Deployment

- Keep `CLERK_SECRET_KEY`, `DATABASE_URL`, and `OPENAI_API_KEY` in your host's
  encrypted environment configuration, never in the repository.
- Rotate any key that may have been exposed.
- The in-memory rate limiter is best-effort per instance; for production behind
  multiple instances, consider a shared store (e.g. Redis) if abuse is a concern.
