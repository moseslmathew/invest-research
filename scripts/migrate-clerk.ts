import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const sql = neon(process.env.DATABASE_URL);

  // 1. Add user_id to watchlists
  await sql`ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS user_id TEXT`;

  // 2. Drop the old unique constraint (market, name)
  await sql`ALTER TABLE watchlists DROP CONSTRAINT IF EXISTS watchlists_market_name_key`;

  // 3. Add the new unique constraint (user_id, market, name)
  // But since we might have existing rows with user_id = null, this can be tricky.
  // For now, let's delete existing watchlists to start fresh since they have no user.
  // The user requested to drop existing anonymous watchlists if needed.
  console.log("Dropping existing watchlists to migrate to user-specific watchlists...");
  await sql`DELETE FROM watchlists WHERE user_id IS NULL`;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS watchlists_user_market_name_key
      ON watchlists (user_id, market, name)
  `;

  console.log("✅ Migration complete: watchlists table now supports user_id.");
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
