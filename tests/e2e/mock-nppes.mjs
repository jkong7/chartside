import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_NPPES_PORT || 3293);

const PEOPLE = {
  "1234567893": { first: "AVERY", last: "CHEN", credential: "M.D.", taxonomy: "Family Medicine", state: "IL" },
  "1245319599": { first: "DANA", last: "RUIZ", credential: "D.O.", taxonomy: "Internal Medicine", state: "CA" },
  "1588667703": { first: "MORGAN", last: "BLAKE", credential: "LCSW", taxonomy: "Social Worker, Clinical", state: "OR" },
  "1003000126": { first: "SAM", last: "PATEL", credential: "PT", taxonomy: "Physical Therapist", state: "TX" },
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/stats") return res.writeHead(200, { "content-type": "application/json" }).end("{}");
  if (url.pathname === "/api/" || url.pathname === "/api") {
    const n = url.searchParams.get("number") ?? "";
    const p = PEOPLE[n];
    const body = p
      ? { result_count: 1, results: [{ number: n, enumeration_type: "NPI-1", basic: { first_name: p.first, last_name: p.last, credential: p.credential }, taxonomies: [{ desc: p.taxonomy, primary: true, state: p.state }], addresses: [{ address_purpose: "LOCATION", state: p.state }] }] }
      : { result_count: 0, results: [] };
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`mock nppes on ${PORT}`));
