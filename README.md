# Hospital-Prices

Working name: **Itemized**. Domain in flight.

## What this is

Consumer hospital price comparison tool. Built on CMS-mandated hospital Machine-Readable Files (MRFs) — every US hospital is required by federal law to publish their negotiated rates with every insurer for every procedure. The data is free, the formats are inconsistent, and no consumer-facing winner has emerged. Turquoise Health and Serif Health own the B2B side. The consumer slot is open.

## Where we are

Status: **shippable preview** as of 2026-04-26.

What's built:
- **96 hospitals across 13 metros**: 25 LA-area (full local depth), 71 in NYC, Chicago, Houston, Dallas, Philadelphia, Phoenix, Atlanta, Boston, Seattle, Cleveland, DC, SF Bay, Nashville, Denver.
- **30 procedures**: imaging (brain MRI, knee MRI, lumbar MRI, CT abd/pelvis, ultrasound, mammogram, X-ray, DXA), labs (CMP, lipid, CBC, A1c, TSH, urinalysis), surgery (knee/hip replacement, knee arthroscopy, gallbladder, hernia, cataract), maternity (vaginal/cesarean delivery), procedural (colonoscopy, EGD), cardiac (EKG, echo), office visits.
- **Streaming parsers** for CMS nested JSON (v2 + v3), tall CSV (v3), wide CSV (v3 with one column per payer), and zipped variants of all of the above.
- **Cleanup pipeline**: drops case-rate / per-diem / sentinel rows, canonicalizes payer names with substring patterns (handles long-form like "Aetna Health of California, Inc. and Aetna Health Management LLC"), buckets Medicare/Medicaid via plan-name and Medicare-only payer detection, sanity-checks negotiated > 3× gross.
- **CMS Hospital Care Compare ratings** (1-5 stars + safety/readmission/mortality subscores) joined to 89 of 96 hospitals by name. The 7 misses are mostly cancer-only specialty hospitals (MSK, MD Anderson, USC Norris) that CMS doesn't rate.
- **Itemized.html UI** (React + Vanilla CSS): editorial visual identity, multi-procedure picker, LA-first layout with national context, personalization flow (insurance + deductible + coinsurance → out-of-pocket estimate), plan-by-plan breakdown in row-expand, CMS rating block per row, sort by price/rating/best value, fold-out for hospitals without a published rate for the current selection.
- **Bills page** (Tier 1) with affiliate hooks for Goodbill bill negotiation.
- **Lazy-loading**: per-procedure data files (~250KB each) instead of one 17MB blob. First paint downloads ~16KB index.
- **Prod build script** (`npm run build:prod`) that compiles JSX, drops Babel CDN runtime, copies static assets to `ui/dist/` ready for Vercel deploy.

Real numbers from this dataset:
- Knee MRI cash spread: $74 (Jefferson Abington) → $32,963 (HCA Houston Kingwood) = **445×**.
- Chest X-ray Aetna: $19 (Providence St Joseph) → $4,201 (Cedars-Sinai). Same insurance card.
- Lab spreads (CMP, A1c, lipid panel) regularly clear 100×.

## What's not built yet

- Procedure-specific quality metrics (CMS publishes them; we use the hospital-wide composite for now).
- Real geocoding / "near me by zip code" — we hardcode an LA-county zip range.
- Database (everything is per-procedure JSON files; works fine for static hosting).
- Actual deploy + domain DNS.
- Bill-review self-service tool (Tier 2, deferred until affiliate revenue justifies it).

## Architecture

```
raw-files/                              symlink to /Volumes/Extreme SSD/Hospital-Prices-raw-files
  *.json | *.csv | *.zip                ~28GB across 96 hospital MRFs
  *-unzipped/                           auto-extracted from .zip MRFs
  results/{cpt}.json                    extractor output, one per CPT code
  ratings.json                          CMS Care Compare overall + subscores
                                        plus matched name and CMS facility ID

scripts/
  download-mrfs.mjs                     parallel fetcher (3 concurrent, 60min/file timeout)
  extract-mri.mjs                       streaming extractor (tall CSV + nested JSON)
  extract-mri-wide.mjs                  separate parser for wide-format CSVs (NYU, HUP, etc.)
  fetch-cms-ratings.mjs                 pulls Hospital Care Compare ratings from data.cms.gov
  build-ui-data.mjs                     transforms extractor output into UI-ready JSON
                                        (per-procedure files for lazy loading)
  build-ui-prod.mjs                     compiles JSX, builds deploy-ready ui/dist/
  summarize-mri.mjs                     prints per-CPT comparison tables to stdout
  cpts.mjs                              shared CPT code list (used by extractors + UI builder)

ui/
  Itemized.html                         entry HTML, Bricolage Grotesque + Inter + JetBrains Mono
  app.jsx                               React app (~1,000 lines)
  tweaks-panel.jsx                      in-page tweaks panel for design iteration
  data.real.js                          procedure index (16KB; hospitals lazy-loaded)
  data/{cpt}.json                       per-procedure hospital data (~250KB each)
  ratings.real.js                       CMS ratings (~85KB)
  bills.html                            standalone affiliate page
  data.js / ratings.js                  original mocked sample data (kept for design iteration)
  dist/                                 generated by build:prod, deploy this
```

## How to run

```bash
npm install

# Download MRFs (slow first time, ~25GB total to external SSD)
npm run download

# Extract (re-runs incrementally; ~3-5 min for 30 procedures across 96 hospitals)
npm run extract
npm run extract:wide

# Fetch CMS ratings (~30s)
npm run ratings

# Build UI data (~5s)
npm run build:data

# Build deploy-ready bundle (~2s)
npm run build:prod

# Or just summarize to stdout
npm run summarize
```

## Local dev

The UI loads from CDN (React 18 + Babel-standalone for JSX) so dev needs an HTTP server, not file://:

```bash
cd ui && python3 -m http.server 8000
# then http://localhost:8000/Itemized.html
```

For prod, use the precompiled bundle (no Babel CDN, faster paint):

```bash
npm run build:prod
cd ui/dist && npx vercel --prod
```

## House rules

- **No em dashes anywhere.** Periods or restructure.
- **Streaming-first.** No `JSON.parse(readFileSync(...))` on a 4GB MRF. Use `stream-json` for JSON, `readline + csv-parse` for CSV.
- **External SSD for raw data.** The internal drive can't hold ~28GB of MRFs comfortably. `raw-files/` is a symlink to `/Volumes/Extreme SSD/Hospital-Prices-raw-files`.
- **Wide-format hospitals go in extract-mri-wide.mjs.** Don't try to make tall and wide one parser.
- **Never take money from entities being compared.** Affiliate revenue from adjacent services (bill negotiation, direct-pay clinics) is fine; sponsored hospital rankings are not.

## Known issues / sharp edges

- **Harbor-UCLA wide CSV** has unclosed quotes in the header that crash the wide parser. Currently skipped with a warning. Needs a CSV-aware multi-line header reader.
- **Mayo Clinic, UW Medicine, Penn Medicine** (in some configurations) sit behind Akamai/Cloudflare 403 walls. WebFetch fails; manual browser download required.
- **Cedars-Sinai's PET Scan items** include CPT 71045 (chest X-ray) in their `code_information` array, which leaks PET scan prices into chest X-ray comparisons. The 3× gross sanity filter catches the worst cases. A more principled fix would be to flag items with multiple unrelated CPTs as ambiguous at extraction time.
- **Payer normalization** is substring-pattern based. Misses long-tail payer names that don't contain "Aetna" / "Cigna" / etc. The "no rate" fold-out at the bottom of each procedure shows hospitals where this hits.
- **Pediatric and cancer specialty hospitals** (CHLA, Seattle Children's, CHOP, Texas Children's, Lurie, Boston Children's, Phoenix Children's, MSK, MD Anderson, USC Norris) don't have CMS overall ratings. The methodology depends on Medicare claims they don't generate. The UI handles this with a "Pediatric/specialty · not rated by CMS" treatment.

## Background research

The full audit of the original 10 sampled hospitals lives at:
`/Users/superhenri/Obsidian-Vaults/Mission Control/Research/Hospital-MRF-Audit-2026-04-25.md`

The competitive scan that led to this build:
`/Users/superhenri/Obsidian-Vaults/Mission Control/Research/Database-Sites-Opportunity-Scan-2026-04-25.md`
