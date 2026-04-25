// Extract knee MRI (CPT 73721) prices from all 7 hospital MRF files.
// Tests: can we get a comparable consumer-facing price table out of this raw data?
//
// CPT 73721 = MRI any joint of lower extremity, without contrast (knee, hip, ankle MRI)
// We'll match on this code across whatever code field each hospital uses.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { chain } from "stream-chain";
import { parser as jsonParser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { pick } from "stream-json/filters/pick.js";
import { parse as csvParse } from "csv-parse";

const TARGET_CODE = "73721";
const RAW_DIR = "/Users/superhenri/Research/hospital-mrfs/raw-files";

const matches = [];

function record(hospital, payer, plan, code, description, negotiated, gross, cash, methodology) {
  matches.push({
    hospital,
    code,
    description: description?.slice(0, 70),
    payer,
    plan,
    negotiated: negotiated ?? null,
    gross: gross ?? null,
    cash: cash ?? null,
    methodology: methodology ?? null,
  });
}

// ---------- JSON files (CMS v2/v3 nested format) ----------
// Schema: standard_charge_information is an array of items.
// Each item has: description, code_information[{code, type}], standard_charges[{
//   gross_charge, discounted_cash, payers_information[{payer_name, plan_name, standard_charge_dollar, ...}]
// }]
async function processJSON(hospitalId, filePath) {
  console.log(`[${hospitalId}] streaming JSON...`);

  const pipeline = chain([
    fs.createReadStream(filePath),
    jsonParser(),
    pick({ filter: "standard_charge_information" }),
    streamArray(),
  ]);

  let count = 0;
  let matched = 0;
  for await (const chunk of pipeline) {
    const item = chunk.value;
    count++;
    const codes = item.code_information || [];
    const hit = codes.some((c) => String(c.code) === TARGET_CODE);
    if (!hit) continue;
    matched++;

    const desc = item.description || "";
    const charges = item.standard_charges || [];
    for (const ch of charges) {
      const gross = ch.gross_charge;
      const cash = ch.discounted_cash;
      const payers = ch.payers_information || [];
      if (payers.length === 0) {
        record(hospitalId, null, null, TARGET_CODE, desc, null, gross, cash, null);
      } else {
        for (const p of payers) {
          record(
            hospitalId,
            p.payer_name,
            p.plan_name,
            TARGET_CODE,
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
  console.log(`[${hospitalId}] scanned ${count} items, ${matched} matched code ${TARGET_CODE}`);
}

// ---------- CSV files (CMS v3 "tall" format) ----------
async function processCSV(hospitalId, filePath, opts = {}) {
  console.log(`[${hospitalId}] streaming CSV...`);
  // CMS CSV files have 2 header rows of "hospital info" before the actual data header.
  // We need to skip until we find the row that starts with "description".
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let dataHeaderLineIdx = -1;
  let lineIdx = 0;
  let dataHeader = null;
  const dataLines = [];
  let foundData = false;
  let count = 0;
  let matched = 0;

  for await (const line of rl) {
    if (!foundData) {
      // Look for the actual data header (starts with "description,")
      if (line.startsWith("description,") || line.startsWith('"description"')) {
        dataHeader = line;
        dataHeaderLineIdx = lineIdx;
        foundData = true;
        lineIdx++;
        continue;
      }
      lineIdx++;
      continue;
    }

    // We're past the header. Process this line as data.
    // Quick filter: only parse rows that contain the target code.
    if (!line.includes(TARGET_CODE)) {
      count++;
      lineIdx++;
      continue;
    }

    // Parse this row + the header together.
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
      // Confirm the code actually matches one of the code fields (not an accidental substring).
      const code1 = row["code|1"] || "";
      const code2 = row["code|2"] || "";
      const code3 = row["code|3"] || "";
      if (code1 !== TARGET_CODE && code2 !== TARGET_CODE && code3 !== TARGET_CODE) {
        count++;
        lineIdx++;
        continue;
      }
      matched++;
      record(
        hospitalId,
        row["payer_name"] || null,
        row["plan_name"] || null,
        TARGET_CODE,
        row["description"] || "",
        row["standard_charge|negotiated_dollar"] || null,
        row["standard_charge|gross"] || null,
        row["standard_charge|discounted_cash"] || null,
        row["standard_charge|methodology"] || null,
      );
    }
    count++;
    lineIdx++;
  }
  console.log(`[${hospitalId}] scanned ${count} rows, ${matched} matched code ${TARGET_CODE}`);
}

// ---------- NYU wide-format CSV ----------
// 1,979 columns: description, code, ..., then one column per payer/plan rate.
// We'll skip this one for now and just note it.
async function processWideCSV(hospitalId, filePath) {
  console.log(`[${hospitalId}] WIDE format - skipping for v1 test (would need separate parser)`);
}

async function main() {
  const t0 = Date.now();

  await processJSON("cedars-sinai", path.join(RAW_DIR, "cedars-sinai.json"));
  await processJSON("ucla-ronald-reagan", path.join(RAW_DIR, "ucla-ronald-reagan.json"));
  await processJSON("providence-st-joseph", path.join(RAW_DIR, "providence-st-joseph.json"));
  await processJSON("houston-methodist", path.join(RAW_DIR, "houston-methodist.json"));
  await processCSV("cleveland-clinic", path.join(RAW_DIR, "cleveland-clinic-unzipped/340714585_the-cleveland-clinic-foundation_standardcharges.csv"));
  await processCSV("advocate-christ", path.join(RAW_DIR, "advocate-christ.csv"));
  await processWideCSV("nyu-langone-tisch", path.join(RAW_DIR, "nyu-langone-tisch.csv"));

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== TOTAL TIME: ${seconds}s ===\n`);
  console.log(`=== ${matches.length} price rows for CPT ${TARGET_CODE} (knee/lower-extremity MRI w/o contrast) ===\n`);

  // Save full table
  const outFile = "/Users/superhenri/Research/hospital-mrfs/raw-files/mri-73721-results.json";
  fs.writeFileSync(outFile, JSON.stringify(matches, null, 2));
  console.log(`Full results: ${outFile}\n`);

  // Print a summary table - just the negotiated rates with payer
  console.log("HOSPITAL                       PAYER                          PLAN                                $$$");
  console.log("─".repeat(110));
  const filtered = matches
    .filter((m) => m.negotiated && Number(m.negotiated) > 0)
    .sort((a, b) => Number(a.negotiated) - Number(b.negotiated));

  for (const m of filtered.slice(0, 40)) {
    const h = (m.hospital || "").padEnd(30);
    const p = (m.payer || "").slice(0, 30).padEnd(30);
    const pl = (m.plan || "").slice(0, 35).padEnd(35);
    const $ = `$${Number(m.negotiated).toFixed(2)}`;
    console.log(`${h} ${p} ${pl} ${$}`);
  }
  if (filtered.length > 40) console.log(`... +${filtered.length - 40} more rows`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
