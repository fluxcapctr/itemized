#!/usr/bin/env node
// Round 6: 40 hospitals across 7 new metros — Detroit, Pittsburgh, Tampa, Miami,
// Austin, Bay Area, San Diego. Same idempotent-patch pattern as wire-la-gap.mjs.
//
// Run:                  node scripts/wire-r6.mjs
// Run with logging:     node scripts/wire-r6.mjs > /tmp/r6.log 2>&1

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RAW_DIR = path.join(ROOT, "raw-files");
const REPORT_FILE = "/tmp/r6-report.md";

const log = (msg) => console.log(`[wire-r6] ${new Date().toISOString()} ${msg}`);

// All 40 hospitals. format: "tall" | "wide" | "json".
// Some HCA URLs and Ascension URLs need per-entry attributes:
//   referer:   sent as Referer header (Ascension Health Austin needs this)
const ASCENSION_REF = "https://healthcare.ascension.org/price-transparency";

const HOSPITALS = [
  // ─── Detroit ──────────────────────────────────────────────────────────
  { id: "henry-ford-detroit", name: "Henry Ford Hospital", url: "https://www.henryford.com/-/media/files/henry-ford/patients-visitors/price-transparency-2026/381357020-1134144801_henry-ford-health_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Henry Ford Hospital", metro: "Detroit, MI", system: "Henry Ford Health" }, lookup: { state: "MI", nameMatch: ["HENRY FORD HOSPITAL"] } },
  { id: "henry-ford-west-bloomfield", name: "Henry Ford West Bloomfield Hospital", url: "https://www.henryford.com/-/media/files/henry-ford/patients-visitors/price-transparency-2026/381357020-1407867559_henry-ford-health_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Henry Ford West Bloomfield Hospital", metro: "West Bloomfield, MI", system: "Henry Ford Health" }, lookup: { state: "MI", nameMatch: ["HENRY FORD WEST BLOOMFIELD HOSPITAL"] } },
  { id: "dmc-detroit-receiving", name: "DMC Detroit Receiving Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844942_detroit-receiving-hospital---dmc_standardcharges.json", ext: "json", format: "json", meta: { name: "DMC Detroit Receiving Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" }, lookup: { state: "MI", nameMatch: ["DETROIT RECEIVING HOSPITAL"] } },
  { id: "dmc-harper-university", name: "DMC Harper University Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844767_harper-university-hospital---dmc_standardcharges.json", ext: "json", format: "json", meta: { name: "DMC Harper University Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" }, lookup: { state: "MI", nameMatch: ["HARPER UNIVERSITY HOSPITAL"] } },
  { id: "dmc-sinai-grace", name: "DMC Sinai-Grace Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844632_dmc-sinai-grace-hospital_standardcharges.json", ext: "json", format: "json", meta: { name: "DMC Sinai-Grace Hospital", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet" }, lookup: { state: "MI", nameMatch: ["SINAI-GRACE HOSPITAL", "SINAI GRACE HOSPITAL"] } },
  { id: "childrens-hospital-michigan", name: "Children's Hospital of Michigan", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272845064_childrens-hospital-of-michigan---dmc_standardcharges.json", ext: "json", format: "json", meta: { name: "Children's Hospital of Michigan", metro: "Detroit, MI", system: "Detroit Medical Center / Tenet", is_pediatric: true }, lookup: { state: "MI", nameMatch: ["CHILDREN'S HOSPITAL OF MICHIGAN", "CHILDRENS HOSPITAL OF MICHIGAN"] } },
  { id: "corewell-royal-oak", name: "Corewell Health Royal Oak (Beaumont)", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blt5644d1c708026093/183459362_1811044878_william-beaumont-hospital_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Corewell Health Royal Oak", metro: "Royal Oak, MI", system: "Corewell Health (Beaumont)" }, lookup: { state: "MI", nameMatch: ["WILLIAM BEAUMONT HOSPITAL", "BEAUMONT ROYAL OAK", "COREWELL HEALTH WILLIAM"] } },
  { id: "corewell-troy", name: "Corewell Health Troy", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blta76ad74666a452ed/381459362_1811044878_beaumont-hospital-troy_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Corewell Health Troy", metro: "Troy, MI", system: "Corewell Health (Beaumont)" }, lookup: { state: "MI", nameMatch: ["BEAUMONT HOSPITAL TROY", "COREWELL HEALTH TROY"] } },
  { id: "corewell-farmington-hills", name: "Corewell Health Farmington Hills", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/bltd2969ccf9b97f808/381426919_corewell-health-farmington-hills-hospital_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Corewell Health Farmington Hills", metro: "Farmington Hills, MI", system: "Corewell Health" }, lookup: { state: "MI", nameMatch: ["COREWELL HEALTH FARMINGTON", "BEAUMONT FARMINGTON", "BOTSFORD HOSPITAL"] } },
  { id: "corewell-dearborn", name: "Corewell Health Dearborn", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blt85f9329ed06a671d/381405141_1740230119_oakwood-healthcare-inc_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Corewell Health Dearborn", metro: "Dearborn, MI", system: "Corewell Health (Oakwood)" }, lookup: { state: "MI", nameMatch: ["OAKWOOD HOSPITAL", "BEAUMONT DEARBORN", "COREWELL HEALTH DEARBORN"] } },

  // ─── Pittsburgh ───────────────────────────────────────────────────────
  { id: "upmc-presbyterian-shadyside", name: "UPMC Presbyterian Shadyside", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250965480_upmc-presbyterian-shadyside_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "UPMC Presbyterian Shadyside", metro: "Pittsburgh, PA", system: "UPMC" }, lookup: { state: "PA", nameMatch: ["UPMC PRESBYTERIAN SHADYSIDE", "UPMC PRESBYTERIAN"] } },
  { id: "upmc-magee-womens", name: "UPMC Magee-Womens Hospital", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250965420_upmc-magee_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "UPMC Magee-Womens Hospital", metro: "Pittsburgh, PA", system: "UPMC" }, lookup: { state: "PA", nameMatch: ["MAGEE-WOMENS HOSPITAL", "MAGEE WOMENS HOSPITAL", "MAGEE-WOMEN'S"] } },
  { id: "upmc-childrens-pittsburgh", name: "UPMC Children's Hospital of Pittsburgh", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250402510_upmc-childrens_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "UPMC Children's Hospital of Pittsburgh", metro: "Pittsburgh, PA", system: "UPMC", is_pediatric: true }, lookup: { state: "PA", nameMatch: ["CHILDREN'S HOSPITAL OF PITTSBURGH", "UPMC CHILDREN'S"] } },
  { id: "ahn-allegheny-general", name: "AHN Allegheny General Hospital", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/250969492_Allegheny-General-Hospital_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Allegheny General Hospital", metro: "Pittsburgh, PA", system: "Allegheny Health Network" }, lookup: { state: "PA", nameMatch: ["ALLEGHENY GENERAL HOSPITAL"] } },
  { id: "ahn-forbes", name: "AHN Forbes Hospital", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/250969492_Forbes-Hospital_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Forbes Hospital", metro: "Monroeville, PA", system: "Allegheny Health Network" }, lookup: { state: "PA", nameMatch: ["FORBES HOSPITAL", "FORBES REGIONAL HOSPITAL"] } },
  { id: "ahn-jefferson-regional", name: "AHN Jefferson Regional Medical Center", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/251260215_Jefferson-Regional-Medical-Center_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Jefferson Regional Medical Center", metro: "Jefferson Hills, PA", system: "Allegheny Health Network" }, lookup: { state: "PA", nameMatch: ["JEFFERSON REGIONAL MEDICAL CENTER", "JEFFERSON HOSPITAL"] } },

  // ─── Tampa ────────────────────────────────────────────────────────────
  { id: "tampa-general", name: "Tampa General Hospital", url: "https://www.tgh.org/-/media/files/patients-and-visitors/593458145_tampa-general-hospital_standardcharges.csv?rev=7c310c7c008b4517a240a5892e37ed20", ext: "csv", format: "tall", meta: { name: "Tampa General Hospital", metro: "Tampa, FL", system: "Tampa General" }, lookup: { state: "FL", nameMatch: ["TAMPA GENERAL HOSPITAL"] } },
  { id: "baycare-st-josephs-tampa", name: "BayCare St. Joseph's Hospital Tampa", url: "https://baycare.org/-/media/project/baycare/consumer-portal/billing-and-insurance/pricing-files-compressed/590774199_StJosephsHospital_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "BayCare St. Joseph's Hospital Tampa", metro: "Tampa, FL", system: "BayCare" }, lookup: { state: "FL", cityContains: "TAMPA", nameMatch: ["ST. JOSEPH'S HOSPITAL", "ST JOSEPHS HOSPITAL TAMPA"] } },
  { id: "baycare-morton-plant", name: "BayCare Morton Plant Hospital", url: "https://baycare.org/-/media/project/baycare/consumer-portal/billing-and-insurance/pricing-files-compressed/590624462_MortonPlantHospital_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "BayCare Morton Plant Hospital", metro: "Clearwater, FL", system: "BayCare" }, lookup: { state: "FL", nameMatch: ["MORTON PLANT HOSPITAL"] } },
  { id: "moffitt-cancer-center", name: "Moffitt Cancer Center", url: "https://eforms.moffitt.org/Moffittcancercenter_standardcharges/593238634_H.-Lee-Moffitt-Cancer-Center-and-Research-Institute-Hospital,-Inc._standardcharges.csv", ext: "csv", format: "tall", meta: { name: "H. Lee Moffitt Cancer Center", metro: "Tampa, FL", system: "Moffitt" }, lookup: { state: "FL", nameMatch: ["H LEE MOFFITT", "MOFFITT CANCER CENTER"] } },

  // ─── Miami ────────────────────────────────────────────────────────────
  { id: "jackson-memorial", name: "Jackson Memorial Hospital", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJMHMiamiFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Jackson Memorial Hospital", metro: "Miami, FL", system: "Jackson Health" }, lookup: { state: "FL", cityContains: "MIAMI", nameMatch: ["JACKSON MEMORIAL HOSPITAL"] } },
  { id: "jackson-north", name: "Jackson North Medical Center", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJNMCNorthMiamiBeachFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Jackson North Medical Center", metro: "North Miami Beach, FL", system: "Jackson Health" }, lookup: { state: "FL", nameMatch: ["JACKSON NORTH MEDICAL CENTER"] } },
  { id: "jackson-south", name: "Jackson South Medical Center", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJSCHMiamiFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv", format: "tall", meta: { name: "Jackson South Medical Center", metro: "Miami, FL", system: "Jackson Health" }, lookup: { state: "FL", cityContains: "MIAMI", nameMatch: ["JACKSON SOUTH MEDICAL CENTER", "JACKSON SOUTH COMMUNITY HOSPITAL"] } },
  { id: "baptist-hospital-miami", name: "Baptist Hospital of Miami", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/590910342_baptist-hospital-of-miami_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "Baptist Hospital of Miami", metro: "Miami, FL", system: "Baptist Health South Florida" }, lookup: { state: "FL", nameMatch: ["BAPTIST HOSPITAL OF MIAMI"] } },
  { id: "baptist-doctors-coral-gables", name: "Doctors Hospital (Coral Gables)", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/43775926_doctors-hospital_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "Doctors Hospital", metro: "Coral Gables, FL", system: "Baptist Health South Florida" }, lookup: { state: "FL", cityContains: "CORAL GABLES", nameMatch: ["DOCTORS HOSPITAL"] } },
  { id: "baptist-homestead", name: "Homestead Hospital", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/650232993_homestead-hospital_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "Homestead Hospital", metro: "Homestead, FL", system: "Baptist Health South Florida" }, lookup: { state: "FL", nameMatch: ["HOMESTEAD HOSPITAL"] } },
  { id: "nicklaus-childrens", name: "Nicklaus Children's Hospital", url: "https://www.nicklauschildrens.org/NCH/media/docs/pdf/Finance/590638499_nicklaus-childrens-hospital_standardcharges_04-2026.zip", ext: "zip", format: "tall", meta: { name: "Nicklaus Children's Hospital", metro: "Miami, FL", system: "Nicklaus Children's", is_pediatric: true }, lookup: { state: "FL", nameMatch: ["NICKLAUS CHILDREN'S", "MIAMI CHILDREN'S"] } },

  // ─── Austin (Ascension URLs need Referer) ─────────────────────────────
  { id: "dell-seton-uta", name: "Dell Seton Medical Center at UT Austin", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1093810327_ascension-seton_standardcharges.zip", ext: "zip", format: "tall", referer: ASCENSION_REF, meta: { name: "Dell Seton Medical Center at UT Austin", metro: "Austin, TX", system: "Ascension Seton" }, lookup: { state: "TX", nameMatch: ["DELL SETON MEDICAL CENTER", "UNIVERSITY MEDICAL CENTER BRACKENRIDGE"] } },
  { id: "ascension-seton-medical-austin", name: "Ascension Seton Medical Center Austin", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1164526786_ascension-seton_standardcharges.zip", ext: "zip", format: "tall", referer: ASCENSION_REF, meta: { name: "Ascension Seton Medical Center Austin", metro: "Austin, TX", system: "Ascension Seton" }, lookup: { state: "TX", nameMatch: ["ASCENSION SETON MEDICAL CENTER AUSTIN", "SETON MEDICAL CENTER AUSTIN"] } },
  { id: "dell-childrens-austin", name: "Dell Children's Medical Center", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1447355771_ascension-seton_standardcharges.zip", ext: "zip", format: "tall", referer: ASCENSION_REF, meta: { name: "Dell Children's Medical Center", metro: "Austin, TX", system: "Ascension Seton", is_pediatric: true }, lookup: { state: "TX", nameMatch: ["DELL CHILDREN'S MEDICAL CENTER", "CHILDREN'S HOSPITAL OF AUSTIN"] } },
  { id: "ascension-seton-northwest", name: "Ascension Seton Northwest Hospital", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1124137054_ascension-seton_standardcharges.zip", ext: "zip", format: "tall", referer: ASCENSION_REF, meta: { name: "Ascension Seton Northwest Hospital", metro: "Austin, TX", system: "Ascension Seton" }, lookup: { state: "TX", nameMatch: ["ASCENSION SETON NORTHWEST", "SETON NORTHWEST"] } },
  { id: "st-davids-medical-center", name: "St. David's Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json", format: "json", meta: { name: "St. David's Medical Center", metro: "Austin, TX", system: "HCA / St. David's" }, lookup: { state: "TX", cityContains: "AUSTIN", nameMatch: ["ST. DAVID'S MEDICAL CENTER", "ST DAVIDS MEDICAL CENTER"] } },
  { id: "st-davids-north-austin", name: "St. David's North Austin Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-NORTH-AUSTIN-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json", format: "json", meta: { name: "St. David's North Austin Medical Center", metro: "Austin, TX", system: "HCA / St. David's" }, lookup: { state: "TX", nameMatch: ["ST. DAVID'S NORTH AUSTIN", "ST DAVIDS NORTH AUSTIN"] } },
  { id: "st-davids-round-rock", name: "St. David's Round Rock Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-ROUND-ROCK-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json", format: "json", meta: { name: "St. David's Round Rock Medical Center", metro: "Round Rock, TX", system: "HCA / St. David's" }, lookup: { state: "TX", nameMatch: ["ST. DAVID'S ROUND ROCK", "ROUND ROCK MEDICAL CENTER"] } },
  { id: "heart-hospital-austin", name: "Heart Hospital of Austin", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_HEART-HOSP-OF-AUSTIN_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json", format: "json", meta: { name: "Heart Hospital of Austin", metro: "Austin, TX", system: "HCA" }, lookup: { state: "TX", nameMatch: ["HEART HOSPITAL OF AUSTIN"] } },

  // ─── Bay Area ─────────────────────────────────────────────────────────
  { id: "stanford-health-care", name: "Stanford Health Care", url: "https://stanfordhealthcare.org/content/dam/SHC/patientsandvisitors/pricingtransparency/946174066_stanford-health-care_standardcharges.json", ext: "json", format: "json", meta: { name: "Stanford Health Care", metro: "Palo Alto, CA", system: "Stanford Medicine" }, lookup: { state: "CA", nameMatch: ["STANFORD HEALTH CARE", "STANFORD HOSPITAL"] } },
  { id: "stanford-tri-valley", name: "Stanford Health Care Tri-Valley", url: "https://stanfordhealthcare.org/content/dam/valleycare/patients-visitors/941429628_stanford-health-care---tri-valley_standardcharges.json", ext: "json", format: "json", meta: { name: "Stanford Health Care Tri-Valley", metro: "Pleasanton, CA", system: "Stanford Medicine" }, lookup: { state: "CA", nameMatch: ["STANFORD HEALTH CARE TRI-VALLEY", "VALLEYCARE MEDICAL CENTER"] } },
  { id: "kaiser-oakland", name: "Kaiser Permanente Oakland Medical Center", url: "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-oakland-medical-center-standard-charges-ncal-en.csv", ext: "csv", format: "tall", meta: { name: "Kaiser Permanente Oakland Medical Center", metro: "Oakland, CA", system: "Kaiser Permanente" }, lookup: { state: "CA", cityContains: "OAKLAND", nameMatch: ["KAISER FOUNDATION HOSPITAL - OAKLAND", "KAISER PERMANENTE OAKLAND"] } },
  { id: "kaiser-redwood-city", name: "Kaiser Permanente Redwood City Medical Center", url: "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-redwood-city-medical-center-standard-charges-ncal-en.csv", ext: "csv", format: "tall", meta: { name: "Kaiser Permanente Redwood City Medical Center", metro: "Redwood City, CA", system: "Kaiser Permanente" }, lookup: { state: "CA", cityContains: "REDWOOD CITY", nameMatch: ["KAISER FOUNDATION HOSPITAL - REDWOOD CITY", "KAISER PERMANENTE REDWOOD CITY"] } },
  { id: "john-muir-walnut-creek", name: "John Muir Health Walnut Creek Medical Center", url: "https://www.johnmuirhealth.com/content/dam/jmh/Documents/payments-and-insurance/machine-readable-files/94-1461843-1740215219_John-Muir-Health-Walnut-Creek-Medical-Center_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "John Muir Health Walnut Creek Medical Center", metro: "Walnut Creek, CA", system: "John Muir Health" }, lookup: { state: "CA", cityContains: "WALNUT CREEK", nameMatch: ["JOHN MUIR MEDICAL CENTER", "JOHN MUIR HEALTH WALNUT CREEK"] } },
  { id: "john-muir-concord", name: "John Muir Health Concord Medical Center", url: "https://www.johnmuirhealth.com/content/dam/jmh/Documents/payments-and-insurance/machine-readable-files/68-0396600-1801821376_John-Muir-Health-Concord-Medical-Center_standardcharges.zip", ext: "zip", format: "tall", meta: { name: "John Muir Health Concord Medical Center", metro: "Concord, CA", system: "John Muir Health" }, lookup: { state: "CA", cityContains: "CONCORD", nameMatch: ["JOHN MUIR HEALTH CONCORD", "MOUNT DIABLO MEDICAL CENTER"] } },

  // ─── San Diego ────────────────────────────────────────────────────────
  { id: "ucsd-health", name: "UC San Diego Health", url: "https://hsfiles.ucsd.edu/patientBilling/UC-San-Diego-Standard-Charges-956006144.json", ext: "json", format: "json", meta: { name: "UC San Diego Health", metro: "San Diego, CA", system: "UCSD Health" }, lookup: { state: "CA", nameMatch: ["UCSD MEDICAL CENTER", "UC SAN DIEGO HEALTH", "UC SAN DIEGO MEDICAL"] } },
  { id: "sharp-memorial", name: "Sharp Memorial Hospital", url: "https://downloads.ctfassets.net/pxcfulgsd9e2/7kOO19WgXRFqOFfWyPsSCE/1dd67ee60fbf2a34d729812c39abb1fe/95-3782169_sharp-memorial-hospital_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Sharp Memorial Hospital", metro: "San Diego, CA", system: "Sharp HealthCare" }, lookup: { state: "CA", nameMatch: ["SHARP MEMORIAL HOSPITAL"] } },
  { id: "sharp-grossmont", name: "Sharp Grossmont Hospital", url: "https://downloads.ctfassets.net/pxcfulgsd9e2/pDe4LFVvP8fh5nOJd8Zji/71b0885eb86902c17aee42e048ea796b/33-0449527_grossmont-hospital-corporation_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Sharp Grossmont Hospital", metro: "La Mesa, CA", system: "Sharp HealthCare" }, lookup: { state: "CA", nameMatch: ["SHARP GROSSMONT HOSPITAL", "GROSSMONT HOSPITAL"] } },
  { id: "scripps-la-jolla", name: "Scripps Memorial Hospital La Jolla", url: "https://apps.scripps.org/pricetransparency/951684089_Scripps-Memorial-Hospital-La-Jolla_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Scripps Memorial Hospital La Jolla", metro: "La Jolla, CA", system: "Scripps Health" }, lookup: { state: "CA", nameMatch: ["SCRIPPS MEMORIAL HOSPITAL LA JOLLA"] } },
  { id: "scripps-mercy-sd", name: "Scripps Mercy Hospital San Diego", url: "https://apps.scripps.org/pricetransparency/951684089_Scripps-Mercy-Hospital-San-Diego_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Scripps Mercy Hospital San Diego", metro: "San Diego, CA", system: "Scripps Health" }, lookup: { state: "CA", cityContains: "SAN DIEGO", nameMatch: ["SCRIPPS MERCY HOSPITAL"] } },
  { id: "rady-childrens", name: "Rady Children's Hospital San Diego", url: "https://www.rchsd.org/wp-content/uploads/2026/03/95-1691313_rady-childrens-hospital-san-diego_standardcharges.csv", ext: "csv", format: "tall", meta: { name: "Rady Children's Hospital San Diego", metro: "San Diego, CA", system: "Rady Children's", is_pediatric: true }, lookup: { state: "CA", nameMatch: ["RADY CHILDREN'S HOSPITAL", "CHILDREN'S HOSPITAL - SAN DIEGO"] } },
];

// ─── Edit helpers (same pattern as wire-la-gap.mjs) ────────────────────────
function injectBefore(file, anchor, block, label) {
  const src = fs.readFileSync(file, "utf8");
  if (src.includes(label)) {
    log(`  ${path.basename(file)}: section "${label}" already present, skipping`);
    return;
  }
  const idx = src.indexOf(anchor);
  if (idx === -1) throw new Error(`anchor not found in ${file}: ${anchor}`);
  fs.writeFileSync(file, src.slice(0, idx) + block + src.slice(idx));
  log(`  wrote section "${label}" to ${path.basename(file)}`);
}

function patchDownloader() {
  const file = path.join(ROOT, "scripts/download-mrfs.mjs");
  const lines = HOSPITALS.map((h) => {
    const parts = [`id: "${h.id}"`, `name: "${h.name.replace(/"/g, '\\"')}"`, `url: "${h.url}"`, `ext: "${h.ext}"`];
    if (h.referer) parts.push(`referer: "${h.referer}"`);
    return `  { ${parts.join(", ")} },`;
  }).join("\n");
  injectBefore(file, "\n];", `  // ── Round 6: 7-metro expansion (Detroit, Pittsburgh, Tampa, Miami, Austin, Bay Area, San Diego) ──\n${lines}\n`, "Round 6: 7-metro expansion");
}

function patchTallExtractor() {
  const file = path.join(ROOT, "scripts/extract-mri.mjs");
  const tallAndJson = HOSPITALS.filter((h) => h.format !== "wide");
  const lines = tallAndJson.map((h) => {
    if (h.format === "json") {
      return `  await processIfExists("${h.id}", path.join(RAW_DIR, "${h.id}.json"), processJSON);`;
    }
    if (h.ext === "zip") {
      return `  await processZipped("${h.id}", "csv");`;
    }
    return `  if (fs.existsSync(path.join(RAW_DIR, "${h.id}.zip"))) {\n    await processZipped("${h.id}", "csv");\n  } else {\n    await processIfExists("${h.id}", path.join(RAW_DIR, "${h.id}.csv"), processCSV);\n  }`;
  }).join("\n");
  injectBefore(file, "  // Mass General zip is unpacked manually", `\n  // ── Round 6: 7-metro expansion ──\n${lines}\n`, "Round 6: 7-metro expansion");
}

function patchWideExtractor() {
  const wide = HOSPITALS.filter((h) => h.format === "wide");
  if (wide.length === 0) return;
  const file = path.join(ROOT, "scripts/extract-mri-wide.mjs");
  const lines = wide.map((h) => `    { id: "${h.id}", path: path.join(RAW_DIR, "${h.id}.csv") },`).join("\n");
  injectBefore(file, "  ];", `    // Round 6\n${lines}\n`, "Round 6");
}

function patchUIBuilder() {
  const file = path.join(ROOT, "scripts/build-ui-data.mjs");
  const lines = HOSPITALS.map((h) => {
    const flags = Object.entries(h.meta).map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v.replace(/"/g, '\\"')}"` : v}`).join(", ");
    return `  "${h.id}": { ${flags} },`;
  }).join("\n");
  injectBefore(file, "};\n\n// Geocode each hospital", `  // ── Round 6: 7-metro expansion ──\n${lines}\n`, "Round 6: 7-metro expansion");
}

function patchRatings() {
  const file = path.join(ROOT, "scripts/fetch-cms-ratings.mjs");
  const lines = HOSPITALS.map((h) => {
    const l = h.lookup;
    const parts = [`id: "${h.id}"`, `state: "${l.state}"`];
    if (l.cityContains) parts.push(`cityContains: "${l.cityContains}"`);
    parts.push(`nameMatch: [${l.nameMatch.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(", ")}]`);
    return `  { ${parts.join(", ")} },`;
  }).join("\n");
  injectBefore(file, "];\n", `  // ── Round 6: 7-metro expansion ──\n${lines}\n`, "Round 6: 7-metro expansion");
}

// ─── Pipeline runners (same as wire-la-gap.mjs) ────────────────────────────
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  return r.status === 0;
}

function detectFormat(filePath) {
  const r = spawnSync("file", [filePath], { encoding: "utf8" });
  return r.stdout || "";
}

function renameZipDisguised() {
  for (const h of HOSPITALS) {
    if (h.ext !== "csv") continue;
    const csv = path.join(RAW_DIR, `${h.id}.csv`);
    if (!fs.existsSync(csv)) continue;
    const desc = detectFormat(csv);
    if (desc.includes("Zip archive")) {
      fs.renameSync(csv, path.join(RAW_DIR, `${h.id}.zip`));
      log(`  renamed ${h.id}.csv → ${h.id}.zip`);
    }
  }
}

function checkProcedureCoverage(cpt) {
  const file = path.join(RAW_DIR, "results", `${cpt}.json`);
  if (!fs.existsSync(file)) return new Set();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const hospitals = new Set();
  for (const r of data.rows) hospitals.add(r.hospital);
  return hospitals;
}

function checkRatings() {
  const file = path.join(RAW_DIR, "ratings.json");
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeReport(steps) {
  const knee = checkProcedureCoverage("73721");
  const ratings = checkRatings();
  const lines = HOSPITALS.map((h) => {
    const hadKnee = knee.has(h.id);
    const r = ratings.ratings?.[h.id];
    const ratingText = r?.matched ? (r.overall_rating != null ? `${r.overall_rating}/5` : "matched, no overall") : "no CMS match";
    const fileExists = fs.existsSync(path.join(RAW_DIR, `${h.id}.${h.ext}`)) || fs.existsSync(path.join(RAW_DIR, `${h.id}.zip`));
    return `- **${h.id}** (${h.format}): downloaded=${fileExists ? "✓" : "✗"}, knee MRI rows=${hadKnee ? "✓" : "✗"}, CMS=${ratingText}`;
  }).join("\n");

  const out = [
    `# Round 6: 7-metro expansion report`,
    ``,
    `Run at: ${new Date().toISOString()}`,
    ``,
    `## Pipeline steps`,
    ...steps.map((s, i) => `${i + 1}. ${s.label} — ${s.ok ? "✓" : "✗ FAILED"}`),
    ``,
    `## Per-hospital status`,
    lines,
    ``,
    `## Coverage summary`,
    `- knee MRI (73721) total hospitals with rows: ${knee.size}`,
    `- new hospitals contributing knee MRI rows: ${HOSPITALS.filter((h) => knee.has(h.id)).length} of ${HOSPITALS.length}`,
  ];
  fs.writeFileSync(REPORT_FILE, out.join("\n"));
  log(`wrote ${REPORT_FILE}`);
}

async function main() {
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

  stepRun("patch download-mrfs.mjs", patchDownloader);
  stepRun("patch extract-mri.mjs", patchTallExtractor);
  stepRun("patch extract-mri-wide.mjs", patchWideExtractor);
  stepRun("patch build-ui-data.mjs", patchUIBuilder);
  stepRun("patch fetch-cms-ratings.mjs", patchRatings);

  stepRun("download MRFs", () => run("npm", ["run", "download"]));
  stepRun("rename zip-as-csv", () => { renameZipDisguised(); return true; });

  stepRun("extract tall + JSON", () => run("npm", ["run", "extract"]));
  stepRun("extract wide", () => run("npm", ["run", "extract:wide"]));
  stepRun("fetch CMS ratings", () => run("npm", ["run", "ratings"]));
  stepRun("build UI data", () => run("npm", ["run", "build:data"]));

  writeReport(steps);
  const failed = steps.filter((s) => !s.ok);
  if (failed.length > 0) {
    log(`completed with ${failed.length} failed step(s) — see ${REPORT_FILE}`);
    process.exit(1);
  }
  log(`completed cleanly. Report at ${REPORT_FILE}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
