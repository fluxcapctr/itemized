# Hospital-Prices

Consumer-facing hospital price comparison tool. Working name only.

## What this is

A research/build spike on whether you can build a "Zillow for medical procedures" by ingesting the CMS-mandated hospital price transparency Machine-Readable Files (MRFs) and putting a real UI on top.

Premise: every US hospital is required to publish a machine-readable file of all standard charges, including negotiated rates with each insurer. The data is free, the formats are inconsistent, and no consumer-facing winner has emerged. Turquoise Health and Serif Health own the B2B side. The consumer slot is open.

## Where we are

Status: **proof of concept complete** as of 2026-04-25.

What's built:
- Downloader for 7 hospital MRF files (Cedars-Sinai, UCLA, Providence St Joseph, Houston Methodist, Cleveland Clinic, NYU Langone Tisch, Advocate Christ)
- Streaming parser that handles both JSON (CMS v2/v3 nested) and CSV (CMS v3 tall) formats
- Working extraction for any CPT code across all 6 standard-format hospitals (NYU's wide format still needs a separate parser)
- Verified output: 514 priced rows for knee/lower-extremity MRI (CPT 73721) extracted in 49 seconds across ~6.7M source rows

Real numbers from this dataset:
- Cash pay for the same procedure ranges from $378 (Cleveland Clinic) to $6,481 (Cedars-Sinai)
- That's a 17x spread for an identical CPT code
- Commercial insurance ranges go even wider ($60-$14,761)

## Next moves (in order)

1. **Multi-procedure extraction.** Pick 10 shoppable procedures (MRI brain, colonoscopy, mammogram, etc.) and run the extractor for all of them across all 6 hospitals. Confirm the price-spread story holds beyond knee MRI.
2. **NYU wide-format parser.** ~1,979 columns, one per payer/plan. Separate code path. ~1 day of work.
3. **Payer name normalization.** Same insurer shows up as "Blue Cross Blue Shield HMO," "BCBS Illinois," "Anthem BCBS," etc. Build a fuzzy-match or curated lookup table. This is the longest open task.
4. **Database layer.** Pipe normalized rows into Postgres or SQLite. Stop re-parsing files for every query.
5. **Consumer UI.** Search by procedure + zip code, return hospital comparison. Mobile-first.

## Architecture

```
raw-files/                              <-- gitignored, ~3.7GB on disk
  cedars-sinai.json                     843MB
  ucla-ronald-reagan.json               477MB
  providence-st-joseph.json             215MB
  houston-methodist.json                 69MB
  cleveland-clinic.zip                   49MB compressed
  cleveland-clinic-unzipped/*.csv       1.5GB
  nyu-langone-tisch.csv                 460MB
  advocate-christ.csv                   141MB
  manifest.json
  mri-73721-results.json                <-- generated extraction output

scripts/
  download-mrfs.mjs                     fetch all hospital files to raw-files/
  extract-mri.mjs                       streaming extractor for CPT 73721
  summarize-mri.mjs                     aggregate results into price comparison
```

## How to run

```bash
npm install
node scripts/download-mrfs.mjs        # ~90 seconds, downloads ~2.3GB
unzip raw-files/cleveland-clinic.zip -d raw-files/cleveland-clinic-unzipped/
node scripts/extract-mri.mjs           # ~50 seconds, produces results.json
node scripts/summarize-mri.mjs         # instant, prints comparison table
```

## Known issues / sharp edges

- **Cedars-Sinai** is on CMS v2.0.0; everyone else is v3.0.0. Parser handles both because the field shape is similar enough, but a strict v3-only parser would miss Cedars.
- **Cleveland Clinic** ships a 51MB zip that decompresses to 1.6GB CSV. Standard CSV parsers blow up. The extractor handles it via line-streaming with an early CPT-code filter before parsing.
- **NYU Langone** uses a CMS-permitted but unusual "wide" format with ~1,979 columns. Currently skipped. Needs its own parser.
- **Mayo Clinic** (not in this set) blocks all programmatic access via Akamai. Would require headless browser or manual download.
- **Kaiser LA** (not in this set) publishes a 3-year-old non-CMS-format zip with only their own plan rates. Skip-or-special-case decision.
- **Payer normalization is unsolved.** Comparing "Anthem PPO" at one hospital to "Blue Cross Anthem" at another requires a mapping table or fuzzy match that does not exist yet.

## Background research

The full audit of all 10 sampled hospitals (formats, sizes, schemas, compliance issues) lives at:
`/Users/superhenri/Obsidian-Vaults/Mission Control/Research/Hospital-MRF-Audit-2026-04-25.md`

The competitive scan that led to this build (why this market vs. the other 5 considered) lives at:
`/Users/superhenri/Obsidian-Vaults/Mission Control/Research/Database-Sites-Opportunity-Scan-2026-04-25.md`
