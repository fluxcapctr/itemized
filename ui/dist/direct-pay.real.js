// Direct-pay imaging providers and typical cash-pay ranges.
//
// IMPORTANT: these ranges are typical cash-pay rates published on the
// providers' public pages or aggregated from public industry data
// (RadNet LA pricing pages, SimonMed published cash rates, NerdWallet
// healthcare-cost survey, Solv aggregated data). They are NOT live
// scraped prices. The "url" field links the user to the provider's
// own page where they can see current pricing for their location.
//
// Every link goes through /go/{partner-id} so we can wire affiliate
// tracking once partnerships are signed (vercel.json redirects).
//
// Refresh cadence: review quarterly and update as providers change
// their published pricing pages.

window.ITEMIZED_DIRECT_PAY = {
  as_of: "2026-04-27",
  providers: {
    radnet: {
      id: "radnet",
      name: "RadNet",
      url: "https://www.radnet.com/los-angeles",
      affiliate_url: "/go/radnet",
      tagline: "70+ LA-area imaging centers (Liberty Pacific, Beverly Hills Imaging, ProMed, Tower Saint John's, more)",
      coverage: ["Los Angeles, CA", "New York, NY", "New Jersey", "Maryland", "Florida", "Arizona"],
    },
    simonmed: {
      id: "simonmed",
      name: "SimonMed Imaging",
      url: "https://www.simonmed.com",
      affiliate_url: "/go/simonmed",
      tagline: "150+ imaging centers across 11 states; transparent cash pricing",
      coverage: ["Arizona", "California", "Florida", "Texas", "Colorado", "Illinois", "Nevada", "New York"],
    },
    akumin: {
      id: "akumin",
      name: "Akumin",
      url: "https://akumin.com",
      affiliate_url: "/go/akumin",
      tagline: "National imaging chain, ~200 outpatient centers",
      coverage: ["Florida", "Texas", "Pennsylvania", "Illinois", "Delaware", "California"],
    },
  },
  // Per-CPT typical cash-pay ranges across major direct-pay imaging chains.
  // Lower number = "starting at" rate published by at least one major
  // provider; higher = upper end seen across providers/markets.
  // Hospital-equivalent comparison drawn from our own MRF data
  // (procedure overview page shows the hospital range for reference).
  pricing: {
    // Brain MRI without contrast (CPT 70551)
    "70551": {
      typical_low: 350, typical_high: 700,
      source: "RadNet LA published rates ($395-$650), SimonMed brain MRI cash rate (~$400 starting), aggregated public pricing",
    },
    // Brain MRI with and without contrast (CPT 70553)
    "70553": {
      typical_low: 500, typical_high: 950,
      source: "RadNet LA pricing, SimonMed contrast-MRI rates",
    },
    // Lumbar spine MRI without contrast (CPT 72148)
    "72148": {
      typical_low: 350, typical_high: 700,
      source: "RadNet, SimonMed published lumbar MRI cash rates",
    },
    // Knee/lower-extremity MRI without contrast (CPT 73721)
    "73721": {
      typical_low: 350, typical_high: 700,
      source: "RadNet LA published rates, SimonMed knee-MRI cash rate ($450 typical), Akumin lower-extremity MRI",
    },
    // CT abdomen and pelvis with contrast (CPT 74177)
    "74177": {
      typical_low: 350, typical_high: 750,
      source: "RadNet, SimonMed CT cash rates",
    },
    // Abdominal ultrasound, complete (CPT 76700)
    "76700": {
      typical_low: 150, typical_high: 350,
      source: "RadNet, SimonMed ultrasound cash rates",
    },
    // Screening mammogram (CPT 77067)
    "77067": {
      typical_low: 100, typical_high: 250,
      source: "RadNet LA mammogram pricing, SimonMed published rates. Note: most insurance plans cover screening mammograms preventively at $0.",
    },
    // DXA bone density scan (CPT 77080)
    "77080": {
      typical_low: 75, typical_high: 200,
      source: "RadNet, SimonMed DXA published rates",
    },
    // Chest X-ray, single view (CPT 71045)
    "71045": {
      typical_low: 50, typical_high: 150,
      source: "RadNet, SimonMed X-ray cash rates",
    },
    // Carotid duplex ultrasound (CPT 93880)
    "93880": {
      typical_low: 200, typical_high: 450,
      source: "Industry aggregated cash pricing for vascular ultrasound",
    },
    // Thyroid ultrasound (CPT 76536)
    "76536": {
      typical_low: 150, typical_high: 350,
      source: "RadNet, SimonMed thyroid ultrasound cash rates",
    },
    // Echocardiogram (CPT 93306)
    "93306": {
      typical_low: 250, typical_high: 600,
      source: "Industry aggregated cash pricing for transthoracic echo",
    },
  },
  // For each CPT, which providers carry it (most carry all imaging).
  // We surface 3 providers per page; this list orders them by relevance.
  default_providers: ["radnet", "simonmed", "akumin"],
};
