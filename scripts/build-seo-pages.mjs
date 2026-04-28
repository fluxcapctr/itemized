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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
function renderHospitalIndex({ hospital, procRows, rating, asOf }) {
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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
function renderHospitalProcedurePage({ hospital, hospitalSlug, proc, procSlug, asOf, rating, peerHospitals }) {
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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
    <a href="/#methodology">Methodology</a>
    <a href="/#faq">FAQ</a>
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
    const hospHtml = renderHospitalIndex({ hospital, procRows, rating, asOf: data.as_of });
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

  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(sitemapUrls));
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), renderRobots());

  console.log(`SEO: wrote ${written} procedure pages + index -> ui/dist/procedure/`);
  console.log(`SEO: wrote ${metroPagesWritten} per-metro pages -> ui/dist/procedure/{slug}/in/{metro}.html`);
  console.log(`SEO: wrote ${hospPagesWritten} hospital overview pages -> ui/dist/hospital/{id}/`);
  console.log(`SEO: wrote ${hospProcPagesWritten} per-(hospital, procedure) pages -> ui/dist/hospital/{id}/{procedure}.html`);
  console.log(`SEO: sitemap.xml (${sitemapUrls.length} urls), robots.txt`);
  console.log(`SEO: a sample slug -> ${SITE_ORIGIN}/procedure/${[...slugMap.keys()][0]}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
