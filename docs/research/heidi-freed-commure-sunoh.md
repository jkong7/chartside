# Batch C: Heidi Health, Freed, Commure Ambient (incl. Augmedix), Sunoh.ai

Research date: 2026-09-27. Sources are listed per section.

**Caveats**
- Many "reviews" in this space are SEO pages written by competitors (Commure, Twofold, DeepCura, Vero, Marvix). I use them only for pricing and feature facts I could cross-check, and I label them as competitor-authored.
- I did not view screenshots directly. The UI descriptions come from help-center text, changelogs and app store listings, which name the buttons, tabs and colors.
- Heidi's pricing numbers disagree between sources, because the plans were renamed and repriced in 2026. The ranges are given below.

---

## Quick comparison

| | Heidi Health | Freed | Commure Ambient (+Augmedix) | Sunoh.ai (eCW/healow) |
|---|---|---|---|---|
| HQ / founded | Melbourne, 2019 (formerly Oscer) | San Francisco area, 2022/23 | SF; Commure + Athelas merger; Augmedix acquired 2024 ($139M) | Sister company of eClinicalWorks (healow); launched Oct 2023 |
| Latest funding | $100M Series C at $900M valuation (Blackbird), plus $240M General Catalyst CVF growth (Sept 2026) | $30M Series A, Sequoia (Mar 2025); ~$34M total | $70M at $7B valuation (May 2026); $200M GC CVF (Jun 2025) | Internal (eCW is private and bootstrapped) |
| Scale | 175M+ patient visits supported; 2M+ consults/week (Oct 2025); 190 countries, 110 languages; ~$50M ARR (Apr 2026) | 26,000+ clinicians, 1,300+ clinics, 32.6M visits in 2025; ~$20M ARR | 40M+ ambient appointments/yr; 130+ health systems; 500+ orgs; 60+ EHRs | 100,000+ providers claimed (older pages say 80k and 90k) |
| Segment | PLG to solo clinicians worldwide, now moving into enterprise (NHS, Beth Israel Lahey, Australia and NZ public health) | Solo and independent practices only ("not designed for large health systems") | Enterprise health systems (HCA, Tenet, Dignity), plus a self-serve "Commure Scribe" | eCW's installed base (small and mid practices, FQHCs), plus EHR-agnostic |
| Entry price | Free tier; paid ~$99–150/user/mo | $39 / $79 / $104–119 per month | Scribe $59/mo annual ($89 monthly); enterprise custom | $149/user/mo (list $199); historical $1.25/visit |
| Signature | Template language and Template Community, Ask Heidi, Evidence, Remote hardware, 110 languages | Learns your style (Auto Learn / Learn format), simplest UX, Chrome "Push to EHR" | Human-in-the-loop tiers (Assist/Live), autonomous coding + RCM, deep Epic/MEDITECH/Cerner | Native import into the eCW progress note, with order pre-fill (labs, imaging, meds) |

---

## 1. Heidi Health

### Company background
- Founded 2019 in Melbourne by Dr. Tom Kelly (CEO, a vascular surgeon), Waleed Mussa (CFO) and Yu Liu (CTO). It started as Oscer, a medical-education product, and pivoted to an AI scribe.
- Funding:
  - Seed and Series A led by Blackbird.
  - Series A ($16.6M USD).
  - Series B: $65M USD, closed Oct 6 2025, led by Point72 Private Investments, at a $465M valuation.
  - Series C: $100M, Sept 2026, led by Blackbird, at a $900M valuation. It came with a $240M "growth investment" from General Catalyst's Customer Value Fund, for $340M of new capital in total.
  - Other investors: Headline, Phoenix Court (LocalGlobe/Latitude), Possible Ventures.
- Scale:
  - Mar 2025: 1M consults/week.
  - Oct 2025: 2M+ consults/week, 73M consults total, 116 countries, 110 languages, "tens of thousands" of clinicians, 200+ specialties.
  - Sept 2026: 175M+ patient visits supported, 67M+ clinical hours, 190 countries.
  - ARR reportedly $50M in April 2026, up from $1M two years earlier.
  - Heidi Evidence has answered more than 10M queries.
- Leadership hires: CMO Dr. Simon Kos (ex-Microsoft CMO); CRO Paul Williamson (ex-Plaid).
- Flagship customers:
  - UK: NHS England Midlands, as sole supplier to 15 acute and community trusts, all ICBs and 1,239 GP practices; Cambridge University Hospitals; North West London Acute Provider Collaborative; Modality Partnership. It is DTAC-compliant and on the NHSE AVT registry.
  - Australia: Monash Health, Royal Children's Hospital Melbourne, Children's Health Queensland, Metro South.
  - New Zealand: every emergency department.
  - Canada: Yukon Government.
  - US: Beth Israel Lahey Health (89% of providers satisfied with note quality), MaineGeneral.
  - R1 RCM partnership for US revenue-cycle work.
  - KLAS Spotlight report (Sept 2025) gave high scores.
- Segment: started as bottom-up and freemium for individual GPs and allied health. It is now aggressively enterprise (public health systems in the Commonwealth countries). It is broad across disciplines: medicine, nursing, allied health, dental, vet and mental health.

### Clinician workflow (from the help center)
1. **Left sidebar:** "Scribe" at the top, then Evidence, Tasks, Templates, Settings. Next to it is a **Sessions list**, with one tab per consult; with "Upcoming Patients" you can pre-create these tabs from a screenshot or CSV of the appointment book.
2. **Start a session.** Click "Add patient details" (name or identifier; this links past sessions and builds a **Patient Profile** of meds, allergies, history and DOB). Pick a template, or let **Auto Mode** choose one (new default, 2026).
3. **Consent.** If the org has "Require Patient Consent" enabled, a checkbox pop-up must be confirmed before transcription starts. Many clinicians instead put a verbatim consent line in their template (see below).
4. **Record.** Click the **green "Transcribe" button (top right)**. It turns **red and reads "Transcribing"**, and a green waveform next to it confirms mic input. There are other input modes too:
   - Dictate mode
   - Upload audio file
   - Telehealth / system-audio capture on desktop, with per-app audio selection
   - Mobile app (offline capable)
   - **Heidi Remote**, a clip-on device
   Sessions can run from 5 seconds to 2 hours, and you can pause and resume them.
5. **Context tab.** Add referral letters, results, prior notes and PDFs, "anything not verbalised". Integrated EHRs pass diagnosis and medication details in here.
6. **Transcript tab.** A live transcript during the visit that stays available afterward.
7. **Note tab.** The note auto-generates on stop, using the selected template. Voice settings let you choose processing style (Fast or Best) and detail level (Brief, **Goldilocks**, Detailed, Super Detailed). Input and output languages can differ.
8. **Edit.** A rich-text editor with bold/italic/underline and snippets (shorthand-triggered text). The word library does auto-replacement and abbreviations. Right-click Find & Replace works across all outputs. **Ask Heidi** is a prompt bar for "make this shorter," "write a referral to cardiology," clinical questions and reformatting. Version history (Apr 2026) records each edit by user and allows one-click revert.
9. **Documents.** Click **"Create"** (top right) and pick a document template (referral letter, patient letter, medical certificate, discharge summary, handout). The document opens in a new tab beside the note. **Queue Documents** generates several documents automatically at the end of every session. **PDF Forms** auto-fill uploaded paper forms (120+ prebuilt, e.g. Medicare and mental-health care plans).
10. **Tasks.** Follow-up actions (tests, referrals, reviews, documents) are auto-extracted into a personal task list.
11. **Coding.** Diagnostic codes are ranked by relevance and you confirm them. Advanced coding is in the paid tier; US coding is via R1.
12. **Get it into the EHR.** Options:
    - Copy (whole note or per section)
    - Export as PDF or DOCX
    - Chrome extension / desktop app "Dictate anywhere"
    - Integrations, either "Connect" (backend) or "Embedded" (side-panel widget inside the EHR)
13. **Sign-off / status.** Notes carry a **Draft or Approved** status for team review. Sessions can be shared with colleagues at View, Edit or Full Access level, or by secure OTP link.

### Templates and note formats
- **Default templates:** SOAP, SOAP (Issues) with a problem list, H&P, and H&P (Issues). Profession-specific formats include ADIME (dietitians) and IMIST-AMBO (paramedics). Setting your specialty unlocks more.
- **Template language:** a plain-text DSL. This is Heidi's core differentiator.
  - Section heading as plain text: `Subjective:`
  - `[Placeholder]` in square brackets = what content goes there, e.g. `[Chief complaint]`.
  - `(Instruction)` in round brackets = how to write it, e.g. `(Only include if explicitly mentioned in transcript, else omit section entirely.)`
  - `"Verbatim"` in quotes = always printed exactly as written.
  - Global instructions go at the very top or bottom of the template.
  - Hygiene rules: don't nest brackets, don't mix bracket types, don't put examples inside placeholders.
  - Newer additions: tables in templates (Apr 2026), conditional formatting, version control.
- **Verbatim consent example from Heidi docs:**
  `"Consent for the use of Heidi Health, an AI-assisted documentation tool, was obtained from the patient prior to this encounter." (write this verbatim and include in every note generated)`
- **Formatting-instruction example:** `(Never use bullet points. Write in full sentences and paragraph format.)` This turns "- 45-year-old male presenting with chest pain / - Pain started 2 days ago" into "Mr Johnson is a 45-year-old male presenting with chest pain that started 2 days ago."
- **Template creation:** "My Templates" → "+ Create template". Either upload example notes (Heidi infers the template) or describe the structure you want.
- **Template Community** (launched Sept 5 2024; heidihealth.com/templates):
  - A public library of clinician-made templates, searchable by title, creator or description.
  - Filters: specialty, region, category. Sort: "Most popular" or "Most recent".
  - Each template shows the creator's name and a use count. Click **"Use template"** to copy it to your library.
  - Templates are reviewed against best practice before they are published.
  - Team template sharing and org-to-org sharing were added in 2026.
- **Sample note text (Heidi marketing):**
  ```
  Subjective
  CC (Chief Complaint): Patient, a 55-year-old male, presents with severe chest pain.
  Objective
  Vital Signs: Blood pressure 150/90 mmHg, heart rate 102 bpm, respiratory rate 22 breaths/min, oxygen saturation 94% on room air.
  Assessment
  Primary Diagnosis: Acute Inferior Wall Myocardial Infarction.
  Plan
  Immediate administration of aspirin, nitroglycerin, and morphine for pain relief.
  ```
  Reddit (u/grey-doc) describes the output style as "almost perfect. Phrasing is terse, hallucination rate low."

### Distinctive features
- **Ask Heidi:** an in-session AI assistant.
- **Heidi Evidence:** launched Feb/Mar 2026. Citation-backed answers from guidelines (BMJ, NICE and others). Patient-context-aware, with live evidence suggestions. On mobile. Chat history, bulk PDF "collections", and sharable threads.
- **Heidi Comms:** calls, bookings, reminders, follow-ups.
- **Heidi Remote** (Mar 23 2026): a 21 g clip-on mic.
  - 360° omnidirectional mic with noise reduction.
  - 14 h battery; 32 GB storage (100+ h of recordings).
  - End-to-end encryption; works offline and syncs later.
  - Pairs with iOS first. Sold in AU, US, CA, UK and NZ.
- **Dictate:** a desktop hotkey tool, "voice wherever your cursor lands". Plus session, inline and mobile dictation.
- **Languages:** 110. Input and output languages are set separately, and several languages can be used in one session.
- **Other:**
  - Split-screen tabs.
  - CPD/CME tracking.
  - Team workspaces, with free assistant seats.
  - Custom export headers and footers.
  - Apps for web, macOS/Windows desktop, iOS and Android (iOS 4.7★, ~2.5K ratings).
  - Certifications: SOC 2, ISO 27001, ISO 42001, HIPAA, GDPR, Cyber Essentials+, UKCA.
  - No audio retained after transcription.

### UI description (text-derived)
- A three-pane web app: a left nav rail (Scribe/Evidence/Tasks/Templates/Settings), a sessions column, and a main workspace.
- The workspace has a header row with patient details, the template selector, the language toggle, and the green Transcribe button at the far right. Below it are the tabs **Context | Transcript | Note**, plus document tabs that open beside the note, and the **Ask Heidi** input bar at the bottom.
- The top-right "Create" button makes documents.
- Recording state is color-coded: green (idle) → red "Transcribing", with a green waveform.
- The brand uses a warm, "friendly" look (off-white/cream backgrounds, deep-purple accents); the name "Heidi" is positioned as a colleague.

### Integrations
- **Epic:** SMART on FHIR, writing back via SmartSections. Hyperspace, Hyperdrive, and Haiku mobile (Apr 2026). Epic Toolbox listed.
- **Oracle Cerner:** PowerChart and FirstNet, with section mapping to MPage components (Mar 2026).
- **US:** athenahealth (Marketplace), eClinicalWorks (via Vim).
- **UK:** EMIS and SystmOne (IM1).
- **AU/NZ:** Best Practice, Medical Director, Gentu, Cliniko, Halaxy, MediRecords.
- **Also:** Semble, IntakeQ/PracticeQ, and a public API and widgets for EHR and telehealth vendors.
- EHR write-back is gated to the Practice/Enterprise tiers.

### Pricing (conflicting; the 2026 repackaging)
- **Official page:** Free, Clinician (14-day trial), Teams ("Talk to us") and Enterprise. Amounts are not shown on the page.
- **Free:** unlimited transcription, standard templates, tasks, and limited Ask Heidi, advanced templates and patient linking. Third parties describe the limit as "10 Pro Actions/mo".
- **Clinician:** reported at $150/user/mo billed annually (Vero, Commure). Other sources say $110 or ~$99; it was previously ~$90. Includes unlimited Evidence, CPD tracking, sharing, advanced coding.
- **Evidence Plus:** ~$40/mo.
- **Practice/Teams:** $99–180/user/mo depending on source, plus EHR write-back.
- **Enterprise:** custom (EHR integration, SSO, custom hosting).
- Free for UK GP trainees in practice.

### Roadmap / launches 2025–2026
| Date | Launch |
|---|---|
| Sept 2024 | Template Community, new sidebar |
| 2025 | Tasks, Patient Profiles, PDF Forms, Upcoming Patients, desktop app, Dictate |
| Feb/Mar 2026 | Evidence |
| Mar 2026 | Remote hardware, Cerner integration, direct session sharing, Evidence on mobile, 7 new Android languages |
| Apr 2026 | Version history, form editing in-session, template tables, Epic Haiku, Auto Mode, template queues |
| Sept 2026 | Series C; stated push "beyond doctor's notes" into Comms and clinical guidance |

### Strengths
- The most powerful template customization, plus a community library, so network effects.
- A generous free tier.
- Multilingual (110 languages).
- Broad discipline coverage.
- Fast note turnaround.
- Strong enterprise wins outside the US.
- A wide platform: Evidence, Tasks, Documents, Forms, hardware.

### Weaknesses and complaints
- Reddit (r/medicine, r/emergencymedicine): hallucinations and conflated problems in long, multi-problem visits.
- UI is sluggish on old clinic PCs.
- App Store: "the app has gotten incredibly buggy"; battery drain and overheating; lost transcriptions.
- Trustpilot: 3.8/5 over ~465 reviews. Quotes: "Now has too many hallucinations. Becoming unsafe", "Extremely unreliable, glitchy". Support is described as bot-like.
- 2026 price increase.
- EHR write-back is not on the self-serve Clinician tier.
- Competitors claim it has no adaptive "learn my style" behavior (templates are explicit, not learned).
- Newer to the US market.

### How it competes
- Wins on price (free), template flexibility and international reach.
- Moving upmarket against Abridge, Microsoft DAX and Nabla in public health systems.
- Positions as an "AI Care Partner" rather than just a scribe.

**Sources**
- https://insurance-edge.net/2026/09/23/ai-healthcare-solution-heidi-secures-100m-in-series-c-round/
- https://www.heidihealth.com/en-us/blog/heidi-series-b
- https://www.startupdaily.net/topic/funding/heidi-health-bags-98-million-series-b-at-703-million-valuation/
- https://sacra.com/c/heidi-health/
- https://github.com/api-evangelist/heidi-health
- https://support.heidihealth.com/en/articles/14648425-getting-started-with-heidi
- https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary
- https://support.heidihealth.com/en/articles/14648446-templates-101-the-basics
- https://support.heidihealth.com/en/articles/9817515-improving-your-heidi-templates-an-intermediate-guide
- https://sites.google.com/heidihealth.com/heidi-health-onboarding-mgh/customizing-templates
- https://www.heidihealth.com/en-us/changelog/template-community
- https://www.heidihealth.com/support/en/articles/9747185-getting-started-with-community-templates
- https://www.heidihealth.com/en-us/progress-notes/heidi-updates-march-2026
- https://www.heidihealth.com/en-us/progress-notes/april-2026
- https://www.heidihealth.com/en-us/blog/heidi-launches-hardware
- https://www.heidihealth.com/en-us/blog/ai-soap-note-generator
- https://www.heidihealth.com/en-us/pricing
- https://www.heidihealth.com/en-ca/integrations
- https://www.heidihealth.com/en-us/epic-integration
- https://www.heidihealth.com/en-us/oracle-cerner-integration
- https://apps.apple.com/us/app/heidi-ai-care-partner/id6504471106
- https://www.veroscribe.com/blog/heidi-health-review-2026 (competitor-authored)
- https://www.commure.com/blog-scribe/heidi-health-review (competitor-authored)
- https://www.iatrox.com/blog/heidi-health-review-2026-ai-scribe-gp
- https://www.trytwofold.com/blog/reddit-family-medicine-scribe-review
- https://secure.businesswire.com/news/home/20250922183902/en/ (KLAS)

---

## 2. Freed

### Company background
- Founded 2022/23 by **Erez Druk** (CEO, ex-Facebook engineer) and his wife, **Dr. Gabriella Meckler** (a physician). The origin story is watching her chart at night.
- Funding: **$30M Series A led by Sequoia**, March 2025. This was its first institutional round; ~$34M total. No later round had been announced as of late 2026.
- Revenue: ~$19–20M ARR in March 2025 (+134% YoY). Druk has publicly referenced ~$20M ARR.
- Scale:
  - March 2025: 17,000+ paying customers across 96 specialties.
  - 2026 homepage: **26,000+ clinicians, 1,300+ clinics, 32.6M patient visits transcribed in 2025**, "5.9M hours returned", 100+ specialties.
- Named customers: Behavioral Health Systems, Camarena Health, Eleanor Health, Entira Family Clinics, Family Health Services, Full Circle Health. It is a CB Insights Digital Health 50 honoree.
- **Segment:** explicitly **independent practices and community clinics, "not designed for large health systems."** Individual credit-card sign-ups, many therapists, naturopaths, chiropractors, and primary care physicians.

### Clinician workflow
1. Sign up with no credit card; the trial is 7 days. Open the web app (Chrome recommended), the iOS/Android app, or the Chrome extension over the EHR.
2. **Enter the patient's name.** Optional "+" to add pronouns. **Pre-charting / visit prep** creates a pre-visit summary from that patient's last visit (Premier: "visit summaries, patient context").
3. **Consent.** Verbal consent; there is no mandatory UI gate in the docs. Freed supplies scripts, e.g. *"I use an AI medical scribe that helps me focus more on you during our visit. The recording is encrypted and automatically deleted after your note is generated."* A verbatim consent line can be put in the template in quotes.
4. Click **"Capture conversation"**. You can pause, and resume for up to 28 days (audio is dropped after 14 days paused). Uploading a recording or a transcript is also supported. Tips: no headphones, and keep the tab visible.
5. Click **"End visit"**. The note is ready in ~60 seconds (1–2 min).
6. **Review.** The visit opens in tabs: **Context | Note | Codes | Instructions**, plus a "+" button to add a **Clinical letter**. The visit list is an **auto-hiding sidebar** (hover the left edge). An **AI Chat panel** on the right can be toggled; you can dictate into it with the mic and tell it where to insert text. The full transcript is under the "…" (More options) menu.
7. **Edit.** Click into a section and type, or use **"Magic Edit"** / AI Chat for bigger rewrites. Click **"Learn format"** (top of the visit page) to teach the template from your edits, or turn on **Auto Learn**.
8. **Coding.** The Codes tab suggests ICD-10, CPT and E/M codes (Premier; CPT in beta).
9. **Patient outputs.** Patient instructions, post-visit letters, and 14+ referral-letter types.
10. **Into the EHR.** "Copy all" or copy per section, or use the **Chrome extension**: open the chart and click **"Push to EHR"**, and the note is mapped into the EHR fields via DOM automation. Priority-supported EHRs:
    - SimplePractice
    - Practice Fusion
    - Tebra
    - Elation
    - TherapyNotes
    - athena
    - OptiMantra
    - Kipu
    - DrChrono
    - eCW (web)

    Core and Starter get only 5 lifetime pushes; Premier is unlimited.
11. **Sign-off** happens in the EHR. Freed has no formal sign or approval state. Notes are kept forever or auto-deleted after 30 days (user choice). Audio is deleted by default.

### Templates and "learning your style"
- **Learned Templates** (purple icon; now the standard):
  - Each has an **Example Note** that the generator mimics.
  - Edits to generated notes update the Example Note, either manually via "Learn format" or automatically via **Auto Learn** (off by default; toggled per template under Templates). Updates take ~1 min in the background.
  - It learns section order, headings, spacing, abbreviations, narrative vs. bullet style, and verbatim quoted text.
  - Version history lets you revert unintended changes.
  - Freed's guidance is "show, don't tell": demonstrate edits rather than write instructions.
- **Structured Templates** (blue icon; legacy builder with outlines) are being sunset.
- **Instant Templates:** upload your own PDF or DOCX example (≤5 MB) and Freed builds a template from it ("instant template builder", Core+).
- **Specialty library** templates and a default note template. Syntax is lighter than Heidi's: quotes = verbatim; square brackets = special instructions at subsection level. There are also custom subsections.
- **Groups:** "Team" visibility and a Team Library. Competitors note there is no push of shared templates on Core or Premier.
- **Sample note fragments (Freed resources):**
  ```
  S: Patient reports mild chest discomfort for 3 days, worse with exertion.
  O: BP 130/80 mmHg, HR 78 bpm, lungs clear to auscultation.
  A: Acute bronchitis; differential: pneumonia vs. asthma exacerbation.
  P: Start azithromycin 250 mg daily × 5 days; increase fluids; return if no improvement in 48 hrs.
  ```
  Freed's pipeline markets colloquial-to-clinical conversion ("stomach bug" → "viral gastroenteritis") and a final "hallucination scan".

### Distinctive features
- **Style learning:** the core pitch, "the scribe that learns your style".
- **Clinical Evidence:** cited answers from 50+ sources, tailored to the patient case (Core+).
- **Coding Assistant:** ICD-10/CPT/E/M.
- **Visit prep / pre-charting.**
- **Dictation** (Premier).
- **Patient instructions and letters.**
- **Two-way SMS.**
- **Front Desk** (launched Apr 14 2026): an AI receptionist answering calls 24/7, sending structured summaries to a shared inbox, multilingual. From $149/mo per 250 calls; 30-minute setup.
- **Languages:** 90+ with auto-detect (Spanish is well reviewed).
- **Trust:** HIPAA, SOC 2 Type II; US-only Azure; no stored recordings; US-based support.

### UI description (text-derived)
- A minimal, distraction-free single-visit view.
  - The visit list hides on the left edge.
  - The center is a large note editor with tabs across the top (Context / Note / Codes / Instructions / +).
  - The right side has a collapsible AI Chat panel.
- The main CTA is a single large "Capture conversation" button beside the patient-name field. "End visit" stops recording.
- Template icons are color-coded: purple = Learned, blue = Structured.
- The brand is friendly and warm; the site tagline is "Focus on people, not paperwork." The Chrome extension renders as a side panel over the EHR, with a "Push to EHR" button.
- Mobile apps: iOS 4.8★ (514 ratings); Android.

### Pricing (2026)
| Tier | Price | Includes |
|---|---|---|
| Starter | $39/mo | 40 notes/mo, specialty templates, live support |
| Core | $79/mo | Unlimited notes, instant template builder, Clinical Evidence (free for residents, students and trainees) |
| Premier | $119 monthly / $104 annual | Adds visit summaries, patient context, patient instructions, unlimited EHR push, dictation, ICD-10/CPT |
| Groups | Custom | MA users, note sharing, SSO, admin dashboards, org BAA, centralized billing, account manager |

- Front Desk: from $149/mo.
- 7-day trial; 50% student discount.
- Historically a single $99/mo plan.

### Strengths
- Easiest onboarding (minutes, no IT).
- Clinicians love it; high app ratings.
- Style learning cuts edit time over repeat use.
- Affordable, transparent pricing.
- Strong in behavioral health and therapy.
- Browser push works across dozens of web EHRs.

### Weaknesses and complaints
- Reddit r/FamilyMedicine: "Quick and efficient", but style drifts between notes and needs polishing. It is seen as SOAP-centric, slower at peak hours, and has occasional hallucinations.
- App Store:
  - "The notes are very poorly structured at the end of your visit"
  - "The battery drain on the most recent version has been rather significant"
  - "There is no way to personalize notes" (older complaint)
- Capterra: "I wish it was automatically linked to my EHR". One user's mic muted silently and they had to rewrite the note from memory.
- Specialty terminology gaps: "took weeks to learn the word subluxation" (DeepCura case, competitor-authored). Weaker in psychiatry, ortho and subspecialties.
- EHR push is DOM automation, not an API; no bi-directional data flow; no native Epic.
- CPT is still beta; no offline capture; per-clinician templates.

### How it competes
- Pure PLG to independents, priced under Heidi's paid tier.
- Expanding horizontally into "the whole patient journey" (Front Desk, coding, evidence, SMS) so it becomes the AI layer for small practices that live in cheap web EHRs.
- Avoids enterprise completely.

**Sources**
- https://www.getfreed.ai/
- https://www.getfreed.ai/pricing
- https://www.getfreed.ai/how-it-works
- https://www.getfreed.ai/ehr-push
- https://www.getfreed.ai/resources/how-to-use-an-ai-scribe
- https://www.getfreed.ai/resources/soap-note-example
- https://www.getfreed.ai/blog/freed-raises-series-a
- https://help.getfreed.ai/en/articles/9391550-get-started-with-freed
- https://help.getfreed.ai/en/articles/11796456-templates-that-learn
- https://help.getfreed.ai/en/articles/11644153-use-templates-to-format-your-notes
- https://help.getfreed.ai/en/articles/11870714-frequently-asked-questions
- https://help.getfreed.ai/en/articles/10355976-freed-chrome-extension
- https://www.cnbc.com/2025/03/05/freed-raises-30-million-led-by-sequoia-to-tackle-clinician-burnout.html
- https://www.fiercehealthcare.com/health-tech/fierce-healthcare-fundraising-tracker-freed-picks-30m-ai-clinician-assistant
- https://www.businesswire.com/news/home/20260414562168/en/Freed-Launches-Front-Desk-an-AI-Receptionist-That-Answers-Clinic-Calls-247
- https://sacra.com/c/freed/ (the funding figures on this page look wrong; ignore them)
- https://apps.apple.com/us/app/-/id6449428266
- https://www.capterra.com/p/10024016/Freed/
- https://www.deepcura.com/resources/freed-ai-review (competitor-authored)
- https://www.commure.com/blog-scribe/freed-ai-review (competitor-authored)
- https://www.trytwofold.com/blog/reddit-family-medicine-scribe-review

---

## 3. Commure Ambient (incl. Augmedix)

### Company background
- **Commure** was incubated by General Catalyst (2017). In 2023 it merged with **Athelas** (CEO Tanay Tandon; RCM plus the "Athelas Scribe", later "Commure Scribe"). It is valued at $6B (2023) and **$7B (May 2026, $70M led by GC, with Sequoia, Morgan Stanley, Kirkland & Ellis)**. It also took **$200M of growth financing from GC's Customer Value Fund (Jun 2025)**.
- **Augmedix** (founded 2012/13 by Ian Shakil) started with **Google Glass live-streaming to remote human scribes**, moved to smartphones, then to AI. Its product lines:
  - Augmedix Go: fully automated AI.
  - Augmedix Live: remote scribe in real time.
  - Live Assist: AI draft plus human editing, coding, orders, AVS.
  - Notebuilder: the NLP engine.

  It went public (Nasdaq AUGX, 2021 SPAC). **Commure acquired it for ~$139M (deal July 2024, closed ~late 2024 / Jan 2025).** Its products now make up the Commure Ambient tiers.
- Other acquisitions: Memora Health, PatientKeeper.
- Scale:
  - 500+ organizations, 3,000+ sites, **130+ health systems**.
  - **40M+ ambient appointments a year**, "tens of thousands" of daily clinician users.
  - 60+ EHR integrations; $25B+ in claims a year.
  - KLAS First Look 2025: **93.3 score, 100% would buy again**.
- Flagship customers:
  - **HCA Healthcare** (Oct 2024 partnership, billed as the largest AI deployment in healthcare: ED, hospitalist and ambulatory across 188 hospitals).
  - Tenet, Dignity Health (350+ hrs/provider/yr saved).
  - North East Medical Services (Epic; multilingual Chinese-speaking population).
  - MEDITECH Expanse customers.
  - Vizient contract (Jan 2025).
- Segment: **enterprise health systems** first (ED, hospitalist, surgical, specialty), but also "thousands of SMB orgs" through self-serve **Commure Scribe**.

### Product tiers (2026)
| Tier | What it is |
|---|---|
| Ambient AI | Self-serve AI scribe (ambulatory, lower acuity) |
| Ambient Assist | AI draft refined by a human Medical Documentation Specialist (MDS) |
| Ambient Live | Dedicated real-time human documentation support for high-complexity surgical and procedural work (legacy Augmedix Live) |
| Ambient+ | Ambient + autonomous coding + dictation |
| Dictation | Voice-to-cursor across 60+ EHRs and apps (Apr 2 2026) |
| Call Center Agents / Commure Agents | Scheduling, call routing, workflow agents |
| Orchestrator | Referral management and intake (GA Jun 30 2026) |

### Clinician workflow (docs.ambient.commure.com)
1. Log in to the mobile app ("Commure Ambient – ScribeMobile", iOS/Android), the web app (ambient.commure.com), the Chrome extension, or the app embedded in the EHR:
   - Epic Toolbox designation (inside Epic, including Haiku/Rover style mobile)
   - MEDITECH Expanse Now (embedded mobile)
   - Cerner (Oracle validated)
2. On the **"My Visits"** tab, enter the patient name (or select from the synced schedule), **choose a template** from your favorites dropdown, and choose visit type **"In-Person" or "Virtual"**.
3. **"Start Recording."** Visits of up to 3 hours are captured. There is an offline mode on mobile. 100+ languages and multi-speaker diarization are supported. Input can be multi-modal (audio, images, existing notes).
4. Consent is set by org policy (not documented as a UI gate in the public docs).
5. **"End Scribe" / "End Recording."** The note is ready in seconds to minutes. On the Assist or Live tiers, the note goes to a human MDS first (status "With MDS").
6. **Review in the Scribe view.** Tabs are Note, Codes and Transcript. The Transcript tab has audio playback with speed control, speaker-separated timestamped dialogue, and "Copy Transcript". The review surfaces **CareCues** (clinical and billing completeness prompts) and a **12-hour patient summary** with chat.
7. **AI Actions:**
   - **Smart Update:** edit one section, regenerate everything, or append **timestamped re-evaluations**. Useful in the ED, where a re-eval is added to the MDM section.
   - **Smart Edit:** add context that wasn't recorded.
   - **Regenerate** with new formatting.
   - **Change Template.**
   - **After Visit Summary:** a patient-friendly summary you can edit and send by secure email, and auto-generate per template.
   - **Rate this Scribe:** thumbs up/down or 5 stars.
8. **Codes:** predicted CPT/ICD-10 and modifiers at note level. You can search by description and save the codes. These flow into Commure's autonomous-coding and RCM products.
9. **"Copy All"** or **"Transfer to EHR"**. There is bi-directional API write-back for Epic, athena, eCW, MEDITECH, NextGen, Practice Fusion, Tebra, TherapyNotes, WebPT and AdvancedMD, plus the Chrome extension otherwise. Statuses:
   - Uploading
   - Offline
   - Processing
   - Generated
   - In EHR
   - Error
   - Syncing
   - Sync Error
   - With MDS
   - Paused
   - Unassigned
10. Sign in the EHR. **My Scribes** is the history list, with search by patient name, date-range filter, sort and status filter.

### Templates and formatting ("AI Studio")
- **Template Library** at ambient.commure.com. Favorites (reorderable) populate the Visit-page dropdown; "+ Add Template" is in the Customize tab. A template has a Title, Description, and sections, each with a **Section Title** and **Section Content** instructions. Sections can be deactivated per encounter.
- **Custom Formatting:** up to 4,000 characters of plain-English rules per template, "as if you were guiding a human scribe". Verbatim examples from the docs:
  - "Create a numbered problem list based on the Subjective and Objective sections."
  - "Use bullet points for all sections except Subjective."
  - "When documenting pain levels, write them as a number out of 10 using numerals."
  - "Always abbreviate physical therapy as 'PT'."
  - "End each note with 'Follow-up as needed.'"
- **Learned Formatting:** star an edited section as the gold standard. **Passive Learning:** learns from edits over time.
- Also: **Dot Phrases**, **Scribe Macros** and a Macro Library, and **Carry Forward Notes** (pull the prior note forward).
- Specialty coverage is very broad (ED, hospitalist, critical care, surgery, EP, wound care, and more).

### UI description (text-derived)
- Mobile-first. The app home is "My Visits", with the schedule or patient list and a big record control; the template dropdown and In-Person/Virtual toggle sit above "Start Recording".
- The web console has My Scribes (a table with status chips), a Customize/AI Studio area, and a note view with an AI Actions menu.
- Commure branding is enterprise navy and blue.
- App Store (ScribeMobile): 4.7★ (42 ratings). Free download with "Ambient Pro $89.99" in-app purchase.

### Pricing
- **Commure Scribe (self-serve):**
  - ScribeCore: 7-day free trial.
  - **ScribePro: $89/mo, or $59/mo billed annually ($708/yr)**. Unlimited notes, custom template builder, AI Copilot, ICD-10/CPT coding, live support.
  - ScribeEnterprise: custom (onboarding, template-building services, direct EHR sync).
- **Enterprise Ambient:** not published. It is bundled with RCM and sometimes financed through GC's CVF (customers pay from realized savings). Some marketing says it is "free for providers at major health systems".

### Roadmap / launches 2025–2026
| Date | Launch |
|---|---|
| 2025 | Epic Toolbox designation, MEDITECH Alliance + Expanse Now embedding, Oracle validation, KLAS First Look (Aug 2025), Commure Agents |
| Apr 2026 | Commure Dictation |
| May 2026 | $7B round |
| Jun 2026 | Orchestrator (referrals/intake) |
| Sept 2026 | CE mark (EU MDR Class I) + UK MHRA registration, i.e. launch in the UK and EU, directly into Heidi's home turf |

The strategic direction is "ambient → autonomous coding → RCM": one platform per health system.

### Strengths
- The only one of the four with **human-in-the-loop tiers**, which suit surgical, ED and high-acuity work.
- Deep EHR embedding (Epic, MEDITECH, Cerner).
- Coding and RCM tie-in sells to the CFO.
- Enormous enterprise logos (HCA).
- KLAS 93.3.
- Offline mobile; multilingual.

### Weaknesses and complaints
- Notes can be verbose and need manual trimming.
- Long stabilization in multi-EHR environments.
- Sparse independent reviews (only 2 on Software Advice).
- Opaque enterprise pricing; high total cost of ownership.
- Integration debt across acquired products (Athelas, Augmedix, PatientKeeper, Memora).
- Intermittent appointment-sync issues.
- App Store: the app auto-closes and logs out if you are "not constantly touching the screen".
- Glassdoor culture concerns.

### How it competes
- Against Abridge, Microsoft DAX and Ambience in enterprise: sells the full stack, ambient plus coding plus RCM.
- Downmarket, the SEO-heavy "Commure Scribe" blog attacks Freed, Heidi and Sunoh on EHR write-back, shared templates and coding.

**Sources**
- https://www.commure.com/ambient-ai
- https://docs.ambient.commure.com/
- https://docs.ambient.commure.com/llms.txt
- https://docs.ambient.commure.com/get_started/first-scribe.md
- https://docs.ambient.commure.com/basics/scribe-actions.md
- https://docs.ambient.commure.com/basics/myscribes.md
- https://docs.ambient.commure.com/ai_studio/template-library.md
- https://docs.ambient.commure.com/ai_studio/custom-formatting.md
- https://docs.ambient.commure.com/ai_studio/after-visit-summaries.md
- https://www.commure.com/blog/commure-ambient-ai-going-beyond-the-note
- https://www.commure.com/press-releases/hca-and-commure-announce-largest-ai-deployment-in-healthcare
- https://www.commure.com/press-releases/commure-ambient-ai-embedded-in-meditech-expanse-now
- https://www.commure.com/press-releases/augmedix-awarded-vizient-contract-for-ambient-ai-documentation-solutions
- https://www.fiercehealthcare.com/ai-and-machine-learning/augmedix-acquired-commure-valuation-139-mil
- https://www.globenewswire.com/news-release/2026/05/19/3297624/0/en/commure-raises-70m-at-7b-valuation-to-transform-healthcare-operations-using-ai.html
- https://www.fiercehealthcare.com/health-tech/commure-raises-200m-growth-financing-general-catalyst
- https://www.commure.com/press-releases/commure-ambient-ai-scores-high-marks-in-klas-first-look-report-for-automating-provider-documentation-rcm
- https://getscribe.commure.com/pricing-page
- https://www.commure.com/blog-scribe/scribe-pricing
- https://apps.apple.com/us/app/commure-ambient-scribemobile/id6449020492
- https://www.rfp.wiki/specialty-industries/healthcare-life-sciences/commure
- https://tooldirectory.ai/tools/augmedix
- https://www.fiercehealthcare.com/tech/google-glass-powered-medical-scribe-service-going-public-as-part-spac-deal

---

## 4. Sunoh.ai (eClinicalWorks / healow)

### Company background
- Built by **healow**, the patient-engagement sister company of **eClinicalWorks** (CEO Girish Navani; a private, bootstrapped EHR vendor with 180,000+ providers and 850,000+ users).
- Launched and integrated into eCW on **Oct 20 2023**. "Sunoh" means "listen" in Hindi.
- Marketed as EHR-agnostic, but its gravity is eCW's installed base. It has no separate venture funding.
- Scale claims have risen from 80k to 90k to **"100,000+ providers"** (2026 homepage: "#1 Trusted by 100k+ Doctors").
- Customers (eCW case studies):
  - AssociatesMD (54 providers, 9 South Florida sites)
  - Healthy Horizons Clinic (Jan 2026)
  - Kidzcare Pediatrics, rural TN (Mar 2026)
  - VitalCare Family Practice
  - Bloom Healthcare (home-based primary care)
  - A women's specialty clinic, and RMWC ($1.25/visit)
- Segment: **small and mid-size ambulatory practices, FQHCs and community health centers on eCW**. Primary care, pediatrics, urgent care, specialty, dental and vision.

### Clinician workflow (inside eCW)
1. Open the appointment and progress note in eCW (desktop V12), or eClinicalTouch / eClinicalMobile on iPhone or iPad. Sunoh is embedded; there is also a standalone app (iOS, Android, iPad, web).
2. Start Sunoh listening. The provider obtains consent verbally per practice policy (no documented UI gate).
3. **Listen.** Captures the conversation, including multi-party visits (patient, caregiver, provider; nurse then doctor sequentially) and televisits.
4. **Transcript.** A dialogue transcript is produced.
5. **Draft.** Content is summarized and **categorized into eCW Progress Note sections** (HPI, ROS, PE, Assessment, Plan, and so on). Templates are SOAP, DAP or specialty.
6. **Order assist** (the signature feature). Sunoh identifies **labs, imaging, procedures, medications, referrals and follow-up appointments** and pre-fills them as eCW orders, including on mobile. The provider reviews and can **"merge pre-configured defaults with a single click."**
7. **Codes.** ICD-10 and CPT recommendations (coding assistant).
8. **Review and modify, then Import.** The provider approves the section-mapped content and imports it into the progress note. Outside eCW, the free **"EHR Sync" browser extension** sends notes to any browser-based EHR, or you can copy/paste or export to PDF.
9. **Sign** in eCW as usual. Audio and transcripts are auto-deleted after 7 days.

### Note formats and sample
- **Formats:** SOAP, DAP and specialty templates, with custom fields. Voice commands are supported.
- **Output language:** English only, even when the visit is in Spanish, Portuguese, Mandarin, Cantonese, Vietnamese and so on (per a Commure competitor review).
- **Patient instructions:** embedded in the Plan section rather than produced as a separate handout.
- No public verbatim sample note was found. The structure mirrors the eCW Progress Note:
  - Chief Complaint
  - HPI
  - ROS
  - Physical Exam
  - Assessment (with ICD-10)
  - Plan / Treatment
  - Orders (labs, imaging, Rx, referrals)
  - Follow-up

### Distinctive features
- **Native eCW write-back to discrete sections plus order pre-fill.** No other product here creates actual orders.
- Mobile, iPad and desktop.
- Multi-speaker, multi-accent capture.
- Coding. Referral letters and discharge summaries.
- It is part of the **eCW AI stack**, which healow promotes as a one-vendor bundle for small practices:
  - **healow Genie:** AI contact center; Maryland Endocrine automated 80–90% of calls.
  - **PRISMA:** records retrieval / health information search.
  - **Image AI:** fax management.
  - **AI Workbench:** agentic platform, e.g. prior auth via payer sites.
  - **healowIQ** (May 2026): point-of-care evidence, competing with Heidi Evidence and Freed Clinical Evidence.
- Microsoft Azure hosting; SOC 2; BAA; no PHI used for training; 2FA on mobile.

### UI description (text-derived)
- Inside eCW it is a Sunoh panel attached to the progress note. After listening, the panel shows the transcript and a section-by-section summary with per-section accept/modify, a separate orders list (labs/imaging/meds/referrals with checkboxes to add), and an Import action that drops content into the matching eCW note sections.
- The standalone app is a simple record screen, then a draft SOAP note with edit and export.
- The healow and Sunoh brand uses blue and teal.

### Pricing
- **$149/user/month** (listed as a "limited-time" price; list $199). No long-term commitment; free trial; 24/7 support and implementation included.
- Earlier eCW-customer pricing was **$1.25 per visit** (still cited in case studies).
- Group/enterprise: via sales.

### Roadmap / 2025–2026
- The stream of eCW case studies continues (Jan and Mar 2026).
- eCW V12 reworks the documentation flow around AI.
- healowIQ evidence launched (May 2026), plus the agentic AI Workbench.
- Sunoh "adding capabilities" was mentioned at the Health Center Summit (May 2026), with few specifics.

### Strengths
- Zero-friction for eCW users: already in the note, discrete-field import, orders pre-filled, one contract with the EHR vendor.
- Good value per dollar (especially per-visit pricing).
- Multi-party pediatric visits.
- Multilingual input.

### Weaknesses and complaints
- Capterra: 4.1/5 (37 reviews; 81% positive).
  - "It still needs occasional cleanup, especially with complex conversations."
  - "I spend as much time cleaning up mistakes as I used to spend dictating."
  - Struggles with **ROS and Physical Exam**: even dictated PE findings are missed.
  - Crashes that lose progress.
  - A slow and unclear activation process.
- English-only output.
- Weak outside eCW (browser extension only).
- Security attestations are less visible (HITRUST and ISO not highlighted).
- Confusing pricing (per-user vs per-visit).
- No published accuracy benchmarks.
- A thin standalone brand with little Reddit presence.

### How it competes
- A bundling play. eCW makes a third-party scribe (Freed, Heidi via Vim, Commure, DeepScribe) harder to justify by offering native order and coding write-back at a mid-range price.
- It is weak for clinicians not on eCW.

**Sources**
- https://sunoh.ai/
- https://sunoh.ai/pricing/
- https://sunoh.ai/how-sunoh-works/
- https://sunoh.ai/blog/sunoh-ai-an-ehr-agnostic-ai-enabled-ambient-listening-technology/
- https://www.eclinicalworks.com/eclinicalworks-integrates-with-sunoh-ai-a-revolutionary-ai-powered-ambient-listening-technology-developed-by-healow-for-clinical-documentation/
- https://www.eclinicalworks.com/eclinicalworks-and-sunoh-ai-help-rural-pediatricians-reclaim-more-than-two-hours-each-day/
- https://www.eclinicalworks.com/eclinicalworks-and-sunoh-ai-assist-healthy-horizon-clinic-save-over-two-hours-daily-on-clinical-documentation/
- https://www.eclinicalworks.com/eclinicalworks-and-sunoh-ai-assist-54-provider-primary-care-and-urgent-care-practice-to-enhance-productivity-and-access-to-care/
- https://www.eclinicalworks.com/blog/sunoh-ai-medical-scribe-is-transforming-documentation-in-womens-specialty-clinic/
- https://www.healthcareittoday.com/2026/05/14/eclinicalworks-shares-artificial-intelligence-agentic-ecosystem-and-new-healowiq-product-at-health-center-summit/
- https://www.capterra.com/p/10016372/Sunoh/
- https://www.trytwofold.com/compare/sunoh-ai-review (competitor-authored)
- https://www.commure.com/blog-scribe/sunoh-ai-review (competitor-authored)

---

## Cross-cutting takeaways (for Chartside)

1. **The workflow is the same everywhere:**
   - Patient name/context
   - Template pick
   - One big record button
   - Stop
   - Note in ~60 s
   - Tabs: Context / Transcript / Note / Codes / Documents
   - AI edit bar
   - Copy or push to the EHR

   The differences are in templates, learning, write-back and add-on surfaces.
2. **The template philosophy splits three ways:**
   - Heidi: an explicit DSL (`[placeholder]`, `(instruction)`, `"verbatim"`) plus a community marketplace.
   - Freed: implicit, example-note learning from edits (Learn format / Auto Learn), with version history.
   - Commure: section-title plus section-instruction forms and a 4,000-character free-text rules box, plus starred "gold standard" sections.
3. **Write-back is the moat and the pain point.**
   - Freed and Commure Scribe use DOM-automation Chrome extensions.
   - Heidi and Commure do real Epic/Cerner integrations, but only on paid enterprise tiers.
   - Sunoh wins inside eCW with discrete sections and orders.
   - Every product's complaints mention copy/paste friction.
4. **Every product is converging on:**
   - Evidence/Q&A
   - Coding
   - Pre-charting
   - Patient letters and AVS
   - Dictate-anywhere
   - Front-desk/phone agents

   Heidi Evidence/Comms, Freed Front Desk/Evidence, Commure Agents/Dictation and healow Genie/IQ are all examples.
5. **The common complaints are an opportunity:**
   - Hallucinations and conflation in multi-problem visits
   - Verbose notes
   - Style drift
   - Weak physical-exam capture
   - Mobile battery drain and crashes that lose audio
   - Silent mic failures (make recording state and audio health loud)
