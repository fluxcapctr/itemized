#!/usr/bin/env node
// Wire up 12 LA-area community hospitals from the round-5 research pass.
// Idempotent: re-running is safe (skips entries that already exist).
//
// Run direct:           node scripts/wire-la-gap.mjs
// Run with logging:     node scripts/wire-la-gap.mjs > /tmp/la-gap-fill.log 2>&1
// Schedule via launchd: see scripts/wire-la-gap.plist.template

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "raw-files"); // symlink to external SSD
const REPORT_FILE = "/tmp/la-gap-fill-report.md";

const log = (msg) => console.log(`[wire-la-gap] ${new Date().toISOString()} ${msg}`);

// ─── Hospital registry for round 5 ─────────────────────────────────────────
// `format` drives which extractor + which file extension on disk:
//   tall:    standard CMS v3 tall CSV → extract-mri.mjs / processCSV
//   wide:    AHMC-style wide CSV (column per payer) → extract-mri-wide.mjs
//   json:    nested JSON v3 → extract-mri.mjs / processJSON
const HOSPITALS = [
  { id: "whittier-hospital", name: "Whittier Hospital Medical Center", url: "https://www.ahmchealth.com/docs/2026_PricingTransparency-Whittier_Hosp-3256-20260317233544.csv", ext: "csv", format: "wide", meta: { name: "Whittier Hospital Medical Center", metro: "Whittier, CA", is_local: true, system: "AHMC Healthcare" }, lookup: { state: "CA", nameMatch: ["WHITTIER HOSPITAL MEDICAL CENTER"] } },
  { id: "san-gabriel-valley-mc", name: "San Gabriel Valley Medical Center", url: "https://www.ahmchealth.com/docs/PricingTransparency-San_Gabriel_Valley_Medical_Center-3324-20260326210352.csv", ext: "csv", format: "wide", meta: { name: "San Gabriel Valley Medical Center", metro: "San Gabriel, CA", is_local: true, system: "AHMC Healthcare" }, lookup: { state: "CA", nameMatch: ["SAN GABRIEL VALLEY MEDICAL CENTER"] } },
  { id: "garfield-medical-center", name: "Garfield Medical Center", url: "https://www.ahmchealth.com/docs/PricingTransparency-Garfield_Medical_Ctr-3221-20260312022710_20260317_final.csv", ext: "csv", format: "wide", meta: { name: "Garfield Medical Center", metro: "Monterey Park, CA", is_local: true, system: "AHMC Healthcare" }, lookup: { state: "CA", nameMatch: ["GARFIELD MEDICAL CENTER"] } },
  { id: "greater-el-monte", name: "Greater El Monte Community Hospital", url: "https://www.ahmchealth.com/docs/PricingTransparency-Greater_El_Monte_Community_Hosp-2026.csv", ext: "csv", format: "wide", meta: { name: "Greater El Monte Community Hospital", metro: "South El Monte, CA", is_local: true, system: "AHMC Healthcare" }, lookup: { state: "CA", nameMatch: ["GREATER EL MONTE COMMUNITY HOSPITAL"] } },
  { id: "monterey-park-hospital", name: "Monterey Park Hospital", url: "https://www.ahmchealth.com/docs/PricingTransparencyMPH.csv", ext: "csv", format: "wide", meta: { name: "Monterey Park Hospital", metro: "Monterey Park, CA", is_local: true, system: "AHMC Healthcare" }, lookup: { state: "CA", nameMatch: ["MONTEREY PARK HOSPITAL"] } },
  { id: "providence-tarzana", name: "Providence Cedars-Sinai Tarzana Medical Center", url: "https://pricetransparency.providence.org/socal/live/833972614_providence-cedars-sinai-tarzana-medical-center_standardcharges.json", ext: "json", format: "json", meta: { name: "Providence Cedars-Sinai Tarzana Medical Center", metro: "Tarzana, CA", is_local: true, system: "Providence" }, lookup: { state: "CA", nameMatch: ["PROVIDENCE CEDARS SINAI TARZANA", "PROVIDENCE TARZANA"] } },
  { id: "long-beach-memorial", name: "MemorialCare Long Beach Medical Center", url: "https://www.memorialcare.org/sites/default/files/_images/content/Patient-Financial-Services/953527031-1477596583_long-beach-memorial-medical-center_standardcharges.json", ext: "json", format: "json", meta: { name: "MemorialCare Long Beach Medical Center", metro: "Long Beach, CA", is_local: true, system: "MemorialCare" }, lookup: { state: "CA", cityContains: "LONG BEACH", nameMatch: ["LONG BEACH MEMORIAL MEDICAL CENTER", "MEMORIALCARE LONG BEACH"] } },
  { id: "miller-childrens", name: "MemorialCare Miller Children's & Women's Hospital", url: "https://www.memorialcare.org/sites/default/files/_images/content/Patient-Financial-Services/953527031-1962442012_memorialcare-miller-children-_s-%26-women-_s-hospital-long-beach_standardcharges.json", ext: "json", format: "json", meta: { name: "MemorialCare Miller Children's & Women's Hospital", metro: "Long Beach, CA", is_local: true, system: "MemorialCare", is_pediatric: true }, lookup: { state: "CA", cityContains: "LONG BEACH", nameMatch: ["MILLER CHILDREN", "MEMORIAL CARE MILLER"] } },
  { id: "coast-plaza", name: "Coast Plaza Hospital (Pipeline Health)", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/8428/760594558-1063412005_pipeline-health-system-holdings,-llc_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Coast Plaza Hospital", metro: "Norwalk, CA", is_local: true, system: "Pipeline Health" }, lookup: { state: "CA", cityContains: "NORWALK", nameMatch: ["COAST PLAZA HOSPITAL", "COAST PLAZA DOCTORS HOSPITAL"] } },
  { id: "adventist-white-memorial-montebello", name: "Adventist Health White Memorial Montebello", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbAHWMLOSANGELESCA&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Adventist Health White Memorial Montebello", metro: "Montebello, CA", is_local: true, system: "Adventist Health" }, lookup: { state: "CA", cityContains: "MONTEBELLO", nameMatch: ["WHITE MEMORIAL", "ADVENTIST HEALTH WHITE MEMORIAL"] } },
  { id: "adventist-glendale", name: "Adventist Health Glendale", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbGAMCGLENDALECA&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Adventist Health Glendale", metro: "Glendale, CA", is_local: true, system: "Adventist Health" }, lookup: { state: "CA", nameMatch: ["ADVENTIST HEALTH GLENDALE", "GLENDALE ADVENTIST"] } },
  { id: "adventist-simi-valley", name: "Adventist Health Simi Valley", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbAHSVSIMIVALLEYCA&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Adventist Health Simi Valley", metro: "Simi Valley, CA", is_local: true, system: "Adventist Health" }, lookup: { state: "CA", cityContains: "SIMI", nameMatch: ["SIMI VALLEY ADVENTIST", "ADVENTIST HEALTH SIMI"] } },
  // ── Hospital-licensed outpatient/specialty (ASC-flavored) — under the CMS HPT rule
  // because they're hospital-licensed, but operate like surgery centers / specialty
  // outpatient facilities. Only including the 2 with verified direct MRF URLs
  // tonight; Casa Colina (PARA portal scrape), Memorial Hospital of Gardena and
  // East LA Doctors (cms-hpt.txt redirects) need manual URL resolution next session.
  { id: "hoag-orthopedic-institute", name: "Hoag Orthopedic Institute", url: "https://www.hoagorthopedicinstitute.com/documents/611588294_hoag-orthopedic-institute_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Hoag Orthopedic Institute", metro: "Newport Beach, CA", is_local: true, system: "Hoag" }, lookup: { state: "CA", nameMatch: ["HOAG ORTHOPEDIC INSTITUTE"] } },
  { id: "south-coast-global-mc", name: "South Coast Global Medical Center", url: "https://www.southcoastglobalmedicalcenter.com/wp-content/uploads/2026/04/550883863_south-coast-global-medical-center_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "South Coast Global Medical Center", metro: "Santa Ana, CA", is_local: true, system: "South Coast Global" }, lookup: { state: "CA", cityContains: "SANTA ANA", nameMatch: ["SOUTH COAST GLOBAL MEDICAL CENTER"] } },
];

// ─── Edit helpers ──────────────────────────────────────────────────────────
// Each function is idempotent: it checks for the entry's id substring before
// inserting, and is a no-op if already present.

function injectBefore(file, anchor, block, label) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes(label)) {
    log(`  ${path.basename(file)}: section "${label}" already present, skipping`);
    return;
  }
  const idx = src.indexOf(anchor);
  if (idx === -1) {
    throw new Error(`anchor not found in ${file}: ${anchor}`);
  }
  const next = src.slice(0, idx) + block + src.slice(idx);
  fs.writeFileSync(file, next);
  log(`  wrote section "${label}" to ${path.basename(file)}`);
}

// download-mrfs.mjs — append before the closing `];` of HOSPITALS array.
function patchDownloader() {
  const file = path.join(ROOT, "scripts/download-mrfs.mjs");
  const lines = HOSPITALS.map(
    (h) => `  { id: "${h.id}", name: "${h.name.replace(/"/g, '\\"')}", url: "${h.url}", ext: "${h.ext}" },`,
  ).join("\n");
  const block = `  // ── Round 5: LA gap fill (community hospitals via AHMC, MemorialCare, Pipeline, Adventist) ─\n${lines}\n`;
  injectBefore(file, "\n];", block, "Round 5: LA gap fill");
}

// extract-mri.mjs — JSON + tall CSV hospitals get processIfExists / processZipped calls
// near the end of main(), before the Mass General zip block.
function patchTallExtractor() {
  const file = path.join(ROOT, "scripts/extract-mri.mjs");
  const tallAndJson = HOSPITALS.filter((h) => h.format !== "wide");
  const lines = tallAndJson
    .map((h) => {
      if (h.format === "json") {
        return `  await processIfExists("${h.id}", path.join(RAW_DIR, "${h.id}.json"), processJSON);`;
      }
      // tall — could be zip-as-csv. The post-download step renames those to .zip,
      // so we use processZipped for tall files that may turn out to be zips.
      // For Para HCFS portal URLs, processZipped handles either case (file exists
      // as .zip → unzip, otherwise no-op and processCSV runs on .csv).
      return `  if (fs.existsSync(path.join(RAW_DIR, "${h.id}.zip"))) {\n    await processZipped("${h.id}", "csv");\n  } else {\n    await processIfExists("${h.id}", path.join(RAW_DIR, "${h.id}.csv"), processCSV);\n  }`;
    })
    .join("\n");
  const block = `\n  // ── Round 5: LA gap fill ─────────────────────────────────────────────\n${lines}\n`;
  injectBefore(file, "  // Mass General zip is unpacked manually", block, "Round 5: LA gap fill");
}

// extract-mri-wide.mjs — wide-format hospitals get added to HOSPITALS array.
function patchWideExtractor() {
  const file = path.join(ROOT, "scripts/extract-mri-wide.mjs");
  const wide = HOSPITALS.filter((h) => h.format === "wide");
  const lines = wide
    .map((h) => `    { id: "${h.id}", path: path.join(RAW_DIR, "${h.id}.csv") },`)
    .join("\n");
  const block = `    // Round 5: LA gap fill (AHMC system)\n${lines}\n`;
  injectBefore(file, "  ];", block, "Round 5: LA gap fill");
}

// build-ui-data.mjs — HOSPITAL_META gets the meta blocks.
function patchUIBuilder() {
  const file = path.join(ROOT, "scripts/build-ui-data.mjs");
  const lines = HOSPITALS.map((h) => {
    const flags = Object.entries(h.meta)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v.replace(/"/g, '\\"')}"` : v}`)
      .join(", ");
    return `  "${h.id}": { ${flags} },`;
  }).join("\n");
  const block = `  // ── Round 5: LA gap fill ─────────────────────────────────────────────\n${lines}\n`;
  injectBefore(file, "};\n\n// Geocode each hospital", block, "Round 5: LA gap fill");
}

// fetch-cms-ratings.mjs — HOSPITAL_LOOKUPS gets new lookups.
function patchRatings() {
  const file = path.join(ROOT, "scripts/fetch-cms-ratings.mjs");
  const lines = HOSPITALS.map((h) => {
    const l = h.lookup;
    const parts = [`id: "${h.id}"`, `state: "${l.state}"`];
    if (l.cityContains) parts.push(`cityContains: "${l.cityContains}"`);
    parts.push(`nameMatch: [${l.nameMatch.map((n) => `"${n}"`).join(", ")}]`);
    return `  { ${parts.join(", ")} },`;
  }).join("\n");
  const block = `  // ── Round 5: LA gap fill ─────────────────────────────────────────────\n${lines}\n`;
  injectBefore(file, "];\n", block, "Round 5: LA gap fill");
}

// ─── Pipeline runners ──────────────────────────────────────────────────────
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  return r.status === 0;
}

function detectFormat(filePath) {
  const r = spawnSync("file", [filePath], { encoding: "utf8" });
  return r.stdout || "";
}

function renameZipDisguised() {
  // For the new hospitals, check if the .csv is actually a zip and rename.
  for (const h of HOSPITALS) {
    if (h.ext !== "csv") continue;
    const csv = path.join(RAW_DIR, `${h.id}.csv`);
    if (!fs.existsSync(csv)) continue;
    const desc = detectFormat(csv);
    if (desc.includes("Zip archive")) {
      const zipPath = path.join(RAW_DIR, `${h.id}.zip`);
      fs.renameSync(csv, zipPath);
      log(`  renamed ${h.id}.csv → ${h.id}.zip (zip-as-csv detected)`);
    }
  }
}

// ─── Status report ─────────────────────────────────────────────────────────
function checkProcedureCoverage(cpt) {
  const file = path.join(RAW_DIR, "results", `${cpt}.json`);
  if (!fs.existsSync(file)) return new Set();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const hospitals = new Set();
  for (const r of data.rows) hospitals.add(r.hospital);
  return hospitals;
}

function checkRatings() {
  const file = path.join(RAW_DIR, "ratings.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeReport(steps) {
  const knee = checkProcedureCoverage("73721");
  const ratings = checkRatings();
  const newOnes = HOSPITALS.map((h) => {
    const hadKnee = knee.has(h.id);
    const rating = ratings.ratings?.[h.id];
    const ratingText = rating?.matched
      ? rating.overall_rating != null
        ? `${rating.overall_rating}/5`
        : "matched, no overall rating"
      : "no CMS match";
    const fileExists = fs.existsSync(path.join(RAW_DIR, `${h.id}.${h.ext}`)) || fs.existsSync(path.join(RAW_DIR, `${h.id}.zip`));
    return `- **${h.id}** (${h.format}): downloaded=${fileExists ? "✓" : "✗"}, knee MRI rows=${hadKnee ? "✓" : "✗"}, CMS=${ratingText}`;
  }).join("\n");

  const lines = [
    `# LA Gap Fill Report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    ``,
    `## Pipeline steps`,
    ...steps.map((s, i) => `${i + 1}. ${s.label} — ${s.ok ? "✓" : "✗ FAILED"}`),
    ``,
    `## Per-hospital status`,
    newOnes,
    ``,
    `## Coverage summary`,
    `- knee MRI (73721) total hospitals with rows: ${knee.size}`,
    `- new hospitals contributing knee MRI rows: ${HOSPITALS.filter((h) => knee.has(h.id)).length} of ${HOSPITALS.length}`,
    ``,
    `Logs: this run wrote stdout/stderr to wherever you redirected (e.g. /tmp/la-gap-fill.log).`,
  ];
  fs.writeFileSync(REPORT_FILE, lines.join("\n"));
  log(`wrote ${REPORT_FILE}`);
}

// ─── main ──────────────────────────────────────────────────────────────────
async function main() {
  const steps = [];
  const stepRun = (label, fn) => {
    log(`STEP: ${label}`);
    try {
      const ok = fn() !== false;
      steps.push({ label, ok });
      if (!ok) log(`  ⚠ ${label} returned false`);
    } catch (e) {
      log(`  ⚠ ${label} threw: ${e.message}`);
      steps.push({ label, ok: false });
    }
  };

  stepRun("patch download-mrfs.mjs", patchDownloader);
  stepRun("patch extract-mri.mjs", patchTallExtractor);
  stepRun("patch extract-mri-wide.mjs", patchWideExtractor);
  stepRun("patch build-ui-data.mjs", patchUIBuilder);
  stepRun("patch fetch-cms-ratings.mjs", patchRatings);

  stepRun("download MRFs", () => run("npm", ["run", "download"]));
  stepRun("rename zip-as-csv", () => { renameZipDisguised(); return true; });

  stepRun("extract tall + JSON", () => run("npm", ["run", "extract"]));
  stepRun("extract wide", () => run("npm", ["run", "extract:wide"]));
  stepRun("fetch CMS ratings", () => run("npm", ["run", "ratings"]));
  stepRun("build UI data", () => run("npm", ["run", "build:data"]));

  writeReport(steps);
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    log(`completed with ${failed.length} failed step(s) — see report at ${REPORT_FILE}`);
    process.exit(1);
  }
  log(`completed cleanly. Report at ${REPORT_FILE}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
