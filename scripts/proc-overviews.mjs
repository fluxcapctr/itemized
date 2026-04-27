// Plain-English overviews for each CPT in our shoppable set.
// Used by build-ui-data.mjs to inject into the per-procedure metadata.
//
// Rules:
//   - Two short paragraphs max. First: what the procedure is. Second: what's
//     bundled, what's not, what to ask about.
//   - No medical advice. No "consult your doctor" boilerplate (everyone knows).
//   - Honest about what the published rate covers.

export const PROC_OVERVIEWS = {
  // ── Imaging ─────────────────────────────────────────────────────────────
  "70551": {
    headline: "MRI of the brain, no contrast dye.",
    body: "An MRI scan of the brain without injected contrast. Used to evaluate headaches, suspected stroke, brain tumors, MS, and other neurologic concerns. Typically a 30-45 minute scan; no radiation.\n\nThe published rate covers the scan and the radiologist's read. It does NOT include the physician visit that ordered the scan, any contrast-with version of the same procedure (CPT 70552 / 70553), or follow-up consultations.",
  },
  "70553": {
    headline: "MRI of the brain, with and without contrast.",
    body: "Same brain MRI as 70551, plus an injected contrast dye (gadolinium) for additional detail. Used when the no-contrast scan is inconclusive, or when looking specifically at tumors, infections, or vascular abnormalities.\n\nPriced higher than the no-contrast version because it requires the contrast injection plus IV access. Cash pay sometimes runs less than the negotiated insurance rate at the same hospital — worth comparing both columns.",
  },
  "72148": {
    headline: "MRI of the lumbar spine, no contrast.",
    body: "MRI of the lower back. Most common reason: persistent back pain, radiating leg pain (sciatica), suspected disc herniation, or pre-surgical planning.\n\nThe scan, radiologist read, and facility fee are bundled into this code. A separate physician visit to discuss results is billed separately. If your provider also orders the cervical or thoracic spine, those are different CPTs at additional cost.",
  },
  "73721": {
    headline: "MRI of a knee or other joint of the leg, no contrast.",
    body: "Most often used for the knee, also covers ankle, hip, or foot joint MRIs. Common reasons: ACL/meniscus injury, persistent joint pain, arthritis evaluation, pre-surgical assessment.\n\nThe published rate covers the scan and read. It does NOT include the orthopedic consultation, physical therapy that may follow, or any injections. Cash pay is often dramatically cheaper than insurance rates at expensive hospitals — read both columns.",
  },
  "74177": {
    headline: "CT scan of the abdomen and pelvis, with contrast.",
    body: "A CT scan covering the abdomen and pelvis with IV contrast dye. Used for abdominal pain, suspected appendicitis or kidney stones, cancer staging, or trauma evaluation. About 15 minutes; uses radiation.\n\nThe rate includes the scan, contrast, and radiologist read. It does NOT include the physician visit, lab work that often accompanies an abdominal workup, or any follow-up imaging.",
  },
  "76700": {
    headline: "Complete abdominal ultrasound.",
    body: "An ultrasound of the abdomen evaluating the liver, gallbladder, pancreas, kidneys, and major blood vessels. No radiation, no contrast. Used for suspected gallstones, liver disease, kidney issues, or unexplained abdominal pain.\n\nLower-cost than CT or MRI. The rate covers the scan and radiologist read. A limited abdominal ultrasound (CPT 76705) is a different code at a lower price.",
  },
  "77067": {
    headline: "Screening mammogram, both breasts.",
    body: "A bilateral screening mammogram for women without symptoms. Federal law requires most insurance plans to cover this with no out-of-pocket cost when used for routine screening (typically once a year for women 40+).\n\nThe published rate is what's billed in the absence of insurance, or what the insurer pays the hospital. If you have insurance and this is preventive screening, you should owe $0. If a follow-up diagnostic mammogram is needed, that's CPT 77065 or 77066 — different code, different price, NOT necessarily covered preventively.",
  },
  "77080": {
    headline: "DXA bone density scan.",
    body: "A dual-energy X-ray absorptiometry scan that measures bone density, typically of the hip and spine. Used to diagnose osteoporosis, assess fracture risk, and monitor treatment. 10-15 minutes; very low radiation.\n\nMedicare covers DXA every 24 months for at-risk patients. Some private plans cover at intervals tied to age and risk factors. Cash-pay is sometimes simpler than dealing with frequency limits.",
  },
  "71045": {
    headline: "Chest X-ray, single view.",
    body: "A standard frontal chest X-ray. Used for suspected pneumonia, evaluating cough or shortness of breath, chest trauma, or pre-operative clearance. Quick, low radiation.\n\nThis is one of the cheapest tests on the menu. The 100x+ price spreads in this dataset are real and they're real money. If your insurance is asking $400 for a $20 X-ray, that's worth pushing back on.",
  },
  // ── Labs ────────────────────────────────────────────────────────────────
  "80053": {
    headline: "Comprehensive metabolic panel (CMP).",
    body: "A blood test that measures 14 substances: glucose, electrolytes, kidney markers, liver enzymes, and proteins. Routine for annual physicals, chronic disease monitoring, or before surgery.\n\nNote that hospital-billed labs are typically 5-20x more expensive than independent labs. If you're not in the hospital for another reason, asking your doctor to send the order to Quest or LabCorp instead can save you 80%+.",
  },
  "80061": {
    headline: "Lipid panel (cholesterol).",
    body: "A blood test measuring total cholesterol, HDL, LDL, and triglycerides. Standard preventive screening. Often part of an annual physical; covered with no cost-share by most plans when used preventively.\n\nIf you're paying out of pocket, independent labs often run this for $20-40 cash. Hospital lab departments sometimes charge 10x that.",
  },
  "85025": {
    headline: "CBC with differential.",
    body: "Complete blood count with differential — measures red and white blood cells, platelets, and the breakdown of white cell types. The most-ordered lab test in the United States. Used for everything from routine check-ups to infection workups to cancer screening.\n\nLike other labs, hospital pricing is dramatically higher than independent labs (Quest, LabCorp, Sonora Quest). If you're scheduling this electively, ask if it can go to an outpatient lab instead.",
  },
  "84443": {
    headline: "TSH (thyroid stimulating hormone).",
    body: "A blood test that measures TSH levels to evaluate thyroid function. Used to diagnose hypo- or hyperthyroidism, monitor thyroid medication, or investigate symptoms like fatigue, weight changes, or temperature sensitivity.\n\nVery cheap test wholesale ($3-5 reagent cost). Hospital pricing reflects facility overhead, not test cost.",
  },
  "83036": {
    headline: "Hemoglobin A1c.",
    body: "A blood test that reflects average blood sugar over the past 2-3 months. Used to diagnose and monitor diabetes. Recommended every 3-6 months for people with diabetes; annually for at-risk patients.\n\nSame story as other labs: hospital pricing >> independent lab pricing. If you have diabetes and are running these regularly, scheduling at an outpatient lab can save hundreds per year.",
  },
  "81002": {
    headline: "Urinalysis with microscopy.",
    body: "Standard urine test analyzing color, clarity, pH, glucose, protein, and microscopic examination for cells and bacteria. Used for UTIs, kidney problems, diabetes monitoring, and pregnancy workups.\n\nCheap test, often part of a panel. Like other labs, the hospital markup is significant.",
  },
  // ── Surgery ─────────────────────────────────────────────────────────────
  "29881": {
    headline: "Knee arthroscopy with meniscectomy.",
    body: "A minimally-invasive knee surgery to remove or repair torn meniscus cartilage. Done outpatient under general or spinal anesthesia. Recovery: 2-6 weeks.\n\nThe published rate covers the surgery and facility fee. It does NOT include: pre-op imaging (often a knee MRI, CPT 73721), the surgeon's professional fee (sometimes billed separately), anesthesia, post-op physical therapy, or any follow-up visits. Ambulatory Surgical Centers often perform this at 50-70% less than hospitals.",
  },
  "27447": {
    headline: "Total knee replacement.",
    body: "Major surgery to replace a damaged knee joint with prosthetic components. Typically a 1-3 day hospital stay; recovery 6-12 weeks plus physical therapy. One of the most-shopped surgeries in the United States — costs vary 10x between hospitals for the same procedure.\n\nThe published rate is the hospital facility fee. It does NOT include: surgeon's fee, anesthesia, the implant itself (which can be $5-15K alone), pre-op clearance, or post-op rehab. Ask the hospital for a 'global price' that includes everything.",
  },
  "27130": {
    headline: "Total hip replacement.",
    body: "Major surgery to replace a damaged hip joint with prosthetic components. Hospital stay 1-3 days; recovery 6-12 weeks. Like knee replacement, prices vary dramatically.\n\nGlobal cost includes: hospital facility, surgeon, anesthesia, implant, post-op rehab. The published MRF rate is usually just the facility piece. Always ask for an itemized estimate before scheduling.",
  },
  "47562": {
    headline: "Laparoscopic gallbladder removal.",
    body: "Minimally-invasive removal of the gallbladder, usually for gallstones or chronic gallbladder disease. Outpatient or 1-day stay; recovery 1-2 weeks.\n\nOften done at an Ambulatory Surgical Center for substantially less than at a hospital. The hospital rate includes facility fee. Surgeon and anesthesia are typically billed separately.",
  },
  "49505": {
    headline: "Inguinal hernia repair, open.",
    body: "Surgery to repair an inguinal (groin) hernia using an open incision. Outpatient procedure under general or spinal anesthesia. Recovery 2-4 weeks.\n\nCommonly done at ASCs at lower cost than hospitals. Laparoscopic versions exist with different CPTs (49650/49651). The published rate is usually the facility fee.",
  },
  "66984": {
    headline: "Cataract surgery, one eye.",
    body: "Removal of the clouded natural lens and replacement with a synthetic intraocular lens. The most-performed surgery in the U.S. Outpatient, usually under 30 minutes; same-day recovery.\n\nMedicare covers cataract surgery with a basic lens. Premium lenses (toric for astigmatism, multifocal for reading vision) are typically out-of-pocket additions. The published rate covers the basic procedure; premium-lens upgrades aren't reflected.",
  },
  // ── Maternity ───────────────────────────────────────────────────────────
  "59400": {
    headline: "Vaginal delivery, global package.",
    body: "The 'global' code covering routine prenatal care, vaginal delivery, and routine postpartum care. The single biggest hospital expense most young families face.\n\nThe published rate is the facility fee for the delivery itself. It does NOT include: anesthesia (epidural is separate), the obstetrician's professional fee (usually billed under the global code separately), the newborn's care (separate billing), NICU if needed, or any complications that bump the delivery into a higher-acuity code. Always get an itemized estimate before delivery if possible.",
  },
  "59510": {
    headline: "Cesarean delivery, global package.",
    body: "The 'global' code covering prenatal care, cesarean delivery, and postpartum care. Typically 30-60% more expensive than vaginal delivery.\n\nSame caveats as 59400: the published rate is the facility fee. Anesthesia, the OB's fee, the newborn's care, and any NICU stay are billed separately. C-sections done as scheduled (planned) are usually cheaper than emergency C-sections, but the CPT code is the same — that's a billing nuance worth knowing.",
  },
  // ── Procedural ──────────────────────────────────────────────────────────
  "45378": {
    headline: "Diagnostic colonoscopy.",
    body: "A scope of the colon to evaluate symptoms (bleeding, pain, change in bowel habits) — diagnostic, not screening. If a polyp is found and removed, the code changes to 45385 and the price changes too.\n\nFederal law covers SCREENING colonoscopies (no symptoms, age 45+) at no out-of-pocket cost for most insurance plans. Diagnostic colonoscopies don't get that protection. The CPT code on your bill matters: if you went in for screening but a polyp was removed, the bill may shift from screening (covered) to diagnostic (cost-share applies).",
  },
  "45385": {
    headline: "Colonoscopy with polyp removal.",
    body: "Same procedure as 45378, but a polyp was found and removed via snare. Often the same scope just with a different billing code at the end.\n\nIf this happens during a SCREENING colonoscopy (you went in with no symptoms), federal law says it should still be covered as preventive — but billing systems sometimes flag it as diagnostic. If you get charged a copay for a screening colonoscopy that became 45385, dispute it citing 42 USC 300gg-13 and the ACA preventive-services rule.",
  },
  "43239": {
    headline: "Upper endoscopy (EGD) with biopsy.",
    body: "A scope of the esophagus, stomach, and duodenum with tissue sample taken. Used for reflux, suspected ulcers, swallowing problems, GI bleeding, or H. pylori testing.\n\nPublished rate is the facility fee. The pathologist who reads the biopsy is usually billed separately, as is anesthesia.",
  },
  // ── Cardiac ─────────────────────────────────────────────────────────────
  "93000": {
    headline: "EKG with interpretation.",
    body: "A 12-lead electrocardiogram measuring the heart's electrical activity. The standard cardiac screen for chest pain, palpitations, pre-operative clearance, or routine cardiac checkups. Quick test (under 5 minutes).\n\nVery cheap to perform. Hospital pricing reflects overhead, not actual test cost. Independent cardiology practices and urgent care centers run these for a fraction of the hospital rate.",
  },
  "93306": {
    headline: "Echocardiogram, complete with Doppler.",
    body: "A comprehensive ultrasound of the heart with blood flow analysis. Used to evaluate murmurs, heart failure, valve disease, or cardiac function before surgery. About 30-45 minutes.\n\nIncludes the scan and read by a cardiologist. Limited or follow-up echocardiograms (CPT 93308) are different codes at lower prices.",
  },
  // ── Office ──────────────────────────────────────────────────────────────
  "99213": {
    headline: "Office visit, established patient, level 3.",
    body: "A standard 20-30 minute office visit for an existing patient with a moderately complex problem. The most-billed office-visit code in primary care.\n\nIf you have insurance, this is usually fully or mostly covered after copay. Cash-pay rates vary 10x between provider types — direct primary care practices often charge $50-100 cash; hospital-owned outpatient clinics can bill $300-600 for the same visit.",
  },
  "99214": {
    headline: "Office visit, established patient, level 4.",
    body: "Higher-acuity than 99213 — 30-40 minutes, more complex medical decision-making. Common when managing multiple chronic conditions, medication adjustments, or significant symptom changes.\n\nThe step up from 99213 to 99214 is one of the most-watched billing patterns in healthcare. If your visit was straightforward (new prescription, brief check-in) and you got billed 99214 instead of 99213, that's worth asking about.",
  },
  // ── Round 7 overviews ──────────────────────────────────────────────────
  "29848": {
    headline: "Surgery to release pressure on the median nerve at the wrist.",
    body: "An outpatient surgery (open or endoscopic) to relieve carpal tunnel syndrome — numbness, tingling, weakness in the hand. Recovery 2-6 weeks; common and very shoppable.\n\nOften done at an Ambulatory Surgical Center for substantially less than at a hospital. The published rate is the facility fee. Surgeon and anesthesia are usually billed separately.",
  },
  "30520": {
    headline: "Surgery to straighten the wall between the nostrils.",
    body: "Outpatient ENT surgery for a deviated septum causing breathing issues. About 1-2 hours under general anesthesia; recovery 1-2 weeks.\n\nFrequently performed at Ambulatory Surgical Centers at significantly lower cost than hospitals. The published rate is the facility fee. Sometimes bundled with turbinate reduction (CPT 30130/30140) at additional cost.",
  },
  "52353": {
    headline: "Endoscopic treatment of kidney/ureter stones with laser fragmentation.",
    body: "Outpatient surgery using a scope passed up through the bladder to break up and remove stones with a laser. Same-day procedure under general anesthesia.\n\nLithotripsy is the surgical alternative to letting a stone pass naturally. Hospital and ASC pricing varies dramatically — same procedure, same recovery time.",
  },
  "55700": {
    headline: "Tissue biopsy of the prostate for cancer evaluation.",
    body: "Used after an elevated PSA blood test or abnormal digital exam. Outpatient, ~30 minutes, transrectal or transperineal approach. The published rate is the facility fee; the pathologist who reads the samples bills separately.\n\nIf this gets ordered, ask your urologist whether MRI-guided fusion biopsy (different code, more accurate) is appropriate — it's often more accurate but pricier.",
  },
  "58150": {
    headline: "Surgical removal of the uterus through an abdominal incision.",
    body: "Major surgery; 1-2 day hospital stay; recovery 4-6 weeks. Used for fibroids, endometriosis, certain cancers, or chronic bleeding. Laparoscopic and robotic versions exist with different CPT codes (58570-58573) at often higher cost.\n\nThe published rate is the hospital facility fee. Surgeon's fee, anesthesia, and any pathology are billed separately.",
  },
  "64483": {
    headline: "Steroid injection into the lumbar spine for back/leg pain.",
    body: "An outpatient injection used for radiating low-back pain (sciatica), herniated disc, or spinal stenosis. About 15-30 minutes; image-guided. Often a series of three.\n\nDramatic price spreads between hospital outpatient departments and pain-management clinics — sometimes 10x. The published rate is the facility fee; the physician's fee is usually billed separately.",
  },
  "76536": {
    headline: "Ultrasound of the thyroid gland.",
    body: "Used to evaluate thyroid nodules, goiter, or abnormal TSH labs. About 15-30 minutes; no radiation; no contrast. Pairs naturally with a TSH blood test (CPT 84443).\n\nFree-standing imaging centers are typically much cheaper than hospital outpatient departments for this scan. Worth shopping.",
  },
  "90834": {
    headline: "Outpatient therapy session with a licensed mental health provider.",
    body: "The most-billed psychotherapy code. Used by psychologists, LCSWs, LPCs, and psychiatrists for ongoing therapy.\n\nMental health pricing varies wildly. Hospital-affiliated behavioral health departments often bill $200-$400 per session; independent therapists charge $100-$250. Out-of-pocket therapy can be much cheaper than going through insurance, especially for high-deductible plans.",
  },
  "93880": {
    headline: "Ultrasound of the carotid arteries with blood flow analysis.",
    body: "Screens for plaque buildup in the neck arteries. Used after a TIA, mini-stroke, or as cardiovascular screening for at-risk patients. About 20-30 minutes; no radiation.\n\nCommon outpatient test. Hospital outpatient departments charge 5-10x what a free-standing vascular lab does for the same scan.",
  },
  "95810": {
    headline: "Overnight sleep study with full monitoring.",
    body: "A diagnostic test where you spend the night at a sleep lab while your breathing, brain activity, oxygen, and heart rhythm are monitored. Used to diagnose sleep apnea, narcolepsy, and other disorders. Most insurance covers it after a referral.\n\nIn-lab studies are typically $1,500-$5,000. Home sleep tests (CPT 95800/95806) are 60-80% cheaper for the same diagnosis. Worth asking your provider if a home test is appropriate.",
  },
  "99203": {
    headline: "First-time office visit, established care, moderate complexity.",
    body: "A 30-45 minute visit for a new patient with a moderately complex problem. Higher than 99213 because of the time and decision-making for a never-seen patient.\n\nOne of the most-billed CPT codes in the country. Hospital-owned outpatient clinics frequently bill 99204 or 99203 at 5-10x the rate of an independent primary care practice.",
  },
  "99204": {
    headline: "First-time office visit with extended evaluation.",
    body: "Higher-acuity new patient visit (45-60 minutes). Used when the new patient has multiple chronic conditions, complicated history, or significant decision-making.\n\nFor specialist consultations, 99204 is often the default code. Worth verifying after the visit that the billed level matches what actually happened.",
  },
};
