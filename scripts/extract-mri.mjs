// Extract negotiated rates for a list of shoppable CPT codes from all hospital MRFs.
// Single streaming pass per file; matches against any code in CPT_CODES.
// Writes one JSON per code to raw-files/results/{cpt}.json.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { chain } from "stream-chain";
import { parser as jsonParser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { pick } from "stream-json/filters/pick.js";
import { parse as csvParse } from "csv-parse";
import { CPT_CODES } from "./cpts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, "..", "raw-files");
const RESULTS_DIR = path.join(RAW_DIR, "results");

const TARGET_CODE_LIST = CPT_CODES.map((c) => c.code);
const TARGET_CODE_SET = new Set(TARGET_CODE_LIST);
const CODE_LINE_REGEX = new RegExp(`\\b(${TARGET_CODE_LIST.join("|")})\\b`);

const matchesByCode = Object.fromEntries(TARGET_CODE_LIST.map((c) => [c, []]));

function record(code, hospital, payer, plan, description, negotiated, gross, cash, methodology) {
  matchesByCode[code].push({
    hospital,
    code,
    description: description?.slice(0, 120),
    payer,
    plan,
    negotiated: negotiated ?? null,
    gross: gross ?? null,
    cash: cash ?? null,
    methodology: methodology ?? null,
  });
}

// ---------- JSON files (CMS v2/v3 nested format) ----------
async function processJSON(hospitalId, filePath) {
  console.log(`[${hospitalId}] streaming JSON...`);

  const pipeline = chain([
    fs.createReadStream(filePath),
    jsonParser(),
    pick({ filter: "standard_charge_information" }),
    streamArray(),
  ]);

  let count = 0;
  const matchedByCode = Object.fromEntries(TARGET_CODE_LIST.map((c) => [c, 0]));
  for await (const chunk of pipeline) {
    const item = chunk.value;
    count++;
    const codes = item.code_information || [];
    const itemCodes = codes.map((c) => String(c.code));
    const matched = itemCodes.filter((c) => TARGET_CODE_SET.has(c));
    if (matched.length === 0) continue;

    const desc = item.description || "";
    const charges = item.standard_charges || [];
    for (const code of matched) {
      matchedByCode[code]++;
      for (const ch of charges) {
        const gross = ch.gross_charge;
        const cash = ch.discounted_cash;
        const payers = ch.payers_information || [];
        if (payers.length === 0) {
          record(code, hospitalId, null, null, desc, null, gross, cash, null);
        } else {
          for (const p of payers) {
            record(
              code,
              hospitalId,
              p.payer_name,
              p.plan_name,
              desc,
              p.standard_charge_dollar ?? p.standard_charge ?? null,
              gross,
              cash,
              p.methodology ?? null,
            );
          }
        }
      }
    }
  }
  const summary = TARGET_CODE_LIST.map((c) => `${c}=${matchedByCode[c]}`).join(" ");
  console.log(`[${hospitalId}] scanned ${count} items. matches: ${summary}`);
}

// ---------- CSV files (CMS v3 "tall" format) ----------
async function processCSV(hospitalId, filePath) {
  console.log(`[${hospitalId}] streaming CSV...`);
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let dataHeader = null;
  let foundData = false;
  let count = 0;
  const matchedByCode = Object.fromEntries(TARGET_CODE_LIST.map((c) => [c, 0]));

  for await (const line of rl) {
    if (!foundData) {
      // Header detection is case-insensitive AND whitespace-tolerant. Different hospitals
      // shape the v3 columns differently: Jefferson capitalizes ("Description"), Seattle
      // Children's leads with "billing_class" before "description", Pomona Valley puts
      // spaces around pipes ("code |1", "standard_charge | gross"). Normalize first.
      const normalized = line.toLowerCase().replace(/\s*\|\s*/g, "|");
      if (
        normalized.includes("description") &&
        normalized.includes("code|1") &&
        normalized.includes("standard_charge|gross")
      ) {
        // Store the normalized header so downstream row[colName] lookups don't have
        // to know what case or spacing the hospital used.
        dataHeader = normalized;
        foundData = true;
      }
      continue;
    }

    // Cheap pre-filter so we don't parse rows we don't care about.
    if (!CODE_LINE_REGEX.test(line)) {
      count++;
      continue;
    }

    const rows = await new Promise((resolve, reject) => {
      const out = [];
      csvParse(`${dataHeader}\n${line}`, {
        columns: true,
        relax_quotes: true,
        relax_column_count: true,
      })
        .on("readable", function () {
          let r;
          while ((r = this.read())) out.push(r);
        })
        .on("end", () => resolve(out))
        .on("error", reject);
    }).catch((err) => {
      console.error(`[${hospitalId}] parse error: ${err.message}`);
      return [];
    });

    for (const row of rows) {
      // Some hospitals put the CPT code as far down as code|4 (Rush University
      // chains chargemaster -> revenue code -> ... -> CPT). Check all four slots.
      const rowCodes = [row["code|1"], row["code|2"], row["code|3"], row["code|4"]]
        .filter(Boolean)
        .map(String);
      const matched = rowCodes.filter((c) => TARGET_CODE_SET.has(c));
      if (matched.length === 0) {
        count++;
        continue;
      }
      for (const code of matched) {
        matchedByCode[code]++;
        record(
          code,
          hospitalId,
          row["payer_name"] || null,
          row["plan_name"] || null,
          row["description"] || "",
          row["standard_charge|negotiated_dollar"] || null,
          row["standard_charge|gross"] || null,
          row["standard_charge|discounted_cash"] || null,
          row["standard_charge|methodology"] || null,
        );
      }
    }
    count++;
  }
  const summary = TARGET_CODE_LIST.map((c) => `${c}=${matchedByCode[c]}`).join(" ");
  console.log(`[${hospitalId}] scanned ${count} rows. matches: ${summary}`);
}

// NYU's wide format needs a separate parser; out of scope here.
async function processWideCSV(hospitalId) {
  console.log(`[${hospitalId}] WIDE format - skipping (needs separate parser)`);
}

const HOSPITALS_PROCESSED = new Set();

async function processIfExists(hospitalId, filePath, processor) {
  if (!fs.existsSync(filePath)) {
    console.log(`[${hospitalId}] file not found at ${filePath}, skipping`);
    return;
  }
  HOSPITALS_PROCESSED.add(hospitalId);
  await processor(hospitalId, filePath);
}

import { spawnSync } from "node:child_process";

// For hospitals whose MRF ships as a .zip (Northwell, NYP, Texas Children's, etc.):
// unzips raw-files/<id>.zip into raw-files/<id>-unzipped/ on first run, then finds
// the first .csv or .json inside and feeds it to the appropriate processor.
async function processZipped(hospitalId, fileExt /* "csv" or "json" */) {
  const zipPath = path.join(RAW_DIR, `${hospitalId}.zip`);
  const dir = path.join(RAW_DIR, `${hospitalId}-unzipped`);
  if (!fs.existsSync(dir)) {
    if (!fs.existsSync(zipPath)) {
      console.log(`[${hospitalId}] zip and unzip dir both missing, skipping`);
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[${hospitalId}] unzipping ${path.basename(zipPath)}...`);
    const r = spawnSync("unzip", ["-q", "-o", zipPath, "-d", dir]);
    if (r.status !== 0) {
      console.warn(`[${hospitalId}] unzip failed (status ${r.status}): ${r.stderr?.toString()}`);
      return;
    }
  }
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(`.${fileExt}`));
  if (files.length === 0) {
    console.warn(`[${hospitalId}] no .${fileExt} found in ${dir}`);
    return;
  }
  const processor = fileExt === "json" ? processJSON : processCSV;
  for (const f of files) {
    await processIfExists(hospitalId, path.join(dir, f), processor);
  }
}

async function main() {
  const t0 = Date.now();

  // Original 6 tall-format and JSON hospitals.
  await processIfExists("cedars-sinai", path.join(RAW_DIR, "cedars-sinai.json"), processJSON);
  await processIfExists("ucla-ronald-reagan", path.join(RAW_DIR, "ucla-ronald-reagan.json"), processJSON);
  await processIfExists("providence-st-joseph", path.join(RAW_DIR, "providence-st-joseph.json"), processJSON);
  await processIfExists("houston-methodist", path.join(RAW_DIR, "houston-methodist.json"), processJSON);
  await processIfExists(
    "cleveland-clinic",
    path.join(RAW_DIR, "cleveland-clinic-unzipped/340714585_the-cleveland-clinic-foundation_standardcharges.csv"),
    processCSV,
  );
  await processIfExists("advocate-christ", path.join(RAW_DIR, "advocate-christ.csv"), processCSV);

  // Round 2 hospitals (tall CSV / JSON formats).
  await processIfExists("jefferson-abington", path.join(RAW_DIR, "jefferson-abington.csv"), processCSV);
  await processIfExists("emory-decatur", path.join(RAW_DIR, "emory-decatur.csv"), processCSV);
  await processIfExists("honorhealth-osborn", path.join(RAW_DIR, "honorhealth-osborn.csv"), processCSV);
  await processIfExists("uchealth-memorial-central", path.join(RAW_DIR, "uchealth-memorial-central.csv"), processCSV);
  await processIfExists("seattle-childrens", path.join(RAW_DIR, "seattle-childrens.csv"), processCSV);
  await processIfExists("vanderbilt-umc", path.join(RAW_DIR, "vanderbilt-umc.json"), processJSON);

  // Round 3 hospitals — LA-area expansion.
  await processIfExists("providence-st-johns-santa-monica", path.join(RAW_DIR, "providence-st-johns-santa-monica.json"), processJSON);
  await processIfExists("usc-keck", path.join(RAW_DIR, "usc-keck.csv"), processCSV);
  await processIfExists("usc-norris", path.join(RAW_DIR, "usc-norris.csv"), processCSV);
  await processIfExists("usc-verdugo-hills", path.join(RAW_DIR, "usc-verdugo-hills.csv"), processCSV);
  await processIfExists("usc-arcadia", path.join(RAW_DIR, "usc-arcadia.csv"), processCSV);
  await processIfExists("hoag-newport", path.join(RAW_DIR, "hoag-newport.csv"), processCSV);
  await processIfExists("chla", path.join(RAW_DIR, "chla.csv"), processCSV);
  await processIfExists("kaiser-la-sunset", path.join(RAW_DIR, "kaiser-la-sunset.csv"), processCSV);
  await processIfExists("mlk-community", path.join(RAW_DIR, "mlk-community.csv"), processCSV);
  await processIfExists("olive-view-ucla", path.join(RAW_DIR, "olive-view-ucla.csv"), processCSV);
  // harbor-ucla.csv is WIDE format — handled by extract-mri-wide.mjs.
  await processIfExists("ucla-santa-monica", path.join(RAW_DIR, "ucla-santa-monica.json"), processJSON);
  await processIfExists("torrance-memorial", path.join(RAW_DIR, "torrance-memorial.csv"), processCSV);
  await processIfExists("huntington-pasadena", path.join(RAW_DIR, "huntington-pasadena.csv"), processCSV);
  await processIfExists("cedars-sinai-marina-del-rey", path.join(RAW_DIR, "cedars-sinai-marina-del-rey.csv"), processCSV);
  await processIfExists("pomona-valley", path.join(RAW_DIR, "pomona-valley.csv"), processCSV);
  await processIfExists("hollywood-presbyterian", path.join(RAW_DIR, "hollywood-presbyterian.json"), processJSON);
  await processIfExists("st-francis-lynwood", path.join(RAW_DIR, "st-francis-lynwood.json"), processJSON);
  await processIfExists("dignity-st-mary-long-beach", path.join(RAW_DIR, "dignity-st-mary-long-beach.json"), processJSON);
  await processIfExists("dignity-california-hospital", path.join(RAW_DIR, "dignity-california-hospital.json"), processJSON);
  await processIfExists("dignity-northridge", path.join(RAW_DIR, "dignity-northridge.json"), processJSON);
  await processIfExists("dignity-glendale-memorial", path.join(RAW_DIR, "dignity-glendale-memorial.json"), processJSON);

  // ── Round 4: NYC ─────────────────────────────────────────────────────
  await processIfExists("mount-sinai-hospital", path.join(RAW_DIR, "mount-sinai-hospital.json"), processJSON);
  await processZipped("nyp-columbia", "json");
  await processZipped("nyp-queens", "json");
  await processIfExists("msk-cancer-center", path.join(RAW_DIR, "msk-cancer-center.json"), processJSON);
  await processIfExists("hss-main", path.join(RAW_DIR, "hss-main.json"), processJSON);
  await processZipped("northwell-lij", "csv");
  await processZipped("northwell-lenox-hill", "csv");
  await processZipped("northwell-north-shore", "csv");
  await processZipped("northwell-staten-island", "csv");
  await processIfExists("montefiore-medical-center", path.join(RAW_DIR, "montefiore-medical-center.csv"), processCSV);
  // NYC H+H Panacea endpoints serve zip archives despite no .zip in the URL
  await processZipped("nychh-bellevue", "csv");
  await processZipped("nychh-elmhurst", "csv");
  await processZipped("nychh-jacobi", "csv");
  await processZipped("nychh-kings-county", "csv");
  await processIfExists("maimonides-medical-center", path.join(RAW_DIR, "maimonides-medical-center.json"), processJSON);

  // ── Round 4: Chicago ─────────────────────────────────────────────────
  await processIfExists("northwestern-memorial", path.join(RAW_DIR, "northwestern-memorial.json"), processJSON);
  await processIfExists("rush-university", path.join(RAW_DIR, "rush-university.csv"), processCSV);
  await processIfExists("uchicago-medical-center", path.join(RAW_DIR, "uchicago-medical-center.json"), processJSON);
  // loyola-medical-center: Trinity Health Panacea endpoint serves zip despite no .zip in URL
  await processZipped("loyola-medical-center", "csv");
  await processIfExists("lurie-childrens", path.join(RAW_DIR, "lurie-childrens.csv"), processCSV);
  await processIfExists("stroger-cook-county", path.join(RAW_DIR, "stroger-cook-county.csv"), processCSV);
  await processIfExists("advocate-lutheran-general", path.join(RAW_DIR, "advocate-lutheran-general.csv"), processCSV);
  await processIfExists("advocate-illinois-masonic", path.join(RAW_DIR, "advocate-illinois-masonic.csv"), processCSV);
  await processIfExists("endeavor-evanston", path.join(RAW_DIR, "endeavor-evanston.json"), processJSON);

  // ── Round 4: Houston ─────────────────────────────────────────────────
  await processIfExists("md-anderson", path.join(RAW_DIR, "md-anderson.csv"), processCSV);
  await processIfExists("memorial-hermann-tmc", path.join(RAW_DIR, "memorial-hermann-tmc.csv"), processCSV);
  await processIfExists("memorial-hermann-southwest", path.join(RAW_DIR, "memorial-hermann-southwest.csv"), processCSV);
  await processIfExists("memorial-hermann-memorial-city", path.join(RAW_DIR, "memorial-hermann-memorial-city.csv"), processCSV);
  await processIfExists("memorial-hermann-sugar-land", path.join(RAW_DIR, "memorial-hermann-sugar-land.csv"), processCSV);
  await processIfExists("baylor-st-lukes-tmc", path.join(RAW_DIR, "baylor-st-lukes-tmc.json"), processJSON);
  await processZipped("texas-childrens", "csv");
  await processZipped("harris-health-ben-taub", "csv");
  await processIfExists("hca-houston-medical-center", path.join(RAW_DIR, "hca-houston-medical-center.json"), processJSON);
  await processIfExists("hca-houston-kingwood", path.join(RAW_DIR, "hca-houston-kingwood.json"), processJSON);

  // ── Round 4: Dallas ──────────────────────────────────────────────────
  await processIfExists("ut-southwestern", path.join(RAW_DIR, "ut-southwestern.csv"), processCSV);
  // baylor-university-medical-center is WIDE format — handled by extract-mri-wide.mjs
  await processZipped("methodist-dallas", "csv");
  await processIfExists("texas-health-presbyterian-dallas", path.join(RAW_DIR, "texas-health-presbyterian-dallas.csv"), processCSV);
  await processIfExists("childrens-medical-center-dallas", path.join(RAW_DIR, "childrens-medical-center-dallas.csv"), processCSV);
  await processZipped("parkland-memorial", "csv");

  // ── Round 4: Philadelphia ────────────────────────────────────────────
  // hup-penn and penn-presbyterian are WIDE format — handled by extract-mri-wide.mjs
  await processIfExists("temple-university-hospital", path.join(RAW_DIR, "temple-university-hospital.csv"), processCSV);
  await processIfExists("chop", path.join(RAW_DIR, "chop.csv"), processCSV);
  await processIfExists("jefferson-einstein-philadelphia", path.join(RAW_DIR, "jefferson-einstein-philadelphia.csv"), processCSV);

  // ── Round 4: Phoenix ─────────────────────────────────────────────────
  await processIfExists("banner-university-phoenix", path.join(RAW_DIR, "banner-university-phoenix.csv"), processCSV);
  await processIfExists("st-josephs-phoenix", path.join(RAW_DIR, "st-josephs-phoenix.json"), processJSON);
  await processZipped("phoenix-childrens", "csv");
  await processIfExists("honorhealth-deer-valley", path.join(RAW_DIR, "honorhealth-deer-valley.csv"), processCSV);

  // ── Round 4: Atlanta ─────────────────────────────────────────────────
  await processIfExists("emory-university-hospital", path.join(RAW_DIR, "emory-university-hospital.csv"), processCSV);
  await processZipped("piedmont-atlanta", "csv");
  await processZipped("grady-memorial", "csv");
  await processIfExists("wellstar-kennestone", path.join(RAW_DIR, "wellstar-kennestone.csv"), processCSV);

  // ── Round 4: Boston ──────────────────────────────────────────────────
  await processZipped("brigham-and-womens", "csv");
  await processIfExists("bidmc", path.join(RAW_DIR, "bidmc.json"), processJSON);
  await processIfExists("boston-childrens", path.join(RAW_DIR, "boston-childrens.json"), processJSON);
  await processIfExists("lahey-burlington", path.join(RAW_DIR, "lahey-burlington.json"), processJSON);

  // ── Round 4: Seattle ─────────────────────────────────────────────────
  await processIfExists("swedish-first-hill", path.join(RAW_DIR, "swedish-first-hill.json"), processJSON);
  // virginia-mason is WIDE format — handled by extract-mri-wide.mjs


  // ── Round 5: LA gap fill ─────────────────────────────────────────────
  await processIfExists("providence-tarzana", path.join(RAW_DIR, "providence-tarzana.json"), processJSON);
  await processIfExists("long-beach-memorial", path.join(RAW_DIR, "long-beach-memorial.json"), processJSON);
  await processIfExists("miller-childrens", path.join(RAW_DIR, "miller-childrens.json"), processJSON);
  if (fs.existsSync(path.join(RAW_DIR, "coast-plaza.zip"))) {
    await processZipped("coast-plaza", "csv");
  } else {
    await processIfExists("coast-plaza", path.join(RAW_DIR, "coast-plaza.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "adventist-white-memorial-montebello.zip"))) {
    await processZipped("adventist-white-memorial-montebello", "csv");
  } else {
    await processIfExists("adventist-white-memorial-montebello", path.join(RAW_DIR, "adventist-white-memorial-montebello.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "adventist-glendale.zip"))) {
    await processZipped("adventist-glendale", "csv");
  } else {
    await processIfExists("adventist-glendale", path.join(RAW_DIR, "adventist-glendale.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "adventist-simi-valley.zip"))) {
    await processZipped("adventist-simi-valley", "csv");
  } else {
    await processIfExists("adventist-simi-valley", path.join(RAW_DIR, "adventist-simi-valley.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "hoag-orthopedic-institute.zip"))) {
    await processZipped("hoag-orthopedic-institute", "csv");
  } else {
    await processIfExists("hoag-orthopedic-institute", path.join(RAW_DIR, "hoag-orthopedic-institute.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "south-coast-global-mc.zip"))) {
    await processZipped("south-coast-global-mc", "csv");
  } else {
    await processIfExists("south-coast-global-mc", path.join(RAW_DIR, "south-coast-global-mc.csv"), processCSV);
  }

  // ── Round 6: 7-metro expansion ──
  if (fs.existsSync(path.join(RAW_DIR, "henry-ford-detroit.zip"))) {
    await processZipped("henry-ford-detroit", "csv");
  } else {
    await processIfExists("henry-ford-detroit", path.join(RAW_DIR, "henry-ford-detroit.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "henry-ford-west-bloomfield.zip"))) {
    await processZipped("henry-ford-west-bloomfield", "csv");
  } else {
    await processIfExists("henry-ford-west-bloomfield", path.join(RAW_DIR, "henry-ford-west-bloomfield.csv"), processCSV);
  }
  await processIfExists("dmc-detroit-receiving", path.join(RAW_DIR, "dmc-detroit-receiving.json"), processJSON);
  await processIfExists("dmc-harper-university", path.join(RAW_DIR, "dmc-harper-university.json"), processJSON);
  await processIfExists("dmc-sinai-grace", path.join(RAW_DIR, "dmc-sinai-grace.json"), processJSON);
  await processIfExists("childrens-hospital-michigan", path.join(RAW_DIR, "childrens-hospital-michigan.json"), processJSON);
  if (fs.existsSync(path.join(RAW_DIR, "corewell-royal-oak.zip"))) {
    await processZipped("corewell-royal-oak", "csv");
  } else {
    await processIfExists("corewell-royal-oak", path.join(RAW_DIR, "corewell-royal-oak.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "corewell-troy.zip"))) {
    await processZipped("corewell-troy", "csv");
  } else {
    await processIfExists("corewell-troy", path.join(RAW_DIR, "corewell-troy.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "corewell-farmington-hills.zip"))) {
    await processZipped("corewell-farmington-hills", "csv");
  } else {
    await processIfExists("corewell-farmington-hills", path.join(RAW_DIR, "corewell-farmington-hills.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "corewell-dearborn.zip"))) {
    await processZipped("corewell-dearborn", "csv");
  } else {
    await processIfExists("corewell-dearborn", path.join(RAW_DIR, "corewell-dearborn.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "upmc-presbyterian-shadyside.zip"))) {
    await processZipped("upmc-presbyterian-shadyside", "csv");
  } else {
    await processIfExists("upmc-presbyterian-shadyside", path.join(RAW_DIR, "upmc-presbyterian-shadyside.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "upmc-magee-womens.zip"))) {
    await processZipped("upmc-magee-womens", "csv");
  } else {
    await processIfExists("upmc-magee-womens", path.join(RAW_DIR, "upmc-magee-womens.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "upmc-childrens-pittsburgh.zip"))) {
    await processZipped("upmc-childrens-pittsburgh", "csv");
  } else {
    await processIfExists("upmc-childrens-pittsburgh", path.join(RAW_DIR, "upmc-childrens-pittsburgh.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "ahn-allegheny-general.zip"))) {
    await processZipped("ahn-allegheny-general", "csv");
  } else {
    await processIfExists("ahn-allegheny-general", path.join(RAW_DIR, "ahn-allegheny-general.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "ahn-forbes.zip"))) {
    await processZipped("ahn-forbes", "csv");
  } else {
    await processIfExists("ahn-forbes", path.join(RAW_DIR, "ahn-forbes.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "ahn-jefferson-regional.zip"))) {
    await processZipped("ahn-jefferson-regional", "csv");
  } else {
    await processIfExists("ahn-jefferson-regional", path.join(RAW_DIR, "ahn-jefferson-regional.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "tampa-general.zip"))) {
    await processZipped("tampa-general", "csv");
  } else {
    await processIfExists("tampa-general", path.join(RAW_DIR, "tampa-general.csv"), processCSV);
  }
  await processZipped("baycare-st-josephs-tampa", "csv");
  await processZipped("baycare-morton-plant", "csv");
  if (fs.existsSync(path.join(RAW_DIR, "moffitt-cancer-center.zip"))) {
    await processZipped("moffitt-cancer-center", "csv");
  } else {
    await processIfExists("moffitt-cancer-center", path.join(RAW_DIR, "moffitt-cancer-center.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "jackson-memorial.zip"))) {
    await processZipped("jackson-memorial", "csv");
  } else {
    await processIfExists("jackson-memorial", path.join(RAW_DIR, "jackson-memorial.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "jackson-north.zip"))) {
    await processZipped("jackson-north", "csv");
  } else {
    await processIfExists("jackson-north", path.join(RAW_DIR, "jackson-north.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "jackson-south.zip"))) {
    await processZipped("jackson-south", "csv");
  } else {
    await processIfExists("jackson-south", path.join(RAW_DIR, "jackson-south.csv"), processCSV);
  }
  await processZipped("baptist-hospital-miami", "csv");
  await processZipped("baptist-doctors-coral-gables", "csv");
  await processZipped("baptist-homestead", "csv");
  // Nicklaus Children's zip contains a JSON, not CSV. Pre-extracted to nicklaus-childrens.json.
  await processIfExists("nicklaus-childrens", path.join(RAW_DIR, "nicklaus-childrens.json"), processJSON);
  await processZipped("dell-seton-uta", "csv");
  await processZipped("ascension-seton-medical-austin", "csv");
  await processZipped("dell-childrens-austin", "csv");
  await processZipped("ascension-seton-northwest", "csv");
  await processIfExists("st-davids-medical-center", path.join(RAW_DIR, "st-davids-medical-center.json"), processJSON);
  await processIfExists("st-davids-north-austin", path.join(RAW_DIR, "st-davids-north-austin.json"), processJSON);
  await processIfExists("st-davids-round-rock", path.join(RAW_DIR, "st-davids-round-rock.json"), processJSON);
  await processIfExists("heart-hospital-austin", path.join(RAW_DIR, "heart-hospital-austin.json"), processJSON);
  await processIfExists("stanford-health-care", path.join(RAW_DIR, "stanford-health-care.json"), processJSON);
  await processIfExists("stanford-tri-valley", path.join(RAW_DIR, "stanford-tri-valley.json"), processJSON);
  if (fs.existsSync(path.join(RAW_DIR, "kaiser-oakland.zip"))) {
    await processZipped("kaiser-oakland", "csv");
  } else {
    await processIfExists("kaiser-oakland", path.join(RAW_DIR, "kaiser-oakland.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "kaiser-redwood-city.zip"))) {
    await processZipped("kaiser-redwood-city", "csv");
  } else {
    await processIfExists("kaiser-redwood-city", path.join(RAW_DIR, "kaiser-redwood-city.csv"), processCSV);
  }
  await processZipped("john-muir-walnut-creek", "csv");
  await processZipped("john-muir-concord", "csv");
  await processIfExists("ucsd-health", path.join(RAW_DIR, "ucsd-health.json"), processJSON);
  if (fs.existsSync(path.join(RAW_DIR, "sharp-memorial.zip"))) {
    await processZipped("sharp-memorial", "csv");
  } else {
    await processIfExists("sharp-memorial", path.join(RAW_DIR, "sharp-memorial.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "sharp-grossmont.zip"))) {
    await processZipped("sharp-grossmont", "csv");
  } else {
    await processIfExists("sharp-grossmont", path.join(RAW_DIR, "sharp-grossmont.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "scripps-la-jolla.zip"))) {
    await processZipped("scripps-la-jolla", "csv");
  } else {
    await processIfExists("scripps-la-jolla", path.join(RAW_DIR, "scripps-la-jolla.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "scripps-mercy-sd.zip"))) {
    await processZipped("scripps-mercy-sd", "csv");
  } else {
    await processIfExists("scripps-mercy-sd", path.join(RAW_DIR, "scripps-mercy-sd.csv"), processCSV);
  }
  if (fs.existsSync(path.join(RAW_DIR, "rady-childrens.zip"))) {
    await processZipped("rady-childrens", "csv");
  } else {
    await processIfExists("rady-childrens", path.join(RAW_DIR, "rady-childrens.csv"), processCSV);
  }
  // Mass General zip is unpacked manually to mass-general-unzipped/. Find any *.csv inside.
  const mgDir = path.join(RAW_DIR, "mass-general-unzipped");
  if (fs.existsSync(mgDir)) {
    const csvs = fs.readdirSync(mgDir).filter((f) => f.endsWith(".csv"));
    for (const csv of csvs) {
      await processIfExists("mass-general", path.join(mgDir, csv), processCSV);
    }
  } else {
    console.log(`[mass-general] unzip dir not found, skipping`);
  }

  // Wide-format hospitals (nyu-langone-tisch, medstar-georgetown) handled by extract-mri-wide.mjs.
  await processWideCSV("nyu-langone-tisch");
  await processWideCSV("medstar-georgetown");

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== TOTAL TIME: ${seconds}s ===\n`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  // Merge into any existing results file: drop rows for hospitals we just
  // processed (replacing them with the fresh extraction) and keep rows from
  // other hospitals untouched. This lets extract-mri.mjs and extract-mri-wide.mjs
  // both write to the same per-CPT files without clobbering each other.
  for (const { code, label } of CPT_CODES) {
    const outFile = path.join(RESULTS_DIR, `${code}.json`);
    let existing = { code, label, rows: [] };
    if (fs.existsSync(outFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(outFile, "utf8"));
      } catch (e) {
        console.warn(`  ${code} existing file unreadable, starting fresh: ${e.message}`);
        existing = { code, label, rows: [] };
      }
    }
    existing.rows = existing.rows.filter((r) => !HOSPITALS_PROCESSED.has(r.hospital));
    const newRows = matchesByCode[code];
    existing.rows.push(...newRows);
    existing.code = code;
    existing.label = label;
    fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
    console.log(`  ${code} ${label.padEnd(50)} +${String(newRows.length).padStart(5)} new (total ${existing.rows.length}) -> ${path.relative(process.cwd(), outFile)}`);
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
