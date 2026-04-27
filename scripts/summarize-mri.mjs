// Summarize per-procedure extraction results into one comparison table per CPT code.
// Reads raw-files/results/*.json produced by extract-mri.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, "..", "raw-files", "results");

// Canonical payer name. Hospitals publish the same insurer with wildly different
// strings (case variants, dba lines, regional suffixes). Mapping them lets a user
// compare "Aetna" rates across hospitals without 14 spelling variants splitting the data.
// This is a starter map; expand as new payer strings show up.
const PAYER_ALIASES = {
  // Aetna
  "aetna": "Aetna",
  "aetna health of california inc.": "Aetna",
  "aetna medicare": "Aetna",
  // Anthem (BCBS-licensed)
  "anthem": "Anthem BCBS",
  "anthem vivity, anthem hmo": "Anthem BCBS",
  "anthem medicare": "Anthem BCBS",
  "blue cross of california, dba anthem blue cross and its affiliates": "Anthem BCBS",
  // Other BCBS
  "blue cross": "Blue Cross Blue Shield",
  "blue shield": "Blue Cross Blue Shield",
  "blue cross blue shield": "Blue Cross Blue Shield",
  "bcbs": "Blue Cross Blue Shield",
  "blue cross blue shield blue precision": "Blue Cross Blue Shield",
  "blue cross blue shield choice": "Blue Cross Blue Shield",
  "blue cross blue shield city of chicago": "Blue Cross Blue Shield",
  "california physicians' service, dba blue shield of california": "Blue Shield of California",
  // Cigna
  "cigna": "Cigna",
  "cigna healthcare of california, inc. and cigna health and life insurance company": "Cigna",
  "evernorth (cigna bh)": "Cigna",
  "cigna one health": "Cigna",
  // UnitedHealthcare
  "united": "UnitedHealthcare",
  "unitedhealthcare": "UnitedHealthcare",
  "united healthcare": "UnitedHealthcare",
  "united healthcare charter": "UnitedHealthcare",
  "united healthcare core navigate": "UnitedHealthcare",
  "united healthcare nexus": "UnitedHealthcare",
  "united bh": "UnitedHealthcare",
  // Humana
  "humana": "Humana",
  "humana military": "Humana Military",
  // Other large names
  "optum": "Optum",
  "optum health": "Optum",
  "oscar": "Oscar",
  "multiplan": "Multiplan",
  "healthsmart": "HealthSmart",
  "three rivers": "Three Rivers",
  "devoted health": "Devoted Health",
  "molina": "Molina",
  "molina healthcare": "Molina",
  "phcs": "Multiplan",
  "private healthcare systems": "Multiplan",
  "first health/coventry": "First Health",
};

function normalizePayer(raw) {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  return PAYER_ALIASES[k] ?? raw.trim();
}

// Payers that exclusively sell Medicare products. The plan name often says
// "All Products" or is otherwise generic, which fools a substring-based bucketer
// into calling these commercial. Hardcoding the carrier identity fixes that.
const MEDICARE_ONLY_PAYERS = new Set([
  "valor",
  "zing health",
  "devoted health",
  "perennial health",
  "scan",
  "alignment health plan",
  "caremore health plan",
  "procare advantage",
  "central health plan",
  "central health plan of california",
  "brandman centers for senior care",
  "concertopace of los angeles, llc",
  "ucla health medicare advantage plan",
  "torrance memorial medicare",
  "redlands community medicare",
  "prime health - medicare",
  "monarch",
]);

function classify(plan = "", payer = "") {
  const payerLow = (payer || "").trim().toLowerCase();
  if (MEDICARE_ONLY_PAYERS.has(payerLow)) return "medicare";
  const s = `${payer} ${plan}`.toLowerCase();
  if (s.includes("medicare") || s.includes("dsnp")) return "medicare";
  if (s.includes("medicaid") || s.includes("medi-cal")) return "medicaid";
  if (s.includes("workers") || s.includes("comp")) return "workers_comp";
  return "commercial";
}

// Drop rows that aren't real per-procedure prices.
// "case rate" = bundled DRG-style rates attributed to many CPTs (cedars's surgical groups).
// "per diem" = inpatient day rate, not a procedure price.
// "other" = catch-all that hospitals use for placeholders (cleveland clinic's $0.01 rows).
const DROP_METHODOLOGIES = new Set(["case rate", "per diem", "other"]);
const MIN_NEGOTIATED = 1; // catches Cleveland Clinic's "0.01" sentinel rows

function rowMethodologyDropped(r) {
  const m = (r.methodology || "").toLowerCase();
  return DROP_METHODOLOGIES.has(m);
}

function hasUsableNegotiated(r) {
  if (!r.negotiated) return false;
  const n = Number(r.negotiated);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n < MIN_NEGOTIATED) return false;
  return true;
}

// Catches sloppy hospital code mappings where one item's price gets attributed
// to a CPT it shouldn't (e.g. cedars labels a PET-scan item with code 71045).
// A real negotiated rate is bounded above by gross. 3x leaves room for unusual
// facility-fee structures while killing 5x-and-up outliers.
const NEGOTIATED_GROSS_RATIO_MAX = 3;
function negotiatedExceedsGross(r) {
  const n = Number(r.negotiated);
  const g = Number(r.gross);
  if (!Number.isFinite(g) || g <= 0) return false;
  return n > NEGOTIATED_GROSS_RATIO_MAX * g;
}

function fmtRange(arr) {
  if (arr.length === 0) return "—".padEnd(22);
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  return `$${min.toFixed(0).padStart(5)}-$${max.toFixed(0).padStart(6)} (n=${arr.length})`.padEnd(22);
}

function fmtPoint(set) {
  if (set.size === 0) return "—      ".padEnd(10);
  const arr = [...set];
  if (arr.length === 1) return `$${arr[0].toFixed(0).padStart(6)}`.padEnd(10);
  return `$${Math.min(...arr).toFixed(0)}-${Math.max(...arr).toFixed(0)}`.padEnd(10);
}

function summarizeProcedure({ code, label, rows }) {
  console.log(`\n${"=".repeat(120)}`);
  console.log(`CPT ${code}  ${label}`);
  console.log(`${rows.length} total rows`);
  console.log("=".repeat(120));

  if (rows.length === 0) {
    console.log("(no matches across hospitals)");
    return;
  }

  const byHospital = {};
  const dropsByReason = {};
  let kept = 0;
  for (const r of rows) {
    const h = r.hospital;
    byHospital[h] ||= { rows: [], cash: new Set(), gross: new Set(), dropped: 0 };
    if (rowMethodologyDropped(r)) {
      byHospital[h].dropped++;
      const reason = `methodology:${(r.methodology || "").toLowerCase()}`;
      dropsByReason[reason] = (dropsByReason[reason] || 0) + 1;
      continue;
    }
    if (hasUsableNegotiated(r) && Number(r.negotiated) < MIN_NEGOTIATED) {
      byHospital[h].dropped++;
      dropsByReason["sentinel_under_$1"] = (dropsByReason["sentinel_under_$1"] || 0) + 1;
      continue;
    }
    if (hasUsableNegotiated(r) && negotiatedExceedsGross(r)) {
      byHospital[h].dropped++;
      dropsByReason["negotiated_>3x_gross"] = (dropsByReason["negotiated_>3x_gross"] || 0) + 1;
      continue;
    }
    byHospital[h].rows.push(r);
    if (r.cash) byHospital[h].cash.add(Number(r.cash));
    if (r.gross) byHospital[h].gross.add(Number(r.gross));
    kept++;
  }

  console.log(`${kept} kept rows after filter (${rows.length - kept} dropped)`);
  const dropParts = Object.entries(dropsByReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${reason}=${n}`);
  if (dropParts.length) console.log(`drops: ${dropParts.join(", ")}`);

  console.log("HOSPITAL                  | GROSS      | CASH       | COMMERCIAL range       | MEDICARE range         | kept | dropped");
  console.log("─".repeat(130));

  for (const [h, d] of Object.entries(byHospital)) {
    const buckets = { commercial: [], medicare: [], medicaid: [], workers_comp: [] };
    for (const r of d.rows) {
      if (!hasUsableNegotiated(r)) continue;
      buckets[classify(r.plan, r.payer)].push(Number(r.negotiated));
    }
    console.log(
      `${h.padEnd(25)} | ${fmtPoint(d.gross)} | ${fmtPoint(d.cash)} | ${fmtRange(buckets.commercial)} | ${fmtRange(buckets.medicare)} | ${String(d.rows.length).padStart(4)} | ${d.dropped}`,
    );
  }

  // Cross-hospital cash spread (the headline number for this thesis).
  const cashByHospital = Object.entries(byHospital)
    .map(([h, d]) => {
      if (d.cash.size === 0) return null;
      return { h, cash: Math.min(...d.cash) };
    })
    .filter(Boolean)
    .sort((a, b) => a.cash - b.cash);

  if (cashByHospital.length >= 2) {
    const lo = cashByHospital[0];
    const hi = cashByHospital[cashByHospital.length - 1];
    const ratio = (hi.cash / lo.cash).toFixed(1);
    console.log(
      `\ncash-pay spread: $${lo.cash.toFixed(0)} (${lo.h}) -> $${hi.cash.toFixed(0)} (${hi.h})  =  ${ratio}x`,
    );
  } else if (cashByHospital.length === 1) {
    console.log(`\ncash-pay: only 1 hospital published a cash rate (${cashByHospital[0].h})`);
  } else {
    console.log(`\ncash-pay: no hospital published a cash rate`);
  }

  // Commercial-rate spread (the other headline).
  const allCommercial = [];
  for (const d of Object.values(byHospital)) {
    for (const r of d.rows) {
      if (!hasUsableNegotiated(r)) continue;
      if (classify(r.plan, r.payer) === "commercial") allCommercial.push(Number(r.negotiated));
    }
  }
  if (allCommercial.length > 0) {
    const min = Math.min(...allCommercial);
    const max = Math.max(...allCommercial);
    const ratio = min > 0 ? (max / min).toFixed(1) : "—";
    console.log(
      `commercial spread: $${min.toFixed(0)} -> $${max.toFixed(0)}  =  ${ratio}x  (n=${allCommercial.length})`,
    );
  }

  // By canonical payer: shows the same insurer's price across hospitals.
  // This is the consumer-facing comparison ("I have Aetna, where's it cheapest?").
  // Only shows commercial bucket; only shows payers that appear at >= 2 hospitals.
  const byPayer = {};
  for (const [h, d] of Object.entries(byHospital)) {
    for (const r of d.rows) {
      if (!hasUsableNegotiated(r)) continue;
      if (classify(r.plan, r.payer) !== "commercial") continue;
      const canon = normalizePayer(r.payer);
      if (!canon) continue;
      byPayer[canon] ||= {};
      byPayer[canon][h] ||= [];
      byPayer[canon][h].push(Number(r.negotiated));
    }
  }
  const multiHospitalPayers = Object.entries(byPayer)
    .filter(([, hospitals]) => Object.keys(hospitals).length >= 2)
    .map(([canon, hospitals]) => {
      const all = Object.values(hospitals).flat();
      return { canon, hospitals, min: Math.min(...all), max: Math.max(...all), n: all.length };
    })
    .sort((a, b) => b.n - a.n);

  if (multiHospitalPayers.length > 0) {
    console.log(`\nBy canonical payer (commercial, payers at >=2 hospitals):`);
    for (const { canon, hospitals, min, max, n } of multiHospitalPayers.slice(0, 6)) {
      const ratio = min > 0 ? (max / min).toFixed(1) : "—";
      console.log(`  ${canon.padEnd(28)} $${min.toFixed(0).padStart(5)} -> $${max.toFixed(0).padStart(6)}  =  ${ratio}x  across ${Object.keys(hospitals).length} hospitals (n=${n})`);
      const perHosp = Object.entries(hospitals)
        .map(([h, vals]) => `${h}:$${Math.min(...vals).toFixed(0)}-${Math.max(...vals).toFixed(0)}`)
        .join("  ");
      console.log(`    ${perHosp}`);
    }
  }
}

function main() {
  if (!fs.existsSync(RESULTS_DIR)) {
    console.error(`No results directory at ${RESULTS_DIR}. Run extract-mri.mjs first.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.error(`No result files in ${RESULTS_DIR}. Run extract-mri.mjs first.`);
    process.exit(1);
  }

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), "utf8"));
    summarizeProcedure(data);
  }
}

main();
