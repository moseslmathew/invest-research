import { GET } from "../app/api/trending/route";

async function testApi() {
  const req = new Request("http://localhost:3000/api/trending?market=US");
  const res = await GET(req);
  console.log("STATUS:", res.status);
  const data = await res.json();
  console.log("DATA:", JSON.stringify(data, null, 2));
}
testApi();
