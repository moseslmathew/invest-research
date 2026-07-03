async function test() {
  const symbol = "MU";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; LuminaResearch/1.0)" }
  });
  const data = await res.json();
  console.log("META:", JSON.stringify(data.chart.result[0].meta, null, 2));
}
test();
