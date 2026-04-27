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
  const procDir = path.join(DIST_DIR, "procedure");
  fs.mkdirSync(procDir, { recursive: true });

  const slugMap = new Map();
  const hospitalsByProc = new Map();
  const sitemapUrls = [
    { loc: SITE_ORIGIN + "/", priority: "1.0", changefreq: "weekly" },
    { loc: SITE_ORIGIN + "/procedure", priority: "0.9", changefreq: "weekly" },
    { loc: SITE_ORIGIN + "/bills", priority: "0.7", changefreq: "monthly" },
  ];

  let written = 0;
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
  }

  // Procedure index hub at /procedure (catalog of all CPTs).
  const indexHtml = renderProcedureIndex({
    procedures: data.procedures,
    hospitalsByProc,
    asOf: data.as_of,
  });
  fs.writeFileSync(path.join(procDir, "index.html"), indexHtml);

  fs.writeFileSync(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(sitemapUrls));
  fs.writeFileSync(path.join(DIST_DIR, "robots.txt"), renderRobots());

  console.log(`SEO: wrote ${written} procedure pages + index -> ui/dist/procedure/`);
  console.log(`SEO: sitemap.xml (${sitemapUrls.length} urls), robots.txt`);
  console.log(`SEO: a sample slug -> ${SITE_ORIGIN}/procedure/${[...slugMap.keys()][0]}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
