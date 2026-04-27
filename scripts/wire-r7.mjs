#!/usr/bin/env node
// Round 7: add 12 high-volume shoppable procedures to bring our coverage to 42 codes.
// Waits for any running wire-r6.mjs to finish first (so we don't fight over the
// extractor), then patches cpts.mjs / proc-overviews.mjs / build-ui-data.mjs
// idempotently and re-runs the extract pipeline.
//
// Run:                node scripts/wire-r7.mjs
// Run with logging:   node scripts/wire-r7.mjs > /tmp/r7.log 2>&1

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORT_FILE = "/tmp/r7-report.md";

const log = (msg) => console.log(`[wire-r7] ${new Date().toISOString()} ${msg}`);

// 12 new shoppable procedures, picked for volume + price-spread visibility.
const NEW_CODES = [
  { code: "29848", label: "Carpal tunnel release",
    short: "Carpal tunnel release", category: "Surgery",
    headline: "Surgery to release pressure on the median nerve at the wrist.",
    body: "An outpatient surgery (open or endoscopic) to relieve carpal tunnel syndrome — numbness, tingling, weakness in the hand. Recovery 2-6 weeks; common and very shoppable.\n\nOften done at an Ambulatory Surgical Center for substantially less than at a hospital. The published rate is the facility fee. Surgeon and anesthesia are usually billed separately.",
  },
  { code: "64483", label: "Lumbar epidural steroid injection",
    short: "Lumbar ESI", category: "Procedure",
    headline: "Steroid injection into the lumbar spine for back/leg pain.",
    body: "An outpatient injection used for radiating low-back pain (sciatica), herniated disc, or spinal stenosis. About 15-30 minutes; image-guided. Often a series of three.\n\nDramatic price spreads between hospital outpatient departments and pain-management clinics — sometimes 10x. The published rate is the facility fee; the physician's fee is usually billed separately.",
  },
  { code: "95810", label: "Polysomnography (sleep study)",
    short: "Sleep study", category: "Procedure",
    headline: "Overnight sleep study with full monitoring.",
    body: "A diagnostic test where you spend the night at a sleep lab while your breathing, brain activity, oxygen, and heart rhythm are monitored. Used to diagnose sleep apnea, narcolepsy, and other disorders. Most insurance covers it after a referral.\n\nIn-lab studies are typically $1,500-$5,000. Home sleep tests (CPT 95800/95806) are 60-80% cheaper for the same diagnosis. Worth asking your provider if a home test is appropriate.",
  },
  { code: "30520", label: "Septoplasty (deviated septum repair)",
    short: "Septoplasty", category: "Surgery",
    headline: "Surgery to straighten the wall between the nostrils.",
    body: "Outpatient ENT surgery for a deviated septum causing breathing issues. About 1-2 hours under general anesthesia; recovery 1-2 weeks.\n\nFrequently performed at Ambulatory Surgical Centers at significantly lower cost than hospitals. The published rate is the facility fee. Sometimes bundled with turbinate reduction (CPT 30130/30140) at additional cost.",
  },
  { code: "58150", label: "Total abdominal hysterectomy",
    short: "Total hysterectomy", category: "Surgery",
    headline: "Surgical removal of the uterus through an abdominal incision.",
    body: "Major surgery; 1-2 day hospital stay; recovery 4-6 weeks. Used for fibroids, endometriosis, certain cancers, or chronic bleeding. Laparoscopic and robotic versions exist with different CPT codes (58570-58573) at often higher cost.\n\nThe published rate is the hospital facility fee. Surgeon's fee, anesthesia, and any pathology are billed separately.",
  },
  { code: "76536", label: "Thyroid ultrasound",
    short: "Thyroid ultrasound", category: "Imaging",
    headline: "Ultrasound of the thyroid gland.",
    body: "Used to evaluate thyroid nodules, goiter, or abnormal TSH labs. About 15-30 minutes; no radiation; no contrast. Pairs naturally with a TSH blood test (CPT 84443).\n\nFree-standing imaging centers are typically much cheaper than hospital outpatient departments for this scan. Worth shopping.",
  },
  { code: "99203", label: "New patient office visit, level 3",
    short: "New patient visit (L3)", category: "Office",
    headline: "First-time office visit, established care, moderate complexity.",
    body: "A 30-45 minute visit for a new patient with a moderately complex problem. Higher than 99213 because of the time and decision-making for a never-seen patient.\n\nOne of the most-billed CPT codes in the country. Hospital-owned outpatient clinics frequently bill 99204 or 99203 at 5-10x the rate of an independent primary care practice.",
  },
  { code: "99204", label: "New patient office visit, level 4",
    short: "New patient visit (L4)", category: "Office",
    headline: "First-time office visit with extended evaluation.",
    body: "Higher-acuity new patient visit (45-60 minutes). Used when the new patient has multiple chronic conditions, complicated history, or significant decision-making.\n\nFor specialist consultations, 99204 is often the default code. Worth verifying after the visit that the billed level matches what actually happened.",
  },
  { code: "52353", label: "Ureteroscopy with lithotripsy (kidney stone)",
    short: "Kidney stone treatment", category: "Surgery",
    headline: "Endoscopic treatment of kidney/ureter stones with laser fragmentation.",
    body: "Outpatient surgery using a scope passed up through the bladder to break up and remove stones with a laser. Same-day procedure under general anesthesia.\n\nLithotripsy is the surgical alternative to letting a stone pass naturally. Hospital and ASC pricing varies dramatically — same procedure, same recovery time.",
  },
  { code: "55700", label: "Prostate biopsy",
    short: "Prostate biopsy", category: "Procedure",
    headline: "Tissue biopsy of the prostate for cancer evaluation.",
    body: "Used after an elevated PSA blood test or abnormal digital exam. Outpatient, ~30 minutes, transrectal or transperineal approach. The published rate is the facility fee; the pathologist who reads the samples bills separately.\n\nIf this gets ordered, ask your urologist whether MRI-guided fusion biopsy (different code, more accurate) is appropriate — it's often more accurate but pricier.",
  },
  { code: "93880", label: "Carotid duplex ultrasound",
    short: "Carotid ultrasound", category: "Cardiac",
    headline: "Ultrasound of the carotid arteries with blood flow analysis.",
    body: "Screens for plaque buildup in the neck arteries. Used after a TIA, mini-stroke, or as cardiovascular screening for at-risk patients. About 20-30 minutes; no radiation.\n\nCommon outpatient test. Hospital outpatient departments charge 5-10x what a free-standing vascular lab does for the same scan.",
  },
  { code: "90834", label: "Psychotherapy, 45 minutes",
    short: "Psychotherapy (45 min)", category: "Office",
    headline: "Outpatient therapy session with a licensed mental health provider.",
    body: "The most-billed psychotherapy code. Used by psychologists, LCSWs, LPCs, and psychiatrists for ongoing therapy.\n\nMental health pricing varies wildly. Hospital-affiliated behavioral health departments often bill $200-$400 per session; independent therapists charge $100-$250. Out-of-pocket therapy can be much cheaper than going through insurance, especially for high-deductible plans.",
  },
];

// Brief plain-English category labels for the picker — same shape as PROC_DISPLAY.
const NEW_DISPLAY = Object.fromEntries(
  NEW_CODES.map((c) => [c.code, { short: c.short, category: c.category }]),
);

// Brief overviews — same shape as PROC_OVERVIEWS.
const NEW_OVERVIEWS = Object.fromEntries(
  NEW_CODES.map((c) => [c.code, { headline: c.headline, body: c.body }]),
);

function r6IsStillRunning() {
  const r = spawnSync("pgrep", ["-f", "wire-r6.mjs"]);
  return r.status === 0 && r.stdout.toString().trim().length > 0;
}

async function waitForR6() {
  let waited = 0;
  while (r6IsStillRunning()) {
    if (waited === 0) log("round-6 still running, waiting for it to finish...");
    await new Promise((r) => setTimeout(r, 30_000));
    waited += 30;
    if (waited % 300 === 0) log(`still waiting (${waited}s elapsed)`);
  }
  log(`round-6 finished after waiting ${waited}s`);
}

function patchCptsMjs() {
  const file = path.join(ROOT, "scripts/cpts.mjs");
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("// Round 7: 12-code expansion")) {
    log("  cpts.mjs: round-7 section already present, skipping");
    return;
  }
  // Insert before the closing `];` of CPT_CODES
  const lines = NEW_CODES.map((c) => `  { code: "${c.code}", label: "${c.label}" },`).join("\n");
  const block = `  // ── Round 7: 12-code expansion (high-volume shoppable codes) ──\n${lines}\n`;
  const idx = src.lastIndexOf("];");
  if (idx === -1) throw new Error("cpts.mjs: no closing ']' found");
  fs.writeFileSync(file, src.slice(0, idx) + block + src.slice(idx));
  log("  patched cpts.mjs (+12 codes)");
}

function patchProcOverviews() {
  const file = path.join(ROOT, "scripts/proc-overviews.mjs");
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("// Round 7 overviews")) {
    log("  proc-overviews.mjs: round-7 section already present, skipping");
    return;
  }
  // Insert before the closing `};` of PROC_OVERVIEWS
  const overviewLines = Object.entries(NEW_OVERVIEWS)
    .map(([code, ov]) => {
      const headline = ov.headline.replace(/"/g, '\\"');
      const body = ov.body.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      return `  "${code}": {\n    headline: "${headline}",\n    body: "${body}",\n  },`;
    })
    .join("\n");
  const block = `  // ── Round 7 overviews ──────────────────────────────────────────────────\n${overviewLines}\n`;
  const idx = src.lastIndexOf("};");
  if (idx === -1) throw new Error("proc-overviews.mjs: no closing '};'");
  fs.writeFileSync(file, src.slice(0, idx) + block + src.slice(idx));
  log("  patched proc-overviews.mjs (+12 overviews)");
}

function patchBuildUIData() {
  const file = path.join(ROOT, "scripts/build-ui-data.mjs");
  const src = fs.readFileSync(file, "utf8");
  if (src.includes("// Round 7 display")) {
    log("  build-ui-data.mjs: round-7 section already present, skipping");
    return;
  }
  // Insert into PROC_DISPLAY just before its closing `};`
  const displayLines = Object.entries(NEW_DISPLAY)
    .map(([code, d]) => `  "${code}": { short: "${d.short}", category: "${d.category}" },`)
    .join("\n");
  const block = `  // ── Round 7 display ──\n${displayLines}\n`;
  // PROC_DISPLAY is a const object; find its closing brace before "};\n\n//"
  const procDisplayStart = src.indexOf("const PROC_DISPLAY");
  if (procDisplayStart === -1) throw new Error("PROC_DISPLAY not found");
  // Find the next "};" after PROC_DISPLAY
  const closingIdx = src.indexOf("};", procDisplayStart);
  if (closingIdx === -1) throw new Error("PROC_DISPLAY closing brace not found");
  fs.writeFileSync(file, src.slice(0, closingIdx) + block + src.slice(closingIdx));
  log("  patched build-ui-data.mjs PROC_DISPLAY (+12 entries)");
}

function run(cmd, args) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
  return r.status === 0;
}

function checkProcedureCoverage(cpt) {
  const file = path.join(ROOT, "raw-files", "results", `${cpt}.json`);
  if (!fs.existsSync(file)) return new Set();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const hospitals = new Set();
  for (const r of data.rows) hospitals.add(r.hospital);
  return hospitals;
}

function writeReport(steps) {
  const lines = NEW_CODES.map((c) => {
    const set = checkProcedureCoverage(c.code);
    return `- **${c.code}** ${c.short.padEnd(28)} hospitals with rows: ${set.size}`;
  });
  const total = [...new Set(
    NEW_CODES.flatMap((c) => [...checkProcedureCoverage(c.code)]),
  )].length;
  const out = [
    `# Round 7: 12-code expansion report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    ``,
    `## Pipeline steps`,
    ...steps.map((s, i) => `${i + 1}. ${s.label} — ${s.ok ? "✓" : "✗ FAILED"}`),
    ``,
    `## Per-procedure coverage`,
    ...lines,
    ``,
    `## Total`,
    `- New procedures: 12`,
    `- Hospitals contributing rows for at least one new procedure: ${total}`,
  ];
  fs.writeFileSync(REPORT_FILE, out.join("\n"));
  log(`wrote ${REPORT_FILE}`);
}

async function main() {
  await waitForR6();

  const steps = [];
  const stepRun = (label, fn) => {
    log(`STEP: ${label}`);
    try {
      const ok = fn() !== false;
      steps.push({ label, ok });
    } catch (e) {
      log(`  ⚠ ${label} threw: ${e.message}`);
      steps.push({ label, ok: false });
    }
  };

  stepRun("patch cpts.mjs", patchCptsMjs);
  stepRun("patch proc-overviews.mjs", patchProcOverviews);
  stepRun("patch build-ui-data.mjs", patchBuildUIData);

  stepRun("re-extract tall + JSON", () => run("npm", ["run", "extract"]));
  stepRun("re-extract wide", () => run("npm", ["run", "extract:wide"]));
  stepRun("rebuild UI data", () => run("npm", ["run", "build:data"]));

  writeReport(steps);
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    log(`completed with ${failed.length} failed step(s) — see ${REPORT_FILE}`);
    process.exit(1);
  }
  log(`completed cleanly. Report at ${REPORT_FILE}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
