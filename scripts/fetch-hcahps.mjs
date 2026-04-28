// Fetch CMS HCAHPS (Patient Survey) data for our hospital set.
//
// HCAHPS = Hospital Consumer Assessment of Healthcare Providers and Systems.
// CMS standardized patient survey covering communication, cleanliness,
// pain management, recommendation rate, and overall experience.
//
// The full national CSV is ~105 MB and ~325K rows (each hospital has
// ~30 measure rows). We download it, filter to the CCNs we already
// matched in fetch-cms-ratings.mjs, extract 9 high-signal measures,
// compute network-wide benchmarks, and write the result to
// ui/hcahps.real.js for the build pipeline.
//
// Run:  node scripts/fetch-hcahps.mjs
// Refresh cadence: monthly (CMS publishes quarterly, but their dataset
// modification dates are roughly monthly).

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const UI_DIR = path.join(REPO, "ui");
const RAW_DIR = path.join(REPO, "raw-files");
const HCAHPS_RAW = path.join(RAW_DIR, "HCAHPS-Hospital.csv");
const RATINGS_FILE = path.join(UI_DIR, "ratings.real.js");
const OUT_FILE = path.join(UI_DIR, "hcahps.real.js");

const HCAHPS_DATASET_API = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items/dgck-syfz";

// The 9 measures we surface on the site. Keys are HCAHPS measure IDs from
// the CSV; values are friendly labels and the type of value to extract.
//
// "pct" measures use the HCAHPS Answer Percent column (top-box "Always" or
// "Yes" responses). "stars" measures use Patient Survey Star Rating.
const MEASURES = [
  { id: "H_STAR_RATING",     label: "HCAHPS overall star rating", short: "overall_stars",        kind: "stars" },
  { id: "H_RECMND_DY",       label: "Would definitely recommend", short: "would_recommend_pct",  kind: "pct"   },
  { id: "H_HSP_RATING_9_10", label: "Hospital rating 9 or 10 of 10", short: "rating_9_10_pct",   kind: "pct"   },
  { id: "H_COMP_1_A_P",      label: "Nurses always communicated well", short: "nurse_comm_pct",  kind: "pct"   },
  { id: "H_COMP_2_A_P",      label: "Doctors always communicated well", short: "doctor_comm_pct", kind: "pct"  },
  { id: "H_COMP_6_Y_P",      label: "Given clear info about recovery", short: "recovery_info_pct", kind: "pct" },
  { id: "H_CLEAN_HSP_A_P",   label: "Room and bathroom always clean", short: "clean_pct",        kind: "pct"   },
  { id: "H_COMP_5_A_P",      label: "Staff always explained meds", short: "med_explain_pct",     kind: "pct"   },
  { id: "H_QUIET_HSP_A_P",   label: "Quiet at night, always",       short: "quiet_pct",          kind: "pct"   },
];

// ── Helpers ─────────────────────────────────────────────────────────────

async function fetchHcahpsDownloadUrl() {
  const r = await fetch(HCAHPS_DATASET_API);
  if (!r.ok) throw new Error(`HCAHPS metadata fetch failed: ${r.status}`);
  const j = await r.json();
  const dist = (j.distribution || []).find((d) => d.mediaType === "text/csv" || /\.csv/i.test(d.downloadURL || ""));
  if (!dist || !dist.downloadURL) throw new Error("No CSV distribution in HCAHPS metadata");
  return { url: dist.downloadURL, modified: j.modified || j.released };
}

async function downloadIfMissing(url) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  if (fs.existsSync(HCAHPS_RAW)) {
    const ageDays = (Date.now() - fs.statSync(HCAHPS_RAW).mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < 25) {
      console.log(`HCAHPS CSV cache hit (${ageDays.toFixed(1)} days old): ${HCAHPS_RAW}`);
      return;
    }
    console.log(`HCAHPS CSV stale (${ageDays.toFixed(0)} days), refreshing...`);
  }
  console.log(`Downloading HCAHPS CSV from ${url}`);
  const r = await fetch(url);
  if (!r.ok || !r.body) throw new Error(`HCAHPS download failed: ${r.status}`);
  const out = fs.createWriteStream(HCAHPS_RAW);
  await pipeline(r.body, out);
  console.log(`Wrote ${HCAHPS_RAW} (${(fs.statSync(HCAHPS_RAW).size / 1024 / 1024).toFixed(1)} MB)`);
}

// Naive CSV row parser tolerant of quoted commas (HCAHPS rows have quoted
// strings with commas inside them).
function parseRow(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      // Handle "" (escaped quote) inside a quoted field.
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === "," && !q) {
      out.push(cur); cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

// Build a CCN -> {measure_short: value} map by streaming the CSV.
async function loadCcnMeasures(ccnSet) {
  const measureById = Object.fromEntries(MEASURES.map((m) => [m.id, m]));
  const out = new Map();
  let headerCols = null;
  let idxId, idxMeasure, idxPct, idxStars, idxN, idxStart, idxEnd;

  const stream = fs.createReadStream(HCAHPS_RAW, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (lineNo === 1) {
      headerCols = parseRow(line);
      idxId = headerCols.indexOf("Facility ID");
      idxMeasure = headerCols.indexOf("HCAHPS Measure ID");
      idxPct = headerCols.indexOf("HCAHPS Answer Percent");
      idxStars = headerCols.indexOf("Patient Survey Star Rating");
      idxN = headerCols.indexOf("Number of Completed Surveys");
      idxStart = headerCols.indexOf("Start Date");
      idxEnd = headerCols.indexOf("End Date");
      if ([idxId, idxMeasure, idxPct, idxStars].some((x) => x < 0)) {
        throw new Error("Unexpected HCAHPS header columns: " + JSON.stringify(headerCols));
      }
      continue;
    }
    const f = parseRow(line);
    const ccn = f[idxId];
    if (!ccnSet.has(ccn)) continue;
    const measure = f[idxMeasure];
    const m = measureById[measure];
    if (!m) continue;
    const valueRaw = m.kind === "stars" ? f[idxStars] : f[idxPct];
    let value = null;
    if (valueRaw && valueRaw !== "Not Applicable" && valueRaw !== "Not Available") {
      const n = Number(valueRaw);
      value = Number.isFinite(n) ? n : null;
    }
    if (!out.has(ccn)) {
      out.set(ccn, {
        sample_size: Number(f[idxN]) || null,
        period_start: f[idxStart] || null,
        period_end: f[idxEnd] || null,
        measures: {},
      });
    }
    out.get(ccn).measures[m.short] = value;
  }
  return out;
}

// Load the existing ratings.real.js so we can map our hospital ids -> CCNs.
function loadHospitalCcnMap() {
  const txt = fs.readFileSync(RATINGS_FILE, "utf8");
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function("window", txt)(sandbox.window);
  const r = sandbox.window.ITEMIZED_RATINGS;
  const map = new Map(); // hospital id -> ccn
  for (const [hid, row] of Object.entries(r.ratings || {})) {
    if (row && row.matched && row.cms_facility_id) {
      map.set(hid, String(row.cms_facility_id));
    }
  }
  return map;
}

// Compute network benchmarks (mean, count) per measure across hospitals
// that have a value. Only counts hospitals with measure-level values.
function computeBenchmarks(byHospital) {
  const sums = {};
  const counts = {};
  for (const m of MEASURES) {
    sums[m.short] = 0;
    counts[m.short] = 0;
  }
  for (const data of byHospital.values()) {
    for (const m of MEASURES) {
      const v = data.measures[m.short];
      if (Number.isFinite(v)) {
        sums[m.short] += v;
        counts[m.short]++;
      }
    }
  }
  const benchmarks = {};
  for (const m of MEASURES) {
    if (counts[m.short] > 0) {
      benchmarks[m.short] = {
        mean: Math.round((sums[m.short] / counts[m.short]) * 10) / 10,
        n: counts[m.short],
      };
    } else {
      benchmarks[m.short] = { mean: null, n: 0 };
    }
  }
  return benchmarks;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { url, modified } = await fetchHcahpsDownloadUrl();
  await downloadIfMissing(url);

  const idToCcn = loadHospitalCcnMap();
  const ccnSet = new Set(idToCcn.values());
  console.log(`Filtering HCAHPS to ${ccnSet.size} matched CCNs...`);

  const byCcn = await loadCcnMeasures(ccnSet);

  // Re-key from CCN to our hospital id.
  const byHospital = new Map();
  for (const [hid, ccn] of idToCcn) {
    if (byCcn.has(ccn)) byHospital.set(hid, byCcn.get(ccn));
  }

  const benchmarks = computeBenchmarks(byHospital);
  const matched = byHospital.size;
  console.log(`HCAHPS matched: ${matched} / ${ccnSet.size} hospitals`);
  console.log(`Network benchmarks (mean values):`);
  for (const m of MEASURES) {
    const b = benchmarks[m.short];
    console.log(`  ${m.short.padEnd(22)} ${b.mean ?? "—"}${m.kind === "pct" ? "%" : ""} (n=${b.n})`);
  }

  // Build the JS file. Same shape pattern as ratings.real.js so the build
  // can load it the same way.
  const out = {
    as_of: new Date().toISOString().slice(0, 10),
    source: "CMS HCAHPS (dataset dgck-syfz)",
    period: byHospital.size
      ? Object.values(Object.fromEntries(byHospital))[0]?.period_end || null
      : null,
    measures: MEASURES.map(({ id, label, short, kind }) => ({ id, label, short, kind })),
    benchmarks,
    hospitals: Object.fromEntries(byHospital),
  };
  const js = `// Generated by scripts/fetch-hcahps.mjs from CMS dataset dgck-syfz.\n// Last refreshed: ${out.as_of}.\nwindow.ITEMIZED_HCAHPS = ${JSON.stringify(out, null, 2)};\n`;
  fs.writeFileSync(OUT_FILE, js);
  console.log(`Wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
