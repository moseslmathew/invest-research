const { neon } = require("@neondatabase/serverless");
const fs = require("fs");
const dotenv = require("dotenv");

if (fs.existsSync(".env")) {
  const envConfig = dotenv.parse(fs.readFileSync(".env"));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const sql = neon(process.env.DATABASE_URL);

async function check() {
  try {
    const watchlists = await sql`SELECT * FROM watchlists`;
    console.log("WATCHLISTS:");
    console.log(watchlists);

    const items = await sql`SELECT * FROM watchlist`;
    console.log("\nWATCHLIST ITEMS:");
    console.log(items);
  } catch (err) {
    console.error(err);
  }
}

check();
