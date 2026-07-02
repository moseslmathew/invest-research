import "dotenv/config";
import { neon } from "@neondatabase/serverless";

// US AI-themed strategic basket. Sector + tier + rationale are stored in `notes`
// since the current schema only has symbol / name / notes.
const STOCKS: {
  symbol: string;
  name: string;
  tier: string;
  sector: string;
  why: string;
  position?: number;
}[] = [
  { symbol: "NVDA", name: "Nvidia", tier: "Tier 1", sector: "Chips", why: "~85% AI training chip share; CUDA software moat is nearly unbreakable short-term" },
  { symbol: "MSFT", name: "Microsoft", tier: "Tier 1", sector: "Cloud", why: "Azure AI + OpenAI; 65%+ Fortune 500 on Azure OpenAI — the enterprise AI gateway" },
  { symbol: "GOOGL", name: "Alphabet (Google)", tier: "Tier 1", sector: "Cloud", why: "Invented the Transformer; owns Gemini, DeepMind, TPUs, and Google Cloud AI" },
  { symbol: "AMAT", name: "Applied Materials", tier: "Tier 1", sector: "Chip Equip", why: "Makes deposition & etch tools that manufacture every AI chip — no AMAT, no GPUs" },
  { symbol: "AMZN", name: "Amazon", tier: "Tier 1", sector: "Cloud", why: "Largest cloud via AWS; Bedrock, Trainium chips, and Anthropic partnership" },
  { symbol: "LRCX", name: "Lam Research", tier: "Tier 1", sector: "Chip Equip", why: "Etch equipment is the gating step for all advanced AI chip nodes — inside every fab" },
  { symbol: "META", name: "Meta Platforms", tier: "Tier 1", sector: "Cloud", why: "Llama open-source models power the open AI ecosystem; 4B+ user AI distribution" },
  { symbol: "MU", name: "Micron Technology", tier: "Tier 2", sector: "Chips", why: "Only US-based HBM3 maker; GPU memory bandwidth is the primary AI throughput bottleneck" },
  { symbol: "AVGO", name: "Broadcom", tier: "Tier 2", sector: "Chips", why: "Custom AI ASICs for Google & Meta; networking silicon; AI revenue doubling in 2026" },
  { symbol: "KLAC", name: "KLA Corporation", tier: "Tier 2", sector: "Chip Equip", why: "Process control & yield inspection at every chip layer — defects kill AI chip economics" },
  { symbol: "ANET", name: "Arista Networks", tier: "Tier 2", sector: "Network", why: "Ethernet fabric connecting GPU clusters; AI networking revenue set to 2× in 2026" },
  { symbol: "AMD", name: "AMD", tier: "Tier 2", sector: "Chips", why: "Primary credible GPU alternative to Nvidia; hyperscalers deploying Instinct MI at scale" },
  { symbol: "MRVL", name: "Marvell Technology", tier: "Tier 2", sector: "Chips", why: "Custom AI silicon & DPUs for hyperscalers; 37% spike on AI networking demand in mid-2026" },
  { symbol: "COHR", name: "Coherent Corp", tier: "Tier 2", sector: "Network", why: "Optical transceivers & co-packaged optics — physical links between GPU nodes at data scale" },
  { symbol: "VRT", name: "Vertiv Holdings", tier: "Tier 2", sector: "Infra/Power", why: "Power & liquid cooling for AI data centers; a genuine infrastructure bottleneck as density rises" },
  { symbol: "INTC", name: "Intel", tier: "Tier 2", sector: "Chips", why: "Gaudi AI accelerators, Xeon AI servers; strategically important even while trailing Nvidia" },
  { symbol: "DELL", name: "Dell Technologies", tier: "Tier 3", sector: "Infra/Power", why: "Largest AI server distribution channel; record AI backlog; key Nvidia Blackwell partner" },
  { symbol: "SMCI", name: "Super Micro Computer", tier: "Tier 3", sector: "Infra/Power", why: "Liquid-cooled GPU-dense racks; direct Nvidia Blackwell partner; front-line AI server maker" },
  { symbol: "CRWV", name: "CoreWeave", tier: "Tier 3", sector: "Infra/Power", why: "Pure-play AI cloud; GPU compute-as-a-service; fastest-growing AI infra company ($5B→$10B)" },
  { symbol: "ORCL", name: "Oracle", tier: "Tier 3", sector: "Cloud", why: "OCI is fastest-growing cloud for AI workloads; massive sovereign AI deals globally" },
  { symbol: "PLTR", name: "Palantir Technologies", tier: "Tier 3", sector: "Defense", why: "AIP platform is the dominant AI layer for military & government; only firm at Pentagon scale" },
  { symbol: "QCOM", name: "Qualcomm", tier: "Tier 3", sector: "Chips", why: "On-device AI in billions of phones, cars, and PCs; edge AI inference at massive global scale" },
  { symbol: "AAPL", name: "Apple", tier: "Tier 3", sector: "Consumer AI", why: "Apple Intelligence on 2B+ devices; Neural Engine chip sets the consumer AI standard" },
  { symbol: "TSLA", name: "Tesla", tier: "Tier 3", sector: "Autonomous", why: "FSD autonomous AI, Optimus humanoid robot, and Dojo supercomputer — autonomous AI bellwether" },
  { symbol: "ETN", name: "Eaton Corporation", tier: "Tier 3", sector: "Infra/Power", why: "Power management & UPS systems; data center power is now a strategic national AI resource" },
  { symbol: "CSCO", name: "Cisco Systems", tier: "Tier 3", sector: "Network", why: "Enterprise networking & security AI; silicon photonics; broad corporate infrastructure reach" },
  { symbol: "CRM", name: "Salesforce", tier: "Tier 4", sector: "Enterprise SW", why: "Einstein AI + Agentforce; largest CRM; how AI gets monetised across enterprise sales & service" },
  { symbol: "NOW", name: "ServiceNow", tier: "Tier 4", sector: "Enterprise SW", why: "AI agents automating enterprise IT workflows; deep penetration of Fortune 500 back-office" },
  { symbol: "IBM", name: "IBM", tier: "Tier 4", sector: "Enterprise SW", why: "Watsonx & Granite models; consulting arm deploys AI into regulated industries at scale" },
  { symbol: "SNOW", name: "Snowflake", tier: "Tier 4", sector: "Enterprise SW", why: "AI data cloud; Cortex AI; where enterprises store and prep training & inference data" },
  { symbol: "DDOG", name: "Datadog", tier: "Tier 4", sector: "Enterprise SW", why: "LLM observability & AIOps; essential for monitoring AI apps running in production" },
  { symbol: "ADBE", name: "Adobe", tier: "Tier 4", sector: "Enterprise SW", why: "Firefly generative AI in industry-standard creative tools; massive professional user base" },
  { symbol: "WDAY", name: "Workday", tier: "Tier 4", sector: "Enterprise SW", why: "AI-powered HR & finance for large enterprises; deep workflow data creates strong AI moat" },
  { symbol: "BAH", name: "Booz Allen Hamilton", tier: "Tier 4", sector: "Defense", why: "Largest US government AI consulting firm; embeds AI into DoD, intelligence agencies, federal" },
  { symbol: "LDOS", name: "Leidos Holdings", tier: "Tier 4", sector: "Defense", why: "AI for national security & C2 systems; multi-billion defence AI contracts across US government" },
  { symbol: "APP", name: "AppLovin", tier: "Tier 4", sector: "Enterprise SW", why: "AXON ML engine rewrote mobile advertising; among the most profitable AI-native companies listed" },
  { symbol: "VST", name: "Vistra Corp", tier: "Tier 4", sector: "Energy 4 AI", why: "Power generation directly contracted by hyperscalers; AI electricity demand makes this strategic" },
  { symbol: "CEG", name: "Constellation Energy", tier: "Tier 4", sector: "Energy 4 AI", why: "Nuclear baseload signed by Microsoft & others for AI data centers; 24/7 clean power supply" },
  { symbol: "ISRG", name: "Intuitive Surgical", tier: "Tier 5", sector: "Healthcare AI", why: "AI-guided da Vinci robotic surgery; dominant in surgical robotics with a deep defensible moat" },
  { symbol: "GEHC", name: "GE HealthCare", tier: "Tier 5", sector: "Healthcare AI", why: "AI in medical imaging & diagnostics; AI-assisted radiology at hospital-system scale" },
  { symbol: "GEV", name: "GE Vernova", tier: "Tier 5", sector: "Energy 4 AI", why: "Grid & turbine infrastructure enabling the power buildout that AI data centers require" },
  { symbol: "SAIC", name: "Science Applications Intl", tier: "Tier 5", sector: "Defense", why: "AI-enabled IT systems across US defence & federal; large recurring government AI contracts" },
  { symbol: "CIEN", name: "Ciena", tier: "Tier 5", sector: "Network", why: "Intelligent optical networking for AI backbone traffic between data centers globally" },
  { symbol: "PATH", name: "UiPath", tier: "Tier 5", sector: "AI-Native", why: "RPA + AI automation platform; large enterprise install base where agentic AI is being layered" },
  { symbol: "UBER", name: "Uber Technologies", tier: "Tier 5", sector: "Autonomous", why: "AI for ride optimization, AV fleet partnerships, and autonomous logistics — major AV deployer" },
  { symbol: "AVAV", name: "AeroVironment", tier: "Tier 5", sector: "Autonomous", why: "AI-guided military drones; defense autonomy is a fast-growing AI category post-2024" },
  { symbol: "SOUN", name: "SoundHound AI", tier: "Tier 5", sector: "Consumer AI", why: "Voice AI platform embedded in automotive & restaurants; leader in conversational edge AI" },
  { symbol: "AI", name: "C3.ai", tier: "Tier 5", sector: "AI-Native", why: "Pure-play enterprise AI software; heavy DoD exposure but revenue growth has been inconsistent" },
  { symbol: "BBAI", name: "BigBear.ai", tier: "Tier 5", sector: "AI-Native", why: "AI decision analytics for defense & border security; growing contract backlog but small scale" },
  { symbol: "NBIS", name: "Nebius Group", tier: "Tier 5", sector: "AI-Native", why: "AI cloud neocloud; Nvidia-backed GPU rental; positioned in the AI compute access market" },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to your .env file.");
  }
  const sql = neon(process.env.DATABASE_URL);

  // Ensure the table exists (mirrors scripts/init-db.ts).
  await sql`
    CREATE TABLE IF NOT EXISTS watchlist (
      id          SERIAL PRIMARY KEY,
      market      TEXT NOT NULL CHECK (market IN ('US', 'IN')),
      symbol      TEXT NOT NULL,
      name        TEXT,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, symbol)
    )
  `;
  // Add the columns introduced for tabular display (safe to re-run).
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS tier TEXT`;
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sector TEXT`;
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS sort_order INTEGER`;
  await sql`ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS watchlist_id INTEGER`;

  // Ensure the US "AI" watchlist exists; this basket seeds into it.
  await sql`
    CREATE TABLE IF NOT EXISTS watchlists (
      id          SERIAL PRIMARY KEY,
      market      TEXT NOT NULL CHECK (market IN ('US', 'IN')),
      name        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (market, name)
    )
  `;
  const [ai] = (await sql`
    INSERT INTO watchlists (market, name)
    VALUES ('US', 'AI')
    ON CONFLICT (market, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `) as { id: number }[];

  let inserted = 0;
  STOCKS.forEach((s, i) => (s.position = i + 1));
  for (const s of STOCKS) {
    const rows = await sql`
      INSERT INTO watchlist (market, watchlist_id, symbol, name, tier, sector, notes, sort_order)
      VALUES ('US', ${ai.id}, ${s.symbol}, ${s.name}, ${s.tier}, ${s.sector}, ${s.why}, ${s.position})
      ON CONFLICT (watchlist_id, symbol) DO UPDATE
        SET name = EXCLUDED.name,
            tier = EXCLUDED.tier,
            sector = EXCLUDED.sector,
            notes = EXCLUDED.notes,
            sort_order = EXCLUDED.sort_order
      RETURNING (xmax = 0) AS is_insert
    `;
    if (rows[0]?.is_insert) inserted++;
  }

  const [{ count }] = (await sql`
    SELECT COUNT(*)::int AS count FROM watchlist WHERE market = 'US'
  `) as { count: number }[];

  console.log(
    `✅ Seed complete. ${inserted} new, ${STOCKS.length - inserted} updated. US watchlist now has ${count} stocks.`
  );
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
