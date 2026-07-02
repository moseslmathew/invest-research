# Lumina · Investment Research

A modern investment research watchlist for **US** and **India** markets, built with Next.js and Neon Postgres. Add stocks to per-market watchlists, saved in the database. (This first version is watchlist-only — no ticker prices yet.)

## Tech stack

- **Next.js 15** (App Router, Server Actions)
- **React 19**
- **Neon** serverless Postgres (`@neondatabase/serverless`)
- Zero CSS framework — a hand-crafted modern light theme with animated gradient orbs

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the database

Copy the example env file and paste your Neon connection string:

```bash
cp .env.example .env
```

Then edit `.env` and set `DATABASE_URL` to your Neon connection string
(Neon dashboard → **Connection Details** → **Connection string**, include `?sslmode=require`):

```
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require"
```

### 3. Initialize the schema

Creates the `watchlist` table:

```bash
npm run db:init
```

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

## Database schema

```sql
CREATE TABLE watchlist (
  id          SERIAL PRIMARY KEY,
  market      TEXT NOT NULL CHECK (market IN ('US', 'IN')),
  symbol      TEXT NOT NULL,
  name        TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market, symbol)
);
```

## Project structure

```
app/
  layout.tsx       Root layout + animated background
  page.tsx         Server component: fetches both watchlists
  Dashboard.tsx    Client component: market tabs + add form + cards
  actions.ts       Server Actions: add / delete watchlist items
  globals.css      The "wow factor" theme
lib/
  db.ts            Neon client + types
  watchlist.ts     Watchlist queries
scripts/
  init-db.ts       One-time schema setup
```

## Notes

- The app renders gracefully even before `DATABASE_URL` is set — you'll see empty watchlists. Add the connection string and run `npm run db:init` to enable saving.
- Adding a symbol that already exists in a market updates its name/notes instead of erroring (idempotent upsert).
