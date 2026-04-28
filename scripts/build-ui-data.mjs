// Generate ui/data.real.js and ui/ratings.real.js from the actual extracted data,
// in the shape the Itemized prototype expects. Swap these in for the mocked
// ui/data.js and ui/ratings.js to drive the UI from real numbers.
//
// Cleanup mirrors summarize-mri.mjs: drop case-rate / per-diem / other / sentinel /
// negotiated-exceeds-gross rows; canonicalize payer names; bucket Medicare vs commercial.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CPT_CODES } from "./cpts.mjs";
import zipcodes from "zipcodes";
import { PROC_OVERVIEWS } from "./proc-overviews.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, "..", "raw-files");
const RESULTS_DIR = path.join(RAW_DIR, "results");
const RATINGS_FILE = path.join(RAW_DIR, "ratings.json");
const UI_DIR = path.resolve(__dirname, "..", "ui");
const DATA_OUT = path.join(UI_DIR, "data.real.js");
const RATINGS_OUT = path.join(UI_DIR, "ratings.real.js");

// ---------- Shared with summarize-mri.mjs ----------
const PAYER_ALIASES = {
  "aetna": "Aetna",
  "aetna health of california inc.": "Aetna",
  "aetna medicare": "Aetna",
  "anthem": "Anthem BCBS",
  "anthem vivity, anthem hmo": "Anthem BCBS",
  "anthem medicare": "Anthem BCBS",
  "blue cross of california, dba anthem blue cross and its affiliates": "Anthem BCBS",
  "blue cross": "Blue Cross Blue Shield",
  "blue shield": "Blue Cross Blue Shield",
  "blue cross blue shield": "Blue Cross Blue Shield",
  "bcbs": "Blue Cross Blue Shield",
  "blue cross blue shield blue precision": "Blue Cross Blue Shield",
  "blue cross blue shield choice": "Blue Cross Blue Shield",
  "blue cross blue shield city of chicago": "Blue Cross Blue Shield",
  "california physicians' service, dba blue shield of california": "Blue Shield of California",
  "cigna": "Cigna",
  "cigna healthcare of california, inc. and cigna health and life insurance company": "Cigna",
  "evernorth (cigna bh)": "Cigna",
  "cigna one health": "Cigna",
  "united": "UnitedHealthcare",
  "unitedhealthcare": "UnitedHealthcare",
  "united healthcare": "UnitedHealthcare",
  "united healthcare charter": "UnitedHealthcare",
  "united healthcare core navigate": "UnitedHealthcare",
  "united healthcare nexus": "UnitedHealthcare",
  "united bh": "UnitedHealthcare",
  "humana": "Humana",
  "humana military": "Humana Military",
  "optum": "Optum",
  "optum health": "Optum",
  "oscar": "Oscar",
  "multiplan": "Multiplan",
  "healthsmart": "HealthSmart",
  "three rivers": "Three Rivers",
  "devoted health": "Devoted Health",
  "molina": "Molina",
  "molina healthcare": "Molina",
  "phcs": "Multiplan",
  "private healthcare systems": "Multiplan",
  "first health/coventry": "First Health",
};

// Hospitals publish payer names with wildly different verbosity. Cedars writes
// "Aetna Health of California Inc., a California corporation and Aetna Health
// Management, LLC."; Hoag writes "Aetna". To compare across hospitals we map
// any string containing recognizable carrier keywords to a canonical name.
// Order matters: more specific patterns (Anthem BCBS) must match before more
// general ones (Blue Cross Blue Shield), and Aetna-Better-Health-style Medicaid
// plans get caught by the bucket classifier separately.
const PAYER_PATTERNS = [
  // Anthem family — match BEFORE generic BCBS so "Anthem Blue Cross of California" maps right.
  { test: (s) => s.includes("anthem") || s.includes("blue cross of california"), canonical: "Anthem BCBS" },
  // Other Blue Cross / Blue Shield (non-Anthem)
  { test: (s) => s.includes("blue cross") || s.includes("blue shield") || /\bbcbs\b/.test(s) || s.includes("anthem blue") , canonical: "Blue Cross Blue Shield" },
  // Aetna (catches "Aetna Health of California ...", "Aetna PPO", etc.)
  { test: (s) => s.includes("aetna"), canonical: "Aetna" },
  // Cigna (Evernorth is Cigna's behavioral-health brand)
  { test: (s) => s.includes("cigna") || s.includes("evernorth"), canonical: "Cigna" },
  // UnitedHealthcare (United, UHC, UnitedHealthcare variations)
  { test: (s) => s.includes("unitedhealthcare") || s.includes("united healthcare") || s.includes("uhc") || /\bunited\b/.test(s), canonical: "UnitedHealthcare" },
  // Humana
  { test: (s) => s.includes("humana"), canonical: "Humana" },
  // Kaiser (huge in LA)
  { test: (s) => s.includes("kaiser"), canonical: "Kaiser Permanente" },
  // Oscar
  { test: (s) => /\boscar\b/.test(s), canonical: "Oscar" },
  // Optum (technically owned by UHC but a separate consumer brand)
  { test: (s) => /\boptum\b/.test(s), canonical: "Optum" },
  // Multiplan (PPO network reseller)
  { test: (s) => s.includes("multiplan") || s.includes("private healthcare systems") || /\bphcs\b/.test(s), canonical: "Multiplan" },
  // Molina (Medi-Cal-heavy)
  { test: (s) => s.includes("molina"), canonical: "Molina" },
  // HealthNet
  { test: (s) => s.includes("healthnet") || s.includes("health net"), canonical: "HealthNet" },
];

function normalizePayer(raw) {
  if (!raw) return null;
  const k = raw.trim();
  const lower = k.toLowerCase();
  if (PAYER_ALIASES[lower]) return PAYER_ALIASES[lower];
  for (const { test, canonical } of PAYER_PATTERNS) {
    if (test(lower)) return canonical;
  }
  return k;
}

const MEDICARE_ONLY_PAYERS = new Set([
  "valor", "zing health", "devoted health", "perennial health", "scan",
  "alignment health plan", "caremore health plan", "procare advantage",
  "central health plan", "central health plan of california",
  "brandman centers for senior care", "concertopace of los angeles, llc",
  "ucla health medicare advantage plan", "torrance memorial medicare",
  "redlands community medicare", "prime health - medicare", "monarch",
]);

function classifyBucket(plan = "", payer = "") {
  const payerLow = (payer || "").trim().toLowerCase();
  if (MEDICARE_ONLY_PAYERS.has(payerLow)) return "medicare";
  const s = `${payer} ${plan}`.toLowerCase();
  if (s.includes("medicare") || s.includes("dsnp")) return "medicare";
  if (s.includes("medicaid") || s.includes("medi-cal")) return "medicaid";
  if (s.includes("workers") || s.includes("comp")) return "workers_comp";
  return "commercial";
}

const DROP_METHODOLOGIES = new Set(["case rate", "per diem", "other"]);
const MIN_NEGOTIATED = 1;
const NEGOTIATED_GROSS_RATIO_MAX = 3;

// Two filters: methodology-only (used to qualify item-level cash/gross) and the
// stricter one (used to qualify negotiated dollar rates). Splitting them matters
// when a hospital publishes percentage-only rates (e.g. Seattle Children's puts
// all rates as percent_of_billed but still has real cash numbers per item).
function methodologyKept(r) {
  const m = (r.methodology || "").toLowerCase();
  return !DROP_METHODOLOGIES.has(m);
}

function negotiatedKept(r) {
  if (!methodologyKept(r)) return false;
  if (!r.negotiated) return false;
  const n = Number(r.negotiated);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n < MIN_NEGOTIATED) return false;
  const g = Number(r.gross);
  if (Number.isFinite(g) && g > 0 && n > NEGOTIATED_GROSS_RATIO_MAX * g) return false;
  return true;
}

// ---------- UI metadata ----------
// Hospitals in our dataset, with display metadata the prototype expects.
// is_local = LA-area (drives the "Hospitals near you" section).
const HOSPITAL_META = {
  "cedars-sinai": { name: "Cedars-Sinai Medical Center", metro: "Los Angeles, CA", is_local: true, system: "Cedars-Sinai Health System" },
  "ucla-ronald-reagan": { name: "Ronald Reagan UCLA Medical Center", metro: "Los Angeles, CA", is_local: true, system: "UCLA Health" },
  "providence-st-joseph": { name: "Providence Saint Joseph (Burbank)", metro: "Los Angeles, CA", is_local: true, system: "Providence" },
  "houston-methodist": { name: "Houston Methodist Hospital", metro: "Houston, TX", is_local: false, system: "Houston Methodist" },
  "cleveland-clinic": { name: "Cleveland Clinic", metro: "Cleveland, OH", is_local: false, system: "Cleveland Clinic" },
  "advocate-christ": { name: "Advocate Christ Medical Center", metro: "Chicago, IL", is_local: false, system: "Advocate Aurora" },
  "nyu-langone-tisch": { name: "NYU Langone Tisch Hospital", metro: "New York, NY", is_local: false, system: "NYU Langone Health", partial_parse: true },
  "mass-general": { name: "Massachusetts General Hospital", metro: "Boston, MA", is_local: false, system: "Mass General Brigham" },
  "medstar-georgetown": { name: "MedStar Georgetown University Hospital", metro: "Washington, DC", is_local: false, system: "MedStar Health" },
  "jefferson-abington": { name: "Jefferson Abington Hospital", metro: "Philadelphia, PA", is_local: false, system: "Jefferson Health" },
  "emory-decatur": { name: "Emory Decatur Hospital", metro: "Atlanta, GA", is_local: false, system: "Emory Healthcare" },
  "honorhealth-osborn": { name: "HonorHealth Scottsdale Osborn", metro: "Phoenix, AZ", is_local: false, system: "HonorHealth" },
  "uchealth-memorial-central": { name: "UCHealth Memorial Hospital Central", metro: "Colorado Springs, CO", is_local: false, system: "UCHealth" },
  "seattle-childrens": { name: "Seattle Children's Hospital", metro: "Seattle, WA", is_local: false, system: "Seattle Children's", is_pediatric: true },
  "vanderbilt-umc": { name: "Vanderbilt University Medical Center", metro: "Nashville, TN", is_local: false, system: "Vanderbilt Health" },
  // ── LA-area expansion (round 3) ─────────────────────────────────────
  "providence-st-johns-santa-monica": { name: "Providence Saint John's Health Center", metro: "Santa Monica, CA", is_local: true, system: "Providence" },
  "usc-keck": { name: "Keck Hospital of USC", metro: "Los Angeles, CA", is_local: true, system: "Keck Medicine of USC" },
  "usc-norris": { name: "USC Norris Cancer Hospital", metro: "Los Angeles, CA", is_local: true, system: "Keck Medicine of USC" },
  "usc-verdugo-hills": { name: "USC Verdugo Hills Hospital", metro: "Glendale, CA", is_local: true, system: "Keck Medicine of USC" },
  "usc-arcadia": { name: "USC Arcadia Hospital", metro: "Arcadia, CA", is_local: true, system: "Keck Medicine of USC" },
  "hoag-newport": { name: "Hoag Memorial Hospital Presbyterian", metro: "Newport Beach, CA", is_local: true, system: "Hoag" },
  "chla": { name: "Children's Hospital Los Angeles", metro: "Los Angeles, CA", is_local: true, system: "CHLA", is_pediatric: true },
  "kaiser-la-sunset": { name: "Kaiser Permanente LA Medical Center", metro: "Los Angeles, CA", is_local: true, system: "Kaiser Permanente" },
  "mlk-community": { name: "MLK Community Hospital", metro: "Los Angeles, CA", is_local: true, system: "MLK Community Healthcare" },
  "olive-view-ucla": { name: "Olive View-UCLA Medical Center", metro: "Sylmar, CA", is_local: true, system: "LA County DHS" },
  "harbor-ucla": { name: "Harbor-UCLA Medical Center", metro: "Torrance, CA", is_local: true, system: "LA County DHS" },
  "ucla-santa-monica": { name: "UCLA Santa Monica Medical Center", metro: "Santa Monica, CA", is_local: true, system: "UCLA Health" },
  "torrance-memorial": { name: "Torrance Memorial Medical Center", metro: "Torrance, CA", is_local: true, system: "Torrance Memorial" },
  "huntington-pasadena": { name: "Huntington Hospital", metro: "Pasadena, CA", is_local: true, system: "Huntington Health" },
  "cedars-sinai-marina-del-rey": { name: "Cedars-Sinai Marina del Rey Hospital", metro: "Marina del Rey, CA", is_local: true, system: "Cedars-Sinai Health System" },
  "pomona-valley": { name: "Pomona Valley Hospital Medical Center", metro: "Pomona, CA", is_local: true, system: "Pomona Valley" },
  "hollywood-presbyterian": { name: "Hollywood Presbyterian Medical Center", metro: "Los Angeles, CA", is_local: true, system: "CHA Hollywood Presbyterian" },
  "st-francis-lynwood": { name: "Saint Francis Medical Center", metro: "Lynwood, CA", is_local: true, system: "Prime Healthcare" },
  "dignity-st-mary-long-beach": { name: "St. Mary Medical Center", metro: "Long Beach, CA", is_local: true, system: "Dignity Health / CommonSpirit" },
  "dignity-california-hospital": { name: "California Hospital Medical Center", metro: "Los Angeles, CA", is_local: true, system: "Dignity Health / CommonSpirit" },
  "dignity-northridge": { name: "Northridge Hospital Medical Center", metro: "Northridge, CA", is_local: true, system: "Dignity Health / CommonSpirit" },
  "dignity-glendale-memorial": { name: "Glendale Memorial Hospital", metro: "Glendale, CA", is_local: true, system: "Dignity Health / CommonSpirit" },
  // ── Round 4: NYC ─────────────────────────────────────────────────────
  "mount-sinai-hospital": { name: "Mount Sinai Hospital", metro: "New York, NY", is_local: false, system: "Mount Sinai Health System" },
  "nyp-columbia": { name: "NewYork-Presbyterian / Columbia & Weill Cornell", metro: "New York, NY", is_local: false, system: "NewYork-Presbyterian" },
  "nyp-queens": { name: "NewYork-Presbyterian Queens", metro: "Queens, NY", is_local: false, system: "NewYork-Presbyterian" },
  "msk-cancer-center": { name: "Memorial Sloan Kettering Cancer Center", metro: "New York, NY", is_local: false, system: "MSK" },
  "hss-main": { name: "Hospital for Special Surgery", metro: "New York, NY", is_local: false, system: "HSS" },
  "northwell-lij": { name: "Northwell Long Island Jewish Medical Center", metro: "Queens / Nassau, NY", is_local: false, system: "Northwell Health" },
  "northwell-lenox-hill": { name: "Lenox Hill Hospital", metro: "New York, NY", is_local: false, system: "Northwell Health" },
  "northwell-north-shore": { name: "North Shore University Hospital", metro: "Manhasset, NY", is_local: false, system: "Northwell Health" },
  "northwell-staten-island": { name: "Staten Island University Hospital", metro: "Staten Island, NY", is_local: false, system: "Northwell Health" },
  "montefiore-medical-center": { name: "Montefiore Medical Center", metro: "Bronx, NY", is_local: false, system: "Montefiore Einstein" },
  "nychh-bellevue": { name: "Bellevue Hospital Center", metro: "New York, NY", is_local: false, system: "NYC Health + Hospitals" },
  "nychh-elmhurst": { name: "Elmhurst Hospital Center", metro: "Queens, NY", is_local: false, system: "NYC Health + Hospitals" },
  "nychh-jacobi": { name: "Jacobi Medical Center", metro: "Bronx, NY", is_local: false, system: "NYC Health + Hospitals" },
  "nychh-kings-county": { name: "Kings County Hospital Center", metro: "Brooklyn, NY", is_local: false, system: "NYC Health + Hospitals" },
  "maimonides-medical-center": { name: "Maimonides Medical Center", metro: "Brooklyn, NY", is_local: false, system: "Maimonides" },
  // ── Round 4: Chicago ─────────────────────────────────────────────────
  "northwestern-memorial": { name: "Northwestern Memorial Hospital", metro: "Chicago, IL", is_local: false, system: "Northwestern Medicine" },
  "rush-university": { name: "Rush University Medical Center", metro: "Chicago, IL", is_local: false, system: "Rush" },
  "uchicago-medical-center": { name: "University of Chicago Medical Center", metro: "Chicago, IL", is_local: false, system: "UChicago Medicine" },
  "loyola-medical-center": { name: "Loyola University Medical Center", metro: "Maywood, IL", is_local: false, system: "Trinity Health" },
  "lurie-childrens": { name: "Ann & Robert H. Lurie Children's Hospital", metro: "Chicago, IL", is_local: false, system: "Lurie Children's", is_pediatric: true },
  "stroger-cook-county": { name: "John H. Stroger Jr. Hospital", metro: "Chicago, IL", is_local: false, system: "Cook County Health" },
  "advocate-lutheran-general": { name: "Advocate Lutheran General Hospital", metro: "Park Ridge, IL", is_local: false, system: "Advocate Aurora" },
  "advocate-illinois-masonic": { name: "Advocate Illinois Masonic Medical Center", metro: "Chicago, IL", is_local: false, system: "Advocate Aurora" },
  "endeavor-evanston": { name: "Endeavor Health Evanston Hospital", metro: "Evanston, IL", is_local: false, system: "Endeavor Health (NorthShore)" },
  // ── Round 4: Houston ─────────────────────────────────────────────────
  "md-anderson": { name: "UT MD Anderson Cancer Center", metro: "Houston, TX", is_local: false, system: "UT MD Anderson" },
  "memorial-hermann-tmc": { name: "Memorial Hermann-Texas Medical Center", metro: "Houston, TX", is_local: false, system: "Memorial Hermann" },
  "memorial-hermann-southwest": { name: "Memorial Hermann Southwest Hospital", metro: "Houston, TX", is_local: false, system: "Memorial Hermann" },
  "memorial-hermann-memorial-city": { name: "Memorial Hermann Memorial City Medical Center", metro: "Houston, TX", is_local: false, system: "Memorial Hermann" },
  "memorial-hermann-sugar-land": { name: "Memorial Hermann Sugar Land Hospital", metro: "Sugar Land, TX", is_local: false, system: "Memorial Hermann" },
  "baylor-st-lukes-tmc": { name: "Baylor St. Luke's Medical Center", metro: "Houston, TX", is_local: false, system: "CommonSpirit / Baylor St. Luke's" },
  "texas-childrens": { name: "Texas Children's Hospital", metro: "Houston, TX", is_local: false, system: "Texas Children's", is_pediatric: true },
  "harris-health-ben-taub": { name: "Ben Taub Hospital", metro: "Houston, TX", is_local: false, system: "Harris Health" },
  "hca-houston-medical-center": { name: "HCA Houston Healthcare Medical Center", metro: "Houston, TX", is_local: false, system: "HCA" },
  "hca-houston-kingwood": { name: "HCA Houston Healthcare Kingwood", metro: "Houston, TX", is_local: false, system: "HCA" },
  // ── Round 4: Dallas / Fort Worth ─────────────────────────────────────
  "ut-southwestern": { name: "UT Southwestern Medical Center", metro: "Dallas, TX", is_local: false, system: "UT Southwestern" },
  "baylor-university-medical-center": { name: "Baylor University Medical Center", metro: "Dallas, TX", is_local: false, system: "Baylor Scott & White" },
  "methodist-dallas": { name: "Methodist Dallas Medical Center", metro: "Dallas, TX", is_local: false, system: "Methodist Health System" },
  "texas-health-presbyterian-dallas": { name: "Texas Health Presbyterian Hospital Dallas", metro: "Dallas, TX", is_local: false, system: "Texas Health Resources" },
  "childrens-medical-center-dallas": { name: "Children's Medical Center Dallas", metro: "Dallas, TX", is_local: false, system: "Children's Health", is_pediatric: true },
  "parkland-memorial": { name: "Parkland Memorial Hospital", metro: "Dallas, TX", is_local: false, system: "Parkland Health" },
  // ── Round 4: Philadelphia ────────────────────────────────────────────
  "hup-penn": { name: "Hospital of the University of Pennsylvania", metro: "Philadelphia, PA", is_local: false, system: "Penn Medicine" },
  "penn-presbyterian": { name: "Penn Presbyterian Medical Center", metro: "Philadelphia, PA", is_local: false, system: "Penn Medicine" },
  "temple-university-hospital": { name: "Temple University Hospital", metro: "Philadelphia, PA", is_local: false, system: "Temple Health" },
  "chop": { name: "Children's Hospital of Philadelphia", metro: "Philadelphia, PA", is_local: false, system: "CHOP", is_pediatric: true },
  "jefferson-einstein-philadelphia": { name: "Jefferson Einstein Philadelphia", metro: "Philadelphia, PA", is_local: false, system: "Jefferson Health" },
  // ── Round 4: Phoenix ─────────────────────────────────────────────────
  "banner-university-phoenix": { name: "Banner - University Medical Center Phoenix", metro: "Phoenix, AZ", is_local: false, system: "Banner Health" },
  "st-josephs-phoenix": { name: "St. Joseph's Hospital and Medical Center", metro: "Phoenix, AZ", is_local: false, system: "Dignity Health / CommonSpirit" },
  "phoenix-childrens": { name: "Phoenix Children's Hospital", metro: "Phoenix, AZ", is_local: false, system: "Phoenix Children's", is_pediatric: true },
  "honorhealth-deer-valley": { name: "HonorHealth Deer Valley Medical Center", metro: "Phoenix, AZ", is_local: false, system: "HonorHealth" },
  // ── Round 4: Atlanta ─────────────────────────────────────────────────
  "emory-university-hospital": { name: "Emory University Hospital", metro: "Atlanta, GA", is_local: false, system: "Emory Healthcare" },
  "piedmont-atlanta": { name: "Piedmont Atlanta Hospital", metro: "Atlanta, GA", is_local: false, system: "Piedmont Healthcare" },
  "grady-memorial": { name: "Grady Memorial Hospital", metro: "Atlanta, GA", is_local: false, system: "Grady Health" },
  "wellstar-kennestone": { name: "WellStar Kennestone Hospital", metro: "Marietta, GA", is_local: false, system: "WellStar Health" },
  // ── Round 4: Boston ──────────────────────────────────────────────────
  "brigham-and-womens": { name: "Brigham and Women's Hospital", metro: "Boston, MA", is_local: false, system: "Mass General Brigham" },
  "bidmc": { name: "Beth Israel Deaconess Medical Center", metro: "Boston, MA", is_local: false, system: "Beth Israel Lahey Health" },
  "boston-childrens": { name: "Boston Children's Hospital", metro: "Boston, MA", is_local: false, system: "Boston Children's", is_pediatric: true },
  "lahey-burlington": { name: "Lahey Hospital & Medical Center", metro: "Burlington, MA", is_local: false, system: "Beth Israel Lahey Health" },
  // ── Round 4: Seattle ─────────────────────────────────────────────────
  "swedish-first-hill": { name: "Swedish Medical Center First Hill", metro: "Seattle, WA", is_local: false, system: "Providence Swedish" },
  "virginia-mason": { name: "Virginia Mason Medical Center", metro: "Seattle, WA", is_local: false, system: "Virginia Mason Franciscan Health" },
  // ── Round 5: LA gap fill ─────────────────────────────────────────────
  "whittier-hospital": { name: "Whittier Hospital Medical Center", metro: "Whittier, CA", is_local: true, system: "AHMC Healthcare" },
  "san-gabriel-valley-mc": { name: "San Gabriel Valley Medical Center", metro: "San Gabriel, CA", is_local: true, system: "AHMC Healthcare" },
  "garfield-medical-center": { name: "Garfield Medical Center", metro: "Monterey Park, CA", is_local: true, system: "AHMC Healthcare" },
  "greater-el-monte": { name: "Greater El Monte Community Hospital", metro: "South El Monte, CA", is_local: true, system: "AHMC Healthcare" },
  "monterey-park-hospital": { name: "Monterey Park Hospital", metro: "Monterey Park, CA", is_local: true, system: "AHMC Healthcare" },
  "providence-tarzana": { name: "Providence Cedars-Sinai Tarzana Medical Center", metro: "Tarzana, CA", is_local: true, system: "Providence" },
  "long-beach-memorial": { name: "MemorialCare Long Beach Medical Center", metro: "Long Beach, CA", is_local: true, system: "MemorialCare" },
  "miller-childrens": { name: "MemorialCare Miller Children's & Women's Hospital", metro: "Long Beach, CA", is_local: true, system: "MemorialCare", is_pediatric: true },
  "coast-plaza": { name: "Coast Plaza Hospital", metro: "Norwalk, CA", is_local: true, system: "Pipeline Health" },
  "adventist-white-memorial-montebello": { name: "Adventist Health White Memorial Montebello", metro: "Montebello, CA", is_local: true, system: "Adventist Health" },
  "adventist-glendale": { name: "Adventist Health Glendale", metro: "Glendale, CA", is_local: true, system: "Adventist Health" },
  "adventist-simi-valley": { name: "Adventist Health Simi Valley", metro: "Simi Valley, CA", is_local: true, system: "Adventist Health" },
  "hoag-orthopedic-institute": { name: "Hoag Orthopedic Institute", metro: "Newport Beach, CA", is_local: true, system: "Hoag" },
  "south-coast-global-mc": { name: "South Coast Global Medical Center", metro: "Santa Ana, CA", is_local: true, system: "South Coast Global" },
  // ── Round 6: 7-metro expansion ──
  "henry-ford-detroit": { name: "Henry Ford Hospital", metro: "Detroit, MI", system: "Henry Ford Health" },
  "henry-ford-west-bloomfield": { name: "Henry Ford West Bloomfield Hospital", metro: "West Bloomfield, MI", system: "Henry Ford Health" },
  "dmc-detroit-receiving": { name: "DMC Detroit Receiving Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" },
  "dmc-harper-university": { name: "DMC Harper University Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" },
  "dmc-sinai-grace": { name: "DMC Sinai-Grace Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" },
  "childrens-hospital-michigan": { name: "Children's Hospital of Michigan", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet", is_pediatric: true },
  "corewell-royal-oak": { name: "Corewell Health Royal Oak", metro: "Royal Oak, MI", system: "Corewell Health (Beaumont)" },
  "corewell-troy": { name: "Corewell Health Troy", metro: "Troy, MI", system: "Corewell Health (Beaumont)" },
  "corewell-farmington-hills": { name: "Corewell Health Farmington Hills", metro: "Farmington Hills, MI", system: "Corewell Health" },
  "corewell-dearborn": { name: "Corewell Health Dearborn", metro: "Dearborn, MI", system: "Corewell Health (Oakwood)" },
  "upmc-presbyterian-shadyside": { name: "UPMC Presbyterian Shadyside", metro: "Pittsburgh, PA", system: "UPMC" },
  "upmc-magee-womens": { name: "UPMC Magee-Womens Hospital", metro: "Pittsburgh, PA", system: "UPMC" },
  "upmc-childrens-pittsburgh": { name: "UPMC Children's Hospital of Pittsburgh", metro: "Pittsburgh, PA", system: "UPMC", is_pediatric: true },
  "ahn-allegheny-general": { name: "Allegheny General Hospital", metro: "Pittsburgh, PA", system: "Allegheny Health Network" },
  "ahn-forbes": { name: "Forbes Hospital", metro: "Monroeville, PA", system: "Allegheny Health Network" },
  "ahn-jefferson-regional": { name: "Jefferson Regional Medical Center", metro: "Jefferson Hills, PA", system: "Allegheny Health Network" },
  "tampa-general": { name: "Tampa General Hospital", metro: "Tampa, FL", system: "Tampa General" },
  "baycare-st-josephs-tampa": { name: "BayCare St. Joseph's Hospital Tampa", metro: "Tampa, FL", system: "BayCare" },
  "baycare-morton-plant": { name: "BayCare Morton Plant Hospital", metro: "Clearwater, FL", system: "BayCare" },
  "moffitt-cancer-center": { name: "H. Lee Moffitt Cancer Center", metro: "Tampa, FL", system: "Moffitt" },
  "jackson-memorial": { name: "Jackson Memorial Hospital", metro: "Miami, FL", system: "Jackson Health" },
  "jackson-north": { name: "Jackson North Medical Center", metro: "North Miami Beach, FL", system: "Jackson Health" },
  "jackson-south": { name: "Jackson South Medical Center", metro: "Miami, FL", system: "Jackson Health" },
  "baptist-hospital-miami": { name: "Baptist Hospital of Miami", metro: "Miami, FL", system: "Baptist Health South Florida" },
  "baptist-doctors-coral-gables": { name: "Doctors Hospital", metro: "Coral Gables, FL", system: "Baptist Health South Florida" },
  "baptist-homestead": { name: "Homestead Hospital", metro: "Homestead, FL", system: "Baptist Health South Florida" },
  "nicklaus-childrens": { name: "Nicklaus Children's Hospital", metro: "Miami, FL", system: "Nicklaus Children's", is_pediatric: true },
  "dell-seton-uta": { name: "Dell Seton Medical Center at UT Austin", metro: "Austin, TX", system: "Ascension Seton" },
  "ascension-seton-medical-austin": { name: "Ascension Seton Medical Center Austin", metro: "Austin, TX", system: "Ascension Seton" },
  "dell-childrens-austin": { name: "Dell Children's Medical Center", metro: "Austin, TX", system: "Ascension Seton", is_pediatric: true },
  "ascension-seton-northwest": { name: "Ascension Seton Northwest Hospital", metro: "Austin, TX", system: "Ascension Seton" },
  "st-davids-medical-center": { name: "St. David's Medical Center", metro: "Austin, TX", system: "HCA / St. David's" },
  "st-davids-north-austin": { name: "St. David's North Austin Medical Center", metro: "Austin, TX", system: "HCA / St. David's" },
  "st-davids-round-rock": { name: "St. David's Round Rock Medical Center", metro: "Round Rock, TX", system: "HCA / St. David's" },
  "heart-hospital-austin": { name: "Heart Hospital of Austin", metro: "Austin, TX", system: "HCA" },
  "stanford-health-care": { name: "Stanford Health Care", metro: "Palo Alto, CA", system: "Stanford Medicine" },
  "stanford-tri-valley": { name: "Stanford Health Care Tri-Valley", metro: "Pleasanton, CA", system: "Stanford Medicine" },
  "kaiser-oakland": { name: "Kaiser Permanente Oakland Medical Center", metro: "Oakland, CA", system: "Kaiser Permanente" },
  "kaiser-redwood-city": { name: "Kaiser Permanente Redwood City Medical Center", metro: "Redwood City, CA", system: "Kaiser Permanente" },
  "john-muir-walnut-creek": { name: "John Muir Health Walnut Creek Medical Center", metro: "Walnut Creek, CA", system: "John Muir Health" },
  "john-muir-concord": { name: "John Muir Health Concord Medical Center", metro: "Concord, CA", system: "John Muir Health" },
  "ucsd-health": { name: "UC San Diego Health", metro: "San Diego, CA", system: "UCSD Health" },
  "sharp-memorial": { name: "Sharp Memorial Hospital", metro: "San Diego, CA", system: "Sharp HealthCare" },
  "sharp-grossmont": { name: "Sharp Grossmont Hospital", metro: "La Mesa, CA", system: "Sharp HealthCare" },
  "scripps-la-jolla": { name: "Scripps Memorial Hospital La Jolla", metro: "La Jolla, CA", system: "Scripps Health" },
  "scripps-mercy-sd": { name: "Scripps Mercy Hospital San Diego", metro: "San Diego, CA", system: "Scripps Health" },
  "rady-childrens": { name: "Rady Children's Hospital San Diego", metro: "San Diego, CA", system: "Rady Children's", is_pediatric: true },

  // Round 8: Flagship academic medical centers + new metros.
  "johns-hopkins": { name: "Johns Hopkins Hospital", metro: "Baltimore, MD", system: "Johns Hopkins Medicine" },
  "ummc-baltimore": { name: "University of Maryland Medical Center", metro: "Baltimore, MD", system: "University of Maryland Medical System" },
  "duke-university-hospital": { name: "Duke University Hospital", metro: "Durham, NC", system: "Duke Health" },
  "unc-hospitals": { name: "UNC Hospitals", metro: "Chapel Hill, NC", system: "UNC Health" },
  "ucsf-medical-center": { name: "UCSF Medical Center", metro: "San Francisco, CA", system: "UCSF Health" },
  "umich-health": { name: "University of Michigan Health", metro: "Ann Arbor, MI", system: "Michigan Medicine" },
  "yale-new-haven": { name: "Yale New Haven Hospital", metro: "New Haven, CT", system: "Yale New Haven Health" },
  "penn-hup": { name: "Hospital of the University of Pennsylvania (HUP)", metro: "Philadelphia, PA", system: "Penn Medicine" },
  "uchealth-univ-colorado": { name: "UCHealth University of Colorado Hospital", metro: "Aurora, CO", system: "UCHealth" },
  "atrium-carolinas-medical-center": { name: "Atrium Health Carolinas Medical Center", metro: "Charlotte, NC", system: "Atrium Health" },
  "fairview-univ-minnesota": { name: "M Health Fairview University of Minnesota Medical Center", metro: "Minneapolis, MN", system: "M Health Fairview" },
  "ohsu": { name: "OHSU Hospital", metro: "Portland, OR", system: "Oregon Health & Science University" },
  "univ-utah-hospital": { name: "University of Utah Hospital", metro: "Salt Lake City, UT", system: "University of Utah Health" },
  "intermountain-medical-center": { name: "Intermountain Medical Center", metro: "Murray, UT", system: "Intermountain Health" },
};

// Geocode each hospital's zip (from raw-files/ratings.json) once at build time.
// User-zip → distance is computed at runtime in app.jsx using the same lookup.
function loadHospitalGeo() {
  if (!fs.existsSync(RATINGS_FILE)) return {};
  const ratings = JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8"));
  const out = {};
  for (const [hid, r] of Object.entries(ratings.ratings || {})) {
    if (!r) continue;
    const entry = {
      address: r.address || null,
      phone: r.phone || null,
      zip: r.zip || null,
    };
    if (r.zip) {
      const z = zipcodes.lookup(String(r.zip).slice(0, 5));
      if (z?.latitude != null && z?.longitude != null) {
        entry.lat = z.latitude;
        entry.lon = z.longitude;
      }
    }
    out[hid] = entry;
  }
  return out;
}
const HOSPITAL_GEO = loadHospitalGeo();

// Display labels per CPT — short label for the picker plus a category for grouping.
const PROC_DISPLAY = {
  // Imaging
  "70551": { short: "Brain MRI", category: "Imaging" },
  "70553": { short: "Brain MRI w/ contrast", category: "Imaging" },
  "72148": { short: "Lumbar spine MRI", category: "Imaging" },
  "73721": { short: "Knee MRI", category: "Imaging" },
  "74177": { short: "CT abdomen/pelvis", category: "Imaging" },
  "76700": { short: "Abdominal ultrasound", category: "Imaging" },
  "77067": { short: "Screening mammogram", category: "Imaging" },
  "77080": { short: "Bone density scan", category: "Imaging" },
  "71045": { short: "Chest X-ray", category: "Imaging" },
  // Labs
  "80053": { short: "Metabolic panel", category: "Lab" },
  "80061": { short: "Lipid panel", category: "Lab" },
  "85025": { short: "CBC blood count", category: "Lab" },
  "84443": { short: "TSH (thyroid)", category: "Lab" },
  "83036": { short: "Hemoglobin A1c", category: "Lab" },
  "81002": { short: "Urinalysis", category: "Lab" },
  // Surgery
  "29881": { short: "Knee arthroscopy", category: "Surgery" },
  "27447": { short: "Knee replacement", category: "Surgery" },
  "27130": { short: "Hip replacement", category: "Surgery" },
  "47562": { short: "Gallbladder removal", category: "Surgery" },
  "49505": { short: "Hernia repair", category: "Surgery" },
  "66984": { short: "Cataract surgery", category: "Surgery" },
  // Maternity
  "59400": { short: "Vaginal delivery", category: "Maternity" },
  "59510": { short: "Cesarean delivery", category: "Maternity" },
  // Procedural
  "45378": { short: "Colonoscopy", category: "Procedure" },
  "45385": { short: "Colonoscopy w/ polypectomy", category: "Procedure" },
  "43239": { short: "Upper endoscopy (EGD)", category: "Procedure" },
  // Cardiac
  "93000": { short: "EKG", category: "Cardiac" },
  "93306": { short: "Echocardiogram", category: "Cardiac" },
  // Office
  "99213": { short: "Office visit (level 3)", category: "Office" },
  "99214": { short: "Office visit (level 4)", category: "Office" },
  // ── Round 7 display ──
  "29848": { short: "Carpal tunnel release", category: "Surgery" },
  "30520": { short: "Septoplasty", category: "Surgery" },
  "52353": { short: "Kidney stone treatment", category: "Surgery" },
  "55700": { short: "Prostate biopsy", category: "Procedure" },
  "58150": { short: "Total hysterectomy", category: "Surgery" },
  "64483": { short: "Lumbar ESI", category: "Procedure" },
  "76536": { short: "Thyroid ultrasound", category: "Imaging" },
  "90834": { short: "Psychotherapy (45 min)", category: "Office" },
  "93880": { short: "Carotid ultrasound", category: "Cardiac" },
  "95810": { short: "Sleep study", category: "Procedure" },
  "99203": { short: "New patient visit (L3)", category: "Office" },
  "99204": { short: "New patient visit (L4)", category: "Office" },
};

// Canonical payers the UI dropdown offers, in display order. Ordered roughly by
// LA-area enrollment share so the most relevant options surface first.
const UI_PAYERS = [
  "Aetna",
  "Anthem BCBS",
  "Blue Cross Blue Shield",
  "Kaiser Permanente",
  "UnitedHealthcare",
  "Cigna",
  "HealthNet",
  "Humana",
  "Optum",
  "Medicare",
  "Medicaid",
];

// ---------- Build per procedure ----------
function buildProcedure(code, label) {
  const file = path.join(RESULTS_DIR, `${code}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`  ${code}: no results file, skipping`);
    return null;
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  // Methodology-filtered rows feed cash/gross. Negotiated rates use a stricter filter.
  const rows = data.rows.filter(methodologyKept);

  const byHospital = {};
  for (const r of rows) {
    (byHospital[r.hospital] ||= []).push(r);
  }

  const hospitals = [];
  for (const [hid, meta] of Object.entries(HOSPITAL_META)) {
    const hospitalRows = byHospital[hid] || [];
    // Cash/gross are item-level numbers; dedupe so a single item with many payer
    // rows doesn't get its cash counted N times in the min/max range.
    //
    // Filters (in order of severity):
    //   - Hard floor: cash must be >= $10. Some hospitals publish $1-$5 placeholders
    //     that aren't transactable and pull spread ratios into absurd 9000x+ territory.
    //   - Hard ceiling: cash must be < $100k. HCA Houston once published $100k for
    //     an A1c lab — clearly an MRF data error.
    //   - Per-row sanity ratio: cash must be >= 1% of that row's own gross. Real
    //     cash discounts never go below 10% of chargemaster; sub-1% is placeholder
    //     territory. This catches the per-procedure outliers that the global floor
    //     misses (e.g. a hospital with mixed real $200 cash + placeholder $1 cash).
    const cashSet = new Set(
      hospitalRows
        .map((r) => ({ cash: Number(r.cash), gross: Number(r.gross) }))
        .filter(({ cash, gross }) => {
          if (!Number.isFinite(cash) || cash < 10 || cash >= 100000) return false;
          if (Number.isFinite(gross) && gross > 0 && cash < gross * 0.01) return false;
          return true;
        })
        .map(({ cash }) => cash),
    );
    const grossSet = new Set(
      hospitalRows.map((r) => Number(r.gross)).filter((n) => Number.isFinite(n) && n > 0),
    );
    const cashes = [...cashSet];
    const grosses = [...grossSet];

    const ratesByPayer = UI_PAYERS.map((canon) => {
      let matching;
      if (canon === "Medicare") {
        matching = hospitalRows.filter((r) => negotiatedKept(r) && classifyBucket(r.plan, r.payer) === "medicare");
      } else if (canon === "Medicaid") {
        matching = hospitalRows.filter((r) => negotiatedKept(r) && classifyBucket(r.plan, r.payer) === "medicaid");
      } else {
        matching = hospitalRows.filter(
          (r) => negotiatedKept(r) && classifyBucket(r.plan, r.payer) === "commercial" && normalizePayer(r.payer) === canon,
        );
      }
      const rates = matching.map((r) => Number(r.negotiated)).filter((n) => Number.isFinite(n) && n > 0);
      // Plan-level rows: deduplicate by (raw_payer, raw_plan, rounded rate). Many
      // hospitals publish the same payer×plan combo many times under slightly
      // different group codes; collapsing them keeps the expand list readable
      // without losing the HMO-vs-PPO-vs-POS detail the user actually needs.
      const seen = new Set();
      const plans = [];
      for (const r of matching) {
        const n = Number(r.negotiated);
        if (!Number.isFinite(n) || n <= 0) continue;
        const key = `${r.payer}|${r.plan}|${Math.round(n)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        plans.push({
          payer: r.payer || null,
          plan: r.plan || null,
          rate: Math.round(n * 100) / 100,
          methodology: r.methodology || null,
        });
      }
      plans.sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
      if (rates.length === 0) {
        return { canonical_payer: canon, low: null, high: null, plan_count: 0, plans: [] };
      }
      return {
        canonical_payer: canon,
        plans,
        low: Math.round(Math.min(...rates)),
        high: Math.round(Math.max(...rates)),
        plan_count: matching.length,
      };
    });

    const allMissing = hospitalRows.length === 0;

    const geo = HOSPITAL_GEO[hid];
    hospitals.push({
      id: hid,
      name: meta.name,
      metro: meta.metro,
      system: meta.system,
      is_local: !!meta.is_local,
      is_pediatric: !!meta.is_pediatric,
      partial_parse: !!meta.partial_parse,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      zip: geo?.zip ?? null,
      address: geo?.address ?? null,
      phone: geo?.phone ?? null,
      cash_pay_low: cashes.length ? Math.round(Math.min(...cashes)) : null,
      cash_pay_high: cashes.length ? Math.round(Math.max(...cashes)) : null,
      gross_low: grosses.length ? Math.round(Math.min(...grosses)) : null,
      gross_high: grosses.length ? Math.round(Math.max(...grosses)) : null,
      rates_by_payer: ratesByPayer,
      all_missing: allMissing,
    });
  }

  // Pediatric hospitals can show enormous cash ranges on adult-coded procedures
  // because of complex-case billing patterns. Excluding them from the headline
  // keeps the surprise number honest while still showing them in the comparison.
  const cashedHospitals = hospitals.filter(
    (h) => !h.all_missing && !h.is_pediatric && h.cash_pay_low != null,
  );
  let headline = null;
  if (cashedHospitals.length >= 2) {
    const lo = cashedHospitals.reduce((a, b) => (a.cash_pay_low <= b.cash_pay_low ? a : b));
    const hi = cashedHospitals.reduce((a, b) => (a.cash_pay_high >= b.cash_pay_high ? a : b));
    const ratio = hi.cash_pay_high / lo.cash_pay_low;
    // Round to 1 decimal under 5x so close-spread procedures don't read as "1x".
    const spread = ratio >= 5 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
    headline = {
      cash_low: lo.cash_pay_low,
      cash_low_hospital: lo.name,
      cash_low_metro: lo.metro,
      cash_high: hi.cash_pay_high,
      cash_high_hospital: hi.name,
      cash_high_metro: hi.metro,
      spread_x: spread,
    };
  }

  const display = PROC_DISPLAY[code] || { short: label, category: "Other" };
  const overview = PROC_OVERVIEWS[code] || null;
  return {
    code,
    label,
    short: display.short,
    category: display.category,
    is_default: code === "73721",
    headline,
    overview, // { headline, body } or null
    hospitals,
  };
}

function main() {
  console.log("building UI data from raw-files/results/...");
  const procedures = [];
  for (const { code, label } of CPT_CODES) {
    const proc = buildProcedure(code, label);
    if (proc) {
      procedures.push(proc);
      const cashedCount = proc.hospitals.filter((h) => !h.all_missing).length;
      console.log(
        `  ${code} ${display(proc.label, 50)} ${cashedCount}/${proc.hospitals.length} hospitals  ${proc.headline ? `${proc.headline.spread_x}x spread` : "(no headline)"}`,
      );
    }
  }

  fs.mkdirSync(UI_DIR, { recursive: true });

  // Per-procedure data lives in ui/data/{cpt}.json. The main bundle ships only
  // the procedure index (metadata + headlines, no hospital arrays) so first
  // paint downloads ~50KB instead of ~17MB. The app fetches a procedure's
  // hospitals on demand when the user picks it from the dropdown.
  const PERPROC_DIR = path.join(UI_DIR, "data");
  fs.mkdirSync(PERPROC_DIR, { recursive: true });

  // Index entries — every field except hospitals[].
  const procedureIndex = procedures.map((p) => {
    const { hospitals, ...rest } = p;
    return rest;
  });

  // Per-procedure files — just code + hospitals[]. The app merges with the index entry.
  for (const p of procedures) {
    const outFile = path.join(PERPROC_DIR, `${p.code}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ code: p.code, hospitals: p.hospitals }));
  }
  console.log(`\nwrote ${procedures.length} per-procedure files to ${path.relative(process.cwd(), PERPROC_DIR)}/`);

  const dataPayload = {
    as_of: new Date().toISOString().slice(0, 10),
    city: "Los Angeles",
    procedures: procedureIndex,
    supported_payers: [
      { id: "Aetna", label: "Aetna" },
      { id: "Anthem BCBS", label: "Anthem Blue Cross Blue Shield" },
      { id: "Blue Cross Blue Shield", label: "Blue Cross Blue Shield" },
      { id: "Kaiser Permanente", label: "Kaiser Permanente" },
      { id: "UnitedHealthcare", label: "UnitedHealthcare" },
      { id: "Cigna", label: "Cigna" },
      { id: "HealthNet", label: "HealthNet" },
      { id: "Humana", label: "Humana" },
      { id: "Optum", label: "Optum" },
      { id: "Medicare", label: "Medicare" },
      { id: "Medicaid", label: "Medicaid / Medi-Cal" },
    ],
    coming_soon_la: [
      "USC Keck Medical Center",
      "Hoag Memorial (Newport Beach)",
      "City of Hope",
      "Long Beach Memorial",
      "Children's Hospital Los Angeles",
      "MLK Community Hospital",
      "Saint John's Health Center",
    ],
  };

  fs.writeFileSync(
    DATA_OUT,
    `// Generated by scripts/build-ui-data.mjs from raw-files/results/*.json.
// Index only — hospital arrays are lazy-loaded from data/{cpt}.json on demand.
(function () {
  window.ITEMIZED_DATA = ${JSON.stringify(dataPayload, null, 2)};
})();
`,
  );
  console.log(`wrote ${path.relative(process.cwd(), DATA_OUT)} (index, ${(fs.statSync(DATA_OUT).size / 1024).toFixed(0)}KB)`);

  // Ratings — pass through raw-files/ratings.json into the prototype's window var.
  if (fs.existsSync(RATINGS_FILE)) {
    const ratings = JSON.parse(fs.readFileSync(RATINGS_FILE, "utf8"));
    fs.writeFileSync(
      RATINGS_OUT,
      `// Generated by scripts/build-ui-data.mjs from raw-files/ratings.json.
window.ITEMIZED_RATINGS = ${JSON.stringify(ratings, null, 2)};
`,
    );
    console.log(`wrote ${path.relative(process.cwd(), RATINGS_OUT)}`);
  }
}

function display(s, width) {
  return (s || "").padEnd(width).slice(0, width);
}

main();
