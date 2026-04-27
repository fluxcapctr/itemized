// Extract negotiated rates from CMS v3 "wide" CSV files where each payer/plan
// is a separate column block. Used by hospitals like NYU Langone (~3,800 cols)
// and MedStar Georgetown (~280 cols).
//
// Output is merged into the same raw-files/results/{cpt}.json files that
// extract-mri.mjs writes to: this script drops any existing rows for the
// hospitals it processes and appends fresh ones, leaving other hospitals'
// rows untouched. Run order between the two extractors does not matter.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { parse as csvParse } from "csv-parse";
import { CPT_CODES } from "./cpts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, "..", "raw-files");
const RESULTS_DIR = path.join(RAW_DIR, "results");

const TARGET_CODE_LIST = CPT_CODES.map((c) => c.code);
const TARGET_CODE_SET = new Set(TARGET_CODE_LIST);
const CODE_LINE_REGEX = new RegExp(`\\b(${TARGET_CODE_LIST.join("|")})\\b`);

const matchesByCode = Object.fromEntries(TARGET_CODE_LIST.map((c) => [c, []]));

function parseCsvLine(line) {
  return new Promise((resolve, reject) => {
    const out = [];
    csvParse(line, { columns: false, relax_quotes: true, relax_column_count: true })
      .on("readable", function () {
        let r;
        while ((r = this.read())) out.push(r);
      })
      .on("end", () => resolve(out[0] || []))
      .on("error", reject);
  });
}

// A "wide" header has many standard_charge|<payer>|<plan>|negotiated_dollar columns.
// Distinguishes it from a tall-format header that has standard_charge|negotiated_dollar.
function looksLikeWideHeader(line) {
  const lower = line.toLowerCase();
  if (!lower.includes("standard_charge|")) return false;
  return /standard_charge\|[^|]+\|[^|]+\|negotiated_dollar/i.test(lower);
}

async function processWideCSV(hospitalId, filePath) {
  console.log(`[${hospitalId}] streaming wide CSV...`);
  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let foundHeader = false;
  let headerCols = null;
  let payerColumns = []; // [{ payer, plan, dollarIdx, methodologyIdx }]
  let descIdx = -1;
  let grossIdx = -1;
  let cashIdx = -1;
  let codeIdxs = []; // indexes for code|1..code|4 (Rush etc. put CPT in code|4)
  let count = 0;
  const matchedByCode = Object.fromEntries(TARGET_CODE_LIST.map((c) => [c, 0]));

  for await (const line of rl) {
    if (!foundHeader) {
      if (looksLikeWideHeader(line)) {
        // Lowercase the column names so lookups don't depend on hospital capitalization.
        const parsed = await parseCsvLine(line).catch((err) => {
          console.warn(`[${hospitalId}] header parse failed (${err.code || err.message}); skipping file. This often means the header has unclosed quotes or multi-line quoted fields, which need a CSV-aware line splitter.`);
          return null;
        });
        if (!parsed) {
          break; // bail out of the for-await loop; nothing usable
        }
        headerCols = parsed.map((c) => (c || "").toLowerCase());
        const idxByName = new Map();
        for (let i = 0; i < headerCols.length; i++) idxByName.set(headerCols[i], i);

        descIdx = idxByName.get("description") ?? -1;
        grossIdx = idxByName.get("standard_charge|gross") ?? -1;
        cashIdx = idxByName.get("standard_charge|discounted_cash") ?? -1;
        for (const k of ["code|1", "code|2", "code|3", "code|4"]) {
          const i = idxByName.get(k);
          if (i !== undefined) codeIdxs.push(i);
        }

        const dollarRe = /^standard_charge\|([^|]+)\|(.+)\|negotiated_dollar$/;
        for (let i = 0; i < headerCols.length; i++) {
          const m = headerCols[i].match(dollarRe);
          if (!m) continue;
          const payer = m[1];
          const plan = m[2];
          const methKey = `standard_charge|${payer}|${plan}|methodology`;
          payerColumns.push({
            payer,
            plan,
            dollarIdx: i,
            methodologyIdx: idxByName.get(methKey) ?? -1,
          });
        }

        foundHeader = true;
        console.log(
          `[${hospitalId}] header: ${headerCols.length} cols, ${payerColumns.length} payer/plan rate blocks`,
        );
      }
      continue;
    }

    // Cheap pre-filter so we don't csv-parse every row. Wide rows can be 30KB+.
    if (!CODE_LINE_REGEX.test(line)) {
      count++;
      continue;
    }

    const row = await parseCsvLine(line).catch((err) => {
      console.error(`[${hospitalId}] parse error: ${err.message}`);
      return null;
    });
    if (!row) {
      count++;
      continue;
    }

    const rowCodes = codeIdxs.map((i) => row[i]).filter(Boolean).map(String);
    const matched = rowCodes.filter((c) => TARGET_CODE_SET.has(c));
    if (matched.length === 0) {
      count++;
      continue;
    }

    const desc = (row[descIdx] || "").slice(0, 120);
    const gross = grossIdx >= 0 ? row[grossIdx] || null : null;
    const cash = cashIdx >= 0 ? row[cashIdx] || null : null;

    for (const code of matched) {
      matchedByCode[code]++;
      for (const pc of payerColumns) {
        const dollar = row[pc.dollarIdx];
        if (!dollar || dollar.trim() === "") continue;
        const methodology = pc.methodologyIdx >= 0 ? row[pc.methodologyIdx] || null : null;
        matchesByCode[code].push({
          hospital: hospitalId,
          code,
          description: desc,
          payer: pc.payer,
          plan: pc.plan,
          negotiated: dollar,
          gross,
          cash,
          methodology,
        });
      }
    }
    count++;
  }

  if (!foundHeader) {
    console.warn(`[${hospitalId}] no wide header found - file may not be wide format`);
  }
  const summary = TARGET_CODE_LIST.map((c) => `${c}=${matchedByCode[c]}`).join(" ");
  console.log(`[${hospitalId}] scanned ${count} rows. items matched: ${summary}`);
}

async function main() {
  const HOSPITALS = [
    { id: "nyu-langone-tisch", path: path.join(RAW_DIR, "nyu-langone-tisch.csv") },
    { id: "medstar-georgetown", path: path.join(RAW_DIR, "medstar-georgetown.csv") },
    { id: "harbor-ucla", path: path.join(RAW_DIR, "harbor-ucla.csv") },
    // Round 4 wide-format additions
    { id: "hup-penn", path: path.join(RAW_DIR, "hup-penn.csv") },
    { id: "penn-presbyterian", path: path.join(RAW_DIR, "penn-presbyterian.csv") },
    { id: "baylor-university-medical-center", path: path.join(RAW_DIR, "baylor-university-medical-center.csv") },
    { id: "virginia-mason", path: path.join(RAW_DIR, "virginia-mason.csv") },
    // Round 5: LA gap fill (AHMC system)
    { id: "whittier-hospital", path: path.join(RAW_DIR, "whittier-hospital.csv") },
    { id: "san-gabriel-valley-mc", path: path.join(RAW_DIR, "san-gabriel-valley-mc.csv") },
    { id: "garfield-medical-center", path: path.join(RAW_DIR, "garfield-medical-center.csv") },
    { id: "greater-el-monte", path: path.join(RAW_DIR, "greater-el-monte.csv") },
    { id: "monterey-park-hospital", path: path.join(RAW_DIR, "monterey-park-hospital.csv") },
  ];

  const t0 = Date.now();
  const processed = new Set();
  for (const h of HOSPITALS) {
    if (!fs.existsSync(h.path)) {
      console.log(`[${h.id}] file not found at ${h.path}, skipping`);
      continue;
    }
    processed.add(h.id);
    await processWideCSV(h.id, h.path);
  }

  const seconds = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n=== TOTAL TIME: ${seconds}s ===\n`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
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
    existing.rows = existing.rows.filter((r) => !processed.has(r.hospital));
    const newRows = matchesByCode[code];
    existing.rows.push(...newRows);
    existing.code = code;
    existing.label = label;
    fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
    console.log(
      `  ${code} ${label.padEnd(50)} +${String(newRows.length).padStart(5)} new (total ${existing.rows.length})`,
    );
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
