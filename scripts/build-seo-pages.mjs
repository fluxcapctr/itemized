// Generate SEO landing pages for each CPT/procedure plus sitemap.xml and
// robots.txt. Output goes to ui/dist/procedure/{slug}.html alongside the
// React app.
//
// Each page is intentionally a static, content-rich page that:
//   - has a unique <title>, meta description, og tags, and canonical URL
//   - embeds real top-5 hospital data so the page is useful even without JS
//   - links to the interactive React app for users who want to filter
//   - publishes JSON-LD (MedicalProcedure, FAQPage, BreadcrumbList) so
//     Google has rich-snippet inputs
//
// Run:  node scripts/build-seo-pages.mjs
// Or:   npm run build:prod  (chained at the end)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const UI_DIR = path.join(REPO, "ui");
const DIST_DIR = path.join(UI_DIR, "dist");
const SITE_ORIGIN = "https://itemized.health";

// Metro-area clustering. Our hospital `metro` field is the literal city
// ("Burbank, CA" / "Bronx, NY"), which is too granular for comparison
// pages. People search "Cedars-Sinai vs UCLA" expecting all greater-LA
// hospitals to pair with each other regardless of which suburb they're
// in. This map normalizes city-metros to their broader regional cluster.
//
// Cities not listed fall back to their raw metro string.
const METRO_CLUSTERS = {
  // Greater Los Angeles
  "Los Angeles, CA": "Greater Los Angeles, CA",
  "Santa Monica, CA": "Greater Los Angeles, CA",
  "Glendale, CA": "Greater Los Angeles, CA",
  "Newport Beach, CA": "Greater Los Angeles, CA",
  "Monterey Park, CA": "Greater Los Angeles, CA",
  "Long Beach, CA": "Greater Los Angeles, CA",
  "Arcadia, CA": "Greater Los Angeles, CA",
  "Sylmar, CA": "Greater Los Angeles, CA",
  "Torrance, CA": "Greater Los Angeles, CA",
  "Pasadena, CA": "Greater Los Angeles, CA",
  "Marina del Rey, CA": "Greater Los Angeles, CA",
  "Pomona, CA": "Greater Los Angeles, CA",
  "Lynwood, CA": "Greater Los Angeles, CA",
  "Whittier, CA": "Greater Los Angeles, CA",
  "San Gabriel, CA": "Greater Los Angeles, CA",
  "South El Monte, CA": "Greater Los Angeles, CA",
  "Tarzana, CA": "Greater Los Angeles, CA",
  "Norwalk, CA": "Greater Los Angeles, CA",
  "Montebello, CA": "Greater Los Angeles, CA",
  "Simi Valley, CA": "Greater Los Angeles, CA",
  // Greater New York
  "New York, NY": "Greater New York, NY",
  "Bronx, NY": "Greater New York, NY",
  "Brooklyn, NY": "Greater New York, NY",
  "Queens, NY": "Greater New York, NY",
  // Greater Boston
  "Boston, MA": "Greater Boston, MA",
  "Burlington, MA": "Greater Boston, MA",
  // Greater Chicago
  "Chicago, IL": "Greater Chicago, IL",
  "Maywood, IL": "Greater Chicago, IL",
  "Park Ridge, IL": "Greater Chicago, IL",
  "Evanston, IL": "Greater Chicago, IL",
  // Greater Houston
  "Houston, TX": "Greater Houston, TX",
  "Sugar Land, TX": "Greater Houston, TX",
  // Greater Atlanta
  "Atlanta, GA": "Greater Atlanta, GA",
  "Marietta, GA": "Greater Atlanta, GA",
  // Greater Detroit
  "Detroit, MI": "Greater Detroit, MI",
  "West Bloomfield, MI": "Greater Detroit, MI",
  "Royal Oak, MI": "Greater Detroit, MI",
  "Troy, MI": "Greater Detroit, MI",
  "Farmington Hills, MI": "Greater Detroit, MI",
  "Dearborn, MI": "Greater Detroit, MI",
  // Greater Pittsburgh
  "Pittsburgh, PA": "Greater Pittsburgh, PA",
  "Jefferson Hills, PA": "Greater Pittsburgh, PA",
  // Greater Tampa Bay
  "Tampa, FL": "Greater Tampa, FL",
  "Clearwater, FL": "Greater Tampa, FL",
  // Greater Miami
  "Miami, FL": "Greater Miami, FL",
  "North Miami Beach, FL": "Greater Miami, FL",
  "Coral Gables, FL": "Greater Miami, FL",
  "Homestead, FL": "Greater Miami, FL",
  // Greater Austin
  "Austin, TX": "Greater Austin, TX",
  "Round Rock, TX": "Greater Austin, TX",
  // SF Bay Area
  "Palo Alto, CA": "SF Bay Area, CA",
  "Pleasanton, CA": "SF Bay Area, CA",
  "Oakland, CA": "SF Bay Area, CA",
  "Redwood City, CA": "SF Bay Area, CA",
  "Walnut Creek, CA": "SF Bay Area, CA",
  "Concord, CA": "SF Bay Area, CA",
  // Greater San Diego
  "San Diego, CA": "Greater San Diego, CA",
  "La Mesa, CA": "Greater San Diego, CA",
  "La Jolla, CA": "Greater San Diego, CA",
};

function metroCluster(metro) {
  return METRO_CLUSTERS[metro] || metro;
}

// US state abbreviation -> full name. Used for state-level rollup pages.
const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// ── Helpers ─────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents.
    .replace(/[̀-ͯ]/g, "")
    // Treat slashes, ampersands, plus signs, parens, colons as word boundaries
    // so "Knee/Lower-Extremity" becomes "knee-lower-extremity" not
    // "kneelower-extremity".
    .replace(/[/&+()[\]:;,]/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function fmtMoney(n) {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

function escHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(s) {
  return escHtml(s);
}

// Read window.ITEMIZED_DATA from the data.real.js bundle.
function loadIndex() {
  const txt = fs.readFileSync(path.join(UI_DIR, "data.real.js"), "utf8");
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function("window", txt);
  fn(sandbox.window);
  return sandbox.window.ITEMIZED_DATA;
}

// Read window.ITEMIZED_RATINGS from the ratings.real.js bundle.
function loadRatings() {
  const fp = path.join(UI_DIR, "ratings.real.js");
  if (!fs.existsSync(fp)) return { ratings: {} };
  const txt = fs.readFileSync(fp, "utf8");
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function("window", txt);
  fn(sandbox.window);
  return sandbox.window.ITEMIZED_RATINGS || { ratings: {} };
}

// Read window.ITEMIZED_HCAHPS from the hcahps.real.js bundle.
function loadHcahps() {
  const fp = path.join(UI_DIR, "hcahps.real.js");
  if (!fs.existsSync(fp)) return { measures: [], benchmarks: {}, hospitals: {} };
  const txt = fs.readFileSync(fp, "utf8");
  const sandbox = { window: {} };
  // eslint-disable-next-line no-new-func
  new Function("window", txt)(sandbox.window);
  return sandbox.window.ITEMIZED_HCAHPS || { measures: [], benchmarks: {}, hospitals: {} };
}

// Format an HCAHPS value with its unit ("75%" or "3/5").
function fmtHcahps(value, kind) {
  if (value == null || !Number.isFinite(value)) return "—";
  return kind === "stars" ? `${value}/5` : `${value}%`;
}

// Render a Patient Experience panel for a single hospital. Shows the 9
// measures + delta from the network benchmark.
function renderHcahpsBlock(hcahpsForHospital, hcahpsMeta) {
  if (!hcahpsForHospital || !hcahpsMeta?.measures?.length) return "";
  const sample = hcahpsForHospital.sample_size;
  const period = hcahpsForHospital.period_end || hcahpsMeta.period;
  const rows = hcahpsMeta.measures.map((m) => {
    const v = hcahpsForHospital.measures?.[m.short];
    const bench = hcahpsMeta.benchmarks?.[m.short]?.mean;
    let deltaCell = "—";
    if (Number.isFinite(v) && Number.isFinite(bench)) {
      const diff = m.kind === "stars" ? (v - bench).toFixed(1) : Math.round(v - bench);
      const sign = diff > 0 ? "+" : "";
      const klass = diff > 0 ? "delta-up" : (diff < 0 ? "delta-down" : "delta-flat");
      const unit = m.kind === "stars" ? "" : "pp";
      deltaCell = `<span class="${klass}">${sign}${diff}${unit}</span>`;
    }
    return `      <tr>
        <td class="hc-label">${escHtml(m.label)}</td>
        <td class="hc-val">${escHtml(fmtHcahps(v, m.kind))}</td>
        <td class="hc-bench">${escHtml(fmtHcahps(bench, m.kind))}</td>
        <td class="hc-delta">${deltaCell}</td>
      </tr>`;
  }).join("\n");
  return `
  <h2 class="display">Patient experience.</h2>
  <p style="font-size:14px;color:var(--ink-3);margin:0 0 12px">CMS HCAHPS patient survey, period ending ${escHtml(period || "—")}${sample ? ` · ${sample.toLocaleString("en-US")} completed surveys` : ""}.</p>
  <table class="hospitals hcahps">
    <thead>
      <tr>
        <th>Measure</th>
        <th style="text-align:right">This hospital</th>
        <th style="text-align:right">Network avg</th>
        <th style="text-align:right">Δ</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <style>
    table.hospitals.hcahps td.hc-label { font-weight: 500; color: var(--ink-2); font-size: 14px; }
    table.hospitals.hcahps td.hc-val { text-align: right; font-family: var(--display-font); font-weight: 700; font-size: 16px; color: var(--ink); }
    table.hospitals.hcahps td.hc-bench { text-align: right; color: var(--ink-3); font-size: 14px; }
    table.hospitals.hcahps td.hc-delta { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
    .delta-up { color: #2F7D5C; font-weight: 600; }
    .delta-down { color: #B7421C; font-weight: 600; }
    .delta-flat { color: var(--ink-3); }
  </style>`;
}

// Side-by-side HCAHPS table for the comparison page.
function renderHcahpsCompareBlock(aHc, bHc, hcahpsMeta, aName, bName) {
  if ((!aHc && !bHc) || !hcahpsMeta?.measures?.length) return "";
  const rows = hcahpsMeta.measures.map((m) => {
    const av = aHc?.measures?.[m.short];
    const bv = bHc?.measures?.[m.short];
    let aClass = "", bClass = "";
    if (Number.isFinite(av) && Number.isFinite(bv)) {
      if (av > bv) aClass = "win";
      else if (bv > av) bClass = "win";
    }
    return `      <tr>
        <td class="hc-label">${escHtml(m.label)}</td>
        <td class="hc-val ${aClass}">${escHtml(fmtHcahps(av, m.kind))}</td>
        <td class="hc-val ${bClass}">${escHtml(fmtHcahps(bv, m.kind))}</td>
      </tr>`;
  }).join("\n");
  const period = (aHc?.period_end || bHc?.period_end || hcahpsMeta.period || "—");
  return `
  <h2 class="display">Patient experience.</h2>
  <p style="font-size:14px;color:var(--ink-3);margin:0 0 12px">CMS HCAHPS patient survey, period ending ${escHtml(period)}. Bold = higher score.</p>
  <table class="hospitals hcahps">
    <thead>
      <tr>
        <th>Measure</th>
        <th style="text-align:right">${escHtml(aName.split(" ")[0])}</th>
        <th style="text-align:right">${escHtml(bName.split(" ")[0])}</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
  <style>
    table.hospitals.hcahps td.hc-label { font-weight: 500; color: var(--ink-2); font-size: 14px; }
    table.hospitals.hcahps td.hc-val { text-align: right; font-family: var(--display-font); font-weight: 600; font-size: 16px; color: var(--ink-2); }
    table.hospitals.hcahps td.hc-val.win { color: var(--signal); font-weight: 700; }
  </style>`;
}

function loadProcHospitals(code) {
  const fp = path.join(UI_DIR, "data", `${code}.json`);
  if (!fs.existsSync(fp)) return [];
  const j = JSON.parse(fs.readFileSync(fp, "utf8"));
  return j.hospitals || [];
}

// ── Page template ───────────────────────────────────────────────────────

function metroFromHospital(h) {
  return h.metro || "";
}

function renderHospitalRow(h, idx) {
  const cash = fmtMoney(h.cash_pay_low);
  const cashHi = h.cash_pay_high && h.cash_pay_high !== h.cash_pay_low
    ? ` to ${fmtMoney(h.cash_pay_high)}`
    : "";
  const metro = escHtml(metroFromHospital(h));
  return `
    <tr>
      <td class="rank">${idx + 1}</td>
      <td class="name">
        <div class="hname">${escHtml(h.name)}</div>
        <div class="hmetro">${metro}</div>
      </td>
      <td class="price"><strong>${cash}</strong>${cashHi}</td>
    </tr>`;
}

function buildFaqs(proc, low, high, count, metros) {
  const procName = proc.label;
  const lowStr = fmtMoney(low);
  const highStr = fmtMoney(high);
  const cptCode = proc.code;
  return [
    {
      q: `How much does ${procName.toLowerCase()} cost in 2026?`,
      a: `Cash-pay prices for ${procName.toLowerCase()} (CPT ${cptCode}) range from ${lowStr} to ${highStr} across the ${count} hospitals in our dataset. The price varies by hospital, payer, and whether you pay cash or use insurance. Cash-pay rates are often dramatically cheaper than the rate insurance would pay at the same hospital, which is one of the more uncomfortable truths in this data.`,
    },
    {
      q: `Why does ${procName.toLowerCase()} cost so much more at some hospitals than others?`,
      a: `Three reasons. First, hospital chargemasters (the "sticker price") are largely arbitrary and were never designed for consumers. Second, hospitals in expensive real-estate markets (Manhattan, San Francisco, Boston) carry higher facility overhead. Third, the negotiated rate each insurance company pays is the result of confidential bilateral contracts, so the same procedure on the same machine can cost 5x more depending on which insurance card you hand over.`,
    },
    {
      q: `Is the cash price always the cheapest option?`,
      a: `Not always, but more often than you'd expect. For ${procName.toLowerCase()} in our dataset, the cash price beats the negotiated insurance rate at many hospitals, especially for patients with high-deductible plans. Always ask the hospital for both numbers before you decide which to use. If you have a low-deductible plan and the procedure is in-network, insurance is usually still cheaper.`,
    },
    {
      q: `What does the published price include?`,
      a: `For ${procName.toLowerCase()} (CPT ${cptCode}), the published rate generally includes the procedure itself plus the immediately associated facility and professional fees as the hospital has assigned them. It does NOT include separate physician consultations, follow-up visits, prescriptions, or any complications that require additional treatment. Always ask: "Is this the all-in price, or just the facility fee?"`,
    },
    {
      q: `Where does this data come from?`,
      a: `Federal law (45 CFR 180.50, the Hospital Price Transparency Rule) requires every US hospital to publish a machine-readable file with their negotiated rates and cash prices. We download those files directly from each hospital, parse them, and present them in a comparable format. No surveys, no estimates, no scraped review sites. The data is current as of the latest publication date for each hospital.`,
    },
  ];
}

function renderPage({ proc, slug, hospitals, asOf }) {
  const procName = proc.label;
  const procShort = proc.short;
  const procCpt = proc.code;
  const overview = proc.overview || {};
  const overviewHeadline = overview.headline || "";
  const overviewBody = overview.body || "";

  // Sort by cash_pay_low, take top 5 with a published cash price.
  const ranked = hospitals
    .filter((h) => !h.all_missing && Number.isFinite(h.cash_pay_low))
    .sort((a, b) => a.cash_pay_low - b.cash_pay_low);
  const top5 = ranked.slice(0, 5);

  const totalWithCash = ranked.length;
  // Only count hospitals that actually have *some* data for this procedure.
  // Hospitals with all_missing=true are in the master list but published
  // nothing for this CPT, so they shouldn't inflate the page's claims.
  const hospitalsWithData = hospitals.filter((h) => !h.all_missing);
  const totalWithData = hospitalsWithData.length;
  const metros = Array.from(new Set(hospitalsWithData.map((h) => h.metro).filter(Boolean))).sort();
  const lowVal = ranked[0]?.cash_pay_low ?? null;
  const highVal = ranked[ranked.length - 1]?.cash_pay_high ?? ranked[ranked.length - 1]?.cash_pay_low ?? null;
  const spread = lowVal && highVal && lowVal > 0 ? Math.round(highVal / lowVal) : null;

  // Page title: aim for ~60-65 chars (Google truncates around 60-70 in
  // search results). We'll keep the full string and let Google handle
  // truncation rather than chop ourselves and lose the brand suffix.
  const title = `${procName} Cost. Compare ${totalWithData} Hospitals. Itemized.`;

  const descLow = lowVal ? fmtMoney(lowVal) : "see range";
  const descHigh = highVal ? fmtMoney(highVal) : "varies";
  const description = `What does ${procName.toLowerCase()} (CPT ${procCpt}) cost in 2026? Cash-pay range: ${descLow} to ${descHigh} across ${totalWithData} hospitals in ${metros.length} US metros. Real CMS-mandated price transparency data.`;

  const canonical = `${SITE_ORIGIN}/procedure/${slug}`;

  // ── JSON-LD ────────────────────────────────────────────────────────
  const medicalProcedureSchema = {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: procName,
    code: {
      "@type": "MedicalCode",
      codeValue: procCpt,
      codingSystem: "CPT",
    },
    description: overviewBody.split("\n\n")[0] || description,
    url: canonical,
  };

  const aggregateOfferSchema = lowVal && highVal ? {
    "@context": "https://schema.org",
    "@type": "AggregateOffer",
    name: `${procName} cash-pay price range`,
    priceCurrency: "USD",
    lowPrice: Math.round(lowVal),
    highPrice: Math.round(highVal),
    offerCount: totalWithCash,
    description: `Cash-pay prices for ${procName.toLowerCase()} at ${totalWithCash} US hospitals.`,
    url: canonical,
  } : null;

  const faqs = buildFaqs(proc, lowVal, highVal, totalWithData, metros);
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Procedures", item: SITE_ORIGIN + "/procedure" },
      { "@type": "ListItem", position: 3, name: procName, item: canonical },
    ],
  };

  const ldBlocks = [
    medicalProcedureSchema,
    aggregateOfferSchema,
    faqSchema,
    breadcrumbSchema,
  ].filter(Boolean);

  // ── HTML body ──────────────────────────────────────────────────────
  const top5Rows = top5.length
    ? top5.map(renderHospitalRow).join("")
    : `<tr><td colspan="3" class="empty">No hospital in our dataset published a cash price for ${escHtml(procName.toLowerCase())} as of ${escHtml(asOf)}.</td></tr>`;

  const overviewBodyHtml = overviewBody
    .split("\n\n")
    .map((p) => `<p>${escHtml(p)}</p>`)
    .join("\n        ");

  const faqHtml = faqs.map((f, i) => `
        <details class="faq-item"${i === 0 ? " open" : ""}>
          <summary><span class="faq-q">${escHtml(f.q)}</span><span class="faq-icon">+</span></summary>
          <div class="faq-a">${escHtml(f.a)}</div>
        </details>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">

  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(title)}">
  <meta name="twitter:description" content="${escAttr(description)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

  <style>
    :root {
      --paper: #F5F1EA;
      --paper-2: #EFEAE1;
      --ink: #0F0E0C;
      --ink-2: #2A2925;
      --ink-3: #6B675F;
      --rule: #2A2925;
      --rule-soft: rgba(15, 14, 12, 0.10);
      --signal: #5B3FE0;
      --signal-soft: #ECE6FE;
      --display-font: 'Bricolage Grotesque', system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--paper);
      color: var(--ink);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 920px; margin: 0 auto; padding: 24px; }
    .nav {
      max-width: 1280px; margin: 0 auto; padding: 18px 24px;
      display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid var(--rule-soft);
    }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; letter-spacing: -0.02em; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter', sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; letter-spacing: 0; }
    .nav-right { display: flex; align-items: center; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    .nav-right a:hover { color: var(--ink); }

    .crumb { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 16px; }
    .crumb a { color: var(--ink-3); text-decoration: none; }
    .crumb a:hover { color: var(--ink); }

    h1.display, h2.display, h3.display { font-family: var(--display-font); letter-spacing: -0.02em; line-height: 1.05; }
    h1.display { font-size: clamp(40px, 6vw, 64px); margin: 0 0 16px; font-weight: 700; }
    h2.display { font-size: clamp(28px, 3.5vw, 40px); margin: 48px 0 16px; font-weight: 700; }
    h3.display { font-size: 22px; margin: 24px 0 8px; font-weight: 600; }
    .accent { color: var(--signal); }

    .lede { font-size: 18px; color: var(--ink-2); margin: 0 0 32px; max-width: 60ch; }
    .lede strong { color: var(--ink); }

    .pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: stretch; margin: 24px 0 32px; }
    .pair-card { background: var(--paper-2); border-radius: 24px; padding: 24px; }
    .pair-card.lo { background: var(--signal-soft); }
    .pair-card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 8px; }
    .pair-card .num { font-family: var(--display-font); font-size: clamp(36px, 4vw, 56px); font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
    .pair-card .num .cur { font-size: 0.6em; vertical-align: 0.18em; margin-right: 2px; color: var(--ink-3); }
    .pair-card .who { margin-top: 12px; font-size: 14px; color: var(--ink-2); }
    .pair-card .who .h { font-weight: 600; }
    .pair-card .who .m { color: var(--ink-3); font-size: 13px; }
    .pair .vs { display: flex; align-items: center; justify-content: center; font-family: var(--display-font); font-size: 18px; color: var(--ink-3); }

    table.hospitals { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
    table.hospitals th, table.hospitals td { padding: 14px 8px; text-align: left; border-bottom: 1px solid var(--rule-soft); }
    table.hospitals th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 500; }
    table.hospitals td.rank { width: 36px; color: var(--ink-3); font-family: 'JetBrains Mono', monospace; font-size: 14px; }
    table.hospitals td.name .hname { font-weight: 600; font-size: 16px; }
    table.hospitals td.name .hmetro { color: var(--ink-3); font-size: 13px; margin-top: 2px; }
    table.hospitals td.price { text-align: right; font-family: var(--display-font); font-size: 18px; font-weight: 600; }
    table.hospitals td.empty { text-align: center; color: var(--ink-3); padding: 24px 8px; font-style: italic; }

    .cta {
      background: var(--ink); color: var(--paper); border-radius: 24px;
      padding: 32px 28px; margin: 32px 0;
    }
    .cta h2 { color: var(--paper); margin: 0 0 12px; font-family: var(--display-font); font-size: 28px; letter-spacing: -0.02em; }
    .cta p { color: rgba(245,241,234,0.8); margin: 0 0 16px; font-size: 16px; }
    .cta a {
      display: inline-block; background: var(--signal); color: var(--paper);
      padding: 14px 22px; border-radius: 12px; text-decoration: none;
      font-weight: 600; font-size: 16px;
    }
    .cta a:hover { background: #6E55EA; }

    .body-prose { max-width: 64ch; }
    .body-prose p { margin: 0 0 16px; color: var(--ink-2); font-size: 16px; }

    .faq-item { border-bottom: 1px solid var(--rule-soft); padding: 16px 0; }
    .faq-item summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; }
    .faq-item summary::-webkit-details-marker { display: none; }
    .faq-q { font-weight: 600; font-size: 16px; color: var(--ink); }
    .faq-icon { font-family: var(--display-font); color: var(--ink-3); }
    .faq-item[open] .faq-icon { transform: rotate(45deg); }
    .faq-a { padding: 12px 0 0; color: var(--ink-2); font-size: 15px; max-width: 64ch; }

    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 48px; color: var(--ink-3); font-size: 13px; }
    footer .foot-disc { margin-top: 8px; font-style: italic; }
    footer a { color: var(--ink-2); }

    @media (max-width: 720px) {
      .pair { grid-template-columns: 1fr; }
      .pair .vs { transform: rotate(90deg); }
    }
  </style>

${ldBlocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b, null, 2)}</script>`).join("\n")}
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">

  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/?p=${escAttr(procCpt)}">Procedures</a> &nbsp;·&nbsp; ${escHtml(procName)}
  </div>

  <h1 class="display">${escHtml(procName)} <span class="accent">cost</span>.</h1>
  <p class="lede">
    What ${escHtml(procName.toLowerCase())} costs at <strong>${totalWithData} US hospitals</strong> across <strong>${metros.length} metros</strong>, pulled from the federally-mandated machine-readable files each hospital is required to publish. Cash-pay range: <strong>${escHtml(fmtMoney(lowVal))}</strong> to <strong>${escHtml(fmtMoney(highVal))}</strong>${spread ? ` (${spread}× spread)` : ""}. CPT code <strong>${escHtml(procCpt)}</strong>.
  </p>

  ${(lowVal != null && highVal != null) ? `
  <section>
    <div class="pair">
      <div class="pair-card lo">
        <div class="lbl">Cheapest cash price</div>
        <div class="num"><span class="cur">$</span>${escHtml(Math.round(lowVal).toLocaleString("en-US"))}</div>
        <div class="who">
          <div class="h">${escHtml(ranked[0].name)}</div>
          <div class="m">${escHtml(metroFromHospital(ranked[0]))}</div>
        </div>
      </div>
      <div class="vs">vs.</div>
      <div class="pair-card hi">
        <div class="lbl">Most expensive cash price</div>
        <div class="num"><span class="cur">$</span>${escHtml(Math.round(highVal).toLocaleString("en-US"))}</div>
        <div class="who">
          <div class="h">${escHtml(ranked[ranked.length - 1].name)}</div>
          <div class="m">${escHtml(metroFromHospital(ranked[ranked.length - 1]))}</div>
        </div>
      </div>
    </div>
  </section>` : ""}

  <h2 class="display">Top 5 cheapest hospitals for ${escHtml(procShort.toLowerCase())}.</h2>
  <table class="hospitals">
    <thead>
      <tr>
        <th>#</th>
        <th>Hospital</th>
        <th style="text-align:right">Cash price</th>
      </tr>
    </thead>
    <tbody>${top5Rows}
    </tbody>
  </table>

  <div class="cta">
    <h2>See all ${totalWithData} hospitals, your insurance, your zip.</h2>
    <p>Pick your insurance plan, enter your zip, see your estimated out-of-pocket cost. Same data, your view.</p>
    <a href="/?p=${escAttr(procCpt)}">Compare ${escHtml(procShort.toLowerCase())} prices  →</a>
  </div>

  ${overviewHeadline || overviewBody ? `
  <h2 class="display">What is ${escHtml(procName.toLowerCase())}?</h2>
  <div class="body-prose">
    ${overviewHeadline ? `<p><strong>${escHtml(overviewHeadline)}</strong></p>` : ""}
    ${overviewBodyHtml}
  </div>` : ""}

  <h2 class="display">Why prices vary this much.</h2>
  <div class="body-prose">
    <p>The same ${escHtml(procName.toLowerCase())} on the same equipment can cost ${spread ? `${spread} times more` : "many times more"} at one hospital than another. Three reasons.</p>
    <p><strong>Chargemasters are arbitrary.</strong> The "sticker price" hospitals publish was never designed for consumers. It's a starting number for negotiation with insurance companies, with adjustments stacked on top for decades. Almost no one pays the chargemaster.</p>
    <p><strong>Negotiated rates are confidential bilateral contracts.</strong> Each insurance company negotiates its own rate with each hospital. Aetna at Hospital A might pay 60% of what Cigna pays at the same hospital for the same code. You see one rate; the hospital sees dozens.</p>
    <p><strong>Cash pay is a separate thing entirely.</strong> Many hospitals offer a "self-pay" or "cash-pay" rate that's dramatically cheaper than what they'd bill insurance, especially for elective imaging. If you have a high-deductible plan, paying cash and filing for reimbursement (or just eating the cost) can be the cheapest path.</p>
  </div>

  <h2 class="display">What to ask the hospital before you book.</h2>
  <div class="body-prose">
    <p>The four questions that surface hidden costs:</p>
    <p><strong>1.</strong> "Is the price you're quoting me the all-in price, or just the facility fee?" Hospitals often quote the facility fee and bill the radiologist or anesthesiologist separately on a different invoice.</p>
    <p><strong>2.</strong> "What's the cash-pay rate vs the rate you'd bill my insurance?" Don't assume insurance is cheaper. For high-deductible plans, cash pay is often the better deal.</p>
    <p><strong>3.</strong> "If I'm uninsured, do you have a financial assistance policy I qualify for?" Federally-tax-exempt hospitals are required to have one, and it can knock 50-100% off the bill for households under specific income thresholds.</p>
    <p><strong>4.</strong> "If I get a bill and the price is different than what was quoted, what's your dispute process?" Get the answer before you book, in writing if possible. If the bill comes in higher than the quote, you have leverage.</p>
  </div>

  <h2 class="display">Common questions.</h2>
  <div class="faq-list">
${faqHtml}
  </div>

  <footer>
    <div>
      <strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50) machine-readable files, downloaded directly from each hospital. CMS Hospital Care Compare (dataset xubh-q36u) for quality ratings. Last refresh: ${escHtml(asOf)}.
    </div>
    <div class="foot-disc">A consumer reading of CMS-mandated MRF data. Not medical or financial advice. Itemized · <a href="/">itemized.health</a></div>
  </footer>
</main>

</body>
</html>`;
}

// ── Per-(metro, procedure) page ─────────────────────────────────────────

// Slug a metro string ("Los Angeles, CA") to a URL fragment ("los-angeles").
// We drop the state since our 13+ metros don't currently collide.
function metroSlug(metro) {
  if (!metro) return "";
  const city = metro.split(",")[0];
  return slugify(city);
}

function renderMetroPage({ proc, procSlug, metro, hospitalsInMetro, asOf }) {
  const procName = proc.label;
  const procShort = proc.short;
  const procCpt = proc.code;
  const cityName = metro.split(",")[0];
  const stateAbbr = (metro.split(",")[1] || "").trim();

  // Sort the metro hospitals by cash price ascending; only those with a
  // published cash price feed the headline numbers.
  const ranked = hospitalsInMetro
    .filter((h) => !h.all_missing && Number.isFinite(h.cash_pay_low))
    .sort((a, b) => a.cash_pay_low - b.cash_pay_low);
  const totalInMetro = hospitalsInMetro.filter((h) => !h.all_missing).length;
  const totalWithCash = ranked.length;
  const lowVal = ranked[0]?.cash_pay_low ?? null;
  const highVal = ranked[ranked.length - 1]?.cash_pay_high ?? ranked[ranked.length - 1]?.cash_pay_low ?? null;
  const spread = lowVal && highVal && lowVal > 0 ? Math.round(highVal / lowVal) : null;

  const mSlug = metroSlug(metro);
  const slug = `${procSlug}/in/${mSlug}`;
  const canonical = `${SITE_ORIGIN}/procedure/${slug}`;
  const parentCanonical = `${SITE_ORIGIN}/procedure/${procSlug}`;

  const title = `${procName} cost in ${cityName}${stateAbbr ? `, ${stateAbbr}` : ""}. Compare ${totalInMetro} hospitals. Itemized.`;
  const descLow = lowVal ? fmtMoney(lowVal) : "see range";
  const descHigh = highVal ? fmtMoney(highVal) : "varies";
  const description = `${procName} cost in ${cityName}${stateAbbr ? `, ${stateAbbr}` : ""}. Cash-pay range: ${descLow} to ${descHigh} across ${totalInMetro} ${cityName}-area hospitals. Real CMS-mandated price transparency data.`;

  // ── JSON-LD ────────────────────────────────────────────────────────
  const medicalProcedureSchema = {
    "@context": "https://schema.org",
    "@type": "MedicalProcedure",
    name: procName,
    code: { "@type": "MedicalCode", codeValue: procCpt, codingSystem: "CPT" },
    description: `${procName} pricing at hospitals in the ${cityName} metro area.`,
    url: canonical,
  };
  const aggregateOfferSchema = lowVal && highVal ? {
    "@context": "https://schema.org",
    "@type": "AggregateOffer",
    name: `${procName} cash-pay price range in ${cityName}`,
    priceCurrency: "USD",
    lowPrice: Math.round(lowVal),
    highPrice: Math.round(highVal),
    offerCount: totalWithCash,
    description: `Cash-pay prices for ${procName.toLowerCase()} at ${totalWithCash} ${cityName}-area hospitals.`,
    url: canonical,
  } : null;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Procedures", item: SITE_ORIGIN + "/procedure" },
      { "@type": "ListItem", position: 3, name: procName, item: parentCanonical },
      { "@type": "ListItem", position: 4, name: cityName, item: canonical },
    ],
  };
  const ldBlocks = [medicalProcedureSchema, aggregateOfferSchema, breadcrumbSchema].filter(Boolean);

  const tableRows = ranked.length
    ? ranked.map(renderHospitalRow).join("")
    : `<tr><td colspan="3" class="empty">No ${escHtml(cityName)}-area hospital published a cash price for ${escHtml(procName.toLowerCase())} as of ${escHtml(asOf)}.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --signal-soft:#ECE6FE; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased; }
    .container { max-width: 920px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    .crumb { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 16px; }
    .crumb a { color: var(--ink-3); text-decoration: none; }
    .crumb a:hover { color: var(--ink); }
    h1.display, h2.display { font-family: var(--display-font); letter-spacing: -0.02em; line-height: 1.05; }
    h1.display { font-size: clamp(36px, 5.5vw, 56px); margin: 0 0 16px; font-weight: 700; }
    h2.display { font-size: clamp(24px, 3vw, 36px); margin: 40px 0 14px; font-weight: 700; }
    .accent { color: var(--signal); }
    .lede { font-size: 18px; color: var(--ink-2); margin: 0 0 28px; max-width: 60ch; }
    .lede strong { color: var(--ink); }
    .pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: stretch; margin: 24px 0 32px; }
    .pair-card { background: var(--paper-2); border-radius: 24px; padding: 24px; }
    .pair-card.lo { background: var(--signal-soft); }
    .pair-card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 8px; }
    .pair-card .num { font-family: var(--display-font); font-size: clamp(34px, 4vw, 50px); font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
    .pair-card .num .cur { font-size: 0.6em; vertical-align: 0.18em; margin-right: 2px; color: var(--ink-3); }
    .pair-card .who { margin-top: 12px; font-size: 14px; color: var(--ink-2); }
    .pair-card .who .h { font-weight: 600; }
    .pair-card .who .m { color: var(--ink-3); font-size: 13px; }
    .pair .vs { display: flex; align-items: center; justify-content: center; font-family: var(--display-font); font-size: 18px; color: var(--ink-3); }
    table.hospitals { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
    table.hospitals th, table.hospitals td { padding: 14px 8px; text-align: left; border-bottom: 1px solid var(--rule-soft); }
    table.hospitals th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 500; }
    table.hospitals td.rank { width: 36px; color: var(--ink-3); font-family: 'JetBrains Mono',monospace; font-size: 14px; }
    table.hospitals td.name .hname { font-weight: 600; font-size: 16px; }
    table.hospitals td.name .hmetro { color: var(--ink-3); font-size: 13px; margin-top: 2px; }
    table.hospitals td.price { text-align: right; font-family: var(--display-font); font-size: 18px; font-weight: 600; }
    table.hospitals td.empty { text-align: center; color: var(--ink-3); padding: 24px 8px; font-style: italic; }
    .cta { background: var(--ink); color: var(--paper); border-radius: 24px; padding: 28px 24px; margin: 32px 0; }
    .cta h2 { color: var(--paper); margin: 0 0 12px; font-family: var(--display-font); font-size: 26px; letter-spacing: -0.02em; }
    .cta p { color: rgba(245,241,234,0.8); margin: 0 0 16px; font-size: 16px; }
    .cta a { display: inline-block; background: var(--signal); color: var(--paper); padding: 14px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .cta a:hover { background: #6E55EA; }
    .body-prose { max-width: 64ch; }
    .body-prose p { margin: 0 0 16px; color: var(--ink-2); font-size: 16px; }
    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 48px; color: var(--ink-3); font-size: 13px; }
    footer .foot-disc { margin-top: 8px; font-style: italic; }
    footer a { color: var(--ink-2); }
    @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } .pair .vs { transform: rotate(90deg); } }
  </style>

${ldBlocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b, null, 2)}</script>`).join("\n")}
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">

  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/procedure">Procedures</a> &nbsp;·&nbsp; <a href="${escAttr(parentCanonical)}">${escHtml(procName)}</a> &nbsp;·&nbsp; ${escHtml(cityName)}
  </div>

  <h1 class="display">${escHtml(procName)} cost in <span class="accent">${escHtml(cityName)}</span>.</h1>
  <p class="lede">
    What ${escHtml(procName.toLowerCase())} costs at <strong>${totalInMetro} ${escHtml(cityName)}-area ${totalInMetro === 1 ? "hospital" : "hospitals"}</strong>, pulled directly from each hospital's federally-mandated price transparency file. Cash-pay range: <strong>${escHtml(fmtMoney(lowVal))}</strong> to <strong>${escHtml(fmtMoney(highVal))}</strong>${spread ? ` (${spread}× spread)` : ""}. CPT code <strong>${escHtml(procCpt)}</strong>.
  </p>

  ${(lowVal != null && highVal != null && ranked.length > 1) ? `
  <section>
    <div class="pair">
      <div class="pair-card lo">
        <div class="lbl">Cheapest in ${escHtml(cityName)}</div>
        <div class="num"><span class="cur">$</span>${escHtml(Math.round(lowVal).toLocaleString("en-US"))}</div>
        <div class="who">
          <div class="h">${escHtml(ranked[0].name)}</div>
          <div class="m">${escHtml(metro)}</div>
        </div>
      </div>
      <div class="vs">vs.</div>
      <div class="pair-card hi">
        <div class="lbl">Most expensive in ${escHtml(cityName)}</div>
        <div class="num"><span class="cur">$</span>${escHtml(Math.round(highVal).toLocaleString("en-US"))}</div>
        <div class="who">
          <div class="h">${escHtml(ranked[ranked.length - 1].name)}</div>
          <div class="m">${escHtml(metro)}</div>
        </div>
      </div>
    </div>
  </section>` : ""}

  <h2 class="display">All ${escHtml(cityName)}-area hospitals.</h2>
  <table class="hospitals">
    <thead>
      <tr>
        <th>#</th>
        <th>Hospital</th>
        <th style="text-align:right">Cash price</th>
      </tr>
    </thead>
    <tbody>${tableRows}
    </tbody>
  </table>

  <div class="cta">
    <h2>See plan-specific prices for your insurance.</h2>
    <p>Pick your insurance plan, see what each ${escHtml(cityName)}-area hospital negotiated. Estimated out-of-pocket included.</p>
    <a href="/?p=${escAttr(procCpt)}">Compare ${escHtml(procShort.toLowerCase())} prices  →</a>
  </div>

  <h2 class="display">${escHtml(procName)}, nationally.</h2>
  <div class="body-prose">
    <p>The ${escHtml(cityName)} numbers above only tell part of the story. The same ${escHtml(procName.toLowerCase())} can vary 10× across US metros, and even within ${escHtml(cityName)} the published prices span ${spread ? `${spread} times` : "many times"} from cheapest to most expensive.</p>
    <p>For the national comparison set, see the <a href="${escAttr(parentCanonical)}">${escHtml(procName)} overview page</a>, which covers ${escHtml(procName.toLowerCase())} prices at every hospital in our dataset.</p>
  </div>

  <h2 class="display">What to ask before you book.</h2>
  <div class="body-prose">
    <p><strong>Is this the all-in price?</strong> Hospitals often quote the facility fee and bill the radiologist, anesthesiologist, or specialist separately. Ask for the bundled total.</p>
    <p><strong>Cash-pay vs. insurance?</strong> Don't assume insurance is cheaper. For high-deductible plans, cash pay often beats the negotiated rate, especially for elective imaging.</p>
    <p><strong>Financial assistance?</strong> Federally-tax-exempt hospitals must have a financial-assistance policy. It can knock 50-100% off the bill for households below specific income thresholds.</p>
  </div>

  <footer>
    <div><strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). Last refresh: ${escHtml(asOf)}.</div>
    <div class="foot-disc">A consumer reading of CMS-mandated MRF data. Not medical or financial advice. Itemized · <a href="/">itemized.health</a></div>
  </footer>
</main>

</body>
</html>`;
}

// ── Procedure index (hub page at /procedure) ───────────────────────────

function renderProcedureIndex({ procedures, hospitalsByProc, asOf }) {
  // Group procedures by category for navigation.
  const byCat = new Map();
  for (const p of procedures) {
    const cat = p.category || "Other";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(p);
  }
  const catOrder = ["Imaging", "Lab", "Procedure", "Surgery", "Office", "Other"];
  const cats = [...byCat.keys()].sort((a, b) => {
    const ai = catOrder.indexOf(a); const bi = catOrder.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const rows = cats.map((cat) => {
    const items = byCat.get(cat).sort((a, b) => a.label.localeCompare(b.label));
    const links = items.map((p) => {
      const slug = p._slug;
      const hospCount = (hospitalsByProc.get(p.code) || []).filter((h) => !h.all_missing).length;
      const range = p.headline?.cash_low != null && p.headline?.cash_high != null
        ? `${fmtMoney(p.headline.cash_low)}<span class="dash"> to </span>${fmtMoney(p.headline.cash_high)}`
        : "<span class=\"dash\">—</span>";
      return `        <li class="proc-row">
          <a class="proc-link" href="/procedure/${escAttr(slug)}">
            <span class="proc-name">${escHtml(p.label)}</span>
            <span class="proc-cpt">CPT ${escHtml(p.code)}</span>
            <span class="proc-range">${range}</span>
            <span class="proc-count">${hospCount} hospitals</span>
          </a>
        </li>`;
    }).join("\n");
    return `      <section class="cat-block">
        <h2 class="display">${escHtml(cat)}</h2>
        <ul class="proc-list">
${links}
        </ul>
      </section>`;
  }).join("\n");

  const totalHosp = (() => {
    const all = new Set();
    for (const list of hospitalsByProc.values()) {
      for (const h of list) if (!h.all_missing) all.add(h.id);
    }
    return all.size;
  })();
  const totalMetros = (() => {
    const m = new Set();
    for (const list of hospitalsByProc.values()) {
      for (const h of list) if (!h.all_missing && h.metro) m.add(h.metro);
    }
    return m.size;
  })();

  const title = `All Procedures · ${procedures.length} medical procedures · Itemized`;
  const description = `Browse ${procedures.length} shoppable medical procedures with real cash-pay and insurance prices from ${totalHosp} US hospitals across ${totalMetros} metros. CMS-mandated price transparency data.`;
  const canonical = `${SITE_ORIGIN}/procedure`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); -webkit-font-smoothing: antialiased; }
    .container { max-width: 1080px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    h1.display { font-family: var(--display-font); font-size: clamp(40px, 6vw, 64px); margin: 0 0 16px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    h2.display { font-family: var(--display-font); font-size: 24px; margin: 32px 0 12px; font-weight: 700; letter-spacing: -0.01em; }
    .lede { font-size: 18px; color: var(--ink-2); max-width: 60ch; margin: 0 0 32px; }
    .accent { color: var(--signal); }
    .proc-list { list-style: none; padding: 0; margin: 0; }
    .proc-link { display: grid; grid-template-columns: 2fr 90px 1.4fr 110px; align-items: center; gap: 16px; padding: 14px 16px; text-decoration: none; color: var(--ink); border-radius: 12px; transition: background 120ms ease; }
    .proc-link:hover { background: var(--paper-2); }
    .proc-name { font-weight: 600; font-size: 15px; }
    .proc-cpt { font-family: 'JetBrains Mono',monospace; font-size: 12px; color: var(--ink-3); }
    .proc-range { font-family: var(--display-font); font-weight: 600; font-size: 15px; color: var(--ink-2); }
    .proc-range .dash { color: var(--ink-3); margin: 0 4px; font-weight: 500; }
    .proc-count { font-size: 12px; color: var(--ink-3); text-align: right; }
    @media (max-width: 720px) { .proc-link { grid-template-columns: 1fr 80px; row-gap: 4px; } .proc-range, .proc-count { grid-column: span 2; text-align: left; } }
    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 64px; color: var(--ink-3); font-size: 13px; }
  </style>
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">
  <h1 class="display"><span class="accent">${procedures.length} procedures.</span><br/>Real prices. Real hospitals.</h1>
  <p class="lede">Compare cash-pay and insurance prices for ${procedures.length} commonly shopped medical procedures across <strong>${totalHosp} US hospitals</strong> in <strong>${totalMetros} metros</strong>. All data pulled directly from CMS-mandated price transparency files. Last refreshed ${asOf}.</p>

${rows}

  <footer>
    <div><strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). CMS Hospital Care Compare (dataset xubh-q36u). Last refresh: ${escHtml(asOf)}.</div>
  </footer>
</main>

</body>
</html>`;
}

// ── Hospital pages ──────────────────────────────────────────────────────

// Build a Hospital JSON-LD blob from the hospital row + (optional) rating.
function hospitalSchema(h, rating, url) {
  const cityState = (h.metro || "").split(",");
  const city = (cityState[0] || "").trim();
  const state = (cityState[1] || "").trim();
  const obj = {
    "@context": "https://schema.org",
    "@type": "Hospital",
    name: h.name,
    url,
  };
  if (h.address) {
    obj.address = {
      "@type": "PostalAddress",
      streetAddress: h.address,
      addressLocality: city || undefined,
      addressRegion: state || undefined,
      postalCode: h.zip || undefined,
      addressCountry: "US",
    };
  }
  if (h.phone) obj.telephone = h.phone;
  if (h.lat != null && h.lon != null) {
    obj.geo = { "@type": "GeoCoordinates", latitude: h.lat, longitude: h.lon };
  }
  if (rating && rating.matched && rating.overall_rating != null) {
    obj.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.overall_rating,
      bestRating: 5,
      worstRating: 1,
      ratingCount: 1,
      reviewAspect: "CMS Hospital Care Compare",
    };
  }
  return obj;
}

// Render the hospital overview page at /hospital/{slug}.
// Lists every procedure where this hospital has a published cash price.
function renderHospitalIndex({ hospital, procRows, rating, asOf, hcahpsForHospital, hcahpsMeta }) {
  // procRows is an array of { proc, slug, cash_pay_low, cash_pay_high } sorted alphabetically.
  const slug = hospital.id;
  const canonical = `${SITE_ORIGIN}/hospital/${slug}`;
  const cityState = hospital.metro || "";
  const city = (cityState.split(",")[0] || "").trim();

  const totalProcs = procRows.length;
  const cashRows = procRows.filter((r) => Number.isFinite(r.cash_pay_low));
  const minCash = cashRows.length ? Math.min(...cashRows.map((r) => r.cash_pay_low)) : null;
  const maxCash = cashRows.length ? Math.max(...cashRows.map((r) => r.cash_pay_high || r.cash_pay_low)) : null;

  const title = `${hospital.name} prices. ${totalProcs} procedures. Itemized.`;
  const description = `Cash-pay and insurance prices for ${totalProcs} procedures at ${hospital.name}${city ? ` in ${city}` : ""}. Real CMS-mandated price transparency data. Last refreshed ${asOf}.`;

  const ldBlocks = [hospitalSchema(hospital, rating, canonical), {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Hospitals", item: SITE_ORIGIN + "/hospital" },
      { "@type": "ListItem", position: 3, name: hospital.name, item: canonical },
    ],
  }];

  const ratingBadge = rating && rating.matched && rating.overall_rating != null
    ? `<span class="rating-badge">${rating.overall_rating}/5 CMS rating</span>`
    : "";

  const procRowsHtml = procRows.map((r) => {
    const range = Number.isFinite(r.cash_pay_low)
      ? (r.cash_pay_high && r.cash_pay_high !== r.cash_pay_low
          ? `${fmtMoney(r.cash_pay_low)}<span class="dash"> to </span>${fmtMoney(r.cash_pay_high)}`
          : fmtMoney(r.cash_pay_low))
      : `<span class="dash">no cash price published</span>`;
    return `        <li class="proc-row">
          <a class="proc-link" href="/hospital/${escAttr(slug)}/${escAttr(r.slug)}">
            <span class="proc-name">${escHtml(r.proc.label)}</span>
            <span class="proc-cpt">CPT ${escHtml(r.proc.code)}</span>
            <span class="proc-range">${range}</span>
          </a>
        </li>`;
  }).join("\n");

  const ratingDetailsHtml = rating && rating.matched && rating.overall_rating != null ? `
  <h2 class="display">CMS quality rating.</h2>
  <div class="body-prose">
    <p><strong>${rating.overall_rating}/5 stars</strong> on CMS Hospital Care Compare. Based on ~50 measures of safety, mortality, readmission, patient experience, and timeliness. ${rating.cms_compare_url ? `<a href="${escAttr(rating.cms_compare_url)}" rel="nofollow noopener" target="_blank">View on Care Compare ↗</a>` : ""}</p>
  </div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --signal-soft:#ECE6FE; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); -webkit-font-smoothing: antialiased; }
    .container { max-width: 1080px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    .crumb { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 16px; }
    .crumb a { color: var(--ink-3); text-decoration: none; }
    .crumb a:hover { color: var(--ink); }
    h1.display { font-family: var(--display-font); font-size: clamp(36px, 5vw, 56px); margin: 0 0 8px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    h2.display { font-family: var(--display-font); font-size: 24px; margin: 32px 0 12px; font-weight: 700; letter-spacing: -0.01em; }
    .accent { color: var(--signal); }
    .lede { font-size: 18px; color: var(--ink-2); max-width: 60ch; margin: 0 0 24px; }
    .h-meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 14px; color: var(--ink-3); margin: 8px 0 24px; }
    .h-meta .h-meta-item { display: flex; align-items: center; gap: 6px; }
    .rating-badge { background: var(--signal-soft); color: var(--signal); font-weight: 600; padding: 4px 10px; border-radius: 999px; font-size: 13px; }
    .proc-list { list-style: none; padding: 0; margin: 0; }
    .proc-link { display: grid; grid-template-columns: 2fr 90px 1.4fr; align-items: center; gap: 16px; padding: 14px 16px; text-decoration: none; color: var(--ink); border-radius: 12px; transition: background 120ms ease; }
    .proc-link:hover { background: var(--paper-2); }
    .proc-name { font-weight: 600; font-size: 15px; }
    .proc-cpt { font-family: 'JetBrains Mono',monospace; font-size: 12px; color: var(--ink-3); }
    .proc-range { font-family: var(--display-font); font-weight: 600; font-size: 15px; color: var(--ink-2); }
    .proc-range .dash { color: var(--ink-3); margin: 0 4px; font-weight: 500; }
    .body-prose { max-width: 64ch; }
    .body-prose p { margin: 0 0 16px; color: var(--ink-2); font-size: 16px; }
    .cta { background: var(--ink); color: var(--paper); border-radius: 24px; padding: 28px 24px; margin: 32px 0; }
    .cta h2 { color: var(--paper); margin: 0 0 12px; font-family: var(--display-font); font-size: 24px; letter-spacing: -0.02em; }
    .cta p { color: rgba(245,241,234,0.8); margin: 0 0 16px; font-size: 16px; }
    .cta a { display: inline-block; background: var(--signal); color: var(--paper); padding: 14px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; }
    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 48px; color: var(--ink-3); font-size: 13px; }
    @media (max-width: 720px) { .proc-link { grid-template-columns: 1fr 80px; } .proc-range { grid-column: span 2; text-align: left; } }
  </style>

${ldBlocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b, null, 2)}</script>`).join("\n")}
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">

  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/hospital">Hospitals</a> &nbsp;·&nbsp; ${escHtml(hospital.name)}
  </div>

  <h1 class="display">${escHtml(hospital.name)}<br/><span class="accent">prices</span>.</h1>
  <div class="h-meta">
    ${hospital.metro ? `<span class="h-meta-item">📍 ${escHtml(hospital.metro)}</span>` : ""}
    ${hospital.system ? `<span class="h-meta-item">${escHtml(hospital.system)}</span>` : ""}
    ${ratingBadge}
  </div>

  <p class="lede">
    ${totalProcs > 0 ? `Cash-pay and insurance prices for <strong>${totalProcs} procedures</strong> at ${escHtml(hospital.name)}, pulled from the federally-mandated machine-readable file the hospital is required to publish.` : `${escHtml(hospital.name)} is in our dataset, but no procedures from our shoppable set had a published cash price as of the last refresh.`}
    ${minCash != null ? ` Cash-pay range across these procedures: <strong>${fmtMoney(minCash)}</strong> to <strong>${fmtMoney(maxCash)}</strong>.` : ""}
  </p>

  ${totalProcs > 0 ? `
  <h2 class="display">Procedure prices.</h2>
  <ul class="proc-list">
${procRowsHtml}
  </ul>` : ""}

  <div class="cta">
    <h2>Compare ${escHtml(hospital.name)} to peers.</h2>
    <p>See how each procedure here stacks up against other hospitals in ${escHtml(city || "your area")} and nationally. Pick your insurance, see your specific rate.</p>
    <a href="/?p=73721">Open the comparison  →</a>
  </div>

  ${ratingDetailsHtml}

  ${renderHcahpsBlock(hcahpsForHospital, hcahpsMeta)}

  <h2 class="display">About this data.</h2>
  <div class="body-prose">
    <p>The prices above are pulled directly from ${escHtml(hospital.name)}'s machine-readable file (MRF), required under the Hospital Price Transparency Rule (45 CFR 180.50). We download the file, parse the rows for our shoppable CPT set, and publish the dollar amounts as the hospital published them. No surveys, no estimates.</p>
    <p>Cash-pay rates are what an uninsured patient would be charged. Insurance-negotiated rates vary by payer and plan; pick a payer in the comparison tool to see plan-specific numbers.</p>
  </div>

  <footer>
    <div><strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). CMS Hospital Care Compare (xubh-q36u). Last refresh: ${escHtml(asOf)}.</div>
    <div style="margin-top:8px;font-style:italic">A consumer reading of CMS-mandated MRF data. Not medical or financial advice. Itemized · <a href="/" style="color:var(--ink-2)">itemized.health</a></div>
  </footer>
</main>

</body>
</html>`;
}

// Render a hospital+procedure page at /hospital/{slug}/{procedure-slug}.
function renderHospitalProcedurePage({ hospital, hospitalSlug, proc, procSlug, asOf, rating, peerHospitals, hcahpsForHospital, hcahpsMeta }) {
  const canonical = `${SITE_ORIGIN}/hospital/${hospitalSlug}/${procSlug}`;
  const hospitalUrl = `${SITE_ORIGIN}/hospital/${hospitalSlug}`;
  const procedureUrl = `${SITE_ORIGIN}/procedure/${procSlug}`;
  const cityState = hospital.metro || "";
  const city = (cityState.split(",")[0] || "").trim();

  const cashLow = hospital.cash_pay_low;
  const cashHigh = hospital.cash_pay_high;
  const grossLow = hospital.gross_low;

  // Peer comparison: where does this hospital rank among hospitals with cash for this proc?
  const peerCashes = peerHospitals
    .filter((h) => Number.isFinite(h.cash_pay_low))
    .map((h) => h.cash_pay_low)
    .sort((a, b) => a - b);
  const peerMedian = peerCashes.length ? peerCashes[Math.floor(peerCashes.length / 2)] : null;
  let positionLabel = null;
  let positionDelta = null;
  if (Number.isFinite(cashLow) && peerMedian) {
    const ratio = cashLow / peerMedian;
    if (ratio <= 0.7) positionLabel = "significantly cheaper than median";
    else if (ratio <= 0.9) positionLabel = "cheaper than median";
    else if (ratio < 1.1) positionLabel = "around the national median";
    else if (ratio < 1.5) positionLabel = "more expensive than median";
    else positionLabel = "significantly more expensive than median";
    positionDelta = Math.round(((cashLow - peerMedian) / peerMedian) * 100);
  }

  const title = `${proc.label} at ${hospital.name}. Cash price ${fmtMoney(cashLow)}. Itemized.`;
  const description = `${proc.label} (CPT ${proc.code}) at ${hospital.name}${city ? ` in ${city}` : ""}: cash-pay price ${fmtMoney(cashLow)}${cashHigh && cashHigh !== cashLow ? ` to ${fmtMoney(cashHigh)}` : ""}${peerMedian ? `, ${positionLabel || "compared to peers"}` : ""}. Real CMS-mandated data.`;

  const offerSchema = Number.isFinite(cashLow) ? {
    "@context": "https://schema.org",
    "@type": "Offer",
    name: `${proc.label} at ${hospital.name} (cash-pay)`,
    priceCurrency: "USD",
    price: Math.round(cashLow),
    priceSpecification: {
      "@type": "PriceSpecification",
      price: Math.round(cashLow),
      priceCurrency: "USD",
    },
    offeredBy: { "@type": "Hospital", name: hospital.name, url: hospitalUrl },
    itemOffered: { "@type": "MedicalProcedure", name: proc.label, code: { "@type": "MedicalCode", codeValue: proc.code, codingSystem: "CPT" } },
    url: canonical,
  } : null;
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Hospitals", item: SITE_ORIGIN + "/hospital" },
      { "@type": "ListItem", position: 3, name: hospital.name, item: hospitalUrl },
      { "@type": "ListItem", position: 4, name: proc.label, item: canonical },
    ],
  };
  const ldBlocks = [hospitalSchema(hospital, rating, hospitalUrl), offerSchema, breadcrumbSchema].filter(Boolean);

  // Insurance rate summary table.
  const insuredRows = (hospital.rates_by_payer || [])
    .filter((rp) => rp.plans && rp.plans.length)
    .map((rp) => {
      const rates = rp.plans.map((p) => p.rate).filter((r) => Number.isFinite(r));
      if (!rates.length) return null;
      const lo = Math.min(...rates);
      const hi = Math.max(...rates);
      const range = lo === hi ? fmtMoney(lo) : `${fmtMoney(lo)} – ${fmtMoney(hi)}`;
      return `<tr><td class="payer">${escHtml(rp.canonical_payer)}</td><td class="price">${range}</td></tr>`;
    })
    .filter(Boolean)
    .join("");

  const ratingBadge = rating && rating.matched && rating.overall_rating != null
    ? `<span class="rating-badge">${rating.overall_rating}/5 CMS rating</span>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --signal-soft:#ECE6FE; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); -webkit-font-smoothing: antialiased; }
    .container { max-width: 920px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    .crumb { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 16px; }
    .crumb a { color: var(--ink-3); text-decoration: none; }
    .crumb a:hover { color: var(--ink); }
    h1.display { font-family: var(--display-font); font-size: clamp(32px, 4.5vw, 48px); margin: 0 0 12px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
    h2.display { font-family: var(--display-font); font-size: 24px; margin: 32px 0 12px; font-weight: 700; letter-spacing: -0.01em; }
    .accent { color: var(--signal); }
    .h-meta { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 14px; color: var(--ink-3); margin: 0 0 24px; }
    .rating-badge { background: var(--signal-soft); color: var(--signal); font-weight: 600; padding: 4px 10px; border-radius: 999px; font-size: 13px; }
    .price-card { background: var(--signal-soft); border-radius: 24px; padding: 28px 24px; margin: 16px 0 24px; }
    .price-card .lbl { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 8px; }
    .price-card .num { font-family: var(--display-font); font-size: clamp(48px, 6vw, 72px); font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
    .price-card .num .cur { font-size: 0.55em; vertical-align: 0.2em; margin-right: 4px; color: var(--ink-3); }
    .price-card .pos { margin-top: 12px; font-size: 14px; color: var(--ink-2); }
    .price-card .pos .delta { font-weight: 600; color: var(--signal); }
    .body-prose { max-width: 64ch; }
    .body-prose p { margin: 0 0 16px; color: var(--ink-2); font-size: 16px; }
    table.payers { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
    table.payers th, table.payers td { padding: 12px 8px; text-align: left; border-bottom: 1px solid var(--rule-soft); }
    table.payers th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 500; }
    table.payers td.payer { font-weight: 600; font-size: 15px; }
    table.payers td.price { text-align: right; font-family: var(--display-font); font-weight: 600; font-size: 15px; }
    .cta { background: var(--ink); color: var(--paper); border-radius: 24px; padding: 28px 24px; margin: 32px 0; }
    .cta h2 { color: var(--paper); margin: 0 0 12px; font-family: var(--display-font); font-size: 24px; letter-spacing: -0.02em; }
    .cta p { color: rgba(245,241,234,0.8); margin: 0 0 16px; font-size: 16px; }
    .cta a { display: inline-block; background: var(--signal); color: var(--paper); padding: 14px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 16px; }
    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 48px; color: var(--ink-3); font-size: 13px; }
  </style>

${ldBlocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b, null, 2)}</script>`).join("\n")}
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">

  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/hospital">Hospitals</a> &nbsp;·&nbsp; <a href="${escAttr(hospitalUrl)}">${escHtml(hospital.name)}</a> &nbsp;·&nbsp; ${escHtml(proc.label)}
  </div>

  <h1 class="display">${escHtml(proc.label)} at <span class="accent">${escHtml(hospital.name)}</span>.</h1>
  <div class="h-meta">
    ${hospital.metro ? `<span>📍 ${escHtml(hospital.metro)}</span>` : ""}
    ${ratingBadge}
    <span>CPT ${escHtml(proc.code)}</span>
  </div>

  ${Number.isFinite(cashLow) ? `
  <div class="price-card">
    <div class="lbl">Cash-pay price</div>
    <div class="num"><span class="cur">$</span>${escHtml(Math.round(cashLow).toLocaleString("en-US"))}${cashHigh && cashHigh !== cashLow ? ` <span style="font-size:0.5em;color:var(--ink-3);font-weight:500">to $${escHtml(Math.round(cashHigh).toLocaleString("en-US"))}</span>` : ""}</div>
    ${positionLabel ? `<div class="pos">${escHtml(hospital.name)} is <span class="delta">${escHtml(positionLabel)}</span>${positionDelta != null ? ` (${positionDelta > 0 ? "+" : ""}${positionDelta}%)` : ""} for ${escHtml(proc.label.toLowerCase())}.</div>` : ""}
    ${grossLow ? `<div class="pos" style="margin-top:6px;color:var(--ink-3);font-size:13px">Chargemaster (gross): ${fmtMoney(grossLow)}${hospital.gross_high && hospital.gross_high !== grossLow ? ` – ${fmtMoney(hospital.gross_high)}` : ""}</div>` : ""}
  </div>` : `<p class="lede">${escHtml(hospital.name)} did not publish a cash-pay price for ${escHtml(proc.label.toLowerCase())} as of the last refresh.</p>`}

  ${insuredRows ? `
  <h2 class="display">Insurance rates.</h2>
  <p class="body-prose"><span style="color:var(--ink-3);font-size:14px">Each row is the range of rates ${escHtml(hospital.name)} negotiated with that payer's plans. Your specific rate depends on your plan.</span></p>
  <table class="payers">
    <thead><tr><th>Payer</th><th style="text-align:right">Range</th></tr></thead>
    <tbody>${insuredRows}</tbody>
  </table>` : ""}

  <div class="cta">
    <h2>See ${escHtml(hospital.name)} vs. nearby hospitals.</h2>
    <p>Open the comparison filtered to ${escHtml(proc.label.toLowerCase())}. Add your insurance, your zip, see exactly what you'd pay.</p>
    <a href="/?p=${escAttr(proc.code)}">Compare prices  →</a>
  </div>

  ${renderHcahpsBlock(hcahpsForHospital, hcahpsMeta)}

  <h2 class="display">About this price.</h2>
  <div class="body-prose">
    <p>This price comes directly from ${escHtml(hospital.name)}'s machine-readable file (MRF), which the Hospital Price Transparency Rule (45 CFR 180.50) requires every US hospital to publish. We download it, parse the row for CPT ${escHtml(proc.code)}, and show you the dollar amount as published.</p>
    <p>The cash-pay number is what an uninsured patient would be charged. Insurance-negotiated rates vary by payer and plan — see the table above for the range, or use the comparison tool for plan-specific numbers.</p>
    <p>For a national view of ${escHtml(proc.label.toLowerCase())} prices, see the <a href="${escAttr(procedureUrl)}">${escHtml(proc.label)} overview</a>.</p>
  </div>

  <footer>
    <div><strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). CMS Hospital Care Compare (xubh-q36u). Last refresh: ${escHtml(asOf)}.</div>
    <div style="margin-top:8px;font-style:italic">A consumer reading of CMS-mandated MRF data. Not medical or financial advice. Itemized · <a href="/" style="color:var(--ink-2)">itemized.health</a></div>
  </footer>
</main>

</body>
</html>`;
}

// Render the hospital index hub at /hospital.
function renderHospitalsHub({ hospitalSummaries, asOf }) {
  // hospitalSummaries: [{ hospital, procCount, rating }] sorted alphabetically.
  const total = hospitalSummaries.length;
  const title = `All hospitals. ${total} US hospitals with prices. Itemized.`;
  const description = `Browse ${total} US hospitals with published cash-pay and insurance prices for shoppable procedures. CMS-mandated price transparency data.`;
  const canonical = SITE_ORIGIN + "/hospital";

  // Group by metro for browse-by-city navigation.
  const byMetro = new Map();
  for (const s of hospitalSummaries) {
    const m = s.hospital.metro || "Unknown";
    if (!byMetro.has(m)) byMetro.set(m, []);
    byMetro.get(m).push(s);
  }
  const metroBlocks = [...byMetro.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([metro, list]) => {
      const items = list.map((s) => {
        const rb = s.rating && s.rating.matched && s.rating.overall_rating != null
          ? `<span class="proc-cpt">${s.rating.overall_rating}/5★</span>`
          : "";
        return `        <li class="proc-row">
          <a class="proc-link" href="/hospital/${escAttr(s.hospital.id)}">
            <span class="proc-name">${escHtml(s.hospital.name)}</span>
            ${rb}
            <span class="proc-range">${s.procCount} procedures</span>
          </a>
        </li>`;
      }).join("\n");
      return `      <section class="cat-block">
        <h2 class="display">${escHtml(metro)}</h2>
        <ul class="proc-list">
${items}
        </ul>
      </section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); -webkit-font-smoothing: antialiased; }
    .container { max-width: 1080px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    h1.display { font-family: var(--display-font); font-size: clamp(40px, 6vw, 64px); margin: 0 0 16px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    h2.display { font-family: var(--display-font); font-size: 24px; margin: 32px 0 12px; font-weight: 700; letter-spacing: -0.01em; }
    .accent { color: var(--signal); }
    .lede { font-size: 18px; color: var(--ink-2); max-width: 60ch; margin: 0 0 32px; }
    .proc-list { list-style: none; padding: 0; margin: 0; }
    .proc-link { display: grid; grid-template-columns: 2fr 80px 110px; align-items: center; gap: 16px; padding: 12px 16px; text-decoration: none; color: var(--ink); border-radius: 12px; transition: background 120ms ease; }
    .proc-link:hover { background: var(--paper-2); }
    .proc-name { font-weight: 600; font-size: 15px; }
    .proc-cpt { font-family: 'JetBrains Mono',monospace; font-size: 12px; color: var(--ink-3); }
    .proc-range { font-size: 13px; color: var(--ink-3); text-align: right; }
    footer { border-top: 1px solid var(--rule-soft); padding: 32px 0; margin-top: 64px; color: var(--ink-3); font-size: 13px; }
  </style>
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">
  <h1 class="display"><span class="accent">${total} hospitals.</span><br/>Real prices. Real procedures.</h1>
  <p class="lede">Every US hospital we have prices for. Click through to see all the procedures we have published cash-pay and insurance rates for at each. Last refreshed ${asOf}.</p>

${metroBlocks}

  <footer>
    <div><strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). Last refresh: ${escHtml(asOf)}.</div>
  </footer>
</main>

</body>
</html>`;
}

// ── Tier-1 SEO expansion: state, insurer, system, glossary ─────────────

function stateAbbrFromMetro(metro) {
  if (!metro) return null;
  const parts = metro.split(",");
  if (parts.length < 2) return null;
  const abbr = parts[1].trim().toUpperCase();
  return STATE_NAMES[abbr] ? abbr : null;
}

function payerSlugify(label) {
  // Insurer labels can be "Blue Cross Blue Shield" / "Anthem BCBS" / "United
  // HealthCare". Normalize to a clean URL slug.
  return slugify(label);
}

function renderShellHead({ title, description, canonical, ldBlocks, type = "website" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escAttr(description)}">
  <link rel="canonical" href="${escAttr(canonical)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <meta property="og:type" content="${escAttr(type)}">
  <meta property="og:title" content="${escAttr(title)}">
  <meta property="og:description" content="${escAttr(description)}">
  <meta property="og:url" content="${escAttr(canonical)}">
  <meta property="og:site_name" content="Itemized">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --paper:#F5F1EA; --paper-2:#EFEAE1; --paper-3:#E5DECF; --ink:#0F0E0C; --ink-2:#2A2925; --ink-3:#6B675F; --rule-soft:rgba(15,14,12,0.10); --signal:#5B3FE0; --signal-soft:#ECE6FE; --display-font:'Bricolage Grotesque',system-ui,sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter',system-ui,sans-serif; background: var(--paper); color: var(--ink); line-height: 1.55; -webkit-font-smoothing: antialiased; }
    .container { max-width: 920px; margin: 0 auto; padding: 24px; }
    .nav { max-width: 1280px; margin: 0 auto; padding: 18px 24px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--rule-soft); }
    .nav .wordmark { font-family: var(--display-font); font-weight: 700; font-size: 22px; color: var(--ink); text-decoration: none; }
    .nav .wordmark .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--signal); margin: 0 6px 2px; vertical-align: middle; }
    .nav .wordmark .tag { font-family: 'Inter',sans-serif; font-weight: 500; font-size: 12px; color: var(--ink-3); margin-left: 8px; }
    .nav-right { display: flex; gap: 22px; font-size: 14px; }
    .nav-right a { color: var(--ink-2); text-decoration: none; }
    .crumb { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 16px; }
    .crumb a { color: var(--ink-3); text-decoration: none; }
    .crumb a:hover { color: var(--ink); }
    h1.display { font-family: var(--display-font); font-size: clamp(36px, 5.5vw, 56px); margin: 0 0 16px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
    h2.display { font-family: var(--display-font); font-size: clamp(24px, 3vw, 36px); margin: 40px 0 14px; font-weight: 700; letter-spacing: -0.01em; }
    h3 { font-family: var(--display-font); font-size: 20px; margin: 24px 0 8px; font-weight: 600; }
    .accent { color: var(--signal); }
    .lede { font-size: 18px; color: var(--ink-2); margin: 0 0 28px; max-width: 60ch; }
    .lede strong { color: var(--ink); }
    p { margin: 0 0 16px; color: var(--ink-2); font-size: 16px; }
    a { color: var(--signal); text-decoration: underline; text-underline-offset: 3px; }
    a:hover { color: var(--ink); }
    table.hospitals { width: 100%; border-collapse: collapse; margin: 16px 0 24px; }
    table.hospitals th, table.hospitals td { padding: 14px 8px; text-align: left; border-bottom: 1px solid var(--rule-soft); }
    table.hospitals th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-3); font-weight: 500; }
    table.hospitals td.rank { width: 36px; color: var(--ink-3); font-family: 'JetBrains Mono',monospace; font-size: 14px; }
    table.hospitals td.name .hname { font-weight: 600; font-size: 16px; }
    table.hospitals td.name .hname a { color: var(--ink); text-decoration: none; }
    table.hospitals td.name .hname a:hover { color: var(--signal); }
    table.hospitals td.name .hmetro { color: var(--ink-3); font-size: 13px; margin-top: 2px; }
    table.hospitals td.price { text-align: right; font-family: var(--display-font); font-size: 18px; font-weight: 600; }
    .pair { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; align-items: stretch; margin: 24px 0 32px; }
    .pair-card { background: var(--paper-2); border-radius: 24px; padding: 24px; }
    .pair-card.lo { background: var(--signal-soft); }
    .pair-card .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--ink-3); margin-bottom: 8px; }
    .pair-card .num { font-family: var(--display-font); font-size: clamp(34px, 4vw, 50px); font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: var(--ink); }
    .pair-card .num .cur { font-size: 0.6em; vertical-align: 0.18em; margin-right: 2px; color: var(--ink-3); }
    .pair-card .who { margin-top: 12px; font-size: 14px; color: var(--ink-2); }
    .pair-card .who .h { font-weight: 600; }
    .pair-card .who .m { color: var(--ink-3); font-size: 13px; }
    .pair .vs { display: flex; align-items: center; justify-content: center; font-family: var(--display-font); font-size: 18px; color: var(--ink-3); }
    .cta { background: var(--ink); color: var(--paper); border-radius: 24px; padding: 28px 24px; margin: 32px 0; }
    .cta h2 { color: var(--paper); margin: 0 0 12px; font-family: var(--display-font); font-size: 24px; letter-spacing: -0.02em; }
    .cta p { color: rgba(245,241,234,0.8); margin: 0 0 16px; font-size: 16px; }
    .cta a { display: inline-block; background: var(--signal); color: var(--paper); padding: 14px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .cta a:hover { background: #6E55EA; }
    .body-prose { max-width: 64ch; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; margin: 16px 0 32px; }
    .grid a { display: block; background: var(--paper-2); border-radius: 14px; padding: 14px 16px; color: var(--ink); text-decoration: none; transition: background 120ms ease; }
    .grid a:hover { background: var(--paper-3); }
    .grid a strong { display: block; font-size: 15px; font-weight: 600; }
    .grid a span { font-size: 12px; color: var(--ink-3); margin-top: 4px; display: block; font-family: 'JetBrains Mono', monospace; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 24px; }
    .pill-row a { background: var(--paper-2); padding: 8px 14px; border-radius: 999px; font-size: 13px; color: var(--ink-2); text-decoration: none; }
    .pill-row a:hover { background: var(--paper-3); color: var(--ink); }
    /* Site-wide footer used on every static SEO page. Three columns
       (Compare / Resources / About) on desktop, stacks on mobile. */
    .site-foot { border-top: 1px solid var(--rule-soft); margin: 80px 0 0; padding: 48px 0 32px; color: var(--ink-3); font-size: 13px; }
    .site-foot .foot-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; margin-bottom: 36px; }
    .site-foot .foot-col h4 { font-family: var(--display-font); font-weight: 600; font-size: 13px; color: var(--ink); margin: 0 0 14px; text-transform: uppercase; letter-spacing: 0.12em; }
    .site-foot .foot-col ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .site-foot .foot-col a { color: var(--ink-2); text-decoration: none; font-size: 14px; transition: color 120ms ease; }
    .site-foot .foot-col a:hover { color: var(--signal); }
    .site-foot .foot-rule { border-top: 1px solid var(--rule-soft); padding-top: 20px; line-height: 1.5; max-width: 100%; }
    .site-foot .foot-rule strong { color: var(--ink-2); }
    .site-foot .foot-rule .foot-disc { margin-top: 6px; font-style: italic; color: var(--ink-3); }
    .site-foot .foot-rule .foot-disc a { color: var(--ink-2); text-decoration: none; }
    @media (max-width: 720px) { .pair { grid-template-columns: 1fr; } .pair .vs { transform: rotate(90deg); } .site-foot .foot-cols { grid-template-columns: 1fr; gap: 32px; } }
  </style>

${ldBlocks.map((b) => `  <script type="application/ld+json">${JSON.stringify(b, null, 2)}</script>`).join("\n")}
</head>
<body>

<nav class="nav">
  <a href="/" class="wordmark">Itemized<span class="dot"></span><span class="tag">Hospital prices, finally.</span></a>
  <div class="nav-right">
    <a href="/procedure">Procedures</a>
    <a href="/hospital">Hospitals</a>
    <a href="/compare">Compare</a>
    <a href="/bills.html">Got a bill?</a>
  </div>
</nav>

<main class="container">
`;
}

function renderShellFoot({ asOf }) {
  return `
  <footer class="site-foot">
    <div class="foot-cols">
      <div class="foot-col">
        <h4>Compare</h4>
        <ul>
          <li><a href="/procedure">All procedures</a></li>
          <li><a href="/hospital">All hospitals</a></li>
          <li><a href="/compare">Head-to-head</a></li>
          <li><a href="/system">Hospital systems</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>Resources</h4>
        <ul>
          <li><a href="/bills.html">Got a bill?</a></li>
          <li><a href="/guide/dispute-medical-bill">Dispute-bill guide</a></li>
          <li><a href="/glossary">Glossary</a></li>
        </ul>
      </div>
      <div class="foot-col">
        <h4>About</h4>
        <ul>
          <li><a href="/#methodology">Methodology</a></li>
          <li><a href="/#faq">FAQ</a></li>
        </ul>
      </div>
    </div>
    <div class="foot-rule">
      <strong>Data sources:</strong> CMS Hospital Price Transparency rule (45 CFR 180.50). CMS Hospital Care Compare (xubh-q36u). CMS HCAHPS patient survey (dgck-syfz). Last refresh: ${escHtml(asOf)}.
      <div class="foot-disc">A consumer reading of CMS-mandated MRF data. Not medical or financial advice. Itemized · <a href="/">itemized.health</a></div>
    </div>
  </footer>
</main>

</body>
</html>`;
}

// ── State page ─────────────────────────────────────────────────────────
function renderStatePage({ proc, procSlug, stateAbbr, stateName, hospitals, asOf }) {
  const ranked = hospitals
    .filter((h) => !h.all_missing && Number.isFinite(h.cash_pay_low))
    .sort((a, b) => a.cash_pay_low - b.cash_pay_low);
  const totalWithData = hospitals.filter((h) => !h.all_missing).length;
  const lowVal = ranked[0]?.cash_pay_low ?? null;
  const highVal = ranked[ranked.length - 1]?.cash_pay_high ?? ranked[ranked.length - 1]?.cash_pay_low ?? null;
  const stateSlug = slugify(stateName);
  const canonical = `${SITE_ORIGIN}/state/${stateSlug}/${procSlug}`;
  const procedureCanonical = `${SITE_ORIGIN}/procedure/${procSlug}`;

  const title = `${proc.label} cost in ${stateName}. Compare ${totalWithData} hospitals. Itemized.`;
  const description = `${proc.label} cost in ${stateName}. Cash-pay range ${lowVal ? fmtMoney(lowVal) : "see range"} to ${highVal ? fmtMoney(highVal) : "varies"} across ${totalWithData} hospitals. Real CMS-mandated price transparency data.`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "MedicalProcedure",
      name: proc.label,
      code: { "@type": "MedicalCode", codeValue: proc.code, codingSystem: "CPT" },
      description: `${proc.label} pricing at hospitals across ${stateName}.`,
      url: canonical,
    },
    lowVal && highVal ? {
      "@context": "https://schema.org", "@type": "AggregateOffer",
      name: `${proc.label} cash-pay price range in ${stateName}`,
      priceCurrency: "USD", lowPrice: Math.round(lowVal), highPrice: Math.round(highVal),
      offerCount: ranked.length, url: canonical,
    } : null,
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Procedures", item: SITE_ORIGIN + "/procedure" },
        { "@type": "ListItem", position: 3, name: proc.label, item: procedureCanonical },
        { "@type": "ListItem", position: 4, name: stateName, item: canonical },
      ],
    },
  ].filter(Boolean);

  // Group rows by metro for visual scanning.
  const byMetro = new Map();
  for (const h of ranked) {
    const m = h.metro || "Unknown";
    if (!byMetro.has(m)) byMetro.set(m, []);
    byMetro.get(m).push(h);
  }
  const metroBlocks = [...byMetro.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([metro, list]) => {
      const rows = list.map((h, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="name">
            <div class="hname"><a href="/hospital/${escAttr(h.id)}/${escAttr(procSlug)}">${escHtml(h.name)}</a></div>
            <div class="hmetro">${escHtml(h.metro)}</div>
          </td>
          <td class="price">${fmtMoney(h.cash_pay_low)}${h.cash_pay_high && h.cash_pay_high !== h.cash_pay_low ? ` to ${fmtMoney(h.cash_pay_high)}` : ""}</td>
        </tr>`).join("");
      return `
  <h3>${escHtml(metro)}</h3>
  <table class="hospitals"><tbody>${rows}</tbody></table>`;
    }).join("");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/procedure">Procedures</a> &nbsp;·&nbsp; <a href="${escAttr(procedureCanonical)}">${escHtml(proc.label)}</a> &nbsp;·&nbsp; ${escHtml(stateName)}
  </div>

  <h1 class="display">${escHtml(proc.label)} cost in <span class="accent">${escHtml(stateName)}</span>.</h1>
  <p class="lede">
    Cash-pay range for ${escHtml(proc.label.toLowerCase())} across <strong>${totalWithData} hospitals</strong> in ${escHtml(stateName)}: <strong>${escHtml(lowVal != null ? fmtMoney(lowVal) : "—")}</strong> to <strong>${escHtml(highVal != null ? fmtMoney(highVal) : "—")}</strong>. CPT code ${escHtml(proc.code)}. Pulled from each hospital's federally-mandated price transparency file.
  </p>

  ${lowVal != null && highVal != null && ranked.length > 1 ? `
  <div class="pair">
    <div class="pair-card lo">
      <div class="lbl">Cheapest in ${escHtml(stateName)}</div>
      <div class="num"><span class="cur">$</span>${escHtml(Math.round(lowVal).toLocaleString("en-US"))}</div>
      <div class="who"><div class="h">${escHtml(ranked[0].name)}</div><div class="m">${escHtml(ranked[0].metro)}</div></div>
    </div>
    <div class="vs">vs.</div>
    <div class="pair-card hi">
      <div class="lbl">Most expensive in ${escHtml(stateName)}</div>
      <div class="num"><span class="cur">$</span>${escHtml(Math.round(highVal).toLocaleString("en-US"))}</div>
      <div class="who"><div class="h">${escHtml(ranked[ranked.length - 1].name)}</div><div class="m">${escHtml(ranked[ranked.length - 1].metro)}</div></div>
    </div>
  </div>` : ""}

  <h2 class="display">Hospitals in ${escHtml(stateName)}, by metro.</h2>
  ${metroBlocks}

  <div class="cta">
    <h2>See plan-specific prices for your insurance.</h2>
    <p>Pick your insurance plan and zip, see exactly what each ${escHtml(stateName)} hospital negotiated. Estimated out-of-pocket included.</p>
    <a href="/?p=${escAttr(proc.code)}">Compare ${escHtml(proc.short.toLowerCase())} prices  →</a>
  </div>
` + renderShellFoot({ asOf });
}

// ── Insurer-specific procedure page ────────────────────────────────────
function renderInsurerPage({ proc, procSlug, payer, payerSlug, hospitals, asOf }) {
  // Look up each hospital's negotiated rate range for this insurer for this procedure.
  const rows = [];
  for (const h of hospitals) {
    if (h.all_missing) continue;
    const rp = (h.rates_by_payer || []).find((p) => p.canonical_payer === payer.id);
    if (!rp || !rp.plans || !rp.plans.length) continue;
    const rates = rp.plans.map((p) => p.rate).filter((r) => Number.isFinite(r));
    if (!rates.length) continue;
    const lo = Math.min(...rates);
    const hi = Math.max(...rates);
    rows.push({ h, lo, hi });
  }
  rows.sort((a, b) => a.lo - b.lo);
  const top = rows.slice(0, 50);
  const totalCovered = rows.length;
  const lowVal = rows[0]?.lo ?? null;
  const highVal = rows[rows.length - 1]?.hi ?? null;

  const canonical = `${SITE_ORIGIN}/with/${payerSlug}/${procSlug}`;
  const procedureCanonical = `${SITE_ORIGIN}/procedure/${procSlug}`;

  const title = `${proc.label} with ${payer.label}. Negotiated rates at ${totalCovered} hospitals. Itemized.`;
  const description = `${proc.label} cost with ${payer.label}: negotiated rates ${lowVal ? fmtMoney(lowVal) : "—"} to ${highVal ? fmtMoney(highVal) : "—"} across ${totalCovered} US hospitals. Plan-by-plan from CMS-mandated transparency files.`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "MedicalProcedure",
      name: proc.label,
      code: { "@type": "MedicalCode", codeValue: proc.code, codingSystem: "CPT" },
      url: canonical,
    },
    lowVal && highVal ? {
      "@context": "https://schema.org", "@type": "AggregateOffer",
      name: `${proc.label} negotiated rates with ${payer.label}`,
      priceCurrency: "USD", lowPrice: Math.round(lowVal), highPrice: Math.round(highVal),
      offerCount: totalCovered, url: canonical,
    } : null,
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Procedures", item: SITE_ORIGIN + "/procedure" },
        { "@type": "ListItem", position: 3, name: proc.label, item: procedureCanonical },
        { "@type": "ListItem", position: 4, name: payer.label, item: canonical },
      ],
    },
  ].filter(Boolean);

  const tableRows = top.length
    ? top.map((r, i) => `
        <tr>
          <td class="rank">${i + 1}</td>
          <td class="name">
            <div class="hname"><a href="/hospital/${escAttr(r.h.id)}/${escAttr(procSlug)}">${escHtml(r.h.name)}</a></div>
            <div class="hmetro">${escHtml(r.h.metro || "")}</div>
          </td>
          <td class="price">${fmtMoney(r.lo)}${r.hi !== r.lo ? ` – ${fmtMoney(r.hi)}` : ""}</td>
        </tr>`).join("")
    : `<tr><td colspan="3" style="text-align:center;color:var(--ink-3);padding:24px 8px;font-style:italic">No ${escHtml(payer.label)} negotiated rate published for ${escHtml(proc.label.toLowerCase())} as of ${escHtml(asOf)}.</td></tr>`;

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/procedure">Procedures</a> &nbsp;·&nbsp; <a href="${escAttr(procedureCanonical)}">${escHtml(proc.label)}</a> &nbsp;·&nbsp; with ${escHtml(payer.label)}
  </div>

  <h1 class="display">${escHtml(proc.label)} with <span class="accent">${escHtml(payer.label)}</span>.</h1>
  <p class="lede">
    Negotiated rates ${escHtml(payer.label)} pays for ${escHtml(proc.label.toLowerCase())} at <strong>${totalCovered} US hospitals</strong>. Range: <strong>${escHtml(lowVal != null ? fmtMoney(lowVal) : "—")}</strong> to <strong>${escHtml(highVal != null ? fmtMoney(highVal) : "—")}</strong>. Your specific cost depends on your plan tier, deductible status, and coinsurance — see the <a href="/?p=${escAttr(proc.code)}&payer=${escAttr(payer.id)}">comparison tool</a> to model your exact out-of-pocket.
  </p>

  <h2 class="display">Top hospitals by ${escHtml(payer.label)} rate.</h2>
  <table class="hospitals">
    <thead><tr><th>#</th><th>Hospital</th><th style="text-align:right">${escHtml(payer.label)} rate</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <div class="cta">
    <h2>Estimate what you'd actually pay with ${escHtml(payer.label)}.</h2>
    <p>Add your deductible status and coinsurance to the comparison tool. We'll estimate your out-of-pocket per hospital.</p>
    <a href="/?p=${escAttr(proc.code)}&payer=${escAttr(payer.id)}">Open comparison  →</a>
  </div>

  <h2 class="display">About these rates.</h2>
  <div class="body-prose">
    <p>Hospitals are required by federal law (45 CFR 180.50) to publish the rates they negotiated with each insurer for each procedure. These numbers are the rates the hospital published for ${escHtml(payer.label)} plans, pulled directly from each hospital's machine-readable file.</p>
    <p>The <em>range</em> column reflects different ${escHtml(payer.label)} plan tiers (HMO, PPO, EPO, etc.). Your plan picks one number out of that range. Your actual out-of-pocket depends on your deductible status, copay, and coinsurance, which the comparison tool can model when you fill them in.</p>
    <p>Cash-pay rates are often <em>cheaper</em> than the negotiated rate, especially for high-deductible plans. Worth comparing both — the <a href="${escAttr(procedureCanonical)}">${escHtml(proc.label)} overview</a> shows the cash-pay column alongside.</p>
  </div>
` + renderShellFoot({ asOf });
}

// ── Hospital system page ───────────────────────────────────────────────
function renderSystemPage({ system, hospitalsInSystem, ratings, asOf }) {
  const sysSlug = slugify(system);
  const canonical = `${SITE_ORIGIN}/system/${sysSlug}`;
  const total = hospitalsInSystem.length;
  const metros = Array.from(new Set(hospitalsInSystem.map((h) => h.metro).filter(Boolean))).sort();
  const ratedHospitals = hospitalsInSystem
    .map((h) => ratings.ratings?.[h.id])
    .filter((r) => r && r.matched && r.overall_rating != null);
  const avgRating = ratedHospitals.length
    ? (ratedHospitals.reduce((s, r) => s + r.overall_rating, 0) / ratedHospitals.length).toFixed(1)
    : null;

  const title = `${system} hospitals. ${total} facilities, prices for ${total} locations. Itemized.`;
  const description = `${system}: ${total} hospitals across ${metros.length} US metros. Cash-pay and insurance prices for shoppable procedures. ${avgRating ? `Average CMS rating ${avgRating}/5.` : ""}`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "Organization",
      name: system, url: canonical,
      description: `Hospital system with ${total} facilities across ${metros.length} US metros.`,
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Hospital systems", item: SITE_ORIGIN + "/system" },
        { "@type": "ListItem", position: 3, name: system, item: canonical },
      ],
    },
  ];

  const sorted = [...hospitalsInSystem].sort((a, b) => a.name.localeCompare(b.name));
  const items = sorted.map((h) => {
    const r = ratings.ratings?.[h.id];
    const rt = r && r.matched && r.overall_rating != null ? `<span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--ink-3)">${r.overall_rating}/5</span>` : "";
    return `    <a href="/hospital/${escAttr(h.id)}">
      <strong>${escHtml(h.name)}</strong>
      <span>${escHtml(h.metro || "")} ${rt}</span>
    </a>`;
  }).join("\n");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/system">Hospital systems</a> &nbsp;·&nbsp; ${escHtml(system)}
  </div>

  <h1 class="display"><span class="accent">${escHtml(system)}</span> hospitals.</h1>
  <p class="lede">
    <strong>${total} ${total === 1 ? "facility" : "facilities"}</strong> across <strong>${metros.length} ${metros.length === 1 ? "metro" : "metros"}</strong>${avgRating ? `, average CMS Care Compare rating <strong>${avgRating}/5</strong>` : ""}. Cash-pay and insurance prices pulled from each hospital's federally-mandated price transparency file.
  </p>

  <h2 class="display">Facilities.</h2>
  <div class="grid">
${items}
  </div>

  <div class="cta">
    <h2>Compare ${escHtml(system)} hospital prices.</h2>
    <p>Pick a procedure on the comparison tool to see prices across all ${escHtml(system)} hospitals plus other systems in the same metros.</p>
    <a href="/procedure">See procedures  →</a>
  </div>
` + renderShellFoot({ asOf });
}

function renderSystemHub({ systemRows, asOf }) {
  const total = systemRows.length;
  const title = `${total} hospital systems. Itemized.`;
  const description = `Browse ${total} US hospital systems with published price transparency data. Each system page lists every facility, metros covered, and CMS quality ratings.`;
  const canonical = `${SITE_ORIGIN}/system`;

  const ldBlocks = [{
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Hospital systems", item: canonical },
    ],
  }];

  const items = systemRows.map((s) => `    <a href="/system/${escAttr(slugify(s.name))}">
      <strong>${escHtml(s.name)}</strong>
      <span>${s.count} ${s.count === 1 ? "facility" : "facilities"} · ${s.metros} ${s.metros === 1 ? "metro" : "metros"}</span>
    </a>`).join("\n");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; Hospital systems
  </div>

  <h1 class="display"><span class="accent">${total} systems.</span></h1>
  <p class="lede">Every US hospital system in our dataset, grouped by parent organization. Click through to see facilities, metros, and CMS ratings for each.</p>

  <div class="grid">
${items}
  </div>
` + renderShellFoot({ asOf });
}

// ── Glossary ────────────────────────────────────────────────────────────
const GLOSSARY = [
  { slug: "cpt-code", term: "CPT Code", short: "Current Procedural Terminology code", body: "A 5-digit code that identifies a specific medical procedure or service. Maintained by the American Medical Association. Every line on a medical bill maps to a CPT (or HCPCS) code; that code determines the price. CPT 73721, for example, is a knee MRI without contrast." },
  { slug: "hcpcs-code", term: "HCPCS Code", short: "Healthcare Common Procedure Coding System code", body: "Codes maintained by CMS for procedures, services, and supplies that aren't covered by CPT — primarily medical equipment, supplies, certain drugs, and some hospital outpatient services. Often appear alongside CPT codes on bills." },
  { slug: "ms-drg", term: "MS-DRG", short: "Medicare Severity Diagnosis-Related Group", body: "How Medicare classifies inpatient hospital stays for payment. Each MS-DRG bundles a primary diagnosis, procedures, and patient severity into a single code that determines what Medicare pays. Hospitals also publish negotiated rates with private insurers by MS-DRG for inpatient cases." },
  { slug: "deductible", term: "Deductible", short: "What you pay before insurance kicks in", body: "The dollar amount you pay out-of-pocket each year before your insurance starts covering claims. A $3,000 deductible means you pay the first $3,000 of medical costs yourself; insurance pays after. Once met, you typically owe coinsurance or copays, not full cost." },
  { slug: "coinsurance", term: "Coinsurance", short: "Your % share after deductible", body: "The percentage of a covered medical bill you pay after meeting your deductible. 20% coinsurance means you pay 20% and your insurer pays 80%, until you hit your out-of-pocket maximum. Different from a copay (a flat dollar amount)." },
  { slug: "copay", term: "Copay", short: "Flat fee per visit or service", body: "A flat dollar amount you pay for a specific service — typical $25-50 for primary care visits, $75-150 for specialists, $250-500 for ER. Copays count toward your out-of-pocket maximum but typically don't apply to your deductible." },
  { slug: "out-of-pocket-maximum", term: "Out-of-pocket maximum", short: "The annual cap on what you pay", body: "The most you'll pay for covered medical services in a plan year. Includes deductible, coinsurance, and copays for in-network care. Once you hit it, your insurer pays 100% of covered services for the rest of the year. ACA requires every plan to have one." },
  { slug: "eob", term: "EOB", short: "Explanation of Benefits", body: "The document your insurer sends you after a medical claim. Lists what was billed, what your insurer paid, and what you owe. NOT a bill — just an explanation. The actual bill comes from the hospital. EOB and bill amounts should match; if they don't, you have grounds to dispute." },
  { slug: "mrf", term: "MRF", short: "Machine-Readable File", body: "The federally-mandated price file every US hospital must publish. Lists every procedure they bill, every insurance plan they contract with, and the negotiated rate for each combination. Required under 45 CFR 180.50 since January 2021. The MRF is what powers Itemized." },
  { slug: "chargemaster", term: "Chargemaster", short: "The hospital's sticker price", body: "The hospital's internal list of standard prices for every service. Mostly arbitrary. Almost no one pays the chargemaster — insurers negotiate it down dramatically, and uninsured patients usually qualify for self-pay discounts. Sometimes called the 'gross charge.'" },
  { slug: "negotiated-rate", term: "Negotiated rate", short: "What your insurer actually pays", body: "The dollar amount your insurance company has agreed to pay the hospital for a specific procedure. Confidential bilateral contract — different insurers pay different rates at the same hospital. The Hospital Price Transparency Rule made these public for the first time in 2021." },
  { slug: "cash-pay", term: "Cash pay", short: "Self-pay rate (no insurance)", body: "What an uninsured patient is charged. Often dramatically cheaper than the negotiated insurance rate at the same hospital, especially for elective procedures. Worth comparing if you have a high-deductible plan." },
  { slug: "facility-fee", term: "Facility fee", short: "What the building charges", body: "A separate charge from the physician's professional fee. The facility fee covers room, equipment, nursing, and overhead. Hospitals can charge facility fees for outpatient services that ASCs (ambulatory surgery centers) don't, which is why the same procedure often costs 2-3× more at a hospital." },
  { slug: "professional-fee", term: "Professional fee", short: "What the doctor charges", body: "The radiologist, anesthesiologist, surgeon, or specialist's fee for their work. Billed separately from the facility fee. A single procedure can produce multiple bills: one from the hospital (facility), one from the doctor (professional). Both should be visible on the itemized bill." },
  { slug: "in-network", term: "In-network", short: "Has a contract with your insurer", body: "A provider that has signed a contract with your insurance company to charge negotiated rates. In-network means your insurance covers more (lower deductible, lower coinsurance, no balance billing). Out-of-network providers charge whatever they want; your insurance covers less or nothing." },
  { slug: "out-of-network", term: "Out-of-network", short: "No contract with your insurer", body: "A provider that does NOT have a contract with your insurance. They can bill you whatever they want, and your insurance typically covers a smaller percentage (or nothing). The No Surprises Act (2022) protects you from out-of-network bills in many emergency and facility-based situations." },
  { slug: "no-surprises-act", term: "No Surprises Act", short: "Federal law against surprise bills", body: "Federal law effective 2022 that bans most surprise out-of-network billing. If you go to an in-network facility, you can't be balance-billed by out-of-network radiologists, anesthesiologists, ER doctors, etc. Also protects against air ambulance balance billing. Look for the 'Notice and Consent' form — if you didn't sign it, the bill is likely disputable." },
  { slug: "hospital-price-transparency-rule", term: "Hospital Price Transparency Rule", short: "45 CFR 180.50 — the rule that makes prices public", body: "Federal regulation, in effect since January 2021, requiring every US hospital to publish a machine-readable file with every payer-negotiated rate, gross charge, and cash-pay price for every service. CMS enforces. Penalties for non-compliance up to $5,500/day. The data behind every price comparison on Itemized comes from these files." },
  { slug: "section-501r", term: "Section 501(r)", short: "Charity care for non-profit hospitals", body: "IRS rule requiring every tax-exempt hospital to have a financial-assistance policy. Households below 200-400% of the Federal Poverty Level (varies by hospital) typically qualify for 50-100% bill reduction. The application is usually one page plus tax verification. Most patients don't know to ask." },
  { slug: "balance-billing", term: "Balance billing", short: "When the provider bills you the difference", body: "When an out-of-network provider bills you for the difference between what they charged and what your insurance paid. Can run into thousands of dollars. The No Surprises Act bans most balance billing in emergency and facility-based settings; for non-emergency out-of-network care, balance billing is often legal but disclosed." },
  { slug: "self-pay-discount", term: "Self-pay discount", short: "Off-list price for paying without insurance", body: "A reduction hospitals offer to patients paying without insurance, typically 10-30% off the chargemaster (sometimes more). Available to fully uninsured patients and to insured patients who want to pay cash to avoid using their insurance. Always ask for it." },
  { slug: "tic", term: "TiC", short: "Transparency in Coverage rule", body: "Separate federal rule (effective 2022) requiring health insurers to publish their negotiated rates with every in-network provider. The files exist but are 200x larger than hospital MRFs. Companies like Turquoise Health and Serif Health build B2B tools on top of them. Itemized works from hospital MRFs only." },
  { slug: "cms-care-compare", term: "CMS Care Compare", short: "The federal hospital quality rating", body: "CMS's overall hospital quality rating, 1-5 stars, built from ~50 measures spanning safety, mortality, readmission, patient experience, and timeliness. Hospital-wide composite, not procedure-specific. Built from Medicare claims, so pediatric and cancer-specialty hospitals don't get rated. Itemized surfaces this rating on every hospital row." },
  { slug: "asc", term: "ASC", short: "Ambulatory Surgery Center", body: "Free-standing outpatient surgery facility. Typically 30-50% cheaper than hospital outpatient departments for the same procedure. Often physician-owned. Common for cataract surgery, colonoscopy, hernia repair, knee arthroscopy, and many imaging procedures. Note: ASCs are NOT covered by 45 CFR 180.50, so their prices aren't in this dataset." },
  { slug: "hsa", term: "HSA", short: "Health Savings Account", body: "Tax-advantaged savings account paired with high-deductible health plans. Contributions are pre-tax; withdrawals for qualified medical expenses are tax-free. Funds roll over year-to-year. The cheapest way to pay for medical care if you're on an HDHP." },
  { slug: "hdhp", term: "HDHP", short: "High-Deductible Health Plan", body: "Health plan with a deductible above a federal threshold ($1,650 individual / $3,300 family in 2026). Lower premiums than traditional plans, but you pay more out-of-pocket before insurance kicks in. HDHPs are HSA-eligible; cash-pay rates often beat HDHP negotiated rates for elective procedures." },
  { slug: "fsa", term: "FSA", short: "Flexible Spending Account", body: "Pre-tax employer-sponsored account for medical expenses. Use-it-or-lose-it (some plans allow $640/year carryover). Doesn't roll over like HSA. Useful if you can predict your medical spend; risky if you can't." },
  { slug: "deductible-met", term: "Deductible met", short: "Your insurance is now paying", body: "You've paid your full plan-year deductible out-of-pocket. From this point until the plan year resets (typically Jan 1), insurance covers covered services subject only to coinsurance and copays. The smartest time to schedule elective procedures." },
  { slug: "preauthorization", term: "Preauthorization", short: "Insurance must approve in advance", body: "Some procedures require your insurer's approval before they'll pay. If you skip it, the claim can be denied entirely. Always check; often handled by the provider's office, but worth confirming. Keep the prior auth number." },
  { slug: "claim-denial", term: "Claim denial", short: "Insurance refused to pay", body: "When your insurer rejects a claim. Common reasons: out-of-network, no preauthorization, not medically necessary, coding error. You can (and should) appeal — first internally to the insurer, then externally to your state insurance department. Most denials are reversed when appealed." },
  { slug: "pre-existing-condition", term: "Pre-existing condition", short: "Medical condition you had before coverage started", body: "Under the Affordable Care Act (2010), insurers cannot deny coverage or charge more based on pre-existing conditions. This applies to all ACA-compliant plans. Short-term limited-duration plans and some employer arrangements have different rules; read carefully." },
];

function renderGlossaryHub() {
  const canonical = `${SITE_ORIGIN}/glossary`;
  const title = `Healthcare pricing glossary. ${GLOSSARY.length} terms in plain English. Itemized.`;
  const description = `Plain-English definitions for ${GLOSSARY.length} healthcare-pricing and insurance terms: CPT, HCPCS, deductible, coinsurance, EOB, chargemaster, MRF, balance billing, and more.`;
  const ldBlocks = [{
    "@context": "https://schema.org", "@type": "DefinedTermSet",
    name: "Itemized healthcare pricing glossary",
    url: canonical,
    hasDefinedTerm: GLOSSARY.map((g) => ({
      "@type": "DefinedTerm",
      name: g.term,
      description: g.body,
      url: `${SITE_ORIGIN}/glossary/${g.slug}`,
    })),
  }];
  const items = GLOSSARY
    .slice()
    .sort((a, b) => a.term.localeCompare(b.term))
    .map((g) => `    <a href="/glossary/${escAttr(g.slug)}">
      <strong>${escHtml(g.term)}</strong>
      <span>${escHtml(g.short)}</span>
    </a>`).join("\n");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; Glossary
  </div>

  <h1 class="display">Healthcare pricing <span class="accent">glossary</span>.</h1>
  <p class="lede">
    Plain-English definitions for the terms that show up on hospital bills, insurance EOBs, and price-transparency files. Bookmark this; you'll need it.
  </p>

  <div class="grid">
${items}
  </div>
` + renderShellFoot({ asOf: new Date().toISOString().slice(0, 10) });
}

function renderGlossaryTerm(term) {
  const canonical = `${SITE_ORIGIN}/glossary/${term.slug}`;
  const title = `What is ${term.term}? Plain-English definition. Itemized.`;
  const description = `${term.term}: ${term.short}. ${term.body.slice(0, 160).replace(/\n/g, " ")}…`;
  const ldBlocks = [{
    "@context": "https://schema.org", "@type": "DefinedTerm",
    name: term.term,
    description: term.body,
    inDefinedTermSet: `${SITE_ORIGIN}/glossary`,
    url: canonical,
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Glossary", item: SITE_ORIGIN + "/glossary" },
      { "@type": "ListItem", position: 3, name: term.term, item: canonical },
    ],
  }];

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/glossary">Glossary</a> &nbsp;·&nbsp; ${escHtml(term.term)}
  </div>

  <h1 class="display">${escHtml(term.term)}.</h1>
  <p class="lede"><strong>${escHtml(term.short)}.</strong></p>

  <div class="body-prose">
    <p>${escHtml(term.body)}</p>
  </div>

  <div class="cta">
    <h2>Use this in real life.</h2>
    <p>The price comparison tool surfaces every term in this glossary in context — plan tiers, deductible status, cash-pay vs. negotiated rate. Pick a procedure to see them all in action.</p>
    <a href="/procedure">Browse procedures  →</a>
  </div>

  <h2 class="display">Other terms.</h2>
  <div class="pill-row">
${GLOSSARY.filter((g) => g.slug !== term.slug).slice(0, 10).map((g) => `    <a href="/glossary/${escAttr(g.slug)}">${escHtml(g.term)}</a>`).join("\n")}
  </div>
` + renderShellFoot({ asOf: new Date().toISOString().slice(0, 10) });
}

// ── Tier-2 SEO: head-to-head comparison, listicles, best value ─────────

// Render a head-to-head comparison page covering all common procedures
// between two hospitals in the same metro.
function renderComparisonPage({ a, b, ratings, hospitalsByProc, procedures, asOf, hcahps }) {
  const aSlug = a.id;
  const bSlug = b.id;
  const slug = `${aSlug}-vs-${bSlug}`;
  const canonical = `${SITE_ORIGIN}/compare/${slug}`;

  // Build the procedure-by-procedure table.
  const rows = [];
  for (const proc of procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    const ah = list.find((h) => h.id === aSlug && !h.all_missing);
    const bh = list.find((h) => h.id === bSlug && !h.all_missing);
    if (!ah || !bh) continue;
    const aCash = Number.isFinite(ah.cash_pay_low) ? ah.cash_pay_low : null;
    const bCash = Number.isFinite(bh.cash_pay_low) ? bh.cash_pay_low : null;
    if (aCash == null && bCash == null) continue;
    let cheaper = null;
    if (aCash != null && bCash != null) cheaper = aCash < bCash ? "a" : (bCash < aCash ? "b" : null);
    rows.push({ proc, aCash, bCash, cheaper });
  }

  const aRating = ratings.ratings?.[aSlug];
  const bRating = ratings.ratings?.[bSlug];
  const aStars = aRating && aRating.matched && aRating.overall_rating != null ? aRating.overall_rating : null;
  const bStars = bRating && bRating.matched && bRating.overall_rating != null ? bRating.overall_rating : null;

  const aWins = rows.filter((r) => r.cheaper === "a").length;
  const bWins = rows.filter((r) => r.cheaper === "b").length;
  const overallCheaper = aWins > bWins ? "a" : (bWins > aWins ? "b" : null);

  const title = `${a.name} vs ${b.name}: prices, ratings, head-to-head. Itemized.`;
  const description = `Compare ${a.name} and ${b.name} side-by-side: cash-pay prices for ${rows.length} procedures, CMS quality ratings, and which hospital is cheaper for what. Real federally-mandated price data.`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Compare hospitals", item: SITE_ORIGIN + "/compare" },
        { "@type": "ListItem", position: 3, name: `${a.name} vs ${b.name}`, item: canonical },
      ],
    },
    hospitalSchema(a, aRating, `${SITE_ORIGIN}/hospital/${aSlug}`),
    hospitalSchema(b, bRating, `${SITE_ORIGIN}/hospital/${bSlug}`),
  ];

  const tableRows = rows.map((r) => {
    const aClass = r.cheaper === "a" ? "win" : "";
    const bClass = r.cheaper === "b" ? "win" : "";
    return `        <tr>
          <td class="proc"><a href="/procedure/${escAttr(r.proc._slug)}">${escHtml(r.proc.label)}</a></td>
          <td class="price ${aClass}">${r.aCash != null ? fmtMoney(r.aCash) : `<span class="none">—</span>`}</td>
          <td class="price ${bClass}">${r.bCash != null ? fmtMoney(r.bCash) : `<span class="none">—</span>`}</td>
          <td class="winner">${r.cheaper === "a" ? `${escHtml(a.name.split(" ")[0])} ↓` : r.cheaper === "b" ? `${escHtml(b.name.split(" ")[0])} ↓` : "tie"}</td>
        </tr>`;
  }).join("\n");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/compare">Compare</a> &nbsp;·&nbsp; ${escHtml(a.name)} vs ${escHtml(b.name)}
  </div>

  <h1 class="display"><a href="/hospital/${escAttr(aSlug)}" style="color:inherit;text-decoration:none">${escHtml(a.name)}</a> vs <span class="accent">${escHtml(b.name)}</span>.</h1>
  <p class="lede">
    Side-by-side prices for <strong>${rows.length} ${rows.length === 1 ? "procedure" : "procedures"}</strong> both hospitals publish, plus CMS quality ratings and metro context. Pulled from each hospital's federally-mandated price transparency file.
    ${overallCheaper === "a" ? ` <strong>${escHtml(a.name)} is cheaper on more procedures (${aWins} vs ${bWins}).</strong>` : ""}
    ${overallCheaper === "b" ? ` <strong>${escHtml(b.name)} is cheaper on more procedures (${bWins} vs ${aWins}).</strong>` : ""}
  </p>

  <div class="pair">
    <div class="pair-card lo" style="background:var(--paper-2)">
      <div class="lbl"><a href="/hospital/${escAttr(aSlug)}" style="color:inherit;text-decoration:none">${escHtml(a.name)}</a></div>
      <div style="margin-top:8px;font-size:14px;color:var(--ink-2)">${escHtml(a.metro || "")}</div>
      ${a.system ? `<div style="margin-top:4px;font-size:13px;color:var(--ink-3)">${escHtml(a.system)}</div>` : ""}
      ${aStars != null ? `<div style="margin-top:8px;font-size:14px;color:var(--ink-2)"><strong>${aStars}/5 CMS</strong></div>` : ""}
      <div style="margin-top:12px;font-size:13px;color:var(--ink-3)">Cheaper on <strong style="color:var(--ink)">${aWins}</strong> of ${rows.length} procedures</div>
    </div>
    <div class="vs">vs.</div>
    <div class="pair-card lo" style="background:var(--paper-2)">
      <div class="lbl"><a href="/hospital/${escAttr(bSlug)}" style="color:inherit;text-decoration:none">${escHtml(b.name)}</a></div>
      <div style="margin-top:8px;font-size:14px;color:var(--ink-2)">${escHtml(b.metro || "")}</div>
      ${b.system ? `<div style="margin-top:4px;font-size:13px;color:var(--ink-3)">${escHtml(b.system)}</div>` : ""}
      ${bStars != null ? `<div style="margin-top:8px;font-size:14px;color:var(--ink-2)"><strong>${bStars}/5 CMS</strong></div>` : ""}
      <div style="margin-top:12px;font-size:13px;color:var(--ink-3)">Cheaper on <strong style="color:var(--ink)">${bWins}</strong> of ${rows.length} procedures</div>
    </div>
  </div>

  <h2 class="display">Head-to-head, by procedure.</h2>
  <table class="hospitals">
    <thead>
      <tr>
        <th>Procedure</th>
        <th style="text-align:right">${escHtml(a.name.split(" ")[0])}</th>
        <th style="text-align:right">${escHtml(b.name.split(" ")[0])}</th>
        <th style="text-align:right">Cheaper</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>

  <style>
    table.hospitals td.proc a { color: var(--ink); text-decoration: none; }
    table.hospitals td.proc a:hover { color: var(--signal); text-decoration: underline; }
    table.hospitals td.price { text-align: right; }
    table.hospitals td.price.win { color: var(--signal); font-weight: 700; }
    table.hospitals td.price .none { color: var(--ink-3); font-weight: 400; }
    table.hospitals td.winner { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; }
  </style>

  ${renderHcahpsCompareBlock(hcahps?.hospitals?.[aSlug], hcahps?.hospitals?.[bSlug], hcahps, a.name, b.name)}

  <div class="cta">
    <h2>Add your insurance.</h2>
    <p>Cash-pay is one number. With your insurance plan, the actual price differs. Pick your insurer in the comparison tool to see plan-specific rates at both hospitals.</p>
    <a href="/?p=${escAttr(rows[0]?.proc?.code || procedures[0].code)}">Open comparison  →</a>
  </div>

  <h2 class="display">How to read this comparison.</h2>
  <div class="body-prose">
    <p>The cash-pay price is what an uninsured patient would be charged at each hospital. It's the cleanest apples-to-apples comparison because it doesn't depend on your insurance plan.</p>
    <p>The CMS rating is the federal quality composite, built from ~50 measures spanning safety, mortality, readmission, patient experience, and timeliness. A 5-star hospital may not be the best at every procedure, and a 3-star hospital can have a strong specific service line. Treat the rating as one input, not the answer.</p>
    <p>For your specific insurance plan, prices can shift dramatically. Some hospitals negotiate steep discounts with one insurer and not another. Always check the plan-specific rate before you book.</p>
  </div>
` + renderShellFoot({ asOf });
}

// ── Listicle: top 10 cheapest hospitals for a procedure in a metro ─────
function renderListiclePage({ proc, procSlug, metro, hospitalsInMetro, asOf }) {
  const cityName = metro.split(",")[0].trim();
  const stateAbbr = (metro.split(",")[1] || "").trim();
  const mSlug = metroSlug(metro);
  const slug = `cheapest-${procSlug}-${mSlug}`;
  const canonical = `${SITE_ORIGIN}/list/${slug}`;

  const ranked = hospitalsInMetro
    .filter((h) => !h.all_missing && Number.isFinite(h.cash_pay_low))
    .sort((a, b) => a.cash_pay_low - b.cash_pay_low)
    .slice(0, 10);

  const lowVal = ranked[0]?.cash_pay_low ?? null;
  const highVal = ranked[ranked.length - 1]?.cash_pay_low ?? null;

  const title = `${ranked.length} cheapest hospitals for ${proc.label.toLowerCase()} in ${cityName}${stateAbbr ? `, ${stateAbbr}` : ""}. Itemized.`;
  const description = `The ${ranked.length} cheapest ${cityName}-area hospitals for ${proc.label.toLowerCase()} (CPT ${proc.code}). Cash-pay range ${lowVal ? fmtMoney(lowVal) : "—"} to ${highVal ? fmtMoney(highVal) : "—"}. Real CMS-mandated price data.`;

  const procedureCanonical = `${SITE_ORIGIN}/procedure/${procSlug}`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "ItemList",
      name: `${ranked.length} cheapest hospitals for ${proc.label} in ${cityName}`,
      url: canonical,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      numberOfItems: ranked.length,
      itemListElement: ranked.map((h, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_ORIGIN}/hospital/${h.id}/${procSlug}`,
        name: h.name,
      })),
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Lists", item: SITE_ORIGIN + "/list" },
        { "@type": "ListItem", position: 3, name: `Cheapest ${proc.short.toLowerCase()} in ${cityName}`, item: canonical },
      ],
    },
  ];

  const items = ranked.map((h, i) => `
  <div style="display:grid;grid-template-columns:48px 1fr auto;gap:16px;align-items:start;padding:18px 0;border-bottom:1px solid var(--rule-soft)">
    <div style="font-family:var(--display-font);font-weight:700;font-size:32px;color:var(--ink-3);letter-spacing:-0.02em;line-height:1">${i + 1}</div>
    <div>
      <div style="font-family:var(--display-font);font-weight:700;font-size:18px;letter-spacing:-0.01em"><a href="/hospital/${escAttr(h.id)}/${escAttr(procSlug)}" style="color:var(--ink);text-decoration:none">${escHtml(h.name)}</a></div>
      <div style="font-size:13px;color:var(--ink-3);margin-top:2px">${escHtml(h.metro || "")}${h.system ? ` · ${escHtml(h.system)}` : ""}</div>
    </div>
    <div style="font-family:var(--display-font);font-weight:700;font-size:22px;letter-spacing:-0.02em;color:var(--ink)">${fmtMoney(h.cash_pay_low)}</div>
  </div>`).join("");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/list">Lists</a> &nbsp;·&nbsp; Cheapest in ${escHtml(cityName)}
  </div>

  <h1 class="display">${ranked.length} cheapest hospitals for <span class="accent">${escHtml(proc.label.toLowerCase())}</span> in ${escHtml(cityName)}.</h1>
  <p class="lede">
    Sorted by published cash-pay price, low to high. Pulled from each hospital's federally-mandated price transparency file. Cash-pay is what an uninsured patient is charged; insured patients can sometimes get the cash rate by asking. CPT code ${escHtml(proc.code)}.
  </p>

  <div>
${items}
  </div>

  <div class="cta">
    <h2>See the full ${escHtml(cityName)} list with insurance rates.</h2>
    <p>This list shows the top ${ranked.length} cash-pay prices. The procedure page covers every ${escHtml(cityName)}-area hospital, plus plan-specific negotiated rates if you add your insurance.</p>
    <a href="/procedure/${escAttr(procSlug)}/in/${escAttr(mSlug)}">Full ${escHtml(cityName)} comparison  →</a>
  </div>

  <h2 class="display">Why prices vary this much.</h2>
  <div class="body-prose">
    <p>The same ${escHtml(proc.label.toLowerCase())} on the same equipment can cost dramatically different amounts at different hospitals. Three reasons.</p>
    <p><strong>Chargemasters are arbitrary.</strong> The "sticker price" hospitals publish was never designed for consumers. It's a starting number for negotiation with insurance, with adjustments stacked on for decades.</p>
    <p><strong>Negotiated rates are confidential.</strong> Each insurer negotiates its own rate with each hospital. Aetna at Hospital A might pay 60% of what Cigna pays at the same hospital for the same code.</p>
    <p><strong>Cash pay is its own thing.</strong> Hospitals often offer self-pay rates dramatically cheaper than what they'd bill insurance, especially for elective procedures. Worth asking even if you have insurance.</p>
  </div>
` + renderShellFoot({ asOf });
}

// ── Best-value pages: top hospitals combining price + CMS rating ───────
function renderBestValuePage({ proc, procSlug, hospitals, ratings, asOf, scope = "national", metro = null }) {
  const isNational = scope === "national";
  const cityName = metro ? metro.split(",")[0].trim() : null;
  const slug = isNational ? procSlug : `${procSlug}-${metroSlug(metro)}`;
  const canonical = isNational
    ? `${SITE_ORIGIN}/best-value/${slug}`
    : `${SITE_ORIGIN}/best-value/${procSlug}/${metroSlug(metro)}`;

  // Score = rank-by-price + (max_rating - rating). Lower is better.
  const candidates = hospitals.filter((h) => {
    if (h.all_missing) return false;
    if (!Number.isFinite(h.cash_pay_low)) return false;
    if (h.is_pediatric) return false; // pediatric specialty: not CMS rated
    return true;
  });
  const withRating = candidates.map((h) => {
    const r = ratings.ratings?.[h.id];
    const stars = r && r.matched && r.overall_rating != null ? r.overall_rating : null;
    return { h, stars, cash: h.cash_pay_low };
  });
  // Filter to hospitals with a published rating; otherwise composite is meaningless.
  const rated = withRating.filter((x) => x.stars != null);
  if (rated.length === 0) return null;
  rated.sort((a, b) => a.cash - b.cash);
  const priceRank = new Map(rated.map((x, i) => [x.h.id, i]));
  const ratingSorted = [...rated].sort((a, b) => b.stars - a.stars);
  const ratingRank = new Map(ratingSorted.map((x, i) => [x.h.id, i]));
  const scored = rated.map((x) => ({
    ...x,
    score: priceRank.get(x.h.id) + ratingRank.get(x.h.id),
  })).sort((a, b) => a.score - b.score);

  const top10 = scored.slice(0, 10);
  if (top10.length === 0) return null;

  const title = isNational
    ? `Best-value hospitals for ${proc.label.toLowerCase()}: top ${top10.length} on price + CMS rating. Itemized.`
    : `Best-value hospitals for ${proc.label.toLowerCase()} in ${cityName}: top ${top10.length}. Itemized.`;
  const description = isNational
    ? `Top ${top10.length} US hospitals for ${proc.label.toLowerCase()} ranked on a composite of cash price and CMS Care Compare rating. Cheapest 4-5 star hospitals first.`
    : `Top ${top10.length} ${cityName}-area hospitals for ${proc.label.toLowerCase()} ranked on price + CMS rating composite.`;

  const procedureCanonical = `${SITE_ORIGIN}/procedure/${procSlug}`;

  const ldBlocks = [
    {
      "@context": "https://schema.org", "@type": "ItemList",
      name: `Best-value hospitals for ${proc.label}${isNational ? "" : ` in ${cityName}`}`,
      url: canonical,
      numberOfItems: top10.length,
      itemListElement: top10.map((x, i) => ({
        "@type": "ListItem", position: i + 1,
        url: `${SITE_ORIGIN}/hospital/${x.h.id}/${procSlug}`,
        name: x.h.name,
      })),
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
        { "@type": "ListItem", position: 2, name: "Best value", item: SITE_ORIGIN + "/best-value" },
        { "@type": "ListItem", position: 3, name: proc.label, item: canonical },
      ],
    },
  ];

  const items = top10.map((x, i) => `
  <div style="display:grid;grid-template-columns:48px 1fr auto auto;gap:16px;align-items:center;padding:18px 0;border-bottom:1px solid var(--rule-soft)">
    <div style="font-family:var(--display-font);font-weight:700;font-size:30px;color:var(--ink-3);letter-spacing:-0.02em;line-height:1">${i + 1}</div>
    <div>
      <div style="font-family:var(--display-font);font-weight:700;font-size:17px;letter-spacing:-0.01em"><a href="/hospital/${escAttr(x.h.id)}/${escAttr(procSlug)}" style="color:var(--ink);text-decoration:none">${escHtml(x.h.name)}</a></div>
      <div style="font-size:13px;color:var(--ink-3);margin-top:2px">${escHtml(x.h.metro || "")}</div>
    </div>
    <div style="background:var(--signal-soft);color:var(--signal);font-weight:700;font-size:13px;padding:4px 10px;border-radius:999px">${x.stars}/5 CMS</div>
    <div style="font-family:var(--display-font);font-weight:700;font-size:22px;letter-spacing:-0.02em;color:var(--ink)">${fmtMoney(x.cash)}</div>
  </div>`).join("");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; <a href="/best-value">Best value</a> &nbsp;·&nbsp; ${escHtml(proc.label)}${cityName ? ` in ${escHtml(cityName)}` : ""}
  </div>

  <h1 class="display">Best-value hospitals for <span class="accent">${escHtml(proc.label.toLowerCase())}</span>${cityName ? ` in ${escHtml(cityName)}` : ""}.</h1>
  <p class="lede">
    Ranked on a composite of cash-pay price (low is good) and CMS Care Compare rating (high is good). The top of this list is where price and quality both work in your favor. ${cityName ? "" : "National rankings."} CPT code ${escHtml(proc.code)}.
  </p>

  <div>
${items}
  </div>

  <div class="cta">
    <h2>See the full picture.</h2>
    <p>This list filters to hospitals with a CMS rating. The full procedure page covers every hospital with prices for ${escHtml(proc.label.toLowerCase())}, including pediatric and specialty hospitals not rated by CMS.</p>
    <a href="${escAttr(procedureCanonical)}">Full ${escHtml(proc.short.toLowerCase())} overview  →</a>
  </div>

  <h2 class="display">How "best value" is computed.</h2>
  <div class="body-prose">
    <p>Each hospital gets two ranks: one by cash-pay price (cheapest = rank 1) and one by CMS overall rating (highest = rank 1). The two are summed; the lowest sum is the best value. Ties broken by price.</p>
    <p>Hospitals without a published CMS rating (specialty, pediatric, cancer-only) are excluded from this ranking because the composite would be meaningless. They show up on the procedure overview page instead.</p>
    <p>This is one heuristic. Some patients reasonably weight rating heavier than price, others the reverse. The <a href="/?p=${escAttr(proc.code)}">comparison tool</a> lets you sort by price-only, rating-only, or this same composite, and add your insurance for plan-specific numbers.</p>
  </div>
` + renderShellFoot({ asOf });
}

// ── /compare hub with two-dropdown picker ──────────────────────────────
function renderCompareHub({ generatedPairs, hospitalsForPicker, asOf }) {
  const canonical = `${SITE_ORIGIN}/compare`;
  const total = generatedPairs.length;
  const title = `Compare hospitals head-to-head. ${total} pre-built comparisons. Itemized.`;
  const description = `Compare any two US hospitals side-by-side: prices for ${42} procedures, CMS quality ratings, HCAHPS patient experience scores. ${total} pre-built head-to-head comparisons; or pick your own pair.`;

  const ldBlocks = [{
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Itemized", item: SITE_ORIGIN + "/" },
      { "@type": "ListItem", position: 2, name: "Compare hospitals", item: canonical },
    ],
  }];

  // Build optgroup options grouped by metro CLUSTER (greater LA, etc.) for
  // the picker. Each option carries data-cluster so JS can filter.
  const byCluster = new Map();
  for (const h of hospitalsForPicker) {
    const c = h.cluster || "Other";
    if (!byCluster.has(c)) byCluster.set(c, []);
    byCluster.get(c).push(h);
  }
  const groups = [...byCluster.entries()].sort((a, b) => {
    // Bigger clusters first (more interesting for the eye).
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });
  const optionsHtml = groups.map(([cluster, list]) => {
    const opts = list.sort((a, b) => a.name.localeCompare(b.name)).map((h) =>
      `      <option value="${escAttr(h.id)}" data-cluster="${escAttr(h.cluster || "")}">${escHtml(h.name)}</option>`).join("\n");
    return `    <optgroup label="${escAttr(cluster)}">\n${opts}\n    </optgroup>`;
  }).join("\n");

  // The "popular pairs" callout shows pre-built pairs grouped by metro.
  const pairsByMetro = new Map();
  for (const p of generatedPairs) {
    const m = p.a.metro || "Other";
    if (!pairsByMetro.has(m)) pairsByMetro.set(m, []);
    pairsByMetro.get(m).push(p);
  }
  const featuredMetros = [...pairsByMetro.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6);
  const featuredHtml = featuredMetros.map(([metro, pairs]) => {
    const links = pairs.slice(0, 8).map((p) =>
      `        <a href="/compare/${escAttr(p.slug)}">${escHtml(p.a.name)} <span style="color:var(--ink-3);font-weight:400">vs</span> ${escHtml(p.b.name)}</a>`).join("\n");
    return `      <section class="cat-block">
        <h2 class="display">${escHtml(metro)}</h2>
        <div class="grid">
${links}
        </div>
      </section>`;
  }).join("\n");

  return renderShellHead({ title, description, canonical, ldBlocks }) + `
  <div class="crumb">
    <a href="/">Itemized</a> &nbsp;·&nbsp; Compare hospitals
  </div>

  <h1 class="display">Compare any two <span class="accent">hospitals</span>.</h1>
  <p class="lede">Pick two US hospitals, see them side-by-side: cash-pay prices for every procedure both publish, CMS quality rating, HCAHPS patient experience scores, network averages.</p>

  <div style="background:var(--paper-2);border-radius:24px;padding:28px 24px;margin:24px 0">
    <div style="font-family:var(--display-font);font-size:18px;font-weight:600;margin-bottom:14px">Pick your pair</div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center" id="pickerRow">
      <select id="hospA" style="padding:14px 16px;font-size:15px;font-family:'Inter',sans-serif;background:var(--paper);border:1px solid var(--rule-soft);border-radius:12px;width:100%;color:var(--ink);appearance:menulist">
        <option value="">Hospital A…</option>
${optionsHtml}
      </select>
      <span style="font-family:var(--display-font);color:var(--ink-3);font-size:18px">vs.</span>
      <select id="hospB" style="padding:14px 16px;font-size:15px;font-family:'Inter',sans-serif;background:var(--paper);border:1px solid var(--rule-soft);border-radius:12px;width:100%;color:var(--ink);appearance:menulist">
        <option value="">Hospital B…</option>
${optionsHtml}
      </select>
    </div>
    <button id="pickerGo" type="button" style="margin-top:14px;background:var(--ink);color:var(--paper);border:0;padding:14px 22px;border-radius:12px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;cursor:pointer;width:100%">Compare →</button>
    <div id="pickerMsg" style="margin-top:10px;font-size:13px;color:var(--ink-3);text-align:center;min-height:18px"></div>
  </div>

${featuredHtml}

  <div class="cta">
    <h2>${total} pre-built comparisons.</h2>
    <p>For metros with multiple hospitals in our dataset, every pairing of the top hospitals already has a dedicated comparison page indexed by Google. Use the picker above for any pair, or click through the featured metros.</p>
    <a href="/procedure">Browse procedures  →</a>
  </div>

<script>
  // Compare-page picker. We generate every unordered pair of hospitals
  // within each metro cluster (greater LA, greater NYC, etc.). The picker
  // filters dropdown B to same-cluster options after A is chosen so users
  // can only construct valid pairs.
  (function () {
    var existing = ${JSON.stringify(generatedPairs.map((p) => p.slug))};
    var existingSet = new Set(existing);
    var a = document.getElementById('hospA');
    var b = document.getElementById('hospB');
    var go = document.getElementById('pickerGo');
    var msg = document.getElementById('pickerMsg');

    // Cache the original full optgroups so we can restore B when A clears.
    var bOriginal = b.innerHTML;
    var aOriginal = a.innerHTML;

    function buildSlugs(x, y) {
      // Try both orderings since we only generated one direction.
      return [x + '-vs-' + y, y + '-vs-' + x];
    }

    // Filter "other" select to only show options whose data-cluster
    // matches the cluster of the chosen value in "selected". If selected
    // is empty, restore the full list.
    function filterPartner(selected, other, originalHtml) {
      if (!selected.value) {
        other.innerHTML = originalHtml;
        return;
      }
      var chosenOption = selected.options[selected.selectedIndex];
      var cluster = chosenOption.getAttribute('data-cluster');
      if (!cluster) return;
      var prevValue = other.value;
      // Reset to the full list, then prune optgroups that don't match.
      other.innerHTML = originalHtml;
      var groups = other.querySelectorAll('optgroup');
      groups.forEach(function (g) {
        if (g.label !== cluster) g.parentNode.removeChild(g);
      });
      // If user had previously chosen a hospital in another cluster, clear.
      if (prevValue && other.value !== prevValue) other.value = '';
    }

    a.addEventListener('change', function () {
      filterPartner(a, b, bOriginal);
      msg.textContent = '';
    });
    b.addEventListener('change', function () {
      filterPartner(b, a, aOriginal);
      msg.textContent = '';
    });

    go.addEventListener('click', function () {
      if (!a.value || !b.value) { msg.textContent = 'Pick both hospitals.'; return; }
      if (a.value === b.value) { msg.textContent = 'Pick two different hospitals.'; return; }
      var candidates = buildSlugs(a.value, b.value);
      var match = candidates.find(function (s) { return existingSet.has(s); });
      if (match) { window.location.href = '/compare/' + match; return; }
      // Pair is in same cluster (filter ensures it) but somehow not generated.
      // Fallback: open hospital A; user can navigate to B from there.
      window.location.href = '/hospital/' + a.value;
    });
  })();
</script>
` + renderShellFoot({ asOf });
}

// ── Sitemap + robots ────────────────────────────────────────────────────

function renderSitemap(urls) {
  const today = new Date().toISOString().slice(0, 10);
  const items = urls.map(({ loc, priority, changefreq }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
}

function renderRobots() {
  return `# itemized.health robots
User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const data = loadIndex();
  const ratings = loadRatings();
  const hcahps = loadHcahps();
  const procDir = path.join(DIST_DIR, "procedure");
  const hospDir = path.join(DIST_DIR, "hospital");
  fs.mkdirSync(procDir, { recursive: true });
  fs.mkdirSync(hospDir, { recursive: true });

  const slugMap = new Map();
  const hospitalsByProc = new Map();
  const sitemapUrls = [
    { loc: SITE_ORIGIN + "/", priority: "1.0", changefreq: "weekly" },
    { loc: SITE_ORIGIN + "/procedure", priority: "0.9", changefreq: "weekly" },
    { loc: SITE_ORIGIN + "/bills", priority: "0.7", changefreq: "monthly" },
    { loc: SITE_ORIGIN + "/guide/dispute-medical-bill", priority: "0.85", changefreq: "monthly" },
  ];

  let written = 0;
  let metroPagesWritten = 0;
  for (const proc of data.procedures) {
    let base = slugify(proc.label);
    // Collision guard: if two procedures slugify to the same string,
    // append the CPT code.
    let slug = base;
    if (slugMap.has(slug)) slug = `${base}-${proc.code}`;
    slugMap.set(slug, proc.code);
    proc._slug = slug; // attached for the index page render

    const hospitals = loadProcHospitals(proc.code);
    hospitalsByProc.set(proc.code, hospitals);
    const html = renderPage({ proc, slug, hospitals, asOf: data.as_of });
    fs.writeFileSync(path.join(procDir, `${slug}.html`), html);
    written++;
    sitemapUrls.push({
      loc: `${SITE_ORIGIN}/procedure/${slug}`,
      priority: "0.8",
      changefreq: "weekly",
    });

    // Per-metro pages for this procedure. Group hospitals (with data) by
    // metro and write a page for each metro that has at least one hospital
    // with a published cash price for this procedure.
    const metroBuckets = new Map();
    for (const h of hospitals) {
      if (h.all_missing || !h.metro) continue;
      if (!metroBuckets.has(h.metro)) metroBuckets.set(h.metro, []);
      metroBuckets.get(h.metro).push(h);
    }
    for (const [metro, list] of metroBuckets) {
      const hasCash = list.some((h) => Number.isFinite(h.cash_pay_low));
      if (!hasCash) continue; // skip metros where no hospital has a cash price for this CPT
      const mSlug = metroSlug(metro);
      if (!mSlug) continue;
      const metroDir = path.join(procDir, slug, "in");
      fs.mkdirSync(metroDir, { recursive: true });
      const metroHtml = renderMetroPage({
        proc,
        procSlug: slug,
        metro,
        hospitalsInMetro: list,
        asOf: data.as_of,
      });
      fs.writeFileSync(path.join(metroDir, `${mSlug}.html`), metroHtml);
      metroPagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/procedure/${slug}/in/${mSlug}`,
        priority: "0.7",
        changefreq: "monthly",
      });
    }
  }

  // Procedure index hub at /procedure (catalog of all CPTs).
  const indexHtml = renderProcedureIndex({
    procedures: data.procedures,
    hospitalsByProc,
    asOf: data.as_of,
  });
  fs.writeFileSync(path.join(procDir, "index.html"), indexHtml);

  // ── Per-hospital pages ────────────────────────────────────────────────
  // Build a map of hospital_id -> hospital row (taking the first occurrence
  // we see across procedures; the hospital fields like address/lat/lon
  // don't depend on procedure).
  const hospitalById = new Map();
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    for (const h of list) {
      if (!hospitalById.has(h.id)) hospitalById.set(h.id, h);
    }
  }
  // Build a map of hospital_id -> [{ proc, slug, cash_pay_low, cash_pay_high }]
  // for every procedure where this hospital published a row.
  const procsByHospital = new Map();
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    for (const h of list) {
      if (h.all_missing) continue;
      if (!procsByHospital.has(h.id)) procsByHospital.set(h.id, []);
      procsByHospital.get(h.id).push({
        proc,
        slug: proc._slug,
        cash_pay_low: h.cash_pay_low,
        cash_pay_high: h.cash_pay_high,
      });
    }
  }

  let hospPagesWritten = 0;
  let hospProcPagesWritten = 0;
  const hospitalSummaries = [];
  for (const [hid, hospital] of hospitalById) {
    const procRows = (procsByHospital.get(hid) || [])
      .sort((a, b) => a.proc.label.localeCompare(b.proc.label));
    const rating = ratings.ratings?.[hid] || null;

    // Hospital overview at /hospital/{id}.
    const hcForHosp = hcahps.hospitals?.[hid] || null;
    const hospHtml = renderHospitalIndex({ hospital, procRows, rating, asOf: data.as_of, hcahpsForHospital: hcForHosp, hcahpsMeta: hcahps });
    const hospPath = path.join(hospDir, hid);
    fs.mkdirSync(hospPath, { recursive: true });
    fs.writeFileSync(path.join(hospPath, "index.html"), hospHtml);
    hospPagesWritten++;
    sitemapUrls.push({
      loc: `${SITE_ORIGIN}/hospital/${hid}`,
      priority: "0.7",
      changefreq: "monthly",
    });
    hospitalSummaries.push({ hospital, procCount: procRows.length, rating });

    // One page per (hospital, procedure) combo where the hospital actually
    // has a procedure row (skip all_missing). We need the per-procedure
    // hospital row (with rates_by_payer, gross_low, etc.), not the
    // master hospital record.
    for (const r of procRows) {
      const procList = hospitalsByProc.get(r.proc.code) || [];
      const hForThisProc = procList.find((x) => x.id === hid);
      if (!hForThisProc || hForThisProc.all_missing) continue;
      const html = renderHospitalProcedurePage({
        hospital: hForThisProc,
        hospitalSlug: hid,
        proc: r.proc,
        procSlug: r.slug,
        asOf: data.as_of,
        rating,
        peerHospitals: procList.filter((x) => !x.all_missing),
        hcahpsForHospital: hcForHosp,
        hcahpsMeta: hcahps,
      });
      fs.writeFileSync(path.join(hospPath, `${r.slug}.html`), html);
      hospProcPagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/hospital/${hid}/${r.slug}`,
        priority: "0.6",
        changefreq: "monthly",
      });
    }
  }

  // Hospital index hub at /hospital.
  hospitalSummaries.sort((a, b) => a.hospital.name.localeCompare(b.hospital.name));
  const hospHubHtml = renderHospitalsHub({ hospitalSummaries, asOf: data.as_of });
  fs.writeFileSync(path.join(hospDir, "index.html"), hospHubHtml);
  sitemapUrls.push({
    loc: `${SITE_ORIGIN}/hospital`,
    priority: "0.9",
    changefreq: "weekly",
  });

  // ── Tier 1: state pages ──────────────────────────────────────────────
  // Group every (procedure, state) where >= 1 hospital has a published cash
  // price. URL: /state/{state-slug}/{procedure-slug}.
  const stateDir = path.join(DIST_DIR, "state");
  fs.mkdirSync(stateDir, { recursive: true });
  let statePagesWritten = 0;
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    const byState = new Map();
    for (const h of list) {
      if (h.all_missing) continue;
      const abbr = stateAbbrFromMetro(h.metro);
      if (!abbr) continue;
      if (!byState.has(abbr)) byState.set(abbr, []);
      byState.get(abbr).push(h);
    }
    for (const [abbr, hospitalsInState] of byState) {
      const hasCash = hospitalsInState.some((h) => Number.isFinite(h.cash_pay_low));
      if (!hasCash) continue;
      const stateName = STATE_NAMES[abbr];
      const stateSlug = slugify(stateName);
      const stateProcDir = path.join(stateDir, stateSlug);
      fs.mkdirSync(stateProcDir, { recursive: true });
      const html = renderStatePage({
        proc, procSlug: proc._slug,
        stateAbbr: abbr, stateName, hospitals: hospitalsInState, asOf: data.as_of,
      });
      fs.writeFileSync(path.join(stateProcDir, `${proc._slug}.html`), html);
      statePagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/state/${stateSlug}/${proc._slug}`,
        priority: "0.7", changefreq: "monthly",
      });
    }
  }

  // ── Tier 1: insurer-specific procedure pages ─────────────────────────
  // For each (procedure, supported insurer) where any hospital has a rate,
  // write a page. URL: /with/{insurer-slug}/{procedure-slug}.
  const withDir = path.join(DIST_DIR, "with");
  fs.mkdirSync(withDir, { recursive: true });
  let insurerPagesWritten = 0;
  const insurers = (data.supported_payers || []).filter((p) => p.id !== "__cash__" && p.id !== "__other__");
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    for (const payer of insurers) {
      // Only emit if at least one hospital has a published rate for this insurer.
      const anyHasRate = list.some((h) => {
        if (h.all_missing) return false;
        const rp = (h.rates_by_payer || []).find((p) => p.canonical_payer === payer.id);
        return rp && rp.plans && rp.plans.some((pl) => Number.isFinite(pl.rate));
      });
      if (!anyHasRate) continue;
      const pSlug = payerSlugify(payer.label);
      const pDir = path.join(withDir, pSlug);
      fs.mkdirSync(pDir, { recursive: true });
      const html = renderInsurerPage({
        proc, procSlug: proc._slug, payer, payerSlug: pSlug,
        hospitals: list, asOf: data.as_of,
      });
      fs.writeFileSync(path.join(pDir, `${proc._slug}.html`), html);
      insurerPagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/with/${pSlug}/${proc._slug}`,
        priority: "0.7", changefreq: "monthly",
      });
    }
  }

  // ── Tier 1: hospital system pages ────────────────────────────────────
  const systemDir = path.join(DIST_DIR, "system");
  fs.mkdirSync(systemDir, { recursive: true });
  const bySystem = new Map();
  for (const [hid, h] of hospitalById) {
    if (!h.system) continue;
    if (!bySystem.has(h.system)) bySystem.set(h.system, []);
    bySystem.get(h.system).push(h);
  }
  let systemPagesWritten = 0;
  const systemRows = [];
  for (const [sysName, hospitalsInSystem] of bySystem) {
    const sysSlug = slugify(sysName);
    if (!sysSlug) continue;
    const sysSubDir = path.join(systemDir, sysSlug);
    fs.mkdirSync(sysSubDir, { recursive: true });
    const html = renderSystemPage({
      system: sysName, hospitalsInSystem, ratings, asOf: data.as_of,
    });
    fs.writeFileSync(path.join(sysSubDir, "index.html"), html);
    systemPagesWritten++;
    const metros = new Set(hospitalsInSystem.map((h) => h.metro).filter(Boolean));
    systemRows.push({ name: sysName, count: hospitalsInSystem.length, metros: metros.size });
    sitemapUrls.push({
      loc: `${SITE_ORIGIN}/system/${sysSlug}`,
      priority: "0.6", changefreq: "monthly",
    });
  }
  // System hub at /system.
  systemRows.sort((a, b) => b.count - a.count);
  fs.writeFileSync(path.join(systemDir, "index.html"), renderSystemHub({ systemRows, asOf: data.as_of }));
  sitemapUrls.push({ loc: `${SITE_ORIGIN}/system`, priority: "0.7", changefreq: "monthly" });

  // ── Tier 2: head-to-head comparison pages ────────────────────────────
  // For each metro with 2+ hospitals (with data), generate all unordered
  // pairs from the top 8 hospitals (by # procedures with data). URL:
  // /compare/{a-id}-vs-{b-id}.
  const compareDir = path.join(DIST_DIR, "compare");
  fs.mkdirSync(compareDir, { recursive: true });
  let comparePagesWritten = 0;
  const generatedPairs = [];
  // Group hospitals by metro CLUSTER (not raw city-metro) so all greater-
  // LA hospitals pair with each other regardless of suburb. Generate every
  // unordered pair within each cluster (no top-N cap; hospital pair search
  // is the whole point of this surface).
  const byClusterSet = new Map();
  for (const [hid, h] of hospitalById) {
    if (!h.metro) continue;
    const cluster = metroCluster(h.metro);
    if (!byClusterSet.has(cluster)) byClusterSet.set(cluster, []);
    byClusterSet.get(cluster).push({ hid, h });
  }
  for (const [cluster, list] of byClusterSet) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i].h;
        const b = list[j].h;
        const html = renderComparisonPage({
          a, b, ratings, hcahps, hospitalsByProc, procedures: data.procedures, asOf: data.as_of,
        });
        const slug = `${a.id}-vs-${b.id}`;
        fs.writeFileSync(path.join(compareDir, `${slug}.html`), html);
        comparePagesWritten++;
        generatedPairs.push({ a, b, slug });
        sitemapUrls.push({
          loc: `${SITE_ORIGIN}/compare/${slug}`,
          priority: "0.6", changefreq: "monthly",
        });
      }
    }
  }

  // /compare hub with picker.
  // Stamp each hospital with its metro cluster so the picker can filter
  // dropdown B to same-cluster hospitals after A is chosen.
  const hospitalsForPicker = [...hospitalById.values()].map((h) => ({
    ...h,
    cluster: metroCluster(h.metro || ""),
  }));
  fs.writeFileSync(path.join(compareDir, "index.html"), renderCompareHub({
    generatedPairs, hospitalsForPicker, asOf: data.as_of,
  }));
  sitemapUrls.push({
    loc: `${SITE_ORIGIN}/compare`,
    priority: "0.85", changefreq: "weekly",
  });

  // ── Tier 2: top 10 cheapest listicle pages ───────────────────────────
  // For each (procedure, metro) where >= 5 hospitals have a published cash
  // price, write a "top 10 cheapest" listicle. URL: /list/cheapest-{proc}-{metro}.
  const listDir = path.join(DIST_DIR, "list");
  fs.mkdirSync(listDir, { recursive: true });
  let listiclePagesWritten = 0;
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    const byMetro = new Map();
    for (const h of list) {
      if (h.all_missing || !Number.isFinite(h.cash_pay_low) || !h.metro) continue;
      if (!byMetro.has(h.metro)) byMetro.set(h.metro, []);
      byMetro.get(h.metro).push(h);
    }
    for (const [metro, hospitalsInMetro] of byMetro) {
      if (hospitalsInMetro.length < 5) continue;
      const html = renderListiclePage({
        proc, procSlug: proc._slug, metro, hospitalsInMetro, asOf: data.as_of,
      });
      const mSlug = metroSlug(metro);
      const slug = `cheapest-${proc._slug}-${mSlug}`;
      fs.writeFileSync(path.join(listDir, `${slug}.html`), html);
      listiclePagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/list/${slug}`,
        priority: "0.65", changefreq: "monthly",
      });
    }
  }

  // ── Tier 2: best-value pages ─────────────────────────────────────────
  // Per procedure (national), and per (procedure, metro) for metros with
  // 5+ rated hospitals.
  const bvDir = path.join(DIST_DIR, "best-value");
  fs.mkdirSync(bvDir, { recursive: true });
  let bvPagesWritten = 0;
  for (const proc of data.procedures) {
    const list = hospitalsByProc.get(proc.code) || [];
    // National page for this procedure.
    const natHtml = renderBestValuePage({
      proc, procSlug: proc._slug, hospitals: list, ratings, asOf: data.as_of, scope: "national",
    });
    if (natHtml) {
      fs.writeFileSync(path.join(bvDir, `${proc._slug}.html`), natHtml);
      bvPagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/best-value/${proc._slug}`,
        priority: "0.7", changefreq: "monthly",
      });
    }
    // Per-metro best-value pages for metros with 5+ rated hospitals.
    const byMetro = new Map();
    for (const h of list) {
      if (h.all_missing || !Number.isFinite(h.cash_pay_low) || !h.metro) continue;
      if (!byMetro.has(h.metro)) byMetro.set(h.metro, []);
      byMetro.get(h.metro).push(h);
    }
    for (const [metro, hospitalsInMetro] of byMetro) {
      const ratedCount = hospitalsInMetro.filter((h) => {
        const r = ratings.ratings?.[h.id];
        return r && r.matched && r.overall_rating != null;
      }).length;
      if (ratedCount < 5) continue;
      const metroHtml = renderBestValuePage({
        proc, procSlug: proc._slug, hospitals: hospitalsInMetro, ratings, asOf: data.as_of,
        scope: "metro", metro,
      });
      if (!metroHtml) continue;
      const procDir = path.join(bvDir, proc._slug);
      fs.mkdirSync(procDir, { recursive: true });
      fs.writeFileSync(path.join(procDir, `${metroSlug(metro)}.html`), metroHtml);
      bvPagesWritten++;
      sitemapUrls.push({
        loc: `${SITE_ORIGIN}/best-value/${proc._slug}/${metroSlug(metro)}`,
        priority: "0.6", changefreq: "monthly",
      });
    }
  }

  // ── Tier 1: glossary ─────────────────────────────────────────────────
  const glossaryDir = path.join(DIST_DIR, "glossary");
  fs.mkdirSync(glossaryDir, { recursive: true });
  fs.writeFileSync(path.join(glossaryDir, "index.html"), renderGlossaryHub());
  sitemapUrls.push({ loc: `${SITE_ORIGIN}/glossary`, priority: "0.7", changefreq: "monthly" });
  for (const term of GLOSSARY) {
    fs.writeFileSync(path.join(glossaryDir, `${term.slug}.html`), renderGlossaryTerm(term));
    sitemapUrls.push({
      loc: `${SITE_ORIGIN}/glossary/${term.slug}`,
      priority: "0.6", changefreq: "monthly",
    });
  }

  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(sitemapUrls));
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), renderRobots());

  console.log(`SEO: wrote ${written} procedure pages + index -> ui/dist/procedure/`);
  console.log(`SEO: wrote ${metroPagesWritten} per-metro pages -> ui/dist/procedure/{slug}/in/{metro}.html`);
  console.log(`SEO: wrote ${hospPagesWritten} hospital overview pages -> ui/dist/hospital/{id}/`);
  console.log(`SEO: wrote ${hospProcPagesWritten} per-(hospital, procedure) pages -> ui/dist/hospital/{id}/{procedure}.html`);
  console.log(`SEO: wrote ${statePagesWritten} state pages -> ui/dist/state/{state}/{procedure}.html`);
  console.log(`SEO: wrote ${insurerPagesWritten} insurer pages -> ui/dist/with/{insurer}/{procedure}.html`);
  console.log(`SEO: wrote ${systemPagesWritten} hospital-system pages + hub -> ui/dist/system/`);
  console.log(`SEO: wrote ${comparePagesWritten} head-to-head pages -> ui/dist/compare/{a}-vs-{b}.html`);
  console.log(`SEO: wrote ${listiclePagesWritten} top-10-cheapest listicles -> ui/dist/list/cheapest-{proc}-{metro}.html`);
  console.log(`SEO: wrote ${bvPagesWritten} best-value pages -> ui/dist/best-value/`);
  console.log(`SEO: wrote ${GLOSSARY.length} glossary terms + hub -> ui/dist/glossary/`);
  console.log(`SEO: sitemap.xml (${sitemapUrls.length} urls), robots.txt`);
  console.log(`SEO: a sample slug -> ${SITE_ORIGIN}/procedure/${[...slugMap.keys()][0]}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
