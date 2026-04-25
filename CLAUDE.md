# CLAUDE.md

Instructions for any Claude Code session opened in this repo.

## Read first

Read `README.md` before doing anything. It has full project state, what's built, what's next, and the sharp edges. The README is the source of truth for project status.

## What you're working on

A consumer-facing hospital price comparison tool, built on top of CMS-mandated hospital Machine-Readable Files (MRFs). The data is free and public; the moat is normalization plus UI. Direct competitors on the consumer side: weak (billy.health, Healthcare Bluebook). B2B competitors: strong but not chasing consumers (Turquoise Health, Serif Health).

The project is post-spike, pre-product. The data pipeline works end-to-end on a sample of 6 hospitals for one procedure. Next stage is breadth (more procedures, more hospitals) then a real database and a real UI.

## House rules

- **No em dashes anywhere.** This is a hard rule across all of Eric's projects. Use periods or restructure. Em dashes get ripped out on review.
- **Streaming-first.** The MRF files are huge (1.6GB CSV is the largest in the current set). Never load a whole file into memory. Use `stream-json` for JSON and node `readline` + `csv-parse` for CSV. The existing extractor in `scripts/extract-mri.mjs` is the reference pattern.
- **Don't re-download blindly.** Files in `raw-files/` are gitignored and live locally. Only re-run `download-mrfs.mjs` if explicitly asked or if a file is stale or missing.
- **Add/remove hospitals via the array** in `scripts/download-mrfs.mjs` (`HOSPITALS` const). Each entry is `{id, name, url, ext}`. The id is used as the filename stem.
- **CMS schema fields:** the parser knows about both v2.0.0 nested JSON (Cedars-Sinai) and v3.0.0 nested JSON (everyone else's JSON). For CSV it expects the v3 tall format with `code|1`, `code|1|type`, `payer_name`, `plan_name`, `standard_charge|negotiated_dollar`, `standard_charge|gross`, `standard_charge|discounted_cash`, `standard_charge|methodology` columns.
- **Wide CSV is unsolved.** NYU Langone uses ~1,979 columns. Don't try to make `extract-mri.mjs` handle it. Write a separate `extract-mri-wide.mjs` if needed.

## Stack

- Node.js 22 (ESM modules, `.mjs` files)
- `stream-json` v2.x — streaming JSON parser
- `stream-chain` — pipeline glue for stream-json (required by the v2 API)
- `csv-parse` — CSV parser
- No framework, no TypeScript yet, no database yet. Resist adding any of these until they are clearly needed.

## Conventions

- Scripts are standalone `.mjs` files in `scripts/`. They write outputs to `raw-files/` (data) or print to stdout (summaries).
- Hospital IDs use kebab-case slugs that match the `id` field in `download-mrfs.mjs` (e.g. `cedars-sinai`, `cleveland-clinic`, `ucla-ronald-reagan`).
- CPT codes are strings, not numbers. Always compare with `===` against a string literal.
- Negotiated rates can be: a dollar amount, a percentage of gross charge, an algorithmic formula in plain English, or a "case rate" notation. The current extractor pulls only dollar amounts. Percentage and algorithm fields exist (`standard_charge|negotiated_percentage`, `standard_charge|negotiated_algorithm`) and matter for full coverage but are out of scope for the dollar-only consumer comparison.

## What not to build yet

- No backend API server. The only "queries" right now are scripts that re-read the raw files. This is correct for the current stage.
- No frontend. The proof is in the data tables, not the UI.
- No database. Re-parsing 6.7M rows takes 49 seconds. Until iteration speed becomes the bottleneck, the database layer is overkill.
- No CI, no tests, no Docker. This is a research repo, not a product repo. Promote things only when they earn it.
- No auth, no users, no Stripe. Way too early.

## When stuck

If a hospital MRF download fails, check:
1. Their `cms-hpt.txt` file (e.g. `https://www.cedars-sinai.org/cms-hpt.txt`) — that's the CMS-required pointer file listing the current MRF URL.
2. The CMS Hospital Price Transparency compliance list.
3. The DoltHub `dolthub/hospital-price-transparency` dataset for community-sourced URLs.

If the parser misses rows for a procedure that should be there, the most common causes:
1. The CPT code is in `code|2` or `code|3`, not `code|1`. The extractor handles this; check the columns weren't renamed.
2. The hospital uses HCPCS or MS-DRG instead of CPT for that service line. Different code system, different number.
3. The procedure is split into modifier-specific entries (`-TC`, `-26`, etc.). May need to look at `modifiers` column.
