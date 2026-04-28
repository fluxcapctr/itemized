// Fetch CMS Hospital Care Compare overall ratings for the 15 hospitals in our dataset.
// Source: https://data.cms.gov/provider-data/dataset/xubh-q36u (Hospital General Information)
// Output: raw-files/ratings.json, keyed by our hospital IDs.
//
// CMS publishes the overall 1-5 star rating plus several "national comparison"
// subscores (above/same/below the national average) for safety, patient experience,
// readmission, and mortality. Children's hospitals frequently don't have an overall
// rating because the methodology depends on Medicare claims data they don't generate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.resolve(__dirname, "..", "raw-files");
const OUT_FILE = path.join(RAW_DIR, "ratings.json");

// For each of our 15 hospitals: the state (narrows the CMS query) and a list of
// name fragments to substring-match against CMS's facility_name. Order matters:
// the first match wins, so put the most specific fragment first.
const HOSPITAL_LOOKUPS = [
  { id: "cedars-sinai", state: "CA", nameMatch: ["CEDARS-SINAI MEDICAL CENTER", "CEDARS SINAI MEDICAL CENTER"] },
  { id: "ucla-ronald-reagan", state: "CA", nameMatch: ["RONALD REAGAN UCLA MEDICAL CENTER", "UCLA MEDICAL CENTER"] },
  // Burbank — disambiguate from Eureka and Orange. CMS uses abbreviated "CTR".
  { id: "providence-st-joseph", state: "CA", cityContains: "BURBANK", nameMatch: ["PROVIDENCE SAINT JOSEPH MEDICAL CTR", "PROVIDENCE SAINT JOSEPH MEDICAL CENTER"] },
  { id: "houston-methodist", state: "TX", nameMatch: ["HOUSTON METHODIST HOSPITAL", "THE METHODIST HOSPITAL"] },
  { id: "cleveland-clinic", state: "OH", nameMatch: ["CLEVELAND CLINIC"] },
  { id: "nyu-langone-tisch", state: "NY", nameMatch: ["NYU LANGONE HOSPITALS", "TISCH HOSPITAL"] },
  { id: "advocate-christ", state: "IL", nameMatch: ["ADVOCATE CHRIST HOSPITAL", "ADVOCATE CHRIST MEDICAL CENTER"] },
  { id: "mass-general", state: "MA", nameMatch: ["MASSACHUSETTS GENERAL HOSPITAL"] },
  { id: "medstar-georgetown", state: "DC", nameMatch: ["MEDSTAR GEORGETOWN", "GEORGETOWN UNIVERSITY HOSPITAL"] },
  { id: "jefferson-abington", state: "PA", nameMatch: ["JEFFERSON ABINGTON HOSPITAL", "ABINGTON MEMORIAL", "ABINGTON HOSPITAL"] },
  { id: "emory-decatur", state: "GA", nameMatch: ["EMORY DECATUR HOSPITAL", "DEKALB MEDICAL"] },
  { id: "honorhealth-osborn", state: "AZ", nameMatch: ["HONORHEALTH SCOTTSDALE OSBORN", "SCOTTSDALE OSBORN"] },
  { id: "uchealth-memorial-central", state: "CO", nameMatch: ["UCH-MEMORIAL HEALTH SYSTEM", "MEMORIAL HOSPITAL CENTRAL"] },
  { id: "seattle-childrens", state: "WA", nameMatch: ["SEATTLE CHILDREN'S HOSPITAL", "CHILDRENS HOSPITAL AND MEDICAL CENTER"] },
  { id: "vanderbilt-umc", state: "TN", nameMatch: ["VANDERBILT UNIVERSITY MEDICAL CENTER"] },
  // ── LA-area expansion (round 3) ─────────────────────────────────────
  { id: "providence-st-johns-santa-monica", state: "CA", nameMatch: ["PROVIDENCE SAINT JOHN'S HEALTH CENTER", "PROVIDENCE ST JOHN'S", "SAINT JOHN'S HEALTH CENTER"] },
  { id: "usc-keck", state: "CA", nameMatch: ["KECK HOSPITAL OF USC", "USC UNIVERSITY HOSPITAL"] },
  { id: "usc-norris", state: "CA", nameMatch: ["USC KENNETH NORRIS", "USC NORRIS CANCER HOSPITAL"] },
  { id: "usc-verdugo-hills", state: "CA", nameMatch: ["USC VERDUGO HILLS HOSPITAL", "VERDUGO HILLS HOSPITAL"] },
  { id: "usc-arcadia", state: "CA", nameMatch: ["USC ARCADIA HOSPITAL", "METHODIST HOSPITAL OF SOUTHERN CALIFORNIA"] },
  { id: "hoag-newport", state: "CA", nameMatch: ["HOAG MEMORIAL HOSPITAL PRESBYTERIAN", "HOAG HOSPITAL"] },
  { id: "chla", state: "CA", nameMatch: ["CHILDREN'S HOSP OF LOS ANGELES", "CHILDRENS HOSPITAL LOS ANGELES", "CHILDREN'S HOSPITAL LOS ANGELES"] },
  { id: "kaiser-la-sunset", state: "CA", nameMatch: ["KAISER FOUNDATION HOSPITAL - LOS ANGELES", "KAISER PERMANENTE LOS ANGELES MEDICAL CENTER", "LOS ANGELES MEDICAL CENTER"] },
  { id: "mlk-community", state: "CA", nameMatch: ["MARTIN LUTHER KING JR. COMMUNITY HOSPITAL", "MLK COMMUNITY HOSPITAL", "MARTIN LUTHER KING"] },
  { id: "olive-view-ucla", state: "CA", nameMatch: ["OLIVE VIEW-UCLA MEDICAL CENTER", "OLIVE VIEW UCLA"] },
  { id: "harbor-ucla", state: "CA", nameMatch: ["LAC/HARBOR-UCLA MED CENTER", "HARBOR-UCLA MED CENTER", "HARBOR-UCLA"] },
  { id: "ucla-santa-monica", state: "CA", nameMatch: ["SANTA MONICA - UCLA MED CTR", "SANTA MONICA UCLA"] },
  { id: "torrance-memorial", state: "CA", nameMatch: ["TORRANCE MEMORIAL MEDICAL CENTER"] },
  { id: "huntington-pasadena", state: "CA", nameMatch: ["HUNTINGTON HEALTH", "HUNTINGTON HOSPITAL"] },
  { id: "cedars-sinai-marina-del-rey", state: "CA", nameMatch: ["CEDARS-SINAI MARINA DEL REY", "MARINA DEL REY HOSPITAL"] },
  { id: "pomona-valley", state: "CA", nameMatch: ["POMONA VALLEY HOSPITAL MEDICAL CENTER"] },
  { id: "hollywood-presbyterian", state: "CA", nameMatch: ["HOLLYWOOD PRESBYTERIAN MEDICAL CENTER"] },
  { id: "st-francis-lynwood", state: "CA", nameMatch: ["ST. FRANCIS MEDICAL CENTER", "SAINT FRANCIS MEDICAL CENTER"] },
  { id: "dignity-st-mary-long-beach", state: "CA", nameMatch: ["ST MARY MEDICAL CENTER", "ST. MARY MEDICAL CENTER LONG BEACH"] },
  { id: "dignity-california-hospital", state: "CA", nameMatch: ["CALIFORNIA HOSPITAL MEDICAL CENTER"] },
  { id: "dignity-northridge", state: "CA", nameMatch: ["NORTHRIDGE HOSPITAL MEDICAL CENTER"] },
  { id: "dignity-glendale-memorial", state: "CA", nameMatch: ["GLENDALE MEM HOSPITAL", "GLENDALE MEMORIAL HOSPITAL"] },
  // ── Round 4: NYC ─────────────────────────────────────────────────────
  { id: "mount-sinai-hospital", state: "NY", nameMatch: ["MOUNT SINAI HOSPITAL", "MT SINAI HOSPITAL"] },
  { id: "nyp-columbia", state: "NY", nameMatch: ["NEW YORK-PRESBYTERIAN HOSPITAL", "NEWYORK-PRESBYTERIAN HOSPITAL", "NEW YORK PRESBYTERIAN HOSPITAL"] },
  { id: "nyp-queens", state: "NY", nameMatch: ["NEW YORK-PRESBYTERIAN/QUEENS", "NEWYORK-PRESBYTERIAN QUEENS"] },
  // MSK is an oncology specialty hospital; CMS Care Compare doesn't rate cancer-only facilities, so we expect no match.
  { id: "msk-cancer-center", state: "NY", nameMatch: ["MEMORIAL HOSPITAL FOR CANCER", "MEMORIAL SLOAN KETTERING"] },
  { id: "hss-main", state: "NY", nameMatch: ["HOSPITAL FOR SPECIAL SURGERY"] },
  { id: "northwell-lij", state: "NY", nameMatch: ["LONG ISLAND JEWISH MEDICAL CENTER"] },
  { id: "northwell-lenox-hill", state: "NY", nameMatch: ["LENOX HILL HOSPITAL"] },
  { id: "northwell-north-shore", state: "NY", nameMatch: ["NORTH SHORE UNIVERSITY HOSPITAL"] },
  { id: "northwell-staten-island", state: "NY", nameMatch: ["STATEN ISLAND UNIVERSITY HOSPITAL"] },
  { id: "montefiore-medical-center", state: "NY", nameMatch: ["MONTEFIORE MEDICAL CENTER"] },
  { id: "nychh-bellevue", state: "NY", nameMatch: ["BELLEVUE HOSPITAL CENTER", "NYC HEALTH AND HOSPITALS / BELLEVUE", "NYC HEALTH + HOSPITALS / BELLEVUE"] },
  { id: "nychh-elmhurst", state: "NY", nameMatch: ["ELMHURST HOSPITAL CENTER", "NYC HEALTH AND HOSPITALS / ELMHURST", "NYC HEALTH + HOSPITALS / ELMHURST"] },
  { id: "nychh-jacobi", state: "NY", nameMatch: ["JACOBI MEDICAL CENTER", "NYC HEALTH AND HOSPITALS / JACOBI", "NYC HEALTH + HOSPITALS / JACOBI"] },
  { id: "nychh-kings-county", state: "NY", nameMatch: ["KINGS COUNTY HOSPITAL CENTER", "NYC HEALTH AND HOSPITALS / KINGS COUNTY", "NYC HEALTH + HOSPITALS / KINGS COUNTY"] },
  { id: "maimonides-medical-center", state: "NY", nameMatch: ["MAIMONIDES MEDICAL CENTER"] },
  // ── Round 4: Chicago ─────────────────────────────────────────────────
  { id: "northwestern-memorial", state: "IL", nameMatch: ["NORTHWESTERN MEMORIAL HOSPITAL"] },
  { id: "rush-university", state: "IL", nameMatch: ["RUSH UNIVERSITY MEDICAL CENTER"] },
  { id: "uchicago-medical-center", state: "IL", nameMatch: ["UNIVERSITY OF CHICAGO MEDICAL CENTER"] },
  { id: "loyola-medical-center", state: "IL", nameMatch: ["LOYOLA UNIVERSITY MEDICAL CENTER"] },
  { id: "lurie-childrens", state: "IL", nameMatch: ["ANN & ROBERT H LURIE CHILDRENS HOSPITAL", "LURIE CHILDRENS HOSPITAL", "ANN AND ROBERT H LURIE"] },
  { id: "stroger-cook-county", state: "IL", nameMatch: ["JOHN H STROGER", "JOHN H. STROGER", "STROGER HOSPITAL"] },
  { id: "advocate-lutheran-general", state: "IL", nameMatch: ["ADVOCATE LUTHERAN GENERAL HOSPITAL"] },
  { id: "advocate-illinois-masonic", state: "IL", nameMatch: ["ADVOCATE ILLINOIS MASONIC MEDICAL CENTER"] },
  { id: "endeavor-evanston", state: "IL", nameMatch: ["ENDEAVOR HEALTH EVANSTON HOSPITAL", "NORTHSHORE EVANSTON HOSPITAL", "EVANSTON HOSPITAL"] },
  // ── Round 4: Houston ─────────────────────────────────────────────────
  { id: "md-anderson", state: "TX", nameMatch: ["UNIVERSITY OF TEXAS M D ANDERSON CANCER CENTER", "MD ANDERSON CANCER CENTER", "M D ANDERSON CANCER CENTER"] },
  { id: "memorial-hermann-tmc", state: "TX", nameMatch: ["MEMORIAL HERMANN-TEXAS MEDICAL CENTER", "MEMORIAL HERMANN HOSPITAL"] },
  { id: "memorial-hermann-southwest", state: "TX", nameMatch: ["MEMORIAL HERMANN SOUTHWEST HOSPITAL"] },
  { id: "memorial-hermann-memorial-city", state: "TX", nameMatch: ["MEMORIAL HERMANN MEMORIAL CITY HOSPITAL", "MEMORIAL HERMANN MEMORIAL CITY"] },
  { id: "memorial-hermann-sugar-land", state: "TX", nameMatch: ["MEMORIAL HERMANN SUGAR LAND HOSPITAL"] },
  { id: "baylor-st-lukes-tmc", state: "TX", nameMatch: ["BAYLOR ST LUKES MEDICAL CENTER", "BAYLOR ST. LUKE'S MEDICAL CENTER", "ST. LUKE'S EPISCOPAL HOSPITAL"] },
  { id: "texas-childrens", state: "TX", nameMatch: ["TEXAS CHILDRENS HOSPITAL", "TEXAS CHILDREN'S HOSPITAL"] },
  { id: "harris-health-ben-taub", state: "TX", nameMatch: ["BEN TAUB GENERAL HOSPITAL", "HARRIS HEALTH BEN TAUB"] },
  { id: "hca-houston-medical-center", state: "TX", nameMatch: ["HCA HOUSTON HEALTHCARE MEDICAL CENTER", "BAYSHORE MEDICAL CENTER"] },
  { id: "hca-houston-kingwood", state: "TX", nameMatch: ["HCA HOUSTON HEALTHCARE KINGWOOD", "KINGWOOD MEDICAL CENTER"] },
  // ── Round 4: Dallas ──────────────────────────────────────────────────
  { id: "ut-southwestern", state: "TX", nameMatch: ["WILLIAM P CLEMENTS JR UNIVERSITY HOSPITAL", "UT SOUTHWESTERN", "ZALE LIPSHY"] },
  { id: "baylor-university-medical-center", state: "TX", nameMatch: ["BAYLOR UNIVERSITY MEDICAL CENTER"] },
  { id: "methodist-dallas", state: "TX", nameMatch: ["METHODIST DALLAS MEDICAL CENTER", "METHODIST HOSPITALS OF DALLAS"] },
  { id: "texas-health-presbyterian-dallas", state: "TX", nameMatch: ["TEXAS HEALTH PRESBYTERIAN HOSPITAL DALLAS", "PRESBYTERIAN HOSPITAL OF DALLAS"] },
  { id: "childrens-medical-center-dallas", state: "TX", nameMatch: ["CHILDRENS MEDICAL CTR OF DALLAS", "CHILDRENS MEDICAL CENTER OF DALLAS"] },
  { id: "parkland-memorial", state: "TX", nameMatch: ["PARKLAND HEALTH AND HOSPITAL SYSTEM", "PARKLAND MEMORIAL HOSPITAL", "PARKLAND HEALTH"] },
  // ── Round 4: Philadelphia ────────────────────────────────────────────
  { id: "hup-penn", state: "PA", nameMatch: ["HOSPITAL OF UNIV OF PENNSYLVANIA", "HOSPITAL OF THE UNIVERSITY OF PENNSYLVANIA"] },
  { id: "penn-presbyterian", state: "PA", nameMatch: ["PENN PRESBYTERIAN MEDICAL CENTER", "PRESBYTERIAN MEDICAL CENTER OF THE UNIVERSITY OF PENNSYLVANIA"] },
  { id: "temple-university-hospital", state: "PA", nameMatch: ["TEMPLE UNIVERSITY HOSPITAL"] },
  { id: "chop", state: "PA", nameMatch: ["CHILDREN'S HOSPITAL OF PHILADELPHIA"] },
  { id: "jefferson-einstein-philadelphia", state: "PA", nameMatch: ["JEFFERSON EINSTEIN PHILADELPHIA HOSPITAL", "EINSTEIN MEDICAL CENTER PHILADELPHIA", "ALBERT EINSTEIN MEDICAL CENTER"] },
  // ── Round 4: Phoenix ─────────────────────────────────────────────────
  { id: "banner-university-phoenix", state: "AZ", nameMatch: ["BANNER - UNIVERSITY MEDICAL CENTER PHOENIX", "BANNER UNIVERSITY MEDICAL CENTER PHOENIX", "GOOD SAMARITAN MEDICAL CENTER"] },
  { id: "st-josephs-phoenix", state: "AZ", nameMatch: ["ST. JOSEPH'S HOSPITAL AND MEDICAL CENTER", "ST JOSEPH'S HOSPITAL AND MEDICAL CENTER"] },
  { id: "phoenix-childrens", state: "AZ", nameMatch: ["PHOENIX CHILDREN'S HOSPITAL"] },
  { id: "honorhealth-deer-valley", state: "AZ", nameMatch: ["HONORHEALTH DEER VALLEY MEDICAL CENTER", "JOHN C LINCOLN DEER VALLEY HOSPITAL"] },
  // ── Round 4: Atlanta ─────────────────────────────────────────────────
  { id: "emory-university-hospital", state: "GA", nameMatch: ["EMORY UNIVERSITY HOSPITAL"] },
  { id: "piedmont-atlanta", state: "GA", nameMatch: ["PIEDMONT ATLANTA HOSPITAL", "PIEDMONT HOSPITAL"] },
  { id: "grady-memorial", state: "GA", nameMatch: ["GRADY MEMORIAL HOSPITAL"] },
  { id: "wellstar-kennestone", state: "GA", nameMatch: ["WELLSTAR KENNESTONE REGIONAL MEDICAL CENTER", "WELLSTAR KENNESTONE", "KENNESTONE"] },
  // ── Round 4: Boston ──────────────────────────────────────────────────
  { id: "brigham-and-womens", state: "MA", nameMatch: ["BRIGHAM AND WOMEN'S HOSPITAL"] },
  { id: "bidmc", state: "MA", nameMatch: ["BETH ISRAEL DEACONESS MEDICAL CENTER"] },
  { id: "boston-childrens", state: "MA", nameMatch: ["BOSTON CHILDREN'S HOSPITAL", "CHILDREN'S HOSPITAL BOSTON"] },
  { id: "lahey-burlington", state: "MA", nameMatch: ["LAHEY HOSPITAL", "LAHEY CLINIC HOSPITAL"] },
  // ── Round 4: Seattle ─────────────────────────────────────────────────
  { id: "swedish-first-hill", state: "WA", nameMatch: ["SWEDISH MEDICAL CENTER", "SWEDISH FIRST HILL"] },
  { id: "virginia-mason", state: "WA", nameMatch: ["VIRGINIA MASON MEDICAL CENTER"] },
  // ── Round 5: LA gap fill ─────────────────────────────────────────────
  { id: "whittier-hospital", state: "CA", nameMatch: ["WHITTIER HOSPITAL MEDICAL CENTER"] },
  { id: "san-gabriel-valley-mc", state: "CA", nameMatch: ["SAN GABRIEL VALLEY MEDICAL CENTER"] },
  { id: "garfield-medical-center", state: "CA", nameMatch: ["GARFIELD MEDICAL CENTER"] },
  { id: "greater-el-monte", state: "CA", nameMatch: ["GREATER EL MONTE COMMUNITY HOSPITAL"] },
  { id: "monterey-park-hospital", state: "CA", nameMatch: ["MONTEREY PARK HOSPITAL"] },
  { id: "providence-tarzana", state: "CA", nameMatch: ["PROVIDENCE CEDARS SINAI TARZANA", "PROVIDENCE TARZANA"] },
  { id: "long-beach-memorial", state: "CA", cityContains: "LONG BEACH", nameMatch: ["LONG BEACH MEMORIAL MEDICAL CENTER", "MEMORIALCARE LONG BEACH"] },
  { id: "miller-childrens", state: "CA", cityContains: "LONG BEACH", nameMatch: ["MILLER CHILDREN", "MEMORIAL CARE MILLER"] },
  { id: "coast-plaza", state: "CA", cityContains: "NORWALK", nameMatch: ["COAST PLAZA HOSPITAL", "COAST PLAZA DOCTORS HOSPITAL"] },
  { id: "adventist-white-memorial-montebello", state: "CA", cityContains: "MONTEBELLO", nameMatch: ["WHITE MEMORIAL", "ADVENTIST HEALTH WHITE MEMORIAL"] },
  { id: "adventist-glendale", state: "CA", nameMatch: ["ADVENTIST HEALTH GLENDALE", "GLENDALE ADVENTIST"] },
  { id: "adventist-simi-valley", state: "CA", cityContains: "SIMI", nameMatch: ["SIMI VALLEY ADVENTIST", "ADVENTIST HEALTH SIMI"] },
  { id: "hoag-orthopedic-institute", state: "CA", nameMatch: ["HOAG ORTHOPEDIC INSTITUTE"] },
  { id: "south-coast-global-mc", state: "CA", cityContains: "SANTA ANA", nameMatch: ["SOUTH COAST GLOBAL MEDICAL CENTER"] },
  // ── Round 6: 7-metro expansion ──
  { id: "henry-ford-detroit", state: "MI", cityContains: "DETROIT", nameMatch: ["HENRY FORD HEALTH HOSPITAL", "HENRY FORD HOSPITAL"] },
  { id: "henry-ford-west-bloomfield", state: "MI", nameMatch: ["HENRY FORD HEALTH WEST BLOOMFIELD HOSPITAL", "HENRY FORD WEST BLOOMFIELD"] },
  { id: "dmc-detroit-receiving", state: "MI", nameMatch: ["DETROIT RECEIVING HOSPITAL"] },
  { id: "dmc-harper-university", state: "MI", nameMatch: ["HARPER UNIVERSITY HOSPITAL"] },
  { id: "dmc-sinai-grace", state: "MI", nameMatch: ["SINAI-GRACE HOSPITAL", "SINAI GRACE HOSPITAL"] },
  { id: "childrens-hospital-michigan", state: "MI", nameMatch: ["CHILDREN'S HOSPITAL OF MICHIGAN", "CHILDRENS HOSPITAL OF MICHIGAN"] },
  { id: "corewell-royal-oak", state: "MI", nameMatch: ["BEAUMONT HOSPITAL ROYAL OAK", "BEAUMONT HOSPITAL - ROYAL OAK", "WILLIAM BEAUMONT HOSPITAL"] },
  { id: "corewell-troy", state: "MI", nameMatch: ["BEAUMONT HOSPITAL, TROY", "BEAUMONT HOSPITAL TROY", "BEAUMONT TROY"] },
  { id: "corewell-farmington-hills", state: "MI", nameMatch: ["BEAUMONT HOSPITAL - FARMINGTON HILLS", "BEAUMONT FARMINGTON"] },
  { id: "corewell-dearborn", state: "MI", nameMatch: ["BEAUMONT HOSPITAL - DEARBORN", "BEAUMONT DEARBORN", "OAKWOOD HOSPITAL"] },
  { id: "upmc-presbyterian-shadyside", state: "PA", nameMatch: ["UPMC PRESBYTERIAN SHADYSIDE", "UPMC PRESBYTERIAN"] },
  { id: "upmc-magee-womens", state: "PA", nameMatch: ["MAGEE-WOMENS HOSPITAL", "MAGEE WOMENS HOSPITAL", "MAGEE-WOMEN'S"] },
  { id: "upmc-childrens-pittsburgh", state: "PA", nameMatch: ["CHILDREN'S HOSPITAL OF PITTSBURGH", "UPMC CHILDREN'S"] },
  { id: "ahn-allegheny-general", state: "PA", nameMatch: ["ALLEGHENY GENERAL HOSPITAL"] },
  { id: "ahn-forbes", state: "PA", nameMatch: ["FORBES HOSPITAL", "FORBES REGIONAL HOSPITAL"] },
  { id: "ahn-jefferson-regional", state: "PA", nameMatch: ["JEFFERSON REGIONAL MEDICAL CENTER", "JEFFERSON HOSPITAL"] },
  { id: "tampa-general", state: "FL", cityContains: "TAMPA", nameMatch: ["TAMPA GENERAL HOSPITAL"] },
  { id: "baycare-st-josephs-tampa", state: "FL", cityContains: "TAMPA", nameMatch: ["ST JOSEPHS HOSPITAL", "ST. JOSEPH'S HOSPITAL"] },
  { id: "baycare-morton-plant", state: "FL", nameMatch: ["MORTON PLANT HOSPITAL"] },
  { id: "moffitt-cancer-center", state: "FL", nameMatch: ["H LEE MOFFITT", "MOFFITT CANCER CENTER"] },
  // CMS rates the Jackson Health System parent CCN, not individual campuses.
  // All three Jackson hospitals share the system-level rating.
  { id: "jackson-memorial", state: "FL", cityContains: "MIAMI", nameMatch: ["JACKSON HEALTH SYSTEM", "JACKSON MEMORIAL HOSPITAL"] },
  { id: "jackson-north", state: "FL", nameMatch: ["JACKSON HEALTH SYSTEM", "JACKSON NORTH MEDICAL CENTER"] },
  { id: "jackson-south", state: "FL", cityContains: "MIAMI", nameMatch: ["JACKSON HEALTH SYSTEM", "JACKSON SOUTH MEDICAL CENTER"] },
  { id: "baptist-hospital-miami", state: "FL", nameMatch: ["BAPTIST HOSPITAL OF MIAMI"] },
  { id: "baptist-doctors-coral-gables", state: "FL", cityContains: "CORAL GABLES", nameMatch: ["DOCTORS HOSPITAL"] },
  { id: "baptist-homestead", state: "FL", nameMatch: ["HOMESTEAD HOSPITAL"] },
  { id: "nicklaus-childrens", state: "FL", nameMatch: ["NICKLAUS CHILDREN'S", "MIAMI CHILDREN'S"] },
  { id: "dell-seton-uta", state: "TX", nameMatch: ["DELL SETON  MED CENTER", "DELL SETON MED CENTER", "DELL SETON MEDICAL CENTER"] },
  { id: "ascension-seton-medical-austin", state: "TX", nameMatch: ["ASCENSION SETON MEDICAL CENTER AUSTIN", "SETON MEDICAL CENTER AUSTIN"] },
  { id: "dell-childrens-austin", state: "TX", nameMatch: ["DELL CHILDREN'S MEDICAL CENTER", "CHILDREN'S HOSPITAL OF AUSTIN"] },
  { id: "ascension-seton-northwest", state: "TX", nameMatch: ["ASCENSION SETON NORTHWEST", "SETON NORTHWEST"] },
  { id: "st-davids-medical-center", state: "TX", cityContains: "AUSTIN", nameMatch: ["ST DAVID'S MEDICAL CENTER", "ST. DAVID'S MEDICAL CENTER"] },
  // CMS lists this hospital as just "NORTH AUSTIN MEDICAL CENTER" without the
  // St. David's brand prefix. Same with Round Rock.
  { id: "st-davids-north-austin", state: "TX", cityContains: "AUSTIN", nameMatch: ["NORTH AUSTIN MEDICAL CENTER"] },
  { id: "st-davids-round-rock", state: "TX", cityContains: "ROUND ROCK", nameMatch: ["ROUND ROCK MEDICAL CENTER"] },
  { id: "heart-hospital-austin", state: "TX", nameMatch: ["HEART HOSPITAL OF AUSTIN"] },
  { id: "stanford-health-care", state: "CA", nameMatch: ["STANFORD HEALTH CARE", "STANFORD HOSPITAL"] },
  { id: "stanford-tri-valley", state: "CA", nameMatch: ["STANFORD HEALTH CARE TRI-VALLEY", "VALLEYCARE MEDICAL CENTER"] },
  { id: "kaiser-oakland", state: "CA", cityContains: "OAKLAND", nameMatch: ["KAISER FOUNDATION HOSPITAL - OAKLAND", "KAISER PERMANENTE OAKLAND"] },
  { id: "kaiser-redwood-city", state: "CA", cityContains: "REDWOOD CITY", nameMatch: ["KAISER FOUNDATION HOSPITAL - REDWOOD CITY", "KAISER PERMANENTE REDWOOD CITY"] },
  { id: "john-muir-walnut-creek", state: "CA", cityContains: "WALNUT CREEK", nameMatch: ["JOHN MUIR MEDICAL CENTER", "JOHN MUIR HEALTH WALNUT CREEK"] },
  { id: "john-muir-concord", state: "CA", cityContains: "CONCORD", nameMatch: ["JOHN MUIR MEDICAL CENTER - CONCORD CAMPUS", "JOHN MUIR HEALTH CONCORD"] },
  { id: "ucsd-health", state: "CA", nameMatch: ["UCSD MEDICAL CENTER", "UC SAN DIEGO HEALTH", "UC SAN DIEGO MEDICAL"] },
  { id: "sharp-memorial", state: "CA", nameMatch: ["SHARP MEMORIAL HOSPITAL"] },
  { id: "sharp-grossmont", state: "CA", nameMatch: ["SHARP GROSSMONT HOSPITAL", "GROSSMONT HOSPITAL"] },
  { id: "scripps-la-jolla", state: "CA", nameMatch: ["SCRIPPS MEMORIAL HOSPITAL LA JOLLA"] },
  { id: "scripps-mercy-sd", state: "CA", cityContains: "SAN DIEGO", nameMatch: ["SCRIPPS MERCY HOSPITAL"] },
  { id: "rady-childrens", state: "CA", nameMatch: ["RADY CHILDREN'S HOSPITAL", "CHILDREN'S HOSPITAL - SAN DIEGO"] },

  // Round 8: Flagship academic medical centers + new metros
  { id: "johns-hopkins", state: "MD", cityContains: "BALTIMORE", nameMatch: ["JOHNS HOPKINS HOSPITAL", "THE JOHNS HOPKINS HOSPITAL"] },
  { id: "ummc-baltimore", state: "MD", cityContains: "BALTIMORE", nameMatch: ["UNIVERSITY OF MARYLAND MEDICAL CENTER"] },
  { id: "duke-university-hospital", state: "NC", cityContains: "DURHAM", nameMatch: ["DUKE UNIVERSITY HOSPITAL", "DUKE UNIV HOSPITAL"] },
  { id: "unc-hospitals", state: "NC", cityContains: "CHAPEL HILL", nameMatch: ["UNC HOSPITALS", "UNIVERSITY OF NORTH CAROLINA HOSPITAL"] },
  { id: "ucsf-medical-center", state: "CA", cityContains: "SAN FRANCISCO", nameMatch: ["UCSF MEDICAL CENTER", "UNIVERSITY OF CALIFORNIA SAN FRANCISCO"] },
  { id: "umich-health", state: "MI", cityContains: "ANN ARBOR", nameMatch: ["UNIVERSITY OF MICHIGAN HOSPITALS", "MICHIGAN MEDICINE", "UNIVERSITY OF MICHIGAN HEALTH"] },
  { id: "yale-new-haven", state: "CT", cityContains: "NEW HAVEN", nameMatch: ["YALE NEW HAVEN HOSPITAL", "YALE-NEW HAVEN HOSPITAL"] },
  { id: "penn-hup", state: "PA", cityContains: "PHILADELPHIA", nameMatch: ["HOSPITAL OF THE UNIVERSITY OF PENNSYLVANIA"] },
  { id: "uchealth-univ-colorado", state: "CO", nameMatch: ["UNIVERSITY OF COLORADO HOSPITAL"] },
  { id: "atrium-carolinas-medical-center", state: "NC", cityContains: "CHARLOTTE", nameMatch: ["CAROLINAS MEDICAL CENTER", "ATRIUM HEALTH CAROLINAS"] },
  { id: "fairview-univ-minnesota", state: "MN", cityContains: "MINNEAPOLIS", nameMatch: ["UNIVERSITY OF MINNESOTA MEDICAL CENTER", "M HEALTH FAIRVIEW", "FAIRVIEW UNIVERSITY"] },
  { id: "ohsu", state: "OR", cityContains: "PORTLAND", nameMatch: ["OREGON HEALTH AND SCIENCE UNIVERSITY", "OHSU HOSPITAL"] },
  { id: "univ-utah-hospital", state: "UT", cityContains: "SALT LAKE CITY", nameMatch: ["UNIVERSITY OF UTAH HOSPITAL", "UNIVERSITY OF UTAH"] },
  { id: "intermountain-medical-center", state: "UT", nameMatch: ["INTERMOUNTAIN MEDICAL CENTER"] },
];

// CMS provider-data API caps page size at 500. Paginate to get the full ~5,400-hospital
// dataset. The conditions[][property] filter syntax CMS documents returns 0 rows when
// hit; client-side filtering by state is reliable and the whole dataset fits in memory.
const CMS_API = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";
const PAGE_SIZE = 500;

async function fetchPageWithRetry(offset, attempt = 0) {
  const url = `${CMS_API}?limit=${PAGE_SIZE}&offset=${offset}`;
  const res = await fetch(url, { headers: { "User-Agent": "Hospital-Prices-Research/1.0" } });
  if (res.status === 503 && attempt < 5) {
    const delay = 1000 * Math.pow(2, attempt);
    console.log(`  offset=${offset}: 503, retrying in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    return fetchPageWithRetry(offset, attempt + 1);
  }
  if (!res.ok) throw new Error(`CMS API page offset=${offset}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchAllHospitals() {
  const all = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const data = await fetchPageWithRetry(offset);
    const page = data.results || [];
    if (page.length === 0) break;
    all.push(...page);
    total = data.count ?? all.length;
    offset += page.length;
    // Polite delay between pages.
    if (offset < total) await new Promise((r) => setTimeout(r, 250));
  }
  return all;
}

function findMatch(hospitals, nameMatchList, cityContains) {
  // If a cityContains filter is set, only consider hospitals whose citytown matches.
  // This guards against name collisions across CA Providence facilities, etc.
  const candidates = cityContains
    ? hospitals.filter((h) => (h.citytown || "").toUpperCase().includes(cityContains.toUpperCase()))
    : hospitals;
  for (const fragment of nameMatchList) {
    const upper = fragment.toUpperCase();
    const found = candidates.find((h) => (h.facility_name || "").toUpperCase().includes(upper));
    if (found) return { match: found, matchedOn: fragment };
  }
  return null;
}

function pickRating(raw) {
  if (raw == null || raw === "Not Available" || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function pickComparison(raw) {
  if (raw == null || raw === "Not Available" || raw === "") return null;
  return raw;
}

// CMS used to publish "Above/Same/Below the National Average" strings per group.
// They now publish raw counts of measures classified as better/no_different/worse.
// Derive a single human-readable signal from those counts.
function deriveSignal(better, worse) {
  const b = Number(better);
  const w = Number(worse);
  if (!Number.isFinite(b) && !Number.isFinite(w)) return null;
  if (b > w) return "above_average";
  if (b < w) return "below_average";
  return "average";
}

async function main() {
  console.log("fetching full CMS Hospital Care Compare dataset...");
  const allHospitals = await fetchAllHospitals();
  console.log(`got ${allHospitals.length} hospitals\n`);

  const byState = new Map();
  for (const h of allHospitals) {
    const s = h.state;
    if (!byState.has(s)) byState.set(s, []);
    byState.get(s).push(h);
  }

  const ratings = {};

  for (const lookup of HOSPITAL_LOOKUPS) {
    const hospitals = byState.get(lookup.state) || [];
    const result = findMatch(hospitals, lookup.nameMatch, lookup.cityContains);
    if (!result) {
      console.warn(`  ${lookup.id.padEnd(28)} NO MATCH in ${lookup.state}`);
      ratings[lookup.id] = { matched: false };
      continue;
    }

    const m = result.match;
    const overall = pickRating(m.hospital_overall_rating);
    ratings[lookup.id] = {
      matched: true,
      matched_on: result.matchedOn,
      cms_facility_id: m.facility_id || null,
      facility_name: m.facility_name || null,
      hospital_type: m.hospital_type || null,
      ownership: m.hospital_ownership || null,
      address: m.address || null,
      city: m.citytown || m.city_town || m.city || null,
      state: m.state || null,
      zip: m.zip_code || m.zip || null,
      phone: m.telephone_number || null,
      overall_rating: overall,
      mortality: deriveSignal(m.count_of_mort_measures_better, m.count_of_mort_measures_worse),
      safety_of_care: deriveSignal(m.count_of_safety_measures_better, m.count_of_safety_measures_worse),
      readmission: deriveSignal(m.count_of_readm_measures_better, m.count_of_readm_measures_worse),
      raw_measure_counts: {
        mortality: {
          better: Number(m.count_of_mort_measures_better) || 0,
          no_different: Number(m.count_of_mort_measures_no_different) || 0,
          worse: Number(m.count_of_mort_measures_worse) || 0,
        },
        safety: {
          better: Number(m.count_of_safety_measures_better) || 0,
          no_different: Number(m.count_of_safety_measures_no_different) || 0,
          worse: Number(m.count_of_safety_measures_worse) || 0,
        },
        readmission: {
          better: Number(m.count_of_readm_measures_better) || 0,
          no_different: Number(m.count_of_readm_measures_no_different) || 0,
          worse: Number(m.count_of_readm_measures_worse) || 0,
        },
      },
      cms_compare_url: m.facility_id
        ? `https://www.medicare.gov/care-compare/details/hospital/${m.facility_id}`
        : null,
    };
    console.log(
      `  ${lookup.id.padEnd(28)} ${overall !== null ? overall + " stars" : "no overall rating"}   (${m.facility_name})`,
    );
  }

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        as_of: new Date().toISOString().slice(0, 10),
        source: "CMS Hospital Care Compare (data.cms.gov dataset xubh-q36u)",
        ratings,
      },
      null,
      2,
    ),
  );

  console.log(`\nwrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
