// Shared list of CPT codes the extractors target.
// Update here and re-run both extract-mri.mjs and extract-mri-wide.mjs.
export const CPT_CODES = [
  // Imaging
  { code: "70551", label: "Brain MRI without contrast" },
  { code: "70553", label: "Brain MRI with and without contrast" },
  { code: "72148", label: "Lumbar spine MRI without contrast" },
  { code: "73721", label: "Knee/lower-extremity MRI without contrast" },
  { code: "74177", label: "CT abdomen and pelvis with contrast" },
  { code: "76700", label: "Abdominal ultrasound, complete" },
  { code: "77067", label: "Mammogram, screening" },
  { code: "77080", label: "DXA bone density scan" },
  { code: "71045", label: "Chest X-ray, single view" },
  // Labs
  { code: "80053", label: "Comprehensive metabolic panel" },
  { code: "80061", label: "Lipid panel" },
  { code: "85025", label: "CBC with differential" },
  { code: "84443", label: "TSH (thyroid stimulating hormone)" },
  { code: "83036", label: "Hemoglobin A1c" },
  { code: "81002", label: "Urinalysis" },
  // Surgery
  { code: "29881", label: "Knee arthroscopy with meniscectomy" },
  { code: "27447", label: "Total knee replacement" },
  { code: "27130", label: "Total hip replacement" },
  { code: "47562", label: "Laparoscopic cholecystectomy" },
  { code: "49505", label: "Inguinal hernia repair, open" },
  { code: "66984", label: "Cataract surgery, one eye" },
  // Maternity
  { code: "59400", label: "Vaginal delivery, global" },
  { code: "59510", label: "Cesarean delivery, global" },
  // Procedural
  { code: "45378", label: "Colonoscopy, diagnostic" },
  { code: "45385", label: "Colonoscopy with polyp removal" },
  { code: "43239", label: "Upper endoscopy (EGD) with biopsy" },
  // Cardiac
  { code: "93000", label: "EKG with interpretation" },
  { code: "93306", label: "Echocardiogram, complete with Doppler" },
  // Office
  { code: "99213", label: "Office visit, established patient, level 3" },
  { code: "99214", label: "Office visit, established patient, level 4" },
  // ── Round 7: 12-code expansion (high-volume shoppable codes) ──
  { code: "29848", label: "Carpal tunnel release" },
  { code: "64483", label: "Lumbar epidural steroid injection" },
  { code: "95810", label: "Polysomnography (sleep study)" },
  { code: "30520", label: "Septoplasty (deviated septum repair)" },
  { code: "58150", label: "Total abdominal hysterectomy" },
  { code: "76536", label: "Thyroid ultrasound" },
  { code: "99203", label: "New patient office visit, level 3" },
  { code: "99204", label: "New patient office visit, level 4" },
  { code: "52353", label: "Ureteroscopy with lithotripsy (kidney stone)" },
  { code: "55700", label: "Prostate biopsy" },
  { code: "93880", label: "Carotid duplex ultrasound" },
  { code: "90834", label: "Psychotherapy, 45 minutes" },
];
