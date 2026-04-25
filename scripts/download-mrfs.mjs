// Download hospital MRF files to disk.
// Run: node scripts/download-mrfs.mjs

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const HOSPITALS = [
  {
    id: "cedars-sinai",
    name: "Cedars-Sinai Medical Center",
    url: "https://www.cedars-sinai.org/content/dam/cedars-sinai/billing-insurance/documents/951644600_CEDARS-SINAI-MEDICAL-CENTER_standardcharges.json",
    ext: "json",
  },
  {
    id: "ucla-ronald-reagan",
    name: "UCLA Ronald Reagan Medical Center",
    url: "https://www.uclahealth.org/sites/default/files/cms-hpt/956006143_ronald-reagan-ucla-medical-center_standardcharges.json?refresh=2026",
    ext: "json",
  },
  {
    id: "providence-st-joseph",
    name: "Providence Saint Joseph Medical Center",
    url: "https://pricetransparency.providence.org/socal/live/951675600_providence-st-joseph-medical-center_standardcharges.json",
    ext: "json",
  },
  {
    id: "houston-methodist",
    name: "Houston Methodist Hospital",
    url: "https://www.houstonmethodist.org/-/media/files/patient-resources/74110155_the-methodist-hospital_standardcharges.ashx",
    ext: "json",
  },
  {
    id: "cleveland-clinic",
    name: "Cleveland Clinic",
    url: "https://mrf.panaceainc.com/Download.aspx?org=clevelandclinic&loc=clevelandclinic&ref=",
    ext: "zip",
  },
  {
    id: "nyu-langone-tisch",
    name: "NYU Langone Tisch Hospital",
    url: "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1801992631_nyu-langone-tisch_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "advocate-christ",
    name: "Advocate Christ Medical Center",
    url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/11263/362169147_advocate-christ-medical-center_standardcharges.csv",
    ext: "csv",
  },
];

const OUT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "raw-files",
);

const PARALLEL = 3;
const TIMEOUT_MS = 15 * 60 * 1000; // 15 min per file

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

async function downloadOne(hospital) {
  const outPath = path.join(OUT_DIR, `${hospital.id}.${hospital.ext}`);
  const tmpPath = `${outPath}.tmp`;
  const start = Date.now();

  console.log(`[${hospital.id}] starting -> ${hospital.url}`);

  const ctrl = AbortController ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;

  try {
    const res = await fetch(hospital.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Research/1.0",
        Accept: "*/*",
      },
      redirect: "follow",
      signal: ctrl?.signal,
    });

    if (!res.ok) {
      console.error(
        `[${hospital.id}] FAILED status=${res.status} ${res.statusText}`,
      );
      return {
        ok: false,
        id: hospital.id,
        status: res.status,
        statusText: res.statusText,
      };
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      console.log(
        `[${hospital.id}] content-length: ${fmtBytes(Number(contentLength))}`,
      );
    }

    await pipeline(
      Readable.fromWeb(res.body),
      fs.createWriteStream(tmpPath),
    );
    fs.renameSync(tmpPath, outPath);

    const stat = fs.statSync(outPath);
    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[${hospital.id}] DONE ${fmtBytes(stat.size)} in ${seconds}s`,
    );
    return {
      ok: true,
      id: hospital.id,
      bytes: stat.size,
      seconds: Number(seconds),
      path: outPath,
    };
  } catch (err) {
    console.error(`[${hospital.id}] ERROR ${err.message}`);
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    return { ok: false, id: hospital.id, error: err.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Hospitals: ${HOSPITALS.length}, parallel: ${PARALLEL}\n`);

  const results = [];
  for (let i = 0; i < HOSPITALS.length; i += PARALLEL) {
    const batch = HOSPITALS.slice(i, i + PARALLEL);
    const batchResults = await Promise.all(batch.map(downloadOne));
    results.push(...batchResults);
  }

  const manifest = {
    downloadedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    if (r.ok) {
      console.log(`  OK   ${r.id.padEnd(28)} ${fmtBytes(r.bytes).padStart(8)}  ${r.seconds}s`);
    } else {
      console.log(
        `  FAIL ${r.id.padEnd(28)} ${r.status ?? r.error ?? "unknown"}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
