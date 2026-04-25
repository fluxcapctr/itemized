// Summarize the 73721 results into a consumer-facing comparison.
import fs from "node:fs";

const data = JSON.parse(
  fs.readFileSync(
    "/Users/superhenri/Research/hospital-mrfs/raw-files/mri-73721-results.json",
    "utf8",
  ),
);

console.log(`Total rows: ${data.length}\n`);

// Group by hospital, then by category (commercial / medicare / medicaid / cash / gross)
const byHospital = {};
for (const r of data) {
  const h = r.hospital;
  byHospital[h] ||= { rows: [], cash: new Set(), gross: new Set() };
  byHospital[h].rows.push(r);
  if (r.cash) byHospital[h].cash.add(Number(r.cash));
  if (r.gross) byHospital[h].gross.add(Number(r.gross));
}

function classify(plan = "", payer = "") {
  const s = `${payer} ${plan}`.toLowerCase();
  if (s.includes("medicare")) return "medicare";
  if (s.includes("medicaid") || s.includes("medi-cal")) return "medicaid";
  if (s.includes("workers") || s.includes("comp")) return "workers_comp";
  return "commercial";
}

console.log("HOSPITAL                  | GROSS   | CASH    | COMM range          | MEDICARE range      | rows");
console.log("─".repeat(115));

for (const [h, d] of Object.entries(byHospital)) {
  const buckets = { commercial: [], medicare: [], medicaid: [], workers_comp: [] };
  for (const r of d.rows) {
    if (!r.negotiated) continue;
    const n = Number(r.negotiated);
    if (!Number.isFinite(n) || n <= 0) continue;
    const c = classify(r.plan, r.payer);
    buckets[c].push(n);
  }
  const fmtRange = (arr) =>
    arr.length === 0
      ? "—".padEnd(20)
      : `$${Math.min(...arr).toFixed(0).padStart(5)}-$${Math.max(...arr)
          .toFixed(0)
          .padStart(6)} (n=${arr.length})`.padEnd(20);
  const fmt$ = (set) => {
    if (set.size === 0) return "—      ";
    const arr = [...set];
    if (arr.length === 1) return `$${arr[0].toFixed(0).padStart(6)}`;
    return `$${Math.min(...arr).toFixed(0)}-${Math.max(...arr).toFixed(0)}`.padEnd(8);
  };
  console.log(
    `${h.padEnd(25)} | ${fmt$(d.gross)} | ${fmt$(d.cash)} | ${fmtRange(buckets.commercial)} | ${fmtRange(buckets.medicare)} | ${d.rows.length}`,
  );
}

console.log("\n=== Commercial plan detail (knee/joint MRI w/o contrast) ===\n");
const commercialOnly = data
  .filter((r) => {
    if (!r.negotiated) return false;
    const c = classify(r.plan, r.payer);
    return c === "commercial";
  })
  .sort((a, b) => Number(a.negotiated) - Number(b.negotiated));

console.log("HOSPITAL                  | PAYER                       | PLAN                                | $$$");
console.log("─".repeat(115));
const seen = new Set();
for (const r of commercialOnly) {
  const key = `${r.hospital}|${r.payer}|${r.plan}|${r.negotiated}`;
  if (seen.has(key)) continue;
  seen.add(key);
  if (seen.size > 40) break;
  console.log(
    `${(r.hospital || "").padEnd(25)} | ${(r.payer || "").slice(0, 27).padEnd(27)} | ${(r.plan || "").slice(0, 35).padEnd(35)} | $${Number(r.negotiated).toFixed(2)}`,
  );
}
console.log(`\n(${seen.size} unique commercial price points shown above; ${commercialOnly.length} total commercial rows)`);
