# Batch B: Suki AI, Nabla, DeepScribe (research as of late Sept 2026)

Method: web search plus page fetches of vendor sites, help centers, developer docs, app store listings, press releases, KLAS pages, and third-party reviews (about 45 sources, listed per section). Caveats: many "review" sites are written by competitors (DeepCura, Twofold, Vero, Marvix, HealOS), so treat their pricing estimates and complaint lists with some skepticism. KLAS 2026 vendor scores other than Abridge's sit behind a login. Screenshots are JS or image-only on most vendor pages, so the UI descriptions below come from help-center text, app store text and version notes rather than direct visual inspection.

---

## 1. Suki AI

### Background
- Founded 2017 in Redwood City, CA, by Punit Soni (ex-Google/Motorola). Started as a voice assistant ("Suki, ...") for dictation and EHR commands and pivoted to ambient in 2023. It now calls itself "Ambient Clinical Intelligence" and "AI infrastructure that gets documentation, coding, and revenue right."
- Funding: about $168M total over 6 rounds. The latest is a **$70M Series D in Oct 2024** (Hedosophia led; Venrock, First Round, Flare, March Capital, Breyer). Reported valuation around $500M at Series D (press estimates). No new round found for 2025-26.
- Two product lines:
  1. **Suki Assistant / "Suki for Clinicians"**, the clinician-facing app.
  2. **Suki Platform / Developer Platform**, APIs and SDKs that let EHRs and partners embed Suki ambient. Partners include athenahealth (athena Ambient Notes, GA Nov 2024), Zoom, HealthEdge GuidingCare (Jan 2026, care managers at health plans), WellSky, MEDENT, Azalea, Sevocity, AvaSure (virtual nursing) and Optum Real.

### Scale and customers
- "400+ leading healthcare systems and partners." Usage **tripled in 2025**, with 150+ features shipped that year. Platform ambient encounters grew 88% in the six months to June 2026.
- Coverage: 100-120+ specialties and 80+ languages. Care settings: ambulatory, inpatient, ED, urgent care, telehealth, home health and nursing.
- Named customers: FMOL Health, McLeod Health, Rush University System for Health (KLAS 2026 ROI validation), MedStar Health, Ascension Saint Thomas (residency program), and 12+ MEDITECH Expanse systems.
- KLAS results:
  - 93.2 overall in the 2024 Spotlight, with 95% saying they would buy again.
  - **KLAS "Suki ROI Validations 2026"**: about **$2,629/provider/month** financial impact and 21-27% less documentation time. At FMOL, after-hours charting fell 65% and notes open more than 7 days fell 43%. McLeod saved about 3.6 hrs/provider/month.
- Frost & Sullivan named Suki a "Transformational Innovation Leader" in ACI (Sept 1, 2026).
- Marketing claims: notes 72-76% faster, 9X year-1 ROI, 48% fewer amended encounters from coding.

### Clinician workflow, step by step
Suki runs on iOS, Android, web, a Chrome extension, a desktop app (macOS on Apple silicon; Windows), and inside Epic as **Suki INSIDE** (Haiku and Hyperspace, via Epic Toolbox).

1. **Pre-visit**
   - The schedule syncs from the EHR, and the clinician taps a patient. They can ask "Suki, what is my schedule today?"
   - A **Patient Summary** (Epic; built on Google Cloud Vertex AI) gives a concise pre-visit overview.
   - **Chart Q&A** answers natural-language questions ("When was the last colonoscopy?", "Show last A1c").
   - **Voice pre-charting**: the clinician dictates parts of the note before the visit. With "Sync EMR content," a note started in the EHR can be pulled into Suki, and vitals, meds and problems can be pulled in from the EHR.
2. **Consent**: the clinician gets verbal consent. Suki's developer docs put this responsibility on the clinician or integrator, and there is no built-in consent capture UI. Audio is deleted by default after 30 days.
3. **Record**
   - The clinician taps to start an ambient session on phone, desktop, or in Haiku.
   - Sessions should be at least 1 minute long, or they may be skipped.
   - **Multiple ambient sessions** can be merged into one note, for example when the clinician steps out and returns.
   - Audio streams to Suki in real time (16 kHz LINEAR16) and is transcribed live.
4. **Note generation**
   - After the session ends, Suki maps the transcript into the requested **LOINC-coded sections**.
   - The draft appears in the Suki note view, or in Epic directly as four standard sections filed into the note.
   - At the same time, Suki generates:
     - **ICD-10/HCC/CPT/E&M** code suggestions
     - **patient instructions** in 80 languages at a 5th-grade reading level
     - **Ambient Order Staging**: meds mentioned in conversation become structured, coded, staged orders for one-click approval ("industry first," 2025)
5. **Edit**
   - The clinician edits by typing or with **voice-enabled editing** ("make the assessment more concise," tone and personalization).
   - Voice commands can also add diagnoses and navigate the chart.
   - **Problem-based charting** is available: the A&P is organized per problem instead of SOAP headings.
6. **Sign-off and write-back**
   - The clinician taps "send to EHR," and Suki "updates the relevant sections in seconds."
   - For Suki INSIDE, the clinician reviews, edits and signs in Hyperspace.
   - For athena, Suki writes into athenaOne note sections along with patient instructions.
   - For MEDITECH Expanse, it writes via the documentation API and mSpeech.
   - For non-integrated EHRs, the clinician copies and pastes.

### Note formats and sections
- Formats: SOAP, H&P, progress note, problem-based, and custom templates. Specialty templates cover 100+ specialties.
- Supported LOINC sections (from Suki developer docs):
  - Chief Complaint (10154-3), HPI (10164-2), Interval History, ROS (10187-3)
  - PMH, PSH, Past Psychiatric History, Family History, Social History, Development History
  - Allergies, Medications, Immunizations, Vitals, Physical Exam (29545-1), Mental Status Exam, Results
  - Assessment (51848-0), Plan (18776-5), Assessment and Plan (51847-2), Problem List
  - Procedure, Hospital Course, Disposition, Patient Instructions (69730-0), Medication Orders (52471-0)
  - Anticipatory Guidance, Advance Directives, Diet, Functional Status, Risk Assessment, Response to Therapy, Therapy Goals, Symptoms and Stressors, Reason for Visit, Discussion Notes
- Standard configurations:
  - "Basic SOAP": CC, HPI, PE, A&P
  - "Comprehensive": adds Meds, Allergies, Problem List, ROS
  - Specialty variants, e.g. MSE for psychiatry

### Distinctive features
- Voice-first heritage:
  - "Suki, ..." commands for navigation, orders ("Order metformin 500mg") and problem-list edits
  - **Ask Suki** chart Q&A
  - **Suki Dictation** in Epic (SMART on FHIR) and MEDITECH (mSpeech), dictating at the cursor. It supports PowerMic-style push-to-talk hardware, custom voice commands, auto-text, and self-learning ASR.
- Ambient Order Staging, Patient Summaries, multilingual patient instructions, and a nursing consortium for nursing documentation.
- The Platform supports MCP servers and agentic workflows ("implemented in minutes with the AI agent of choice").

### UI description
- The mobile app is described as "clean, intuitive." There was a "Modern UI redesign" in 2025 with updated colors, typography and polish.
- Brand visuals: purple/violet and warm yellow accents on white, which match Suki's marketing site. This is inferred from the site's brand assets and is not confirmed in text.
- Main screens:
  - **Schedule list** of the day's patients, synced from the EHR
  - **Patient/encounter view** with a large mic/record control
  - **Note view** with collapsible sections, codes and patient instructions
  - A **Send to EHR** action
- iOS listing: v3.8.0, Sept 17, 2026; 4.1 stars (66 ratings); iOS 18+ and macOS 15+ on M1 or later. It lists schedule, ambient sessions for ED and urgent care, and E/M suggestions.
- The Web SDK offers a "Suki-hosted review UI," and a headless React SDK is available for partners.

### EHR integrations
- Deep integrations: Epic (Toolbox; Haiku and Hyperspace; APIs), Oracle Health/Cerner PowerChart, athenahealth (native "athena Ambient Notes," about 5-day setup), MEDITECH Expanse (first fully integrated ambient), and Elation.
- Partner and embedded: MEDENT, Azalea, WellSky, Sevocity, HealthEdge, Zoom.
- Not integrated per competitor reviews: eCW, AdvancedMD, Veradigm, DrChrono. For these the clinician copies and pastes.

### Pricing
- Not public. Third-party estimates put Suki at **$299-$399 per clinician per month**, with enterprise deals at $350-$500+. Contracts are annual and sales-led.
- A lighter "Suki Compose" tier reportedly costs less.

### Roadmap and 2025-2026 launches
- 2025: Suki INSIDE for Epic Haiku and Hyperspace, Patient Summaries, Ambient Order Staging, voice editing, MEDITECH Expanse integration, the nursing consortium, the AvaSure and WellSky partnerships, and the UI redesign.
- Jan 2026: HealthEdge care-management ambient.
- June 2026: the Developer Platform added MCP and agentic workflows.
- Aug 2026 Suki Dictation roadmap:
  - streaming ASR
  - natural-language voice editing
  - automated procedure notes
  - interactive clinical Q&A
  - "workflow orchestration" inside the EHR
- The Epic page lists "AI dictation in Epic" and "order entry" as coming soon.
- Stated 2026 themes: deeper specialty coverage, assisted revenue cycle, clinical reasoning, end-to-end workflows, and moving "from documenting what happened to anticipating what comes next."

### Strengths
- Deepest voice-command and dictation layer of the three: one vendor for ambient plus dictation plus commands.
- Broad EHR depth, including MEDITECH and athena native.
- Strong KLAS ROI validation.
- Order staging and a platform/embedded business with EHR vendors as distribution.

### Weaknesses and complaints
- Expensive, with enterprise procurement and weeks of rollout.
- The voice-command learning curve is real, and many users only use the ambient features.
- App Store:
  - An oncologist called it "useless in oncology" because it "rarely recognizes the drugs discussed."
  - Another reviewer said notes are "generic and repetitive" and omit visit details.
- Reddit (as summarized by third parties): r/healthIT calls it "enterprise-oriented" with the longest learning curve. r/FamilyMedicine praises the HPI but calls the A&P "bloated."
- A smaller funding base than Abridge or Ambience.

### How it competes
Suki positions itself as the "assistant," not just a scribe (voice, orders, Q&A, coding). It also sells itself as the embeddable infrastructure layer for EHRs and partners, and it targets mid-market EHRs (MEDITECH, athena) where Abridge and DAX are weaker.

### Sources
- https://www.suki.ai/ ; https://www.suki.ai/clinicians/ ; https://www.suki.ai/epic/ ; https://www.suki.ai/athena-integration/ ; https://www.suki.ai/ehr-integrations/
- https://www.suki.ai/blog/2025-in-review-the-year-ambient-clinical-intelligence-became-foundational/
- https://www.suki.ai/blog/two-years-in-suki-developer-platform-clinical-ai/
- https://www.suki.ai/blog/evolving-the-cursor-how-suki-dictation-is-powering-the-next-era-of-in-ehr-workflows/
- https://www.suki.ai/blog/suki-inside-a-new-way-to-use-suki-for-epic-haiku-available-in-epic-toolbox/
- https://www.suki.ai/press-releases/healthedge-and-suki-introduce-ambient-clinical-intelligence-for-care-management/
- https://developer.suki.ai/documentation/concepts/ambient-clinical-notes/ambient-documentation
- https://developer.suki.ai/documentation/concepts/ambient-clinical-notes/note-sections
- https://apps.apple.com/us/app/suki/id1425102117
- https://klasresearch.com/report/suki-roi-validations-2026-cross-organizational-results-from-suki-s-clinical-intelligence-platform/3869
- https://www.fiercehealthcare.com/ai-and-machine-learning/suki-banks-70m-build-out-ai-assistants-doctors-it-inks-more-health-system
- https://healthtechnologynet.com/2026/09/01/suki-named-a-transformational-innovation-leader-in-ambient-clinical-intelligence-by-frost-sullivan/
- https://www.sevocity.com/ai-ambient-listening-scribe-suki/
- https://www.deepcura.com/resources/suki-ai-review (competitor-authored) ; https://www.trytwofold.com/compare/suki-ai-review (competitor) ; https://medaidirectory.com/blog/suki-ai-review-2026 ; https://www.deepcura.com/resources/best-ai-medical-scribe-reddit

---

## 2. Nabla

### Background
- Founded 2018 in Paris by **Alexandre LeBrun** (ex-Wit.ai, acquired by Facebook), Delphine Groll and Martin Raison. Launched "Nabla Copilot" (a Chrome extension scribe) in 2023 and expanded aggressively into the US.
- Advisors include Yann LeCun and Tony Fadell.
- **Leadership change on July 21, 2026**:
  - **Brian Manning** (ex-President/CRO Bamboo Health, PatientPing, Zocdoc) became CEO.
  - LeBrun became Executive Chairman and Chief AI Officer, and is also CEO of **AMI Labs**, Yann LeCun's world-model lab, which has an exclusive partnership with Nabla toward autonomous clinical agents.
  - Dr. Matt Sakumoto joined as Chief Clinical Product Officer in Feb 2026.
- Funding:
  - $24M Series B (Jan 2024)
  - **$70M Series C in June 2025**, led by HV Capital with Highland Europe, DST Global, Cathay Innovation and Build Collective. Total raised is **$120M**.
  - "Live ARR grew 5x in 6 months." About 60% of the team is engineering.

### Scale and customers
- Scale as of 2025-26: **85,000+ clinicians**, 130+ organizations (June 2025). By Feb 2026 this was "150+ health systems," and by July 2026 "190+ healthcare organizations." About **20M+ encounters per year**. 35+ languages and 55+ specialties.
- Customers:
  - Enterprise systems: **M Health Fairview** (10+ hospitals, 60+ clinics; systemwide ambient plus dictation on Epic, Feb 2026), UCLA Health (randomized trial), University of Iowa Health Care, Carle Health, Denver Health, Aultman (Oracle Cerner, Jan 2026), University of Toledo Health (Apr 2026), Children's Hospital LA, LCMC Health, McFarland Clinic, Mankato Clinic
  - Other organizations: CVS Health, Accolade, Tia, Neighborhood Health
- Outcomes cited:
  - 55% of users save 1+ hour a day, and 27% less burnout.
  - Iowa: 2.6 hrs/week saved and a sustained 26% burnout drop at two years.
  - Denver Health: +15 points patient satisfaction. Carle: 55% save 1 hour or more daily.
  - 89% same-day note completion. "Only 5% of notes edited."
- KLAS: 90.9 (A+ on likely-to-recommend) in Oct 2024. Named to TIME's World's Top HealthTech 2026.

### Clinician workflow, step by step
Surfaces: web app (app.nabla.com in Chrome or Edge), **Chrome extension** (20k users, 5.0 stars, updated Sept 25, 2026), iOS/Android "Nabla Assistant Mobile," **Nabla in Epic Haiku** (Epic Toolbox for Ambient Voice Recognition, Oct 2025), Nabla Connect iFrame embedded in other EHRs, and Nabla Dictation for Mac (July 2026).

1. **Sign in**
   - At first sign-in, the clinician picks a specialty, country and EHR, then signs in with an email passcode.
   - Enterprise users sign in with SSO/SAML or SMART on FHIR.
   - Accounts sync across web, extension and mobile, and encounters appear on every device.
2. **Pick the patient**
   - In Epic, Nabla "mirrors your Epic schedule in real time." The clinician can review past notes, start encounters, and move visit to visit without going back to Epic.
   - Standalone users click **"+ New encounter."**
   - **Patient context** can be added so the note uses chart history.
3. **Consent**
   - Nabla supplies a verbal script: *"I'm using a software tool called Nabla to make it easier to write down my medical notes... Do you consent to the use of this tool during our visit and future visits?"*
   - The script stresses that audio is processed only during the visit and is not stored.
4. **Record**
   - The clinician clicks **"Start consultation."** A live **Transcript** tab shows the conversation with a running timer (in mm:ss, after clinician feedback), and the clinician can switch between the **Transcript** and **Note** tabs mid-visit.
   - Visits can run up to 3 hours with multiple speakers.
   - For telehealth, the Chrome extension captures tab audio from browser-based video visits. It does not work with the Zoom, Teams or WebEx desktop apps.
   - Mobile users are told to enable Do Not Disturb, and Android users to disable Doze.
   - Audio is processed in-browser or streamed and then discarded, and only the transcript and note are kept.
5. **Generate**: the clinician clicks **"Finish and generate note."** The note appears in under 20 seconds, as sections, each with a **copy icon**.
6. **Edit**
   - The clinician edits inline.
   - **Magic edit** (wand icon in the right-side vertical toolbar on web, or "..." next to **Copy note** on mobile) takes an instruction such as "Include more information regarding blood pressure control in the HPI section." Nabla then re-reads the transcript and clicks **"Update note."**
   - Encounter quotes can be inserted into the note.
7. **Patient instructions**: a **"Patient instructions"** tab holds a patient-friendly recap. The clinician can edit it, copy it, or export it to PDF from the dropdown next to Copy.
8. **Export and sign**
   - In integrated EHRs (Epic, athena, Oracle and others), Nabla exports the structured note into the EHR note template or sections.
   - It **suggests new problems, visit diagnoses and vitals** and exports them to discrete Epic fields and flowsheets.
   - The clinician signs in the EHR.
   - Otherwise, **"Copy note"** (or copy per section) and paste.
9. **Dictation**: the dropdown next to "+New encounter" includes **"Start dictated note."** The clinician can pause and resume, use auto or explicit punctuation ("new paragraph," "period"), and completed dictations appear in past encounters. Nabla Dictation also works in Epic Hyperspace and Hyperdrive for patient messages, referrals and letters.

### Note formats and sections
Built-in templates are listed in the Core API docs, with English locale section keys:
- **GENERIC_MULTIPLE_SECTIONS** (general medicine):
  - Chief Complaint, HPI, PMH, PSH, Past Obstetric History, Family Hx, Social Hx
  - Allergies, Current Medications, Immunizations, Vitals, Physical Exam, Lab Results, Imaging Results
  - Assessment, Plan, Prescription, Appointments
- **MULTIPLE_SECTIONS_WITH_ROS**, and **_AP_MERGED** variants of every template, where the A&P is returned as structured per-problem subsections.
- **GENERIC_SOAP** (Subjective/Objective/Assessment/Plan), **GENERIC_SOAP_PLUS_EXAM_TESTS_AP_MERGED** (adds Physical Exam and Diagnostic Tests Ordered), and **GENERIC_APSO_AP_MERGED** (A&P first).
- **GENERIC_SUMMARY**, a single chronological Summary section.
- Specialty templates:
  - **EMERGENCY_** variants
  - **WCC_** (Well Child Care, with a WELL_CHILD_CARE section on development and diet)
  - **PSYCHIATRY_** (with MENTAL_HEALTH_EXAM)
  - **PSYCHOLOGY_MULTIPLE_SECTIONS** (History of Present Complaint, Mental Health History, MSE)
  - **CARDIOLOGY_** (with CARDIOVASCULAR_RISK_FACTORS)
  - Organizations can also have bespoke templates.
- Per-section customization:
  - Style (Auto, Bullet points, Paragraph)
  - Level of detail (Normal, High/"DETAILED")
  - **Split by problem**, "Hide section by default," and "Include differential diagnosis when discussed"
  - Section-level and general **custom instructions**, for example "I am a [specialty], only include information regarding [specialty]," "Make note more concise," or "Include laterality of dominant hand and location of pain." The docs advise not using the words "section" or "template" inside instructions.
- **ChartSync** (API, 2026): the note is generated from a source note, either a DRAFT typed pre-visit or the LAST_SIGNED prior note (its A&P), plus the new transcript. In other words, follow-up notes "build on your last signed note or Epic draft."

Sample A&P output, verbatim from Nabla docs:
```json
{ "key": "ASSESSMENT_AND_PLAN", "title": "Assessment & Plan",
  "content": { "type": "SUBSECTIONS", "subsections": [
    { "id": "550e...", "title": "Hypertension", "text": "Continue lisinopril 10 mg daily." },
    { "id": "6ba7...", "title": "Type 2 diabetes", "text": "Maintain metformin; recheck A1c in 3 months." } ] } }
```
ICD-10 normalization returns, per problem, `I10 Essential (primary) hypertension` and `E11.9 Type 2 diabetes mellitus without complications`, each linked back by `subsection_id`.

Sample ChartSync LAST_SIGNED A&P: "1. Type 2 diabetes — A1c trending down on metformin 500mg BID. Continue current regimen. 2. Hypertension — well controlled on lisinopril 10mg daily."

A Nabla blog sample note skeleton reads: "Chief complaint: Persistent foot pain," followed by HPI, PMH, Physical exam, Assessment & Plan, and Prescription.

### Distinctive features
- The **Chrome extension** was the original wedge: individual doctors could self-serve in minutes.
- Patient instructions tab with PDF export.
- A combined **ambient plus dictation** platform.
- **Nabla Dictation for Mac** (July 28, 2026): the "first fully on-device clinical dictation" app. It is Swift and Core ML on Apple silicon, works with PowerMic and SpeechMike, integrates with Epic, and M Health Fairview uses it at scale. Nabla says 44% of its active clinicians use Apple devices.
- Coding: ICD-10, HCC, MCC and E/M suggestions. CPT coding is reportedly still on the roadmap.
- Multilingual encounters (35+ languages; strong in French and Spanish).
- **Nabla Connect** API/iFrame for EHR vendors and digital health companies.
- The **Navina partnership** (July 2025) adds real-time care gaps and HCC.
- Nabla published an early **CHAI Applied Model Card**.

### UI description
- Reviewers call it "polished and modern."
- Web app layout:
  - an encounter list or past encounters on the left
  - the main pane with **Transcript** and **Note** tabs, plus a **Patient instructions** tab after generation
  - a right-side **vertical toolbar** (Magic edit and others)
  - a prominent **"Copy note"** button with a dropdown (regenerate with instructions, generate patient instructions, PDF)
  - a **"+ New encounter"** split button whose dropdown includes "Start dictated note"
- Before generation, a live timer and a "Finish and generate note" call to action are shown.
- Brand: dark navy and white with a minimal look. The ∇ nabla symbol is the logo.
- Mobile ("Nabla Assistant Mobile," iOS): 3.9 stars (8 ratings), version 69.0.0. It is a record screen with a one-click summary. One reviewer said it silenced their ringer and they missed urgent pages.

### EHR integrations
- Epic: Toolbox member, Haiku-embedded, Hyperspace and Hyperdrive dictation, and discrete write-back of problems, diagnoses and vitals.
- Oracle Health/Cerner (Aultman), athenahealth, NextGen, Greenway, Altera, and ArYa, plus "20+" EHRs through Nabla Connect (iFrame).
- SMART on FHIR, SSO/SAML/SCIM. Go-live is quoted as "days," though a deep dive says enterprise rollouts take 4-6 weeks.

### Pricing
- Historically **Free** (30 consults/month, no BAA) and **Pro at about $119/month** for unlimited use.
- Enterprise pricing is custom; third-party estimates range from $99 to $399 per provider per month.
- The public site no longer lists prices, and the company is now enterprise-led.

### Roadmap and 2025-2026 launches
- 2025: Series C; Nabla Dictation (Feb 2025); Epic Toolbox and Haiku (Oct 2025); Nabla Connect iFrame (Oct 2025); Navina partnership.
- 2026:
  - M Health Fairview systemwide rollout, Aultman on Oracle Cerner, and Toledo
  - Mac on-device dictation
  - ChartSync follow-up notes and structured A&P in the API
  - the new CEO
- Stated direction: an **agentic platform** covering orders, nursing, pre-charting, coding, "agentic EHR commands," custom agents for departments, and connecting even to "API-less legacy tools."
- The AMI Labs world-models partnership aims at autonomous clinical agents. The company says it is "1% done."

### Strengths
- Fast note generation (under 20 s) with low edit rates.
- Strong self-serve and bottom-up heritage.
- Multilingual support, a clean UI, and an Apple and on-device story.
- A broad mid-market EHR list plus Epic Toolbox.
- Transparent safety work (model cards, evaluation blog), and an RCT (UCLA) showing a 9.5% cut in time-in-note.

### Weaknesses and complaints
- The trial noted "occasional clinically major inaccuracies" (mean inaccuracy score 2.8 out of 5).
- Mobile app: ringer silencing, "nonsense words" in dictation, and a slow or failing desktop app led one user to cancel.
- Pricing is opaque now that the company is enterprise-led.
- Subspecialties need template tuning, and CPT coding is not yet available.
- A Trustpilot review complained about unresponsive sales.
- The founder-CEO transition adds execution risk in a market where Epic, Microsoft, Oracle and Amazon are all building native scribes.

### How it competes
Nabla competes on speed, lighter and cheaper deployment, and multilingual support. Its Epic-native plus Apple-native dictation story lets it replace both Dragon and a separate ambient vendor. It is strong in FQHCs, children's hospitals, virtual-first care and mid-market EHRs.

### Sources
- https://www.nabla.com/ ; https://www.nabla.com/press ; https://www.nabla.com/ehr ; https://www.nabla.com/epic ; https://www.nabla.com/connect
- https://www.nabla.com/blog/70m-series-c ; https://www.prnewswire.com/news-releases/nabla-raises-70m-series-c-to-deliver-agentic-ai-to-the-heart-of-clinical-workflows-bringing-total-funding-to-120m-302483646.html ; https://www.statnews.com/2025/06/17/nabla-raises-70-million-ambient-market-heats-up/
- https://www.prnewswire.com/news-releases/m-health-fairview-selects-nablas-combined-ambient-ai-assistant-and-dictation-solution-to-power-next-generation-clinical-documentation-302679672.html
- https://www.healthcaredive.com/news/nabla-appoints-new-ceo-brian-manning/825972/ ; https://hitconsultant.net/2026/07/21/nabla-appoints-brian-manning-ceo-contextual-clinical-ai/
- https://www.nabla.com/press-release/nabla-launches-medical-grade-dictation-product-built-for-apple-devices
- https://nabla.com/press-release/nabla-joins-epic-toolbox-deepening-its-integration-with-epic
- https://www.navina.ai/news/nabla-and-navina-announce-strategic-partnership-to-supercharge-clinician-workflows-with-clinical-intelligence-and-ambient-ai
- Help center: https://help.nabla.com/en/articles/781890 (access) ; /769346 (patient instructions) ; /1370434 (dictation) ; /4718018 (custom instructions) ; /4856962 (formatting) ; /780930 (magic edit) ; /4854722 (consent) ; https://www.nabla.com/copilot-patient-consent
- API docs: https://docs.nabla.com/core-api/guides/note-templates/note-templates-sections ; https://docs.nabla.com/core-api/guides/assessment-and-plan ; https://docs.nabla.com/core-api/guides/chartsync ; https://docs.nabla.com/core-api/guides/note-templates/note-customization
- https://www.nabla.com/blog/evaluating-medical-note-generation
- https://chromewebstore.google.com/detail/nabla/gdhbaoemgglcgmkidhnhcellgnehaeol ; https://apps.apple.com/us/app/nabla-assistant-mobile/id6503088605
- https://www.healthcareaiguy.com/p/company-deep-dive-nabla ; https://www.commure.com/blog-scribe/nabla-ai-review (competitor) ; https://www.trytwofold.com/compare/nabla-copilot-review (competitor) ; https://www.medequipdirectory.com/guides/ambient-ai-scribe-comparison-guide-2026-dax-abridge-nabla-deepscribe/ ; https://www.spotsaas.com/product/nabla/pricing

---

## 3. DeepScribe

### Background
- Founded 2017 in San Francisco by UC Berkeley students **Akilesh Bapu, Matthew Ko (CEO) and Kairui Zeng**. It is one of the earliest pure-play ambient scribes.
- It originally used a human-in-the-loop QA step, which some older reviews blame for hours-long note delays. It is now marketed as "fully automated" and runs on a proprietary clinical LLM trained on more than 3M labeled medical conversations.
- Funding:
  - **$30M round in Jan 2022**, led by Index Ventures (Nina Achadjian), with Alexandr Wang, Dylan Field, Bee Partners, Stage 2 and 1984 Ventures. Sources disagree on whether this was the Series A or B.
  - Total is about **$60M over 3 rounds** (Tracxn), though some trackers show $37M.
  - No 2025-26 round found. About 101 employees (May 2026).
- It has **pivoted hard to oncology** as its wedge and calls itself the "Ambient Operating System for oncology."

### Scale and customers
- DeepScribe says it is used "across **90% of U.S. community oncology** organizations," and that its customers see about **40% of all U.S. cancer visits**. It expected to document **3.1M+ cancer visits per year** (Nov 2025). Monthly oncology volume quadrupled from Jan to Nov 2025.
- More than 95% adoption in recent enterprise deployments, and "85% clinician adoption."
- Customers:
  - Oncology networks: Texas Oncology, Florida Cancer Specialists, New York Cancer & Blood Specialists, Tennessee Oncology, OneOncology, Rocky Mountain Cancer Centers, Compass Oncology, CCC Nevada, Minnesota Oncology, Mary Bird Perkins, CARTI
  - Health systems: Ochsner Health; older references also cite HealthPartners and Prisma Health
- **Flatiron Health partnership (Jan 2025)**: DeepScribe is the first ambient partner for OncoEMR's 4,200+ providers. It also integrates with Ontada iKnowMed Gen 2.
- KLAS:
  - **98.8** in the 2025 Spotlight (the press release says 98.3, the highest ambient score cited)
  - Three Top-5 spots in the 2025 Emerging Solutions Top 20 (outcomes, clinician experience, patient experience)
- Outcomes:
  - Aug 2025 study (405,210 encounters, 17 practices): **+16% diagnoses per visit**, +22% ICD-10 specificity, +22% comorbidities captured, +45% SDOH documentation, and 84.2% of notes closed within 72 hours.
  - Marketing claims 2.2 hrs/day saved, a 99.92% note approval rating, and 1.6-minute average chart closure. One oncologist said: "90-95% of the time I'm not making any adjustments."

### Clinician workflow, step by step
Surfaces: iPhone app (iOS; also iPad and visionOS; **no Android**), desktop/web, embedded in OncoEMR and iKnowMed, and Epic including Haiku.

1. **Pre-visit, with SmartPrep** (launched Apr 27, 2026 as "the next evolution of chart summarization"):
   - For new consults, it synthesizes up to 2 years of records into a structured **oncologic HPI**.
   - For follow-ups, it surfaces **interval events** and reconciles prior plan items.
   - It pulls key details from multi-page pathology and radiology reports.
   - It shows a **prioritized checklist** of items needing attention.
   - It is available on web, iOS, or inside the EHR. DeepScribe says prep time per patient falls to about a third.
2. **Select patient**: the clinician opens the app and "select[s] a patient from your synced Epic (or OncoEMR) schedule."
3. **Consent**: verbal, handled by the practice. No specific consent UI was found.
4. **Record**
   - The clinician taps record. App v8.3.0 merged SmartPrep and recording into one screen with a **floating record button**, so the prep summary stays visible while recording.
   - Real-time processing runs "hundreds of model passes per visit" and uses EHR context (labs, imaging, meds, diagnoses).
   - More than 110 languages are claimed.
   - **DeepScribe Assist** gives real-time point-of-care prompts (HCC gaps, value-based care) during the visit.
5. **Note generation**: this is "Diagnosis Intelligence." The draft is a specialty note that references prior visits, and it arrives with **E/M, ICD-10 and HCC codes** (CDI support).
6. **Review and edit, with Customization Studio**
   - The clinician edits the note, then presses **"Learn."** DeepScribe proposes rules from the edits, and the clinician accepts them as new defaults.
   - Any rule can be opened and rewritten in plain language.
   - "Blueprints" define custom sections and discrete fields.
   - Rules can be set per visit type (consult, follow-up, exam).
   - "Day-one accuracy" comes from ingesting the clinician's past notes to match their style.
   - There are three layers: oncology model, then org settings, then personal preferences.
7. **Approve and write-back**
   - The clinician approves, and the note syncs to the EHR "within seconds" with no copy/paste.
   - In OncoEMR and iKnowMed, it writes into **discrete fields** and embeds prep and review.
   - In Epic, codes sync too.

### Note formats and sections
- SOAP and custom formats, with 50+ templates and 50+ specialties.
- Core: oncology, hematology/oncology. Secondary: cardiology, GI, neurology, orthopedics, urology, primary care, value-based care, rheumatology, allergy, OB.
- Oncology-oriented sections described: **Oncologic History / HPI** (synthesized pre-visit), **Interval History**, **Impressions**, problem-organized Assessment & Plan, and pathology and radiology findings.
- Staging, biomarkers and treatment lines are implied by SmartPrep's path and imaging extraction but are not enumerated publicly.
- No verbatim sample note text was found publicly.

### Distinctive features
- Deep oncology specialization, with native OncoEMR and iKnowMed integration, which no other scribe has at this depth.
- SmartPrep pre-visit intelligence.
- Coding intelligence (E/M, ICD-10, HCC) with published diagnosis-capture evidence.
- Customization Studio's "Learn from edits" loop.
- Roadmap into **clinical trial matching, biomarker identification and treatment planning**.

### UI description
- iPhone-first app with a **synced schedule list**.
- The patient screen shows the **SmartPrep summary** (prioritized checklist and oncologic history) with a **floating record button** overlaid.
- The note review screen has sections, codes, an edit mode and a **"Learn"** action, plus approve/sync.
- Branding is a clean white UI with DeepScribe navy/blue accents (inferred from the marketing site).
- The App Store listing (v8.4.1, Sept 7, 2026; 49.5 MB) has too few ratings to show a score.
- Capterra reviewers say one version could not be used from a laptop, only mobile, although desktop is now advertised.

### EHR integrations
- Oncology EHRs: OncoEMR (Flatiron), iKnowMed Gen 2 (Ontada).
- Epic, including Haiku and bidirectional context.
- Third-party lists also include athenahealth, eClinicalWorks, AdvancedMD, DrChrono (partner marketplace), ModMed, Objective Medical Systems, NextGen and Oracle Cerner. These should be verified case by case.

### Pricing
- Not public, with no self-serve or free trial. Estimates run **$350-$500+ per provider per month**; older or other estimates say $200-$400.
- Annual auto-renewing contracts, with reported setup fees of $500-$1,000.

### Roadmap and 2025-2026 launches
- 2025: the Flatiron/OncoEMR partnership, the oncology outcomes study, and rapid volume growth.
- 2026: SmartPrep (Apr 2026, showcased at the Community Oncology Conference), and the combined prep-plus-record app.
- Stated direction:
  - an "Ambient Operating System" spanning the whole oncology journey
  - trial matching, biomarkers and treatment planning
  - revenue cycle
  - more specialty verticals (cardiology, urology, GI and others)

### Strengths
- Near-monopoly share in community oncology, with the highest KLAS scores.
- Native oncology EHR integrations and published coding and diagnosis-capture outcomes.
- Strong personalization loop and high clinician adoption.

### Weaknesses and complaints
- Expensive and opaque, with auto-renew contracts ("stuck for another 12 months"). A Reddit post called it "horribly overpriced."
- iOS reliability: "Every time your phone rings it stops the visit. Then it locks the app... delete and re-download."
- No Android app.
- Occasional incomplete notes that need reprocessing, and historical delays from human QA.
- Small team (about 100) and modest funding against well-funded rivals.
- Narrow oncology concentration is a risk, as is Epic's own native ambient scribe.

### How it competes
DeepScribe competes on vertical depth rather than breadth: oncology-specific models, OncoEMR/iKnowMed discrete write-back, pre-visit synthesis, and coding ROI. It avoids head-to-head fights with Abridge and DAX at general health systems.

### Sources
- https://www.deepscribe.ai/ ; https://www.deepscribe.ai/specialties/oncology ; https://www.deepscribe.ai/solutions/customization-studio ; https://www.deepscribe.ai/ehr-integrations/epic
- https://www.deepscribe.ai/resources/deepscribe-introduces-smartprep-comprehensive-pre-visit-intelligence ; https://www.prnewswire.com/news-releases/deepscribe-introduces-smartprep-comprehensive-pre-visit-intelligence-for-oncology-302753452.html
- https://www.prnewswire.com/news-releases/deepscribes-oncology-momentum-accelerates-ambient-ai-set-to-capture-3-1-million-cancer-care-visits-annually-302610937.html
- https://www.prnewswire.com/news-releases/deepscribe-solidifies-ambient-ai-leadership-in-oncology-with-new-study-and-accelerated-growth-302557045.html
- https://www.prnewswire.com/news-releases/deepscribe-and-flatiron-health-announce-partnership-to-bring-oncology-specific-ambient-ai-to-flatirons-4-200-providers-302356795.html ; https://www.mobihealthnews.com/news/deepscribe-partners-flatiron-health-oncology-focused-ambient-ai
- https://www.deepscribe.ai/resources/next-stage-ambient-ai-oncology-care ; https://www.deepscribe.ai/resources/deepscribe-adds-customization-studio-to-fully-automated-ai-scribe
- https://www.businesswire.com/news/home/20220111005911/en/DeepScribe-Raises-%2430M-To-Become-First-Widely-Accepted-Application-of-Voice-AI-in-Healthcare ; https://tracxn.com/d/companies/deepscribe/__ycOGgIZmzrdCxdUAkN0ABj5QEMaW9luBcDUpFs9Cs9g
- https://apps.apple.com/au/app/deepscribe/id1499229832 ; https://www.capterra.com/p/232206/DeepScribe/reviews/
- https://www.veroscribe.com/blog/deepscribe-ai-scribe-guide ; https://www.veroscribe.com/blog/deepscribe-review-2026 (competitor) ; https://www.deepcura.com/resources/deepscribe-review (competitor) ; https://www.medequipdirectory.com/guides/ambient-ai-scribe-comparison-guide-2026-dax-abridge-nabla-deepscribe/

---

## Cross-company comparison

| | Suki | Nabla | DeepScribe |
|---|---|---|---|
| Founded / HQ | 2017, Redwood City | 2018, Paris (US-expanded) | 2017, San Francisco |
| Funding | ~$168M (Series D $70M, Oct 2024) | $120M (Series C $70M, Jun 2025) | ~$60M (last $30M, Jan 2022) |
| Scale | 400+ orgs; usage 3x in 2025 | 85k+ clinicians, 190+ orgs, ~20M enc/yr | 90% of US community oncology orgs; 3.1M cancer visits/yr |
| Wedge | Voice assistant, dictation, orders; embeddable platform | Fast, clean self-serve scribe; multilingual; Apple and on-device dictation | Oncology vertical; pre-visit synthesis; coding |
| Start visit | Tap patient on synced schedule (mobile/web/Haiku) | "Start consultation" / "+New encounter" (web, extension, mobile, Haiku) | Pick patient from synced schedule, then floating record button |
| Edit | Voice editing, problem-based charting | Inline edit, Magic edit, custom instructions | Edit, then "Learn" (Customization Studio) |
| Write-back | LOINC sections; Epic INSIDE; athena/MEDITECH native | Section export plus discrete problems, Dx and vitals (Epic); copy per section | Discrete fields in OncoEMR/iKnowMed; Epic sync |
| Coding | ICD-10/HCC/CPT/E&M | ICD-10/HCC/E&M (CPT pending) | ICD-10/HCC/E&M, published Dx-capture lift |
| Price (est.) | $299-$399+/mo | Was free/$119 Pro; enterprise $99-$399 | $350-$500+/mo, annual auto-renew |
| Agentic direction | MCP, agentic platform, order entry, workflow orchestration | Agentic platform, custom agents, AMI Labs world models | Ambient OS: trial matching, biomarkers, treatment planning |

Design takeaways for Chartside:
- Every vendor has converged on the same flow: **schedule, then tap patient, then record, then sectioned note with codes and patient instructions, then edit, then push to EHR**.
- The differentiators live in three places:
  - pre-visit context (SmartPrep, Suki Patient Summary, Nabla ChartSync)
  - structured per-problem A&P with codes linked to each problem (Nabla's subsection IDs)
  - an edit-learning loop (DeepScribe "Learn," Nabla custom instructions)
- Common complaints to design against:
  - phone calls interrupting mobile recording, which all three have
  - generic or bloated A&P
  - poor drug-name recognition in specialties
  - opaque pricing
