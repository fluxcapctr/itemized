const { useState, useMemo, useEffect, useRef, useCallback } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showNational": true,
  "accentHex": "#6E3CFF",
  "paperHex": "#F2EEE3",
  "displayFont": "Bricolage Grotesque",
  "headlineSize": 100,
  "bodySize": 100,
  "headlineMode": "spread",
  "cornerRadius": 24,
  "stickyPicker": false,
  "compactRows": false,
  "showCoverage": true,
  "showMethodology": true,
  "sortMode": "price"
}/*EDITMODE-END*/;

// ── helpers ─────────────────────────────────────────────────────────────────
function shade(hex, pct) {
  // shift HSL lightness by pct percentage points (negative = darker)
  const m = hex.replace("#","").match(/.{2}/g);
  if (!m) return hex;
  let [r,g,b] = m.map(h => parseInt(h,16)/255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h /= 6;
  }
  l = Math.max(0, Math.min(1, l + pct/100));
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
  let r2,g2,b2;
  if (s === 0) r2=g2=b2=l;
  else {
    const q = l < 0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r2 = hue2rgb(p,q,h+1/3); g2 = hue2rgb(p,q,h); b2 = hue2rgb(p,q,h-1/3);
  }
  return "#" + [r2,g2,b2].map(v => Math.round(v*255).toString(16).padStart(2,"0")).join("");
}
function fmt(n) {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function fmtMoney(n) { return n == null ? "—" : `$${fmt(n)}`; }

// LA county zip range — coarse check per brief
function isLaZip(z) {
  const n = parseInt(z, 10);
  return /^\d{5}$/.test(z) && n >= 90001 && n <= 91609;
}

// Haversine distance in miles. Used to label each hospital row with how far
// it is from the user's entered zip (Turquoise-style "4.6 mi" label).
function haversineMiles(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Resolve a US zip to lat/lon via the public zippopotam.us API. No key required.
// Cached in-memory so we only fetch once per zip per session.
const zipGeoCache = {};
async function geocodeZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  if (zipGeoCache[zip]) return zipGeoCache[zip];
  try {
    const r = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!r.ok) return null;
    const d = await r.json();
    const place = d.places?.[0];
    if (!place) return null;
    const result = {
      lat: parseFloat(place.latitude),
      lon: parseFloat(place.longitude),
      city: place["place name"] || null,
      state: place["state abbreviation"] || null,
    };
    zipGeoCache[zip] = result;
    return result;
  } catch { return null; }
}

// Estimate out-of-pocket cost given a negotiated rate and the user's plan info.
function estimateOop(rate, plan) {
  if (rate == null) return null;
  const ded = plan.deductibleStatus === "met" ? 0
            : plan.deductibleStatus === "not_met" ? Math.max(0, plan.deductibleLeft || 0)
            : Math.max(0, plan.deductibleLeft || 500); // not sure → assume default
  const dedPart = Math.min(ded, rate);
  const remainder = Math.max(0, rate - dedPart);
  const coins = remainder * (plan.coinsurance / 100);
  return Math.round(dedPart + coins);
}

// ── URL state ───────────────────────────────────────────────────────────────
function useQueryState() {
  const get = useCallback(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      p: p.get("p"),
      payer: p.get("payer"),
      dm: p.get("dm"), // deductible-met flag
    };
  }, []);
  const [s, setS] = useState(get());
  const set = useCallback((next) => {
    const p = new URLSearchParams(window.location.search);
    Object.entries(next).forEach(([k, v]) => {
      if (v == null) p.delete(k);
      else p.set(k, v);
    });
    const qs = p.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", url);
    setS(get());
  }, [get]);
  return [s, set];
}

// ── Rating helpers ──────────────────────────────────────────────────────────
function getRating(hospitalId) {
  const r = (window.ITEMIZED_RATINGS && window.ITEMIZED_RATINGS.ratings) || {};
  return r[hospitalId] || null;
}
function ratingForSort(hospitalId) {
  const r = getRating(hospitalId);
  if (!r || r.overall_rating == null) return -1;
  return r.overall_rating;
}
function subscoreLabel(field, val) {
  if (!val) return null;
  const direction = val.replace("_", " ");
  const friendly = {
    safety_of_care: {
      above_average: "Patients experience fewer safety incidents than at the typical U.S. hospital.",
      average: "Safety performance is in line with the national average.",
      below_average: "Patients experience more safety incidents than at the typical U.S. hospital.",
    },
    readmission: {
      above_average: "Patients are readmitted less often than at the typical U.S. hospital.",
      average: "Readmission rate is in line with the national average.",
      below_average: "Patients are readmitted more often than at the typical U.S. hospital.",
    },
    mortality: {
      above_average: "Mortality rate is lower than at the typical U.S. hospital.",
      average: "Mortality is in line with the national average.",
      below_average: "Mortality rate is higher than at the typical U.S. hospital.",
    },
  };
  return { direction, friendly: friendly[field][val] };
}

function StarBlock({ hospitalId, compact, isPediatric }) {
  const [open, setOpen] = useState(false);
  const r = getRating(hospitalId);

  if (isPediatric || (r && r.overall_rating == null)) {
    return (
      <span className="star-block na" title="CMS Care Compare ratings are built from Medicare claims and don't apply to pediatric specialty hospitals.">
        <em>Pediatric specialty · not rated by CMS</em>
      </span>
    );
  }
  if (!r) return null;

  return (
    <span className="star-block" onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); } }}>
      <span className="star-num">{r.overall_rating}<span className="star-of">/5</span></span>
      <span className="star-src">CMS</span>
      {open && (
        <span className="star-pop" onClick={(e) => e.stopPropagation()}>
          <span className="sp-h">CMS Care Compare overall rating</span>
          {["safety_of_care", "readmission", "mortality"].map(k => {
            const lbl = subscoreLabel(k, r[k]);
            const display = k === "safety_of_care" ? "Safety" : k === "readmission" ? "Readmission" : "Mortality";
            return (
              <span key={k} className="sp-row">
                <span className="sp-k">{display}</span>
                <span className={`sp-v sp-${(r[k] || "na").replace(/_/g, "-")}`}>{r[k] ? r[k].replace("_", " ") : "—"}</span>
                {lbl && <span className="sp-help">{lbl.friendly}</span>}
              </span>
            );
          })}
          {r.cms_compare_url && <a className="sp-link" href={r.cms_compare_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>View on Care Compare ↗</a>}
        </span>
      )}
    </span>
  );
}

// ── components ──────────────────────────────────────────────────────────────

function Hero({ proc, mode, userMetroLabel, localCount, procedureCount }) {
  // Defaults so the hero still renders cleanly before App passes these down.
  if (!userMetroLabel) userMetroLabel = "Los Angeles";
  if (localCount == null) localCount = 0;
  if (procedureCount == null) procedureCount = 0;
  const h = proc.headline;
  // Find the rating for the cheapest hospital — used to add quality framing to the lede.
  // Only hospitals that publish a cash rate factor into the headline (some hospitals
  // publish negotiated rates but no cash, leaving cash_pay_* as null). Pediatric
  // hospitals also excluded so the cheapest/dearest names match the headline numbers,
  // which build-ui-data.mjs computes after excluding pediatric outliers.
  const cashed = proc.hospitals.filter(x => !x.all_missing && !x.is_pediatric && x.cash_pay_low != null);
  const cheapestH = cashed.length ? cashed.reduce((a, b) => a.cash_pay_low <= b.cash_pay_low ? a : b) : null;
  const dearestH = cashed.length ? cashed.reduce((a, b) => a.cash_pay_high >= b.cash_pay_high ? a : b) : null;
  const cheapRating = cheapestH ? getRating(cheapestH.id) : null;
  const dearRating  = dearestH  ? getRating(dearestH.id)  : null;
  const headline = mode === "anchor" ? (
    <h1 className="hero-h display">
      A {proc.short.toLowerCase()}<br/>
      for <span className="accent">${fmt(h.cash_low)}</span>.<br/>
      <span style={{fontSize:"0.42em", display:"block", marginTop:18, fontFamily:"'Inter', sans-serif", fontWeight:500, letterSpacing:"-0.01em", color:"var(--ink-2)"}}>
        Or ${fmt(h.cash_high)}, depending where you walk in.
      </span>
    </h1>
  ) : mode === "question" ? (
    <h1 className="hero-h display">
      Why does the<br/>same {proc.short.toLowerCase()} cost<br/><span className="accent">${fmt(h.cash_low)}</span> to <span className="accent">${fmt(h.cash_high)}</span>?
    </h1>
  ) : (
    <h1 className="hero-h display">
      Same {proc.short.toLowerCase()}.<br/>
      <span className="accent">{h.spread_x}<span className="x">×</span></span> price difference.
    </h1>
  );
  return (
    <section className="hero">
      <div className="hero-meta">
        <span className="city-chip"><span className="pin"></span>{userMetroLabel}</span>
        <span className="mono" style={{fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)"}}>
          {localCount} {userMetroLabel}-area {localCount === 1 ? "hospital" : "hospitals"} · {procedureCount} procedures · CMS-mandated MRF data
        </span>
      </div>

      {headline}
      <p className="lede">
        <strong>{fmtMoney(h.cash_low)}</strong> at one hospital. <strong>{fmtMoney(h.cash_high)}</strong> at another. Same procedure, same insurance card.
      </p>

      {(cheapRating || dearRating) && (
        <p className="lede lede-quality">
          {(() => {
            const cr = cheapRating?.overall_rating;
            const dr = dearRating?.overall_rating;
            if (cr != null && cr >= 4) {
              return <><strong>{cheapestH.name}</strong> charges <strong>{fmtMoney(h.cash_low)}</strong> and holds a <strong>{cr}/5 CMS rating</strong> — the same procedure costs <strong>{fmtMoney(h.cash_high)}</strong> at {dearestH.name}{dr != null ? ` (${dr}/5)` : ""}.</>;
            }
            if (dr != null && dr >= 4 && (cr == null || cr <= 3)) {
              return <><strong>{dearestH.name}</strong> charges <strong>{fmtMoney(h.cash_high)}</strong> and holds a <strong>{dr}/5 CMS rating</strong>. The cheapest option, <strong>{cheapestH.name}</strong>, is <strong>{fmtMoney(h.cash_low)}</strong>{cr != null ? ` with a ${cr}/5 rating` : ""}. Price ≠ quality runs both directions.</>;
            }
            // both middling
            return <>Cheapest is <strong>{cheapestH.name}</strong> at <strong>{fmtMoney(h.cash_low)}</strong>{cr != null ? `, ${cr}/5 CMS` : ""}. Most expensive is <strong>{dearestH.name}</strong> at <strong>{fmtMoney(h.cash_high)}</strong>{dr != null ? `, ${dr}/5 CMS` : ""}.</>;
          })()}
        </p>
      )}

        <div className="pair">
          <div className="pair-card lo">
            <div className="lbl">Cheapest cash price</div>
            <div className="num"><span className="cur">$</span>{fmt(h.cash_low)}</div>
            <div className="who">
              <div className="h">{h.cash_low_hospital}</div>
              <div className="m">{h.cash_low_metro}</div>
            </div>
          </div>
          <div className="vs">vs.</div>
          <div className="pair-card hi">
            <div className="lbl">Most expensive cash price</div>
            <div className="num"><span className="cur">$</span>{fmt(h.cash_high)}</div>
            <div className="who">
              <div className="h">{h.cash_high_hospital}</div>
              <div className="m">{h.cash_high_metro}</div>
            </div>
          </div>
        </div>
    </section>
  );
}

function ProcedurePicker({ procedures, selected, onChange, mode, onModeToggle, zip, setZip, zipFeedback, userGeo, sticky }) {
  return (
    <div className={`picker-shell${sticky ? " sticky" : ""}`}>
      <div className="picker-cell">
        <span className="k">Procedure</span>
        <span className="v">
          <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
            {selected.short} <span className="mono" style={{fontSize: 11, color:"var(--ink-3)", marginLeft:6}}>CPT {selected.code}</span>
          </span>
          <span className="chev">▾</span>
        </span>
        <select value={selected.code} onChange={e => onChange(e.target.value)} aria-label="Choose procedure">
          {procedures.map(p => (
            <option key={p.code} value={p.code}>{p.short} — CPT {p.code}</option>
          ))}
        </select>
      </div>
      <div className="picker-cell where-cell">
        <span className="k">Where</span>
        <div className="where-row">
          <span className="city-label">
            {userGeo?.city && userGeo?.state ? `${userGeo.city}, ${userGeo.state}` : "Los Angeles, CA"}
          </span>
          <input
            className="zip-input"
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="zip"
            value={zip}
            onChange={e => setZip(e.target.value.replace(/\D/g,"").slice(0,5))}
            aria-label="ZIP code"
          />
        </div>
        {/* Only show feedback for transient states; resolved city already lives in city-label. */}
        {zipFeedback && !(userGeo?.city) && (
          <span className="zip-feedback">{zipFeedback}</span>
        )}
      </div>
      <button className={`picker-cta ${mode==="personalized" ? "active" : ""}`} onClick={onModeToggle}>
        <span className="pulse"></span>
        {mode === "personalized" ? "Showing your estimate" : "Get my price →"}
      </button>
    </div>
  );
}

function PersonalizationForm({ plan, setPlan, payers, onReset, coverage, totalLocal }) {
  const step1Done = plan.payer != null;
  const step2Done = step1Done && plan.deductibleStatus != null && (plan.deductibleStatus !== "not_met" || plan.deductibleLeft != null);
  const step3Done = step2Done && plan.coinsurance != null;

  return (
    <div className="pf">
      {/* Step 1 — payer */}
      <div className={`pf-step ${step1Done ? "done" : ""}`}>
        <div className="num">1</div>
        <div className="q">What's your insurance?
          <span className="hint">We use it to look up the negotiated rate at each hospital.</span>
        </div>
        <div className="answer">
          <div className={`pf-select-shell ${plan.payer ? "on" : ""}`}>
            <span>{
              plan.payer === "__cash__" ? "I'm paying cash"
              : plan.payer === "__other__" ? "Other / not listed"
              : plan.payer ? payers.find(p => p.id === plan.payer)?.label
              : "Select your plan"
            }</span>
            <span className="chev">▾</span>
            <select value={plan.payer || ""} onChange={e => setPlan({ ...plan, payer: e.target.value || null })}>
              <option value="">— Select —</option>
              {payers.map(p => {
                const n = coverage?.[p.id] ?? 0;
                const suffix = totalLocal != null ? ` (${n} of ${totalLocal} nearby hospitals)` : "";
                return <option key={p.id} value={p.id}>{p.label}{suffix}</option>;
              })}
              <option value="__cash__">I'm paying cash</option>
              <option value="__other__">Other / not listed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Step 2 — deductible */}
      <div className={`pf-step ${step2Done ? "done" : ""} ${!step1Done || plan.payer === "__cash__" || plan.payer === "__other__" ? "locked" : ""}`}>
        <div className="num">2</div>
        <div className="q">Have you hit your deductible this year?
          <span className="hint">Look at your insurance card or last EOB if you're unsure.</span>
        </div>
        <div className="answer">
          <button className={`chip ${plan.deductibleStatus === "met" ? "on" : ""}`} onClick={() => setPlan({ ...plan, deductibleStatus: "met" })}>Yes, met it</button>
          <button className={`chip ${plan.deductibleStatus === "not_met" ? "on" : ""}`} onClick={() => setPlan({ ...plan, deductibleStatus: "not_met", deductibleLeft: plan.deductibleLeft ?? 500 })}>Not yet</button>
          <button className={`chip ${plan.deductibleStatus === "unsure" ? "on" : ""}`} onClick={() => setPlan({ ...plan, deductibleStatus: "unsure" })}>Not sure</button>
          {plan.deductibleStatus === "not_met" && (
            <input
              className="pf-input"
              type="number"
              min={0}
              step={50}
              value={plan.deductibleLeft ?? 500}
              onChange={e => setPlan({ ...plan, deductibleLeft: Number(e.target.value) || 0 })}
              aria-label="Deductible remaining"
            />
          )}
        </div>
      </div>

      {/* Step 3 — coinsurance */}
      <div className={`pf-step ${step3Done ? "done" : ""} ${!step2Done ? "locked" : ""}`}>
        <div className="num">3</div>
        <div className="q">Coinsurance after deductible?
          <span className="hint">Most in-network plans are 20%. Your insurance card lists this as a percentage.</span>
        </div>
        <div className="answer">
          {[10, 20, 30].map(p => (
            <button key={p} className={`chip ${plan.coinsurance === p ? "signal on" : ""}`} onClick={() => setPlan({ ...plan, coinsurance: p })}>{p}%</button>
          ))}
          <input
            className="pf-input"
            type="number"
            min={0} max={100}
            placeholder="custom"
            value={plan.coinsurance != null && ![10,20,30].includes(plan.coinsurance) ? plan.coinsurance : ""}
            onChange={e => setPlan({ ...plan, coinsurance: Number(e.target.value) || 0 })}
            aria-label="Coinsurance percent"
            style={{width: 90}}
          />
        </div>
      </div>

      <div className="pf-foot">
        <span>Estimates update in real time as you answer. We don't store anything.</span>
        <button className="pf-link" onClick={onReset}>Reset & show cash prices →</button>
      </div>
    </div>
  );
}

// Comparative position label: where does this hospital sit relative to the
// peer set for the same procedure + insurance combo?
//   - significantly_lower: bottom 25% (often half the median)
//   - lower: bottom 25-50%
//   - average: middle 50%
//   - higher: top 25-50%
//   - significantly_higher: top 25% (often 2x+ the median)
function positionLabel(myPrice, allPrices) {
  if (myPrice == null || !allPrices || allPrices.length < 4) return null;
  const sorted = [...allPrices].filter((n) => n != null).sort((a, b) => a - b);
  if (sorted.length < 4) return null;
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return null;
  const ratio = myPrice / median;
  if (ratio < 0.6) return { tier: "significantly_lower", text: "Significantly lower" };
  if (ratio < 0.9) return { tier: "lower", text: "Lower than average" };
  if (ratio <= 1.1) return { tier: "average", text: "About average" };
  if (ratio <= 1.5) return { tier: "higher", text: "Higher than average" };
  return { tier: "significantly_higher", text: "Significantly higher" };
}

function HospitalCard({ h, idx, isCheapest, mode, plan, payerLabel, isLocal, isExpanded, onToggle, dense, peerPrices, userGeo }) {
  const cardRef = useRef(null);
  const priceRef = useRef(null);

  // pick the rate to display
  const rate = useMemo(() => {
    if (mode === "cash") {
      return { low: h.cash_pay_low, high: h.cash_pay_high, source: "Cash pay (self-pay)", payer: null };
    }
    if (!plan.payer || plan.payer === "__cash__" || plan.payer === "__other__") {
      return { low: h.cash_pay_low, high: h.cash_pay_high, source: "Cash pay (self-pay)", payer: null };
    }
    const r = h.rates_by_payer.find(p => p.canonical_payer === plan.payer);
    if (!r || r.low == null) return { low: null, high: null, source: `No rate published for ${payerLabel}`, payer: plan.payer };
    return { low: r.low, high: r.high, source: `${payerLabel} · ${r.plan_count} plan${r.plan_count===1?"":"s"}`, payer: plan.payer };
  }, [h, mode, plan, payerLabel]);

  const oop = useMemo(() => {
    if (mode !== "personalized" || rate.low == null || !plan.coinsurance == null) return null;
    if (!plan.payer || plan.payer === "__cash__" || plan.payer === "__other__") return null;
    if (plan.coinsurance == null) return null;
    return { low: estimateOop(rate.low, plan), high: estimateOop(rate.high, plan) };
  }, [mode, rate, plan]);

  // flash on update
  useEffect(() => {
    if (!priceRef.current) return;
    priceRef.current.classList.remove("flash");
    void priceRef.current.offsetWidth;
    priceRef.current.classList.add("flash");
  }, [oop?.low, oop?.high, rate.low]);

  const cls = ["card"];
  if (isLocal) cls.push("local");
  if (isCheapest && rate.low != null) cls.push("cheapest");
  if (isExpanded) cls.push("open");

  const showOop = mode === "personalized" && oop != null;

  return (
    <div className={cls.join(" ")} ref={cardRef} onClick={onToggle} role="button" tabIndex={0}
         onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}>
      <div className="rank">{String(idx + 1).padStart(2, "0")}</div>
      <div className="name">
        <span className="name-line">
          <span className="name-text">{h.name}</span>
          {isCheapest && rate.low != null && <span className="tag cheap">cheapest</span>}
          {h.partial_parse && <span className="tag partial">partial parse</span>}
        </span>
        <span className="sys">{h.system}</span>
        <span className="rating-line">
          <StarBlock hospitalId={h.id} isPediatric={h.is_pediatric} />
          {(() => {
            const pos = positionLabel(rate.low, peerPrices);
            if (!pos || isCheapest || rate.low == null) return null;
            return <span className={`tag pos pos-${pos.tier}`}>{pos.text}</span>;
          })()}
        </span>
      </div>
      <div className="metro">
        {h.metro}
        {userGeo && h.lat != null && (() => {
          const d = haversineMiles(userGeo.lat, userGeo.lon, h.lat, h.lon);
          if (d == null) return null;
          const label = d < 1 ? "<1 mi" : d < 10 ? `${d.toFixed(1)} mi` : `${Math.round(d)} mi`;
          return <span className="metro-dist"> · {label}</span>;
        })()}
      </div>
      <div className="price-cell">
        {rate.low == null ? (
          <>
            <span className="na">—</span>
            <span className="pri-meta" title="The hospital didn't publish a rate for this payer/procedure combination in their MRF.">
              {mode === "cash" ? "Cash price not published" : `No ${payerLabel} rate published`}
            </span>
          </>
        ) : showOop ? (
          <>
            <span className="pri-num" ref={priceRef}>
              <span className="cur">$</span>{fmt(oop.low)}
              {oop.high !== oop.low && <span className="range">–${fmt(oop.high)}</span>}
            </span>
            <span className="neg-context">est. you pay · negotiated <span className="strike">{fmtMoney(rate.low)}{rate.high!==rate.low?`–${fmt(rate.high)}`:""}</span></span>
          </>
        ) : (
          <>
            <span className="pri-num" ref={priceRef}>
              <span className="cur">$</span>{fmt(rate.low)}
              {rate.high !== rate.low && <span className="range">–${fmt(rate.high)}</span>}
            </span>
            <span className="pri-meta">{rate.source}</span>
          </>
        )}
      </div>

      <div className="row-expand" onClick={e => e.stopPropagation()}>
        <div className="mono" style={{fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 14}}>
          Plan-level rates from this hospital's MRF
        </div>
        <div className="plan-groups">
          {h.rates_by_payer.map(p => {
            const sel = plan.payer === p.canonical_payer;
            const hasRate = p.low != null;
            const plans = p.plans || [];
            return (
              <div key={p.canonical_payer} className={`plan-group${sel ? " sel" : ""}${hasRate ? "" : " na"}`}>
                <div className="plan-group-h">
                  <span className="pname">{p.canonical_payer}</span>
                  <span className="pcount">
                    {!hasRate
                      ? "No rate published"
                      : plans.length === 1
                        ? `1 plan · $${fmt(plans[0].rate)}`
                        : `${plans.length} plans · $${fmt(p.low)}${p.high !== p.low ? `–$${fmt(p.high)}` : ""}`}
                  </span>
                </div>
                {plans.length > 0 && (
                  <div className="plan-rows">
                    {plans.slice(0, 12).map((row, i) => (
                      <div key={i} className="plan-row">
                        <span className="plan-name" title={[row.payer, row.plan].filter(Boolean).join(" · ")}>
                          {row.plan || row.payer || "(unnamed plan)"}
                        </span>
                        <span className="plan-rate">${fmt(row.rate)}</span>
                      </div>
                    ))}
                    {plans.length > 12 && (
                      <div className="plan-row more">+ {plans.length - 12} more plan{plans.length - 12 === 1 ? "" : "s"}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div className="plan-group static">
            <div className="plan-group-h">
              <span className="pname">Cash (self-pay)</span>
              <span className="pcount">{h.cash_pay_low == null ? "Not published" : `$${fmt(h.cash_pay_low)}${h.cash_pay_high !== h.cash_pay_low ? `–$${fmt(h.cash_pay_high)}` : ""}`}</span>
            </div>
          </div>
          <div className="plan-group static">
            <div className="plan-group-h">
              <span className="pname tipped" data-tip="The hospital's full sticker price. Almost no one actually pays this — insurance negotiates it down, cash payers get a discount.">
                Chargemaster (gross) <span className="tip-icon">ⓘ</span>
              </span>
              <span className="pcount">{h.gross_low == null ? "Not published" : `$${fmt(h.gross_low)}${h.gross_high !== h.gross_low ? `–$${fmt(h.gross_high)}` : ""}`}</span>
            </div>
          </div>
        </div>
        {/* Contact this hospital — phone + address from CMS Care Compare. */}
        {(h.phone || h.address) && (
          <div className="contact-block">
            <div className="contact-row">
              <div className="contact-label">Contact this hospital</div>
              <div className="contact-actions">
                {h.phone && (
                  <a className="contact-btn primary" href={`tel:${h.phone.replace(/[^\d+]/g, "")}`} onClick={e => e.stopPropagation()}>
                    <span className="contact-btn-icon">☎</span>
                    {h.phone}
                  </a>
                )}
                {h.address && (
                  <a className="contact-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.address}, ${h.metro}`)}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                    <span className="contact-btn-icon">📍</span>
                    {h.address}, {h.metro}
                  </a>
                )}
              </div>
            </div>
            <div className="nsa-callout">
              <strong>Your right to know.</strong> Federal law (the No Surprises Act, 45 CFR 149.610) gives you the right to request a written <strong>Good Faith Estimate</strong> from this hospital before any non-emergency care. Call them with the CPT code above and your insurance details and they have to provide one. <a href="https://www.cms.gov/nosurprises/consumers" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Learn more →</a>
            </div>
          </div>
        )}

        <a className="bills-cta" href="/bills.html" onClick={e => e.stopPropagation()}>
          <span className="bills-cta-icon">⚖</span>
          <span className="bills-cta-text">
            <strong>Got a bill that doesn't match these rates?</strong>
            Bill review services dispute it for a cut of the savings — no savings, no fee.
          </span>
          <span className="bills-cta-arrow">→</span>
        </a>
        <div className="source-line">
          <span>SRC ↗ <a href="#" onClick={e=>e.preventDefault()} style={{color:"inherit"}}>cms-hpt.txt</a></span>
          <span>MRF ↗ <a href="#" onClick={e=>e.preventDefault()} style={{color:"inherit"}}>{h.id}-mrf-2026.json</a></span>
          <span>Last fetched · 2026-04-26</span>
        </div>
      </div>
    </div>
  );
}

function MethodologyCards({ data }) {
  return (
    <div id="methodology">
      <div className="sec">
        <h2 className="display">How we know.<br/><span className="accent">No spin.</span></h2>
        <div className="sec-sub">Every number on this page came out of a CMS-mandated machine-readable file. No imputation, no smoothing, no averaging. The work is in cleanup and presentation.</div>
      </div>

      <div className="meth-grid">
        <div className="meth-card signal">
          <div className="eyebrow">§ 01 — Source</div>
          <h3 className="h">Public, by <em>federal rule</em>.</h3>
          <p className="b">Since January 2021, every U.S. hospital has been required to publish a machine-readable file with every payer-negotiated rate, gross chargemaster price, and discounted cash rate, for every billable service. We pull the URL straight from each hospital's <span className="mono">cms-hpt.txt</span> manifest.</p>
          <svg className="ast" style={{color:"var(--paper)"}}><use href="#ast"/></svg>
        </div>
        <div className="meth-card">
          <div className="eyebrow">§ 02 — Cleanup</div>
          <h3 className="h">One <em>paragraph</em>.</h3>
          <p className="b">We drop bundled case rates, per-diem rates, anything coded methodology = "other", and any negotiated rate more than 3× the gross charge (almost always a parsing artifact). Cash rates are taken verbatim. Negotiated ranges are min/max across plan-level rows for a canonical payer name.</p>
        </div>
        <div className="meth-card">
          <div className="eyebrow">§ 03 — On the star ratings</div>
          <h3 className="h">One <em>input</em>, not the answer.</h3>
          <p className="b">CMS star ratings are hospital-wide composites built from ~50 measures spanning safety, mortality, readmission, patient experience, and timeliness. They reflect <strong>overall hospital quality, not procedure-specific outcomes</strong>. A 5-star hospital may not be the best for every procedure, and a 3-star hospital may have a strong specific service line. Use the rating as one input, not the answer.</p>
          <a className="meth-link" href="https://www.medicare.gov/care-compare/" target="_blank" rel="noopener noreferrer">data.cms.gov · dataset xubh-q36u ↗</a>
        </div>
      </div>
    </div>
  );
}

// Curated direct-pay alternatives for shoppable imaging procedures.
// These are NOT in our parsed dataset — they're free-standing facilities that
// don't publish CMS-format MRFs. Pricing on their cash-pay pages typically
// runs 50-70% below hospital rates for the same scan.
//
// TODO: replace public links with affiliate-tracked URLs once partnerships are
// signed. Marker: /go/{partner} would route through a tracking redirect.
const DIRECT_PAY_PROVIDERS = {
  imaging: [
    { name: "RadNet", note: "70+ LA-area imaging centers (Liberty Pacific, Beverly Hills Imaging, ProMed, Tower Saint John's, more)", url: "https://www.radnet.com/los-angeles" },
    { name: "SimonMed Imaging", note: "15-20 LA centers, transparent cash pricing", url: "https://www.simonmed.com" },
    { name: "Akumin", note: "National imaging chain, LA-area locations", url: "https://akumin.com" },
  ],
};

const PROCEDURE_DIRECT_PAY_TYPE = {
  "70551": "imaging", "70553": "imaging", "72148": "imaging",
  "73721": "imaging", "74177": "imaging", "76700": "imaging",
  "77067": "imaging", "77080": "imaging", "71045": "imaging",
};

function DirectPayAlternatives({ proc }) {
  const type = PROCEDURE_DIRECT_PAY_TYPE[proc.code];
  if (!type) return null;
  const providers = DIRECT_PAY_PROVIDERS[type] || [];
  if (providers.length === 0) return null;
  return (
    <div className="direct-pay-alt">
      <div className="dpa-h">
        <span className="dpa-icon">💡</span>
        <div>
          <strong>Free-standing imaging centers are typically 50–70% cheaper than hospitals for {proc.short.toLowerCase()}.</strong>
          <span className="dpa-sub">These facilities don't publish CMS-format MRFs (the federal rule applies to hospitals only), so they're not in the comparison above. Most publish cash pricing on request.</span>
        </div>
      </div>
      <div className="dpa-list">
        {providers.map((p) => (
          <a key={p.name} className="dpa-item" href={p.url} target="_blank" rel="noopener noreferrer">
            <div className="dpa-name">{p.name}</div>
            <div className="dpa-note">{p.note}</div>
            <div className="dpa-arrow">→</div>
          </a>
        ))}
      </div>
    </div>
  );
}

function ProcOverview({ proc }) {
  const [expanded, setExpanded] = useState(false);
  if (!proc.overview) return null;
  return (
    <div className="proc-overview">
      <div className="ov-h">{proc.overview.headline}</div>
      <div className={`ov-body ${expanded ? "" : "collapsed"}`}>{proc.overview.body}</div>
      <button className="ov-toggle" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : "Read more →"}
      </button>
    </div>
  );
}

function FAQ({ hospitalCount, metroCount, procedureCount }) {
  const [openIdx, setOpenIdx] = useState(null);
  const items = [
    {
      q: "Where does the data come from?",
      a: "Every hospital in the United States is required by federal law (45 CFR 180.50) to publish a Machine-Readable File listing every procedure they bill, every insurance plan they contract with, and the negotiated rate for each combination. We download the file from each hospital, parse it, and surface the comparison. No middleman, no insurer, no hospital sponsoring the rankings.",
    },
    {
      q: "Why is my hospital missing?",
      a: `Either we haven't parsed it yet (we're at ${hospitalCount} hospitals across ${metroCount} metros and still adding), or the hospital published their MRF in an unusual format we haven't written a parser for, or their server blocks automated downloads. We add hospitals on a rolling basis. If yours isn't here, ask.`,
    },
    {
      q: "Why does my insurance plan show \"no rate published\"?",
      a: "Hospitals are required to publish the rate they've negotiated with each insurer, but enforcement is uneven. Some hospitals only publish rates for the plans they actually contract with at scale. Others publish a partial list. We can't show you a rate the hospital didn't publish.",
    },
    {
      q: "Why don't HMO and PPO show as separate options in the dropdown?",
      a: "We aggregate by canonical insurer (Aetna, Cigna, etc.) at the top level. Click any hospital row to expand and see the plan-by-plan breakdown — every individual plan name and rate the hospital published.",
    },
    {
      q: "What's the difference between cash pay, gross charge, and negotiated rate?",
      a: "Cash pay is what an uninsured patient is charged. Gross charge (\"chargemaster\") is the sticker price hospitals invented as a starting point for negotiation — almost no one pays it. Negotiated rate is what your insurance has agreed to pay (you pay your copay/deductible/coinsurance on top). Cash pay is often cheaper than the negotiated rate, which is one of the more uncomfortable truths in this dataset.",
    },
    {
      q: "How accurate are the CMS star ratings?",
      a: "CMS Hospital Care Compare is the federal regulator's rating, built from ~50 measures across safety, mortality, readmission, patient experience, and timeliness. It's a hospital-wide composite, not procedure-specific. A 5-star hospital may not be the best at every procedure, and a 3-star hospital can have a strong specific service line. We treat the rating as one input, not the answer.",
    },
    {
      q: "Are you taking money from any of these hospitals or insurers?",
      a: "No. That would compromise the data. We earn a referral fee from Goodbill (the bill-negotiation service we recommend on the \"Got a bill?\" page), and we expect to add affiliates from direct-pay imaging clinics in the future. The line we hold: revenue can come from adjacent services the user is already looking for, never from the entities being compared.",
    },
  ];
  return (
    <div id="faq" className="faq">
      <div className="sec">
        <h2 className="display">
          Questions you should <span className="accent">ask us</span>.
        </h2>
      </div>
      <div className="faq-list">
        {items.map((it, i) => (
          <details key={i} className="faq-item" open={openIdx === i ? true : undefined} onToggle={(e) => setOpenIdx(e.target.open ? i : (openIdx === i ? null : openIdx))}>
            <summary>
              <span className="faq-q">{it.q}</span>
              <span className="faq-icon">+</span>
            </summary>
            <div className="faq-a">{it.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

function SortSelector({ value, onChange }) {
  const [openHelp, setOpenHelp] = useState(false);
  const opts = [
    { id: "price",  label: "Price",      hint: "ascending — cheapest first" },
    { id: "rating", label: "CMS rating", hint: "descending — 5★ first" },
    { id: "value",  label: "Best value", hint: "combines both", help: true },
  ];
  return (
    <div className="sort-bar" role="tablist" aria-label="Sort hospitals">
      <span className="sort-lbl">Sort</span>
      <div className="sort-tabs">
        {opts.map(o => (
          <button key={o.id} role="tab" aria-selected={value === o.id}
                  className={`sort-tab ${value === o.id ? "on" : ""}`}
                  onClick={() => onChange(o.id)}>
            {o.label}
            {o.help && (
              <span className="sort-help" onClick={(e) => { e.stopPropagation(); setOpenHelp(h => !h); }}
                    title="How is Best value calculated?">(?)</span>
            )}
          </button>
        ))}
      </div>
      {openHelp && (
        <div className="sort-help-pop">
          <strong>How "Best value" ranks hospitals.</strong>
          <p>We rank every hospital twice — by price, ascending; and by CMS rating, descending — then sum the two ranks. The lowest combined rank wins. Hospitals without a published CMS rating are placed at the bottom of the rating ranks. The composite isn't science; it's a useful starting point. Decide for yourself whether you trust it.</p>
          <button className="sort-help-close" onClick={() => setOpenHelp(false)}>Got it</button>
        </div>
      )}
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const data = window.ITEMIZED_DATA;
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [qs, setQs] = useQueryState();

  // Procedure index ships with the page (small). Hospital arrays are lazy-loaded
  // from data/{cpt}.json on procedure switch; cached after first fetch.
  const procedures = data.procedures;
  const initialCode = qs.p || procedures.find(p => p.is_default)?.code || procedures[0].code;
  const [procCode, setProcCode] = useState(initialCode);
  const [procHospitals, setProcHospitals] = useState({}); // cpt -> hospitals[]
  const [loading, setLoading] = useState(true);

  // Fetch the active procedure's hospitals on first view and on procedure change.
  useEffect(() => {
    if (procHospitals[procCode]) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`./data/${procCode}.json`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)))
      .then((d) => {
        setProcHospitals((prev) => ({ ...prev, [procCode]: d.hospitals }));
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load procedure data:", err);
        setLoading(false);
      });
  }, [procCode]);

  const procIndexEntry = procedures.find(p => p.code === procCode) || procedures[0];
  // Stitch the index entry together with the lazy-loaded hospitals array.
  const proc = useMemo(() => ({
    ...procIndexEntry,
    hospitals: procHospitals[procCode] || [],
  }), [procIndexEntry, procHospitals, procCode]);

  const [mode, setMode] = useState(qs.payer ? "personalized" : "cash");
  const [plan, setPlan] = useState({
    payer: qs.payer || null,
    deductibleStatus: qs.dm === "1" ? "met" : qs.dm === "0" ? "not_met" : null,
    deductibleLeft: 500,
    coinsurance: 20,
  });

  const [expanded, setExpanded] = useState(null);
  const [zip, setZip] = useState("");
  const [zipFeedback, setZipFeedback] = useState("");

  // tweak side effects
  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--signal", tweaks.accentHex);
    r.style.setProperty("--paper", tweaks.paperHex);
    // derive paper-2 / paper-3 from paper
    r.style.setProperty("--paper-2", shade(tweaks.paperHex, -4));
    r.style.setProperty("--paper-3", shade(tweaks.paperHex, -8));
    r.style.setProperty("--display-font", `'${tweaks.displayFont}', 'Bricolage Grotesque', sans-serif`);
    r.style.setProperty("--headline-scale", tweaks.headlineSize / 100);
    r.style.setProperty("--body-scale", tweaks.bodySize / 100);
    r.style.setProperty("--corner", `${tweaks.cornerRadius}px`);
  }, [tweaks.accentHex, tweaks.paperHex, tweaks.displayFont, tweaks.headlineSize, tweaks.bodySize, tweaks.cornerRadius]);

  // load display font dynamically
  useEffect(() => {
    const f = tweaks.displayFont;
    if (!f || f === "Bricolage Grotesque") return;
    const id = "twk-font-" + f.replace(/\s+/g, "-");
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;500;600;700;800&display=swap`;
    document.head.appendChild(link);
  }, [tweaks.displayFont]);

  // url sync
  useEffect(() => {
    setQs({
      p: procCode === "73721" ? null : procCode,
      payer: mode === "personalized" && plan.payer && !["__cash__","__other__"].includes(plan.payer) ? plan.payer : null,
      dm: mode === "personalized" && plan.deductibleStatus === "met" ? "1" : (mode === "personalized" && plan.deductibleStatus === "not_met" ? "0" : null),
    });
  }, [procCode, mode, plan.payer, plan.deductibleStatus]);

  // zip handling — geocodes via zippopotam.us, then computes distance per hospital.
  const [userGeo, setUserGeo] = useState(null);
  useEffect(() => {
    if (!zip) { setZipFeedback(""); setUserGeo(null); return; }
    if (zip.length < 5) { setZipFeedback("type 5 digits…"); setUserGeo(null); return; }
    setZipFeedback("looking up…");
    let cancelled = false;
    geocodeZip(zip).then((geo) => {
      if (cancelled) return;
      if (!geo) { setZipFeedback("zip not found"); setUserGeo(null); return; }
      setUserGeo(geo);
      // Show the city the user entered. We compute distance to all 96 hospitals
      // across 13 metros, so any valid US zip gets useful results.
      setZipFeedback(geo.city && geo.state ? `${geo.city}, ${geo.state}` : "✓ valid zip");
    });
    return () => { cancelled = true; };
  }, [zip]);

  // Sort hospitals by selected price
  function priceForSort(h) {
    // Null cash sorts to the bottom (Number.POSITIVE_INFINITY) instead of being
    // coerced to 0 by the JS less-than operator on null.
    if (mode === "cash") return h.cash_pay_low ?? Number.POSITIVE_INFINITY;
    if (!plan.payer || ["__cash__","__other__"].includes(plan.payer)) return h.cash_pay_low ?? Number.POSITIVE_INFINITY;
    const r = h.rates_by_payer.find(p => p.canonical_payer === plan.payer);
    if (!r || r.low == null) return Number.POSITIVE_INFINITY;
    if (mode === "personalized" && plan.coinsurance != null && plan.deductibleStatus != null) {
      return estimateOop(r.low, plan) ?? Number.POSITIVE_INFINITY;
    }
    return r.low;
  }

  // Sort comparator factory — returns sorted list per active sortMode.
  function sortHospitals(list) {
    const sortMode = tweaks.sortMode || "price";
    const arr = [...list];
    if (sortMode === "price") {
      arr.sort((a,b) => {
        const pa = priceForSort(a), pb = priceForSort(b);
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "rating") {
      arr.sort((a,b) => {
        const ra = ratingForSort(a.id), rb = ratingForSort(b.id);
        if (ra !== rb) return rb - ra;
        const pa = priceForSort(a), pb = priceForSort(b);
        if (pa !== pb) return pa - pb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === "value") {
      // rank-by-price ascending + rank-by-rating descending; null ratings = worst rank.
      const byPrice  = [...arr].sort((a,b) => priceForSort(a) - priceForSort(b));
      const byRating = [...arr].sort((a,b) => ratingForSort(b.id) - ratingForSort(a.id));
      const priceRank = new Map(byPrice.map((h,i) => [h.id, i]));
      const ratingRank = new Map(byRating.map((h,i) => [h.id, ratingForSort(h.id) < 0 ? arr.length : i]));
      arr.sort((a,b) => {
        const sa = priceRank.get(a.id) + ratingRank.get(a.id);
        const sb = priceRank.get(b.id) + ratingRank.get(b.id);
        if (sa !== sb) return sa - sb;
        return priceForSort(a) - priceForSort(b);
      });
    }
    return arr;
  }

  // Derive the user's metro from their zip's lat/lon. We use the metro of
  // the closest hospital across all our metros, provided it's within ~75 mi.
  // If no zip entered (or no nearby metro), default to "Los Angeles, CA"
  // because LA is the densest preview set and the safest default.
  const userMetro = useMemo(() => {
    if (!userGeo) return "Los Angeles, CA";
    let best = null;
    for (const h of proc.hospitals) {
      if (h.lat == null || h.lon == null) continue;
      const d = haversineMiles(userGeo.lat, userGeo.lon, h.lat, h.lon);
      if (!best || d < best.d) best = { d, metro: h.metro };
    }
    return best && best.d < 75 ? best.metro : "Los Angeles, CA";
  }, [userGeo, proc]);
  // City portion of metro, used in headlines: "Los Angeles" / "Boston" / etc.
  const userMetroLabel = useMemo(() => userMetro.split(",")[0], [userMetro]);

  const localHospitals = useMemo(() =>
    sortHospitals(proc.hospitals.filter(h => h.metro === userMetro && !h.all_missing)),
    [proc, mode, plan, tweaks.sortMode, userMetro]);

  const nationalHospitals = useMemo(() =>
    sortHospitals(proc.hospitals.filter(h => h.metro !== userMetro && !h.all_missing)),
    [proc, mode, plan, tweaks.sortMode, userMetro]);

  const cheapestLocalId = localHospitals[0]?.id;
  const cheapestOverallId = useMemo(() => {
    const all = [...localHospitals, ...nationalHospitals];
    return all[0]?.id;
  }, [localHospitals, nationalHospitals]);

  // Peer prices for the active selection — used by HospitalCard to label each
  // row as "significantly lower / lower / average / higher / significantly higher"
  // relative to the median. We compute on all non-pediatric hospitals (national
  // included) so the comparison reflects the full peer set.
  const peerPrices = useMemo(() => {
    const all = [...localHospitals, ...nationalHospitals].filter(h => !h.is_pediatric);
    return all.map(priceForSort).filter(p => Number.isFinite(p));
  }, [localHospitals, nationalHospitals, mode, plan]);

  const payerLabel = data.supported_payers.find(p => p.id === plan.payer)?.label || plan.payer;
  const payersForForm = data.supported_payers;

  // Coverage count per payer across the user's-metro hospitals: how many
  // local hospitals publish a rate for this payer for the selected procedure.
  // Drives the "Aetna (19 of 25 nearby hospitals)" hint in the dropdown.
  const localPayerCoverage = useMemo(() => {
    const localHosp = proc.hospitals.filter(h => h.metro === userMetro && !h.all_missing);
    const out = {};
    for (const p of data.supported_payers) {
      out[p.id] = localHosp.filter(h => {
        const r = h.rates_by_payer.find(rp => rp.canonical_payer === p.id);
        return r && r.low != null;
      }).length;
    }
    return out;
  }, [proc, data.supported_payers, userMetro]);
  const totalLocalHospitals = useMemo(
    () => proc.hospitals.filter(h => h.metro === userMetro && !h.all_missing).length,
    [proc]
  );

  // Hospitals partitioned by whether they have a rate for the user's selection.
  // In cash mode: cash_pay_low must be present. In personalized mode: a rate for
  // the chosen payer must exist. Hospitals without a rate get folded into a
  // collapse-by-default footer below the main list.
  function hasRateForCurrentSelection(h) {
    if (mode === "cash" || !plan.payer || ["__cash__", "__other__"].includes(plan.payer)) {
      return h.cash_pay_low != null;
    }
    const r = h.rates_by_payer.find(p => p.canonical_payer === plan.payer);
    return !!(r && r.low != null);
  }

  function handleModeToggle() {
    setMode(m => m === "personalized" ? "cash" : "personalized");
    setExpanded(null);
  }

  function handleProcChange(code) {
    setProcCode(code);
    setExpanded(null);
  }

  function handleResetPersonalization() {
    setMode("cash");
    setPlan({ payer: null, deductibleStatus: null, deductibleLeft: 500, coinsurance: 20 });
  }

  return (
    <>
      <div className="container">
        <Hero proc={proc} mode={tweaks.headlineMode}
              userMetroLabel={userMetroLabel}
              localCount={totalLocalHospitals}
              procedureCount={procedures.length} />

        <ProcedurePicker
          procedures={procedures}
          selected={proc}
          onChange={handleProcChange}
          mode={mode}
          onModeToggle={handleModeToggle}
          zip={zip} setZip={setZip} zipFeedback={zipFeedback} userGeo={userGeo}
          sticky={tweaks.stickyPicker}
        />

        {mode === "personalized" && (
          <PersonalizationForm
            plan={plan} setPlan={setPlan}
            payers={payersForForm}
            onReset={handleResetPersonalization}
            coverage={localPayerCoverage}
            totalLocal={totalLocalHospitals}
          />
        )}

        <ProcOverview proc={proc} />

        {/* LA hospitals */}
        <div className="sec">
          <h2 className="display">
            Hospitals <span className="accent">near you</span>.
          </h2>
          <div className="sec-sub">
            {mode === "personalized" && plan.payer && !["__cash__","__other__"].includes(plan.payer)
              ? <>Estimated out-of-pocket for <strong>{proc.short.toLowerCase()}</strong> on <strong>{payerLabel}</strong>, {plan.deductibleStatus === "met" ? "with deductible already met" : plan.deductibleStatus === "not_met" ? `with $${fmt(plan.deductibleLeft)} deductible left` : "with deductible status unknown"}, at {plan.coinsurance}% coinsurance.</>
              : <>Cash-pay range for <strong>{proc.short.toLowerCase()}</strong> at the {userMetroLabel}-area hospitals whose MRFs we've parsed.</>}
          </div>
        </div>
        <SortSelector value={tweaks.sortMode || "price"} onChange={v => setTweak("sortMode", v)} />
        {loading ? (
          <div className="loading-shell">
            <div className="loading-pulse"></div>
            <div className="mono" style={{fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ink-3)"}}>
              Loading {proc.short?.toLowerCase()} prices…
            </div>
          </div>
        ) : (() => {
          const localWithRate = localHospitals.filter(hasRateForCurrentSelection);
          const localWithoutRate = localHospitals.filter(h => !hasRateForCurrentSelection(h));
          const noRateLabel = mode === "cash"
            ? "didn't publish a cash price for this procedure"
            : `didn't publish a ${payerLabel} rate for this procedure`;
          return (
            <>
              <div className={`cards ${tweaks.compactRows ? "dense" : ""}`}>
                {localWithRate.map((h, idx) => (
                  <HospitalCard
                    key={h.id} h={h} idx={idx}
                    isCheapest={h.id === cheapestLocalId}
                    mode={mode} plan={plan} payerLabel={payerLabel}
                    isLocal={true}
                    isExpanded={expanded === h.id}
                    onToggle={() => setExpanded(expanded === h.id ? null : h.id)}
                    dense={tweaks.compactRows}
                    peerPrices={peerPrices} userGeo={userGeo}
                  />
                ))}
              </div>
              {localWithoutRate.length > 0 && (
                <details className="no-rate-fold">
                  <summary>
                    <span className="count">{localWithoutRate.length}</span> {localWithoutRate.length === 1 ? "hospital" : "hospitals"} {noRateLabel}
                    <span className="hint">— show</span>
                  </summary>
                  <div className={`cards muted ${tweaks.compactRows ? "dense" : ""}`}>
                    {localWithoutRate.map((h, idx) => (
                      <HospitalCard
                        key={h.id} h={h} idx={localWithRate.length + idx}
                        isCheapest={false}
                        mode={mode} plan={plan} payerLabel={payerLabel}
                        isLocal={true}
                        isExpanded={expanded === h.id}
                        onToggle={() => setExpanded(expanded === h.id ? null : h.id)}
                        dense={tweaks.compactRows}
                        peerPrices={peerPrices} userGeo={userGeo}
                      />
                    ))}
                  </div>
                </details>
              )}
            </>
          );
        })()}

        <div className="disclaimer">
          <span className="pin"></span>
          {mode === "personalized"
            ? "These are estimates. Your actual cost depends on coverage details we can't see — out-of-pocket max, in-network status, secondary insurance. Use this as a starting point, not a quote."
            : "Cash-pay rates are what an uninsured patient would be charged. Hospitals are required to publish them; the spread is what they actually published."}
        </div>

        <DirectPayAlternatives proc={proc} />

        {/* National context */}
        {tweaks.showNational && (
          <>
            <div className="sec">
              <h2 className="display">
                How {userMetroLabel} <span className="accent">compares</span> nationally.
              </h2>
              <div className="sec-sub">
                The same {proc.short.toLowerCase()} at hospitals in other metros. Lower visual weight on purpose — these aren't "near you." But they're how you know the {userMetroLabel} numbers aren't the only numbers.
              </div>
            </div>
            {(() => {
              const natWith = nationalHospitals.filter(hasRateForCurrentSelection);
              const natWithout = nationalHospitals.filter(h => !hasRateForCurrentSelection(h));
              // Cap the national/compare section at 5 visible hospitals to keep
              // the page short. Anything beyond 5 (with or without a rate)
              // collapses into a "show more" fold.
              const natWithTop = natWith.slice(0, 5);
              const natWithRest = natWith.slice(5);
              const natRest = [...natWithRest, ...natWithout];
              const restLabel = natRest.length === 1
                ? "more national hospital"
                : "more national hospitals";
              return (
                <>
                  <div className="cards national">
                    {natWithTop.map((h, idx) => (
                      <HospitalCard
                        key={h.id} h={h} idx={idx}
                        isCheapest={h.id === cheapestOverallId}
                        mode={mode} plan={plan} payerLabel={payerLabel}
                        isLocal={false}
                        isExpanded={expanded === h.id}
                        onToggle={() => setExpanded(expanded === h.id ? null : h.id)}
                        peerPrices={peerPrices} userGeo={userGeo}
                      />
                    ))}
                  </div>
                  {natRest.length > 0 && (
                    <details className="no-rate-fold">
                      <summary>
                        <span className="count">{natRest.length}</span> {restLabel}
                        <span className="hint">— show</span>
                      </summary>
                      <div className="cards national muted">
                        {natRest.map((h, idx) => (
                          <HospitalCard
                            key={h.id} h={h} idx={natWithTop.length + idx}
                            isCheapest={false}
                            mode={mode} plan={plan} payerLabel={payerLabel}
                            isLocal={false}
                            isExpanded={expanded === h.id}
                            onToggle={() => setExpanded(expanded === h.id ? null : h.id)}
                            peerPrices={peerPrices} userGeo={userGeo}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}
          </>
        )}

        <div style={{height: 80}} />

        {tweaks.showMethodology && <MethodologyCards data={data} />}

        <FAQ
          hospitalCount={proc.hospitals.filter(h => !h.all_missing).length || proc.hospitals.length}
          metroCount={new Set(proc.hospitals.filter(h => !h.all_missing).map(h => h.metro).filter(Boolean)).size}
          procedureCount={procedures.length}
        />

        <footer className="foot">
          <div className="foot-sources">
            <div className="foot-h">Data sources</div>
            <ul>
              <li><strong>Hospital prices</strong> — CMS Hospital Price Transparency rule (45 CFR 180.50), as of {data.as_of}.</li>
              <li><strong>Hospital quality ratings</strong> — CMS Hospital Care Compare (dataset xubh-q36u), as of {window.ITEMIZED_RATINGS?.as_of || "2026-04-26"}.</li>
              <li><strong>Coverage</strong> — 14 hospitals across 8 metros. Methodology and gaps detailed above.</li>
            </ul>
          </div>
          <div className="foot-meta">
            <div>Itemized · itemized.health</div>
            <div className="foot-disc">A consumer reading of CMS-mandated MRF data. Not medical or financial advice.</div>
            <div className="foot-ver">v0.3 · Apr 2026</div>
          </div>
        </footer>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Type" />
        <TweakSelect label="Display font" value={tweaks.displayFont} onChange={v => setTweak("displayFont", v)}
          options={["Bricolage Grotesque","Fraunces","DM Serif Display","Space Grotesk","Archivo Black","Manrope","Bebas Neue","Playfair Display"]} />
        <TweakSlider label="Headline size" value={tweaks.headlineSize} onChange={v => setTweak("headlineSize", v)} min={70} max={140} step={5} unit="%" />
        <TweakSlider label="Body size" value={tweaks.bodySize} onChange={v => setTweak("bodySize", v)} min={85} max={125} step={5} unit="%" />

        <TweakSection label="Brand" />
        <TweakColor label="Signal accent" value={tweaks.accentHex} onChange={v => setTweak("accentHex", v)} />
        <TweakColor label="Paper / background" value={tweaks.paperHex} onChange={v => setTweak("paperHex", v)} />
        <TweakSlider label="Corner radius" value={tweaks.cornerRadius} onChange={v => setTweak("cornerRadius", v)} min={0} max={36} step={2} unit="px" />

        <TweakSection label="Hero" />
        <TweakRadio label="Headline" value={tweaks.headlineMode} onChange={v => setTweak("headlineMode", v)}
          options={[{value:"spread",label:"Spread"},{value:"anchor",label:"$ anchor"},{value:"question",label:"Ask"}]} />

        <TweakSection label="Layout" />
        <TweakToggle label="Compact rows" value={tweaks.compactRows} onChange={v => setTweak("compactRows", v)} />
        <TweakToggle label="Sticky picker" value={tweaks.stickyPicker} onChange={v => setTweak("stickyPicker", v)} />
        <TweakToggle label="National context" value={tweaks.showNational} onChange={v => setTweak("showNational", v)} />
        <TweakToggle label="Methodology cards" value={tweaks.showMethodology} onChange={v => setTweak("showMethodology", v)} />
      </TweaksPanel>
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("app"));
root.render(<App />);
