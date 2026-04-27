// Download hospital MRF files to disk.
// Run: node scripts/download-mrfs.mjs

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const HOSPITALS = [
  {
    id: "cedars-sinai",
    name: "Cedars-Sinai Medical Center",
    url: "https://www.cedars-sinai.org/content/dam/cedars-sinai/billing-insurance/documents/951644600_CEDARS-SINAI-MEDICAL-CENTER_standardcharges.json",
    ext: "json",
  },
  {
    id: "ucla-ronald-reagan",
    name: "UCLA Ronald Reagan Medical Center",
    url: "https://www.uclahealth.org/sites/default/files/cms-hpt/956006143_ronald-reagan-ucla-medical-center_standardcharges.json?refresh=2026",
    ext: "json",
  },
  {
    id: "providence-st-joseph",
    name: "Providence Saint Joseph Medical Center",
    url: "https://pricetransparency.providence.org/socal/live/951675600_providence-st-joseph-medical-center_standardcharges.json",
    ext: "json",
  },
  {
    id: "houston-methodist",
    name: "Houston Methodist Hospital",
    url: "https://www.houstonmethodist.org/-/media/files/patient-resources/74110155_the-methodist-hospital_standardcharges.ashx",
    ext: "json",
  },
  {
    id: "cleveland-clinic",
    name: "Cleveland Clinic",
    url: "https://mrf.panaceainc.com/Download.aspx?org=clevelandclinic&loc=clevelandclinic&ref=",
    ext: "zip",
  },
  {
    id: "nyu-langone-tisch",
    name: "NYU Langone Tisch Hospital",
    url: "https://standard-charges-prod.s3.amazonaws.com/pricing_files/133971298-1801992631_nyu-langone-tisch_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "advocate-christ",
    name: "Advocate Christ Medical Center",
    url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/11263/362169147_advocate-christ-medical-center_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "mass-general",
    name: "Massachusetts General Hospital",
    url: "https://www.massgeneralbrigham.org/content/dam/mgb-global/en/price-transparency/042697983_Massachusetts-General-Hospital_StandardCharges.zip",
    ext: "zip",
  },
  {
    id: "medstar-georgetown",
    name: "MedStar Georgetown University Hospital",
    url: "https://www.medstarhealth.org/-/media/project/mho/medstar/billing-and-insurance/2026/522218584_medstar_georgetown_university_hospital_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "jefferson-abington",
    name: "Jefferson Abington Hospital",
    url: "https://use2webtechstgpricelist.blob.core.windows.net/pricelist/Complete%20File/231352152%20_jefferson-abington-hospital_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "emory-decatur",
    name: "Emory Decatur Hospital",
    url: "https://www.emoryhealthcare.org/-/media/Project/EH/Emory/ui/pricing-transparency/csv/2026/581966795_emory-decatur-hospital_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "honorhealth-osborn",
    name: "HonorHealth Scottsdale Osborn Medical Center",
    url: "https://www.honorhealth.com/sites/default/files/2023-12/860181654_honorhealthsomc_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "uchealth-memorial-central",
    name: "UCHealth Memorial Hospital Central",
    url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/8076/460796114-1144397134_uchmhs_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "seattle-childrens",
    name: "Seattle Children's Hospital",
    url: "https://www.seattlechildrens.org/globalassets/documents/for-patients-and-families/910564748_seattle-childrens-hospital_standardcharges.csv",
    ext: "csv",
  },
  {
    id: "vanderbilt-umc",
    name: "Vanderbilt University Medical Center",
    url: "https://finance.vumc.org/assets/pub/pt/352528741_vanderbilt-university-medical-center_standardcharges.json",
    ext: "json",
  },
  // ── LA-area expansion (round 3) ─────────────────────────────────────
  { id: "providence-st-johns-santa-monica", name: "Providence Saint John's Health Center (Santa Monica)", url: "https://pricetransparency.providence.org/socal/live/951684082_providence-st-johns-health-center_standardcharges.json", ext: "json" },
  { id: "usc-keck", name: "Keck Hospital of USC", url: "https://hospitalpricedisclosure.com/download.aspx?pi=5fSixiuBb0ZpZwZgOthF7A*-*", ext: "csv" },
  { id: "usc-norris", name: "USC Norris Cancer Hospital", url: "https://hospitalpricedisclosure.com/download.aspx?pi=ksKjyMbyRELl8UdC2a3rOg*-*", ext: "csv" },
  { id: "usc-verdugo-hills", name: "USC Verdugo Hills Hospital", url: "https://hospitalpricedisclosure.com/download.aspx?pi=h0rmgXMGiSXmDqPqnFmWhA*-*", ext: "csv" },
  { id: "usc-arcadia", name: "USC Arcadia Hospital", url: "https://www.keckmedicine.org/wp-content/uploads/2025/06/951643336_usc-arcadia-hospital_standardcharges.csv", ext: "csv" },
  { id: "hoag-newport", name: "Hoag Memorial Hospital Presbyterian", url: "https://downloads.ctfassets.net/8u2cuf59smsh/52tazi7symInZOZZ2g2eJU/a5edeceac81a9d8369ea9548032e2d42/951643327_hoag-memorial-hospital-presbyterian_standardcharges.csv", ext: "csv" },
  { id: "chla", name: "Children's Hospital Los Angeles", url: "https://www.chla.org/standard-charges/1/951690977_childrens-hospital-of-los-angeles_standardcharges.csv", ext: "csv" },
  { id: "kaiser-la-sunset", name: "Kaiser Permanente LA Medical Center (Sunset)", url: "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-los-angeles-medical-center-standard-charges-scal-en.csv", ext: "csv" },
  { id: "mlk-community", name: "MLK Community Hospital", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/7906/274658935_martin-luther-king%2C-jr-los-angeles-mlkla-healthcare-corporation_standardcharges.csv", ext: "csv" },
  { id: "olive-view-ucla", name: "Olive View-UCLA Medical Center", url: "https://file.lacounty.gov/SDSInter/dhs/1157355_956000927_OliveView-UCLAMedicalCenter_standardcharges.csv", ext: "csv" },
  { id: "harbor-ucla", name: "Harbor-UCLA Medical Center", url: "https://file.lacounty.gov/SDSInter/dhs/1157353_956000927_Harbor-UCLAMedicalCenter_standardcharges.csv", ext: "csv" },
  { id: "ucla-santa-monica", name: "UCLA Santa Monica Medical Center", url: "https://www.uclahealth.org/sites/default/files/cms-hpt/954541687_santa-monica-ucla-medical-center-and-orthopaedic-hospital_standardcharges.json", ext: "json" },
  { id: "torrance-memorial", name: "Torrance Memorial Medical Center", url: "https://www.torrancememorial.org/app/files/public/72290ad6-2a3d-4b7e-acf0-1daa4ba8ba5e/951644042_TORRANCE-MEMORIAL-MEDICAL-CENTER_standardcharges.csv", ext: "csv" },
  { id: "huntington-pasadena", name: "Huntington Hospital", url: "https://media.huntingtonhealth.org/951644036_HUNTINGTON-HOSPITAL_standardcharges.csv", ext: "csv" },
  { id: "cedars-sinai-marina-del-rey", name: "Cedars-Sinai Marina del Rey Hospital", url: "https://www.marinahospital.com/administration/media/files/201645949_CEDARS-SINAI-MARINA-HOSPITAL_standardcharges.csv", ext: "csv" },
  { id: "pomona-valley", name: "Pomona Valley Hospital Medical Center", url: "https://custom.pvhmc.org/CostEstimator/downloadable/Machine-Readable-File.csv", ext: "csv" },
  { id: "hollywood-presbyterian", name: "Hollywood Presbyterian Medical Center", url: "https://www.hollywoodpresbyterian.com/300284087_HOLLYWOOD-PRESBYTERIAN-MEDICAL-CENTER_STANDARDCHARGES.json", ext: "json" },
  { id: "st-francis-lynwood", name: "Saint Francis Medical Center (Lynwood)", url: "https://stfrancismedicalcenter.com/wp-content/uploads/2026/04/850737566_StFrancisMedicalCenter_standardcharges.JSON", ext: "json" },
  { id: "dignity-st-mary-long-beach", name: "St. Mary Medical Center (Long Beach)", url: "https://www.dignityhealth.org/content/dam/dignity-health/documents/mrf-json/southern-california/json/941196203_st-mary-medical-center-long-beach_standardcharges.json", ext: "json" },
  { id: "dignity-california-hospital", name: "California Hospital Medical Center", url: "https://www.dignityhealth.org/content/dam/dignity-health/documents/mrf-json/southern-california/json/815009488_california-hospital-medical-center_standardcharges.json", ext: "json" },
  { id: "dignity-northridge", name: "Northridge Hospital Medical Center", url: "https://www.dignityhealth.org/content/dam/dignity-health/documents/mrf-json/southern-california/json/815009488_northridge-hospital-medical-center_standardcharges.json", ext: "json" },
  { id: "dignity-glendale-memorial", name: "Glendale Memorial Hospital", url: "https://www.dignityhealth.org/content/dam/dignity-health/documents/mrf-json/southern-california/json/815009488_glendale-memorial-hospital-and-health-center_standardcharges.json", ext: "json" },
  // ── Round 4: NYC ─────────────────────────────────────────────────────
  { id: "mount-sinai-hospital", name: "Mount Sinai Hospital", url: "https://www.mountsinai.org/files/mrf/131624096_mount-sinai-hospital_standardcharges.json", ext: "json" },
  { id: "nyp-columbia", name: "NewYork-Presbyterian / Columbia & Weill Cornell", url: "https://nyp.widen.net/content/hisgjrgpuk/original/133957095_NewYork-Presbyterian-Hospital_standardcharges.json.zip?u=n8xzey&download=true", ext: "zip" },
  { id: "nyp-queens", name: "NewYork-Presbyterian Queens", url: "https://nyp.widen.net/content/nfagsjimrt/original/111839362_NewYork-Presbyterian-Queens_standardcharges.json.zip?u=n8xzey&download=true", ext: "zip" },
  { id: "msk-cancer-center", name: "Memorial Sloan Kettering Cancer Center", url: "https://www.mskcc.org/hpt/1/131924236_memorial-hospital-for-cancer-and-allied-diseases-nyc_standardcharges.json", ext: "json" },
  { id: "hss-main", name: "Hospital for Special Surgery", url: "https://d2cg6hcwj0g0z0.cloudfront.net/131624135-1598703019_ny-society-for-the-relief-of-ruptured-and-crippled-maintaing-the-hospital-for-special-surgery_standardcharges.json", ext: "json" },
  { id: "northwell-lij", name: "Northwell Long Island Jewish Medical Center", url: "https://www.northwell.edu/sites/northwell.edu/files/machine-readable-files/Long_Island_Jewish_Hospital_StandardCharges.zip", ext: "zip" },
  { id: "northwell-lenox-hill", name: "Lenox Hill Hospital (Northwell)", url: "https://www.northwell.edu/sites/northwell.edu/files/machine-readable-files/Lenox_Hill_Hospital_StandardCharges.zip", ext: "zip" },
  { id: "northwell-north-shore", name: "North Shore University Hospital (Northwell)", url: "https://www.northwell.edu/sites/northwell.edu/files/machine-readable-files/North_Shore_University_Hospital_StandardCharges.zip", ext: "zip" },
  { id: "northwell-staten-island", name: "Staten Island University Hospital (Northwell)", url: "https://www.northwell.edu/sites/northwell.edu/files/machine-readable-files/Staten_Island_University_Hospital_StandardCharges.zip", ext: "zip" },
  { id: "montefiore-medical-center", name: "Montefiore Medical Center", url: "https://assets.montefioreeinstein.org/patient-information/131740114_montefiore-medical-center_standardcharges.csv", ext: "csv" },
  // NYC H+H Panacea endpoints serve zip archives despite no .zip extension in the URL
  { id: "nychh-bellevue", name: "Bellevue Hospital Center", url: "https://nychh.pt.panaceainc.com/MRFDownload/nychh/bellevue", ext: "zip" },
  { id: "nychh-elmhurst", name: "Elmhurst Hospital Center", url: "https://nychh.pt.panaceainc.com/MRFDownload/nychh/elmhurst", ext: "zip" },
  { id: "nychh-jacobi", name: "Jacobi Medical Center", url: "https://nychh.pt.panaceainc.com/MRFDownload/nychh/jacobi", ext: "zip" },
  { id: "nychh-kings-county", name: "Kings County Hospital Center", url: "https://nychh.pt.panaceainc.com/MRFDownload/nychh/kings", ext: "zip" },
  { id: "maimonides-medical-center", name: "Maimonides Medical Center", url: "https://cleverleypteusstatic.blob.core.windows.net/readable/111635081_maimonides-medical-center_standardcharges.json", ext: "json" },
  // ── Round 4: Chicago ─────────────────────────────────────────────────
  { id: "northwestern-memorial", name: "Northwestern Memorial Hospital", url: "https://www.nm.org/site_data/370960170_northwestern-memorial-hospital_standardcharges.json", ext: "json" },
  { id: "rush-university", name: "Rush University Medical Center", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbRUMCCHICAGOIL&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "uchicago-medical-center", name: "University of Chicago Medical Center", url: "https://edge.sitecorecloud.io/unichicagomc-81nbqnb3/media/files/pricing-transparency/2026/363488183_the-university-of-chicago-medical-center_standardcharges.json", ext: "json" },
  { id: "loyola-medical-center", name: "Loyola University Medical Center", url: "https://trinityhealth.pt.panaceainc.com/MRFDownload/trinityhealth/loyolauniversitycenter", ext: "zip" },
  { id: "lurie-childrens", name: "Ann & Robert H. Lurie Children's Hospital", url: "https://www.luriechildrens.org/globalassets/media/pages/patients--visitors/billing--financial-assistance/36-2170833_ann_and_robert_h_lurie_childrens_hospital_of_chicago_standardcharges.csv", ext: "csv" },
  { id: "stroger-cook-county", name: "John H. Stroger Jr. Hospital (Cook County)", url: "https://cookcountyhealth.org/wp-content/uploads/366006541_JOHN-H-STROGER-JR-HOSP-OF-COOK-COUNTY-PROVIDENT-HOSPITAL_standardcharges-2.csv", ext: "csv" },
  { id: "advocate-lutheran-general", name: "Advocate Lutheran General Hospital", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/11268/362169147_advocate-lutheran-general-hospital_standardcharges.csv", ext: "csv" },
  { id: "advocate-illinois-masonic", name: "Advocate Illinois Masonic Medical Center", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/11267/363196629_advocate-illinois-masonic-medical-center_standardcharges.csv", ext: "csv" },
  { id: "endeavor-evanston", name: "Endeavor Health Evanston Hospital", url: "https://www.endeavorhealth.org/362167060_endeavor-health-evanston-hospital_standardcharges.json", ext: "json" },
  // ── Round 4: Houston ─────────────────────────────────────────────────
  { id: "md-anderson", name: "UT MD Anderson Cancer Center", url: "https://www.mdanderson.org/content/dam/mdanderson/documents/patients-and-family/becoming-our-patient/planning-for-care/74-6001118_MD%20Anderson%20Cancer%20Center_StandardCharges.csv", ext: "csv" },
  { id: "memorial-hermann-tmc", name: "Memorial Hermann-Texas Medical Center", url: "https://memorialhermann.org/-/media/memorial-hermann/org/files/patients-and-visitors/cms-standard-hospital-charges/741152597_memorial-hermann-texas-medical-center_standardcharges.ashx", ext: "csv" },
  { id: "memorial-hermann-southwest", name: "Memorial Hermann Southwest Hospital", url: "https://memorialhermann.org/-/media/memorial-hermann/org/files/patients-and-visitors/cms-standard-hospital-charges/741152597_memorial-hermann-southwest-hospital_standardcharges.ashx", ext: "csv" },
  { id: "memorial-hermann-memorial-city", name: "Memorial Hermann Memorial City Medical Center", url: "https://memorialhermann.org/-/media/memorial-hermann/org/files/patients-and-visitors/cms-standard-hospital-charges/741152597_memorial-hermann-memorial-city-medical-center_standardcharges.ashx", ext: "csv" },
  { id: "memorial-hermann-sugar-land", name: "Memorial Hermann Sugar Land Hospital", url: "https://memorialhermann.org/-/media/memorial-hermann/org/files/patients-and-visitors/cms-standard-hospital-charges/741152597_memorial-hermann-sugar-land-hospital_standardcharges.ashx", ext: "csv" },
  { id: "baylor-st-lukes-tmc", name: "Baylor St. Luke's Medical Center", url: "https://www.commonspirit.org/content/dam/commonspiritorg/en/bslmc/soho/finance/price-transparency/741161938_chi-st-lukes-health-baylor-st-lukes-medical-center_standardcharges.json", ext: "json" },
  { id: "texas-childrens", name: "Texas Children's Hospital", url: "https://www.texaschildrens.org/sites/tc/files/uploads/documents/741100555_texas-childrens-hospital_standardcharges.zip", ext: "zip" },
  { id: "harris-health-ben-taub", name: "Ben Taub Hospital", url: "https://www.harrishealth.org/SiteCollectionDocuments/financials/charge%20description%20master/741536936_HarrisHealthBenTaubHospital_StandardCharges.zip", ext: "zip" },
  { id: "hca-houston-medical-center", name: "HCA Houston Healthcare Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/82-1635538_HCA-HOUSTON-HEALTHCARE-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  { id: "hca-houston-kingwood", name: "HCA Houston Healthcare Kingwood", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/62-1619857_HCA-HOUSTON-HEALTHCARE-KINGWOOD_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  // ── Round 4: Dallas / Fort Worth ─────────────────────────────────────
  { id: "ut-southwestern", name: "UT Southwestern Medical Center", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/10906/753175630_the-university-of-texas-southwestern-medical-center-at-dallas_standardcharges.csv", ext: "csv" },
  { id: "baylor-university-medical-center", name: "Baylor University Medical Center", url: "https://wadcdn.azureedge.net/bswhealth/com/siteassets/pricing-transparency/751837454_baylor-university-medical-center_standardcharges.csv", ext: "csv" },
  { id: "methodist-dallas", name: "Methodist Dallas Medical Center", url: "https://www.methodisthealthsystem.org/sites/default/files/Price%20Transparency/750800661_MethodistDallasMedicalCenter_standardcharges.zip", ext: "zip" },
  { id: "texas-health-presbyterian-dallas", name: "Texas Health Presbyterian Hospital Dallas", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/13790/751047527_texas-health-presbyterian-hospital-dallas_standardcharges.csv", ext: "csv" },
  { id: "childrens-medical-center-dallas", name: "Children's Medical Center Dallas", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/10174/750800628-1194743013_childrens-medical-center_standardcharges.csv", ext: "csv" },
  { id: "parkland-memorial", name: "Parkland Memorial Hospital", url: "https://www.parklandhealth.org/Uploads/Public/Documents/PDFs/Reports-Discolures/2026/price%20transparency/756004221_parkland-health_standardcharges.zip", ext: "zip" },
  // ── Round 4: Philadelphia ────────────────────────────────────────────
  { id: "hup-penn", name: "Hospital of the University of Pennsylvania", url: "https://www1.pennmedicine.org/images/pricing/231352685_the-trustees-of-the-university-of-pennsylvania-dba-the-hospital-of-the-univer_standardcharges.csv", ext: "csv" },
  { id: "penn-presbyterian", name: "Penn Presbyterian Medical Center", url: "https://www1.pennmedicine.org/images/pricing/232810852_Presbyterian-Medical-Center-of-the-University-of-Pennsylvania-Health-System-d_standardcharges.csv", ext: "csv" },
  { id: "temple-university-hospital", name: "Temple University Hospital", url: "https://www.templehealth.org/sites/default/files/file/2025-04/232825878_Temple_University_Main_standardcharges.csv", ext: "csv" },
  { id: "chop", name: "Children's Hospital of Philadelphia", url: "https://media.chop.edu/data/files/finance/23-1352166_ChildrensHospitalofPhiladelphia_standardcharges.csv", ext: "csv" },
  { id: "jefferson-einstein-philadelphia", name: "Jefferson Einstein Philadelphia", url: "https://use2webtechstgpricelist.blob.core.windows.net/pricelist/Complete%20File/231396794_jefferson-einstein-philadelphia-hospital_standardcharges.csv", ext: "csv" },
  // ── Round 4: Phoenix ─────────────────────────────────────────────────
  { id: "banner-university-phoenix", name: "Banner - University Medical Center Phoenix", url: "https://images.pricetransparency.healthcare/public-mrfs/banner/270036499_banner-university-medical-center-phoenix_standardcharges.csv", ext: "csv" },
  { id: "st-josephs-phoenix", name: "St. Joseph's Hospital and Medical Center", url: "https://www.dignityhealth.org/content/dam/dignity-health/documents/mrf-json/southwest/json/941196203_st-josephs-hospital-and-medical-center_standardcharges.json", ext: "json" },
  { id: "phoenix-childrens", name: "Phoenix Children's Hospital", url: "https://phoenixchildrens.pt.panaceainc.com/MRFDownload/phoenixchildrens/phoenixchildrens", ext: "zip" },
  { id: "honorhealth-deer-valley", name: "HonorHealth Deer Valley Medical Center", url: "https://www.honorhealth.com/sites/default/files/2023-12/860181654_honorhealthdvmc_standardcharges.csv", ext: "csv" },
  // ── Round 4: Atlanta ─────────────────────────────────────────────────
  { id: "emory-university-hospital", name: "Emory University Hospital", url: "https://www.emoryhealthcare.org/-/media/Project/EH/Emory/ui/pricing-transparency/csv/2026/580566256_emory-university-hospital_standardcharges.csv", ext: "csv" },
  { id: "piedmont-atlanta", name: "Piedmont Atlanta Hospital", url: "https://www.piedmont.org/-/media/files/patients-and-visitors/price-estimates/price-estimates-2026/580566213_piedmont-atlanta-hospital_standardcharges.zip", ext: "zip" },
  { id: "grady-memorial", name: "Grady Memorial Hospital", url: "https://www.gradyhealth.org/files/263037695_GradyMemorialHospitalCorporation_standardcharges.csv.zip", ext: "zip" },
  { id: "wellstar-kennestone", name: "WellStar Kennestone Hospital", url: "https://www.wellstar.org/wellstar-kennestone-hospital_standard-charges", ext: "csv" },
  // ── Round 4: Boston ──────────────────────────────────────────────────
  { id: "brigham-and-womens", name: "Brigham and Women's Hospital", url: "https://www.massgeneralbrigham.org/content/dam/mgb-global/en/price-transparency/042312909_Brigham-and-Womens-Hospital_StandardCharges.zip", ext: "zip" },
  { id: "bidmc", name: "Beth Israel Deaconess Medical Center", url: "https://bidmc.org/042103881_beth-israel-deaconess-medical-center_standardcharges.json", ext: "json" },
  { id: "boston-childrens", name: "Boston Children's Hospital", url: "https://www.childrenshospital.org/sites/default/files/cms-hpt/comp-2026/04-2774441_Boston-Childrens-Longwood_StandardCharges.json", ext: "json" },
  { id: "lahey-burlington", name: "Lahey Hospital & Medical Center", url: "https://www.lahey.org/042704686_lahey-hospital-medical-center-burlington_standardcharges.json", ext: "json" },
  // ── Round 4: Seattle ─────────────────────────────────────────────────
  { id: "swedish-first-hill", name: "Swedish Medical Center First Hill", url: "https://pricetransparency.providence.org/swedish/live/910433740_swedish-medical-center_standardcharges.json", ext: "json" },
  { id: "virginia-mason", name: "Virginia Mason Medical Center", url: "https://www.vmfh.org/content/dam/vmfhorg/documents/price-transparency/910565539_virginiamason_standardcharges.csv", ext: "csv" },  // ── Round 5: LA gap fill (community hospitals via AHMC, MemorialCare, Pipeline, Adventist) ─
  { id: "whittier-hospital", name: "Whittier Hospital Medical Center", url: "https://www.ahmchealth.com/docs/2026_PricingTransparency-Whittier_Hosp-3256-20260317233544.csv", ext: "csv" },
  { id: "san-gabriel-valley-mc", name: "San Gabriel Valley Medical Center", url: "https://www.ahmchealth.com/docs/PricingTransparency-San_Gabriel_Valley_Medical_Center-3324-20260326210352.csv", ext: "csv" },
  { id: "garfield-medical-center", name: "Garfield Medical Center", url: "https://www.ahmchealth.com/docs/PricingTransparency-Garfield_Medical_Ctr-3221-20260312022710_20260317_final.csv", ext: "csv" },
  { id: "greater-el-monte", name: "Greater El Monte Community Hospital", url: "https://www.ahmchealth.com/docs/PricingTransparency-Greater_El_Monte_Community_Hosp-2026.csv", ext: "csv" },
  { id: "monterey-park-hospital", name: "Monterey Park Hospital", url: "https://www.ahmchealth.com/docs/PricingTransparencyMPH.csv", ext: "csv" },
  { id: "providence-tarzana", name: "Providence Cedars-Sinai Tarzana Medical Center", url: "https://pricetransparency.providence.org/socal/live/833972614_providence-cedars-sinai-tarzana-medical-center_standardcharges.json", ext: "json" },
  { id: "long-beach-memorial", name: "MemorialCare Long Beach Medical Center", url: "https://www.memorialcare.org/sites/default/files/_images/content/Patient-Financial-Services/953527031-1477596583_long-beach-memorial-medical-center_standardcharges.json", ext: "json" },
  { id: "miller-childrens", name: "MemorialCare Miller Children's & Women's Hospital", url: "https://www.memorialcare.org/sites/default/files/_images/content/Patient-Financial-Services/953527031-1962442012_memorialcare-miller-children-_s-%26-women-_s-hospital-long-beach_standardcharges.json", ext: "json" },
  { id: "coast-plaza", name: "Coast Plaza Hospital (Pipeline Health)", url: "https://sthpiprd.blob.core.windows.net/machine-readable-files/8428/760594558-1063412005_pipeline-health-system-holdings,-llc_standardcharges.csv", ext: "csv" },
  { id: "adventist-white-memorial-montebello", name: "Adventist Health White Memorial Montebello", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbAHWMLOSANGELESCA&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "adventist-glendale", name: "Adventist Health Glendale", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbGAMCGLENDALECA&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "adventist-simi-valley", name: "Adventist Health Simi Valley", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbAHSVSIMIVALLEYCA&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "hoag-orthopedic-institute", name: "Hoag Orthopedic Institute", url: "https://www.hoagorthopedicinstitute.com/documents/611588294_hoag-orthopedic-institute_standardcharges.csv", ext: "csv" },
  { id: "south-coast-global-mc", name: "South Coast Global Medical Center", url: "https://www.southcoastglobalmedicalcenter.com/wp-content/uploads/2026/04/550883863_south-coast-global-medical-center_standardcharges.csv", ext: "csv" },
  // ── Round 6: 7-metro expansion (Detroit, Pittsburgh, Tampa, Miami, Austin, Bay Area, San Diego) ──
  { id: "henry-ford-detroit", name: "Henry Ford Hospital", url: "https://www.henryford.com/-/media/files/henry-ford/patients-visitors/price-transparency-2026/381357020-1134144801_henry-ford-health_standardcharges.csv", ext: "csv" },
  { id: "henry-ford-west-bloomfield", name: "Henry Ford West Bloomfield Hospital", url: "https://www.henryford.com/-/media/files/henry-ford/patients-visitors/price-transparency-2026/381357020-1407867559_henry-ford-health_standardcharges.csv", ext: "csv" },
  { id: "dmc-detroit-receiving", name: "DMC Detroit Receiving Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844942_detroit-receiving-hospital---dmc_standardcharges.json", ext: "json" },
  { id: "dmc-harper-university", name: "DMC Harper University Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844767_harper-university-hospital---dmc_standardcharges.json", ext: "json" },
  { id: "dmc-sinai-grace", name: "DMC Sinai-Grace Hospital", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272844632_dmc-sinai-grace-hospital_standardcharges.json", ext: "json" },
  { id: "childrens-hospital-michigan", name: "Children's Hospital of Michigan", url: "https://mrfs.hyvehealthcare.com/TenetHealth/272845064_childrens-hospital-of-michigan---dmc_standardcharges.json", ext: "json" },
  { id: "corewell-royal-oak", name: "Corewell Health Royal Oak (Beaumont)", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blt5644d1c708026093/183459362_1811044878_william-beaumont-hospital_standardcharges.csv", ext: "csv" },
  { id: "corewell-troy", name: "Corewell Health Troy", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blta76ad74666a452ed/381459362_1811044878_beaumont-hospital-troy_standardcharges.csv", ext: "csv" },
  { id: "corewell-farmington-hills", name: "Corewell Health Farmington Hills", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/bltd2969ccf9b97f808/381426919_corewell-health-farmington-hills-hospital_standardcharges.csv", ext: "csv" },
  { id: "corewell-dearborn", name: "Corewell Health Dearborn", url: "https://assets.contentstack.io/v3/assets/blt3055f692fe7bf193/blt85f9329ed06a671d/381405141_1740230119_oakwood-healthcare-inc_standardcharges.csv", ext: "csv" },
  { id: "upmc-presbyterian-shadyside", name: "UPMC Presbyterian Shadyside", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250965480_upmc-presbyterian-shadyside_standardcharges.csv", ext: "csv" },
  { id: "upmc-magee-womens", name: "UPMC Magee-Womens Hospital", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250965420_upmc-magee_standardcharges.csv", ext: "csv" },
  { id: "upmc-childrens-pittsburgh", name: "UPMC Children's Hospital of Pittsburgh", url: "https://dam.upmc.com/-/media/upmc/locations/hospitals/documents/cdm-json-files/250402510_upmc-childrens_standardcharges.csv", ext: "csv" },
  { id: "ahn-allegheny-general", name: "AHN Allegheny General Hospital", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/250969492_Allegheny-General-Hospital_standardcharges.csv", ext: "csv" },
  { id: "ahn-forbes", name: "AHN Forbes Hospital", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/250969492_Forbes-Hospital_standardcharges.csv", ext: "csv" },
  { id: "ahn-jefferson-regional", name: "AHN Jefferson Regional Medical Center", url: "https://www.ahn.org/content/dam/ahn/en/dmxahn/documents/patients-visitors/patients/financial-services/hospital-charges/251260215_Jefferson-Regional-Medical-Center_standardcharges.csv", ext: "csv" },
  { id: "tampa-general", name: "Tampa General Hospital", url: "https://www.tgh.org/-/media/files/patients-and-visitors/593458145_tampa-general-hospital_standardcharges.csv?rev=7c310c7c008b4517a240a5892e37ed20", ext: "csv" },
  { id: "baycare-st-josephs-tampa", name: "BayCare St. Joseph's Hospital Tampa", url: "https://baycare.org/-/media/project/baycare/consumer-portal/billing-and-insurance/pricing-files-compressed/590774199_StJosephsHospital_standardcharges.zip", ext: "zip" },
  { id: "baycare-morton-plant", name: "BayCare Morton Plant Hospital", url: "https://baycare.org/-/media/project/baycare/consumer-portal/billing-and-insurance/pricing-files-compressed/590624462_MortonPlantHospital_standardcharges.zip", ext: "zip" },
  { id: "moffitt-cancer-center", name: "Moffitt Cancer Center", url: "https://eforms.moffitt.org/Moffittcancercenter_standardcharges/593238634_H.-Lee-Moffitt-Cancer-Center-and-Research-Institute-Hospital,-Inc._standardcharges.csv", ext: "csv" },
  { id: "jackson-memorial", name: "Jackson Memorial Hospital", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJMHMiamiFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "jackson-north", name: "Jackson North Medical Center", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJNMCNorthMiamiBeachFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "jackson-south", name: "Jackson South Medical Center", url: "https://apps.para-hcfs.com/PTT/FinalLinks/Reports.aspx?dbName=dbJSCHMiamiFL&type=CDMWithoutLabel&fileType=CSV", ext: "csv" },
  { id: "baptist-hospital-miami", name: "Baptist Hospital of Miami", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/590910342_baptist-hospital-of-miami_standardcharges.zip", ext: "zip" },
  { id: "baptist-doctors-coral-gables", name: "Doctors Hospital (Coral Gables)", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/43775926_doctors-hospital_standardcharges.zip", ext: "zip" },
  { id: "baptist-homestead", name: "Homestead Hospital", url: "https://baptisthealth.net/-/media/Documents/Patient-Resources/Patient-Pricing/Apr-2026/650232993_homestead-hospital_standardcharges.zip", ext: "zip" },
  { id: "nicklaus-childrens", name: "Nicklaus Children's Hospital", url: "https://www.nicklauschildrens.org/NCH/media/docs/pdf/Finance/590638499_nicklaus-childrens-hospital_standardcharges_04-2026.zip", ext: "zip" },
  { id: "dell-seton-uta", name: "Dell Seton Medical Center at UT Austin", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1093810327_ascension-seton_standardcharges.zip", ext: "zip", referer: "https://healthcare.ascension.org/price-transparency" },
  { id: "ascension-seton-medical-austin", name: "Ascension Seton Medical Center Austin", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1164526786_ascension-seton_standardcharges.zip", ext: "zip", referer: "https://healthcare.ascension.org/price-transparency" },
  { id: "dell-childrens-austin", name: "Dell Children's Medical Center", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1447355771_ascension-seton_standardcharges.zip", ext: "zip", referer: "https://healthcare.ascension.org/price-transparency" },
  { id: "ascension-seton-northwest", name: "Ascension Seton Northwest Hospital", url: "https://healthcare.ascension.org/-/media/project/ascension/healthcare/price-transparency-files/tx-csv/741109643-1124137054_ascension-seton_standardcharges.zip", ext: "zip", referer: "https://healthcare.ascension.org/price-transparency" },
  { id: "st-davids-medical-center", name: "St. David's Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  { id: "st-davids-north-austin", name: "St. David's North Austin Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-NORTH-AUSTIN-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  { id: "st-davids-round-rock", name: "St. David's Round Rock Medical Center", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_ST.-DAVID'S-ROUND-ROCK-MEDICAL-CENTER_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  { id: "heart-hospital-austin", name: "Heart Hospital of Austin", url: "https://stctrprodsnsvc00455826e6.blob.core.windows.net/pt-final-posting-files/74-2781812_HEART-HOSP-OF-AUSTIN_standardcharges.json?si=pt-json-access-policy&spr=https&sv=2024-11-04&sr=c&sig=o5IofreS%2F7ETlsnhPakPWCwHVVUZRobywQ5wUKGjVuQ%3D", ext: "json" },
  { id: "stanford-health-care", name: "Stanford Health Care", url: "https://stanfordhealthcare.org/content/dam/SHC/patientsandvisitors/pricingtransparency/946174066_stanford-health-care_standardcharges.json", ext: "json" },
  { id: "stanford-tri-valley", name: "Stanford Health Care Tri-Valley", url: "https://stanfordhealthcare.org/content/dam/valleycare/patients-visitors/941429628_stanford-health-care---tri-valley_standardcharges.json", ext: "json" },
  { id: "kaiser-oakland", name: "Kaiser Permanente Oakland Medical Center", url: "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-oakland-medical-center-standard-charges-ncal-en.csv", ext: "csv" },
  { id: "kaiser-redwood-city", name: "Kaiser Permanente Redwood City Medical Center", url: "https://healthy.kaiserpermanente.org/content/dam/kporg/final/documents/health-plan-documents/coverage-information/machine-readable/941105628-redwood-city-medical-center-standard-charges-ncal-en.csv", ext: "csv" },
  { id: "john-muir-walnut-creek", name: "John Muir Health Walnut Creek Medical Center", url: "https://www.johnmuirhealth.com/content/dam/jmh/Documents/payments-and-insurance/machine-readable-files/94-1461843-1740215219_John-Muir-Health-Walnut-Creek-Medical-Center_standardcharges.zip", ext: "zip" },
  { id: "john-muir-concord", name: "John Muir Health Concord Medical Center", url: "https://www.johnmuirhealth.com/content/dam/jmh/Documents/payments-and-insurance/machine-readable-files/68-0396600-1801821376_John-Muir-Health-Concord-Medical-Center_standardcharges.zip", ext: "zip" },
  { id: "ucsd-health", name: "UC San Diego Health", url: "https://hsfiles.ucsd.edu/patientBilling/UC-San-Diego-Standard-Charges-956006144.json", ext: "json" },
  { id: "sharp-memorial", name: "Sharp Memorial Hospital", url: "https://downloads.ctfassets.net/pxcfulgsd9e2/7kOO19WgXRFqOFfWyPsSCE/1dd67ee60fbf2a34d729812c39abb1fe/95-3782169_sharp-memorial-hospital_standardcharges.csv", ext: "csv" },
  { id: "sharp-grossmont", name: "Sharp Grossmont Hospital", url: "https://downloads.ctfassets.net/pxcfulgsd9e2/pDe4LFVvP8fh5nOJd8Zji/71b0885eb86902c17aee42e048ea796b/33-0449527_grossmont-hospital-corporation_standardcharges.csv", ext: "csv" },
  { id: "scripps-la-jolla", name: "Scripps Memorial Hospital La Jolla", url: "https://apps.scripps.org/pricetransparency/951684089_Scripps-Memorial-Hospital-La-Jolla_standardcharges.csv", ext: "csv" },
  { id: "scripps-mercy-sd", name: "Scripps Mercy Hospital San Diego", url: "https://apps.scripps.org/pricetransparency/951684089_Scripps-Mercy-Hospital-San-Diego_standardcharges.csv", ext: "csv" },
  { id: "rady-childrens", name: "Rady Children's Hospital San Diego", url: "https://www.rchsd.org/wp-content/uploads/2026/03/95-1691313_rady-childrens-hospital-san-diego_standardcharges.csv", ext: "csv" },

];

const OUT_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "raw-files",
);

const PARALLEL = 3;
const TIMEOUT_MS = 60 * 60 * 1000; // 60 min per file (Vanderbilt's 1.74GB on a throttled link took ~30 min)

function fmtBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

async function downloadOne(hospital) {
  const outPath = path.join(OUT_DIR, `${hospital.id}.${hospital.ext}`);
  const tmpPath = `${outPath}.tmp`;
  const start = Date.now();

  // Skip if the file is already on disk and recently fetched. Re-running this
  // script is a no-op for fresh files. Files older than REFRESH_DAYS days get
  // re-downloaded so a monthly cron picks up rate updates.
  //
  // Override mechanisms:
  //   --force       : redownload everything regardless of age
  //   REFRESH_DAYS  : env var, default 30. Set to "never" to disable age-based refresh.
  const refreshEnv = process.env.REFRESH_DAYS;
  const refreshDays = refreshEnv === "never" ? Infinity : Number(refreshEnv ?? 30);
  if (!process.argv.includes("--force") && fs.existsSync(outPath)) {
    const stat = fs.statSync(outPath);
    const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < refreshDays) {
      console.log(`[${hospital.id}] SKIP exists (${fmtBytes(stat.size)}, ${ageDays.toFixed(1)}d old)`);
      return { ok: true, id: hospital.id, bytes: stat.size, seconds: 0, path: outPath, skipped: true };
    }
    console.log(`[${hospital.id}] STALE (${ageDays.toFixed(1)}d > ${refreshDays}d), re-fetching`);
  }

  console.log(`[${hospital.id}] starting -> ${hospital.url}`);

  const ctrl = AbortController ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;

  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Research/1.0",
      Accept: "*/*",
    };
    // Some hosts (notably Ascension Health's transparency CDN) require a Referer
    // header from their own price-transparency page. Per-hospital `referer` field.
    if (hospital.referer) headers.Referer = hospital.referer;
    const res = await fetch(hospital.url, {
      headers,
      redirect: "follow",
      signal: ctrl?.signal,
    });

    if (!res.ok) {
      console.error(
        `[${hospital.id}] FAILED status=${res.status} ${res.statusText}`,
      );
      return {
        ok: false,
        id: hospital.id,
        status: res.status,
        statusText: res.statusText,
      };
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      console.log(
        `[${hospital.id}] content-length: ${fmtBytes(Number(contentLength))}`,
      );
    }

    await pipeline(
      Readable.fromWeb(res.body),
      fs.createWriteStream(tmpPath),
    );
    fs.renameSync(tmpPath, outPath);

    const stat = fs.statSync(outPath);
    const seconds = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[${hospital.id}] DONE ${fmtBytes(stat.size)} in ${seconds}s`,
    );
    return {
      ok: true,
      id: hospital.id,
      bytes: stat.size,
      seconds: Number(seconds),
      path: outPath,
    };
  } catch (err) {
    console.error(`[${hospital.id}] ERROR ${err.message}`);
    try {
      fs.unlinkSync(tmpPath);
    } catch {}
    return { ok: false, id: hospital.id, error: err.message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Output dir: ${OUT_DIR}`);
  console.log(`Hospitals: ${HOSPITALS.length}, parallel: ${PARALLEL}\n`);

  const results = [];
  for (let i = 0; i < HOSPITALS.length; i += PARALLEL) {
    const batch = HOSPITALS.slice(i, i + PARALLEL);
    const batchResults = await Promise.all(batch.map(downloadOne));
    results.push(...batchResults);
  }

  const manifest = {
    downloadedAt: new Date().toISOString(),
    results,
  };
  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    if (r.ok) {
      console.log(`  OK   ${r.id.padEnd(28)} ${fmtBytes(r.bytes).padStart(8)}  ${r.seconds}s`);
    } else {
      console.log(
        `  FAIL ${r.id.padEnd(28)} ${r.status ?? r.error ?? "unknown"}`,
      );
    }
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
