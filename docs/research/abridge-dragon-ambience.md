# Batch A: Abridge, Microsoft Dragon Copilot, Ambience Healthcare (as of late Sept 2026)

Research date: 2026-09-27. How much to trust each source: vendor press releases and support docs are the most reliable for how the products work. Health-system tip sheets (UCSF, a Northwell ED guide) are the best evidence of the real clinician workflow. Third-party "review" blogs (DeepCura, Vero, Plaud, SOAP Note Buddy and others) are competitors or SEO sites. Their pricing numbers are estimates and marked as such.

---

## 0. Market context (applies to all three)

- **Market share (ambient scribe revenue, about $600M market, Haverin analysis):** Microsoft/Nuance 33%, Abridge 30%, Ambience 13%, Suki 10%. Nuance once sat in 77% of US hospitals, 55% of physicians and 75% of radiologists through Dragon dictation. Source: https://haverin.substack.com/p/microsoft-dragon-copilot-nuance-healthcare-ai
- **KLAS:**
  - 2025 Ambient Speech scores: DeepScribe 98.8, Ambience 97.7, Abridge 95.1, Microsoft DAX Copilot 91.6 (4th of 4). KLAS: "Abridge's physician focus resonated with respondents, while DAX Copilot's appeal leaned on being a Microsoft solution."
  - 2026 Best in KLAS, Ambient AI: Abridge 94.7, Ambience 94.4, so very close.
  - Most Epic organizations KLAS interviewed use Abridge or Microsoft, because both are Epic Workshop partners with native integration.
  - Sources: https://www.techtarget.com/revcyclemanagement/news/366638784/Abridge-Microsoft-earn-top-spots-for-revenue-cycle-tech and https://klasresearch.com/decision-insights/ambient-ai/487
- **Epic AI Charting (the biggest threat to all three):**
  - Epic announced it at UGM in August 2025 and released it broadly on 2026-02-04.
  - It is part of Epic's "Art" (clinician) AI suite; "Penny" covers revenue cycle and "Emmie" covers patients.
  - It records through Haiku/Canto, uses Microsoft's Dragon ambient AI on Azure, drafts the note and queues orders. Epic's CMO says diagnoses are coming next.
  - Epic has about 42% of acute hospitals and 55% of beds.
  - Sources: https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/ , https://www.fiercehealthcare.com/health-tech/epic-unveils-major-ai-features-ai-charting-microsoft-cosmos-ai-risk-prediction-and-rcm , https://hitconsultant.net/2026/02/05/epic-releases-ai-charting-ambient-ai-market-implications/
- **Evidence reality check:**
  - Largest multi-site study (5 academic centers, 1,800+ users): 13 fewer EHR minutes and 16 fewer documentation minutes per 8 hours of patient care.
  - UChicago Abridge cohort: 1.8 minutes saved per appointment (15.9%).
  - An RCT of DAX Copilot found no statistically significant time effect.
  - Clinicians change a median of 9% of AI-generated words, and 14.9% of notes go unedited.
  - Commercial scribes have error rates of 16.7 to 23.3%, and 76% of those errors are omissions.
  - Sources: https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot and https://www.medrxiv.org/content/10.1101/2025.07.10.25331333.full.pdf
- **Error census preprint (Aug 2026):** 3 commercial scribes, 142 consultations, 618 verified errors. "One note in three (31.3%)" had a failure, clustered in allergies/medications, made-up identity details and telephone-visit misclassification. https://arxiv.org/abs/2608.31017
- **Common clinician complaints across vendors:**
  - Notes run 2 to 3 times longer than a human-written note, a "ChatGPT essay" feel. Vendors over-document to limit liability.
  - Anything the clinician does not say out loud is missed, speakers get misattributed, and billing or medicolegal phrases still have to be added by hand.
  - Sources: https://uzzieltamon.substack.com/p/when-ai-scribes-sound-like-medical , https://techysurgeon.substack.com/p/youre-using-your-clinics-ambient

---

## 1. Abridge

### Background
- **Founded:** March 2018 in Pittsburgh, out of the Pittsburgh Health Data Alliance (UPMC, Pitt and CMU).
- **Founders:**
  - Dr. Shivdev (Shiv) Rao, CEO: a cardiologist at UPMC who also invested in health-tech companies.
  - Sandeep Konam, CTO: CMU robotics.
  - Florian Metze: CMU Language Technologies Institute speech researcher, left in 2019.
- **History:** The company started with a consumer "Abridge for Patients" app for recording visits, then pivoted to the enterprise clinician scribe.
- Source: https://research.contrary.com/company/abridge

### Funding and valuation
| Round | Date | Amount | Valuation |
|---|---|---|---|
| Series A | Oct 2020 | Bessemer, USV | |
| Series B | Oct 2023 | $30M | |
| Series C | Feb 2024 | $150M | $850M |
| Series D | Feb 2025 | $250M | $2.75B |
| Series E (a16z, Khosla) | Jun 2025 | $300M | $5.3B |
| Series E extension | Apr 2026 | $316M | $5.3B (reaffirmed) |

- **Total raised:** about $0.8 to 1.05B (sources differ).
- **ARR:**
  - $60M at end of 2024.
  - $100M+ realized by May 2025.
  - $117M contracted in Q1 2025.
  - 2026 ARR is not disclosed.
- Sources: https://sacra.com/c/abridge/ , https://valueaddvc.com/blog/abridge-valuation-2026-5-3b-100m-arr-and-how-the-ai-scribe-beat-nuance-and-ambience , https://www.abridge.com/blog/series-e

### Scale
- **Health systems:**
  - About 150 in July 2025.
  - 250+ in February 2026 (KLAS press).
  - 300+ by June to September 2026.
- **Conversations:** 80M clinician-patient conversations projected for 2026. The homepage now claims "100M+ conversations" a year.
- **Patient reach:** partner systems serve 250M+ patients.
- **Coverage:** 50 to 55+ specialties and 28+ languages. Settings include outpatient, ED, inpatient and nursing.
- Sources: https://www.abridge.com/press-release/best-in-klas-2026-press , https://www.abridge.com/press-release/patient-centered-clinician-intelligence-platform-keynote

### Flagship customers
- **Kaiser Permanente:** all 40 hospitals and about 600 offices, about 24,600 physicians. NEJM AI study: 1,306 clinicians, 4M+ encounters, note quality 4.35 out of 5.
- **Mayo Clinic:** 2,000+ physicians.
- **Duke Health:** 5,000+ clinicians, January 2025.
- **UPMC:** 12,000+ clinicians across 40+ hospitals and 800 outpatient sites.
- **Sutter Health:** 1,000+ clinicians.
- **Other named customers:** Johns Hopkins, Yale New Haven, Emory, Geisinger, UW Health, Christus, Akron Children's, Reid Health, AltaMed (an FQHC), UCSF, Northwell (ED).
- **Northwestern Medicine:** enterprise-wide across all hospitals, announced June 2026.
- **VA:** originally picked Abridge and Nuance in 2024.

### Exact clinician workflow ("Abridge Inside" for Epic)
Built from the UCSF provider guide (v2, March 2025) and an Epic ED quick start guide dated April 2026.

Before the first use:
- The clinician installs Epic **Haiku**. Personal phones need Intune and encryption.
- On first use, the clinician sets **Note Settings**:
  - HPI: *Concise* or *Comprehensive*.
  - Assessment & Plan: *Concise* or *Comprehensive* (Comprehensive is advised for procedural, surgical, palliative, heme-onc and EM), and *Bulleted* or *Paragraph*.
  - Settings can be changed later from the gear icon in the Abridge activity ("Save Settings"). Changes are not applied to notes that already exist.

Each visit:
1. **Launch Haiku, then pick the patient from the schedule** (calendar defaults to today).
2. **Consent.** A suggested script: *"Today, I'm using a new note-taking tool that records our visit and uses AI to help me write my notes. This lets me focus more on you during our conversation. Everything is stored securely and not stored on this phone for your protection. Is this okay with you?"* Consent is needed from everyone in the room.
3. **Start recording.** Tap the **Abridge Inside icon** at the bottom of the Haiku patient chart, then tap the **red record dot** or microphone.
   - The Epic schedule's Note Status column shows **Recording**, then **Uploading**, **Processing**, **Ready** and **Reviewed**.
   - The clinician can **Pause/Resume**, even across days for pre-charting.
   - Phone calls pause the recording automatically.
   - The clinician must pause before e-prescribing controlled substances with Duo.
   - Only one provider can use Abridge per visit.
4. **Recording tips from the guide:**
   - Converse naturally rather than dictating.
   - Say exam findings and nonverbal cues out loud.
   - Use pause and resume to add medical terms before or after the visit.
   - No headphones. For telehealth, the phone picks up the computer speakers.
5. **Finish.** Tap (ED guide: press and hold) **"Create Note"**. This is final: *"you cannot link Abridge with the encounter again."* The generated text shows in Haiku.
6. **Open the note in Hyperspace.**
   - An info banner says AI-generated text is ready.
   - The clinician picks a note template (a speed button such as "New Pt" or "Follow Up") that contains the Abridge SmartPhrases: **.HPISEC** (includes the consent line), **.PESEC**, **.APSEC** and **.RESULTSEC**.
   - The sections fill in automatically and carry an Abridge icon.
7. **Consent attestation is added automatically.** ED version: *"I affirm that I have discussed the use of ambient recording technology to assist with documentation for this clinical encounter with the patient; I have answered all questions, addressed all concerns, and have obtained the patient's consent to proceed."*
8. **Edit** inside the SmartPhrase sections as usual.
9. **Verify.**
   - **More Actions, then Linked Evidence** (or right-click the text and choose Linked Evidence) opens the **Abridge activity** side by side with the note.
   - Highlighting a note sentence shows the matching transcript excerpt and plays that stretch of audio.
   - The same activity holds the Patient Summary, star-rating feedback, settings and (2026) the **Abridge AI** chat.
   - The activity can only be opened before the note is signed.
10. **Patient instructions.** In Wrap-Up, type **.AVSSEC** (or use a speed button) to pull in the patient visit summary.
11. **Sign the note.** Status becomes "Reviewed."

Other details:
- **ED version:**
  - The ED Provider Note fills HPI, PE and MDM. The ED Continuation of Care note fills MDM.
  - If a resident has already written the note, the attending inserts content by hand with SmartLinks such as .ABRIDGEPE and .ABRIDGEMDM.
- **Audio retention:** 14 days at UCSF (reviews cite 30 days by default).
- **Outside Epic:**
  - The stand-alone **Abridge for Clinicians** app (iOS/Android) records the visit.
  - The clinician reviews and finalizes in the **Abridge web editor**, then copies or pushes to the EHR.
  - The App Store listing mentions "Noteworthy" overviews and an interactive transcript, rated 4.2 out of 5 from 47 ratings.
  - Recent App Store reviews mention recordings failing after an update.

Sources: https://community-affiliates-internal.ucsf.edu/sites/g/files/tkssra15911/files/wysiwyg/Abridge_Guide.pdf , https://nwhed.org/wp-content/uploads/ASAP_QSG_Abridge-Inside-for-Emergency-Department.pdf , https://apps.apple.com/us/app/abridge-for-clinicians/id1580370720 , https://support.abridge.com/hc/en-us/articles/30235128433811-Verify-a-Note-With-Linked-Evidence

### Note formats and sample structure
- **Core sections:** HPI, Physical Exam, Results, Assessment & Plan.
- **Optional sections** (shown in the Abridge tab to copy over): PMH, Medications, Social History, Family History.
- **The underlying model** writes SOAP-style notes.
- **Special note types** (built on the Contextual Reasoning Engine, April 2025, which reads prior notes and chart context):
  - Pediatric Well Visit.
  - Behavioral Health.
  - ED (HPI/PE/MDM).
  - Inpatient (H&P, progress notes).
  - Nursing flowsheets.
- **Sample A&P text** from Abridge support, Bulleted style:
  ```
  Possible Ischemic Heart Disease: New onset exertional chest pain and shortness of breath with
  radiation to the arm and associated lightheadedness. High risk given history of diabetes,
  hypertension, and family history of heart disease.
   - Perform electrocardiogram (EKG) and echocardiogram today.
  ```
  Each problem is followed by its rationale, then plan items as indented bullets. Paragraph style turns this into a descriptive blurb.
- Sources: https://support.abridge.com/hc/en-us/articles/30098939952787-Update-Note-Section-Settings , https://www.abridge.com/blog/pediatric-well-visit-note-type

### Distinctive features
- **Linked Evidence:** every sentence in the note maps to its transcript excerpt and audio timestamp. This is Abridge's signature trust feature.
- **Patient Visit Summary** (April 2024): 8th-grade reading level, with audio clips, a care plan, glossary bookmarks and sharing with family.
- **Multilingual:** 28+ languages, including Haitian Creole, Tagalog, Cantonese and Hindi. The note comes out in English.
- **Own models ("Ears"):**
  - A medical speech recognition model with 16% lower word error rate than Whisper v3 and Google, and 45% fewer errors on new drug names.
  - Note generation trained on 1.5M+ consented encounters.
  - Catches 97% of confabulations versus 82% for GPT-4o.
  - An NVIDIA Nemotron-based foundation model was announced in June 2026.
- **Revenue cycle:**
  - ICD-10, HCC and E/M suggestions at the point of care ("every code traced to the conversation") and "Care Signals" for risk gaps.
  - **Pre-bill review for CDI and coding teams** (Sept 14, 2026): checks inpatient DRGs and present-on-admission status against the bedside conversation before a claim goes out. Reid Health is the first customer. This competes with Solventum/3M, SmarterDx and Waystar.
- **Prior auth:** with Availity (announced Jan 12, 2026), real-time prior authorization grounded in the conversation.
- **Orders:** Abridge Inside for outpatient orders, piloted through Epic Workshop in June 2025, queues orders from the conversation. Inpatient support also shipped June 2025.
- **Abridge AI / Clinical Decision Support:** an evidence chat inside Epic using UpToDate, ADA, AAFP, AHA, JAMA, JCO and Neurology content, grounded in the conversation.
- **June 11, 2026 "clinician intelligence platform" keynote:**
  - Pre-charting and pre-visit summaries.
  - Speech recognition during the visit.
  - Flowsheets, codes and orders after the visit.
  - A natural-language agent to customize outputs.
  - **Abridge for Nurses.**
  - Smart-room integrations with Artisight and hellocare.ai.
  - Real-time claims alignment.
  - Clinical-trial screening.

### UI description
- **Inside Epic:** mostly native Epic UI.
  - A purple/blue **Abridge icon** in the Haiku bottom action bar.
  - A simple record screen with a large red record dot, a pause button, a timer and a "Create Note" button.
  - A Note Settings link.
  - In Hyperspace, note sections are marked with the Abridge icon, and an **Abridge activity** side panel sits next to the note, holding the transcript, Linked Evidence highlights, the Patient Summary tab, a gear icon for settings, star feedback and a prompt box.
- **Stand-alone web editor:**
  - The note is on the left and the transcript on the right.
  - Highlighting note text lights up the matching transcript lines, with an audio player.
- **Brand:** clean, with white, navy and purple accents. Marketing screenshots show patient summaries, checklists and notes.

### EHR integrations
- **Epic:** deepest. Workshop partner, "Abridge Inside" across Haiku, Hyperspace and Hyperdrive, via the Ambient Module.
- **Other EHRs:** Oracle Health and athenahealth (athena also resells Abridge to smaller practices). Reviews list eClinicalWorks, NextGen and Allscripts as less seamless.

### Pricing
- **Enterprise only**, not published.
- **Estimates:**
  - About $2,500 per clinician per year (Sacra).
  - About $208 per provider per month (Haverin).
  - $2,500 to $7,200+ per year (Vero).
  - An individual seat was listed at $199/month in March 2025 (Contrary), but there is no real self-serve tier now.
- **KLAS (2024):** customers said Abridge was cheaper than DAX.

### Roadmap and direction
The company is moving from scribe to "clinician intelligence platform" across the whole visit (before, during and after). Near-term pieces:
- Revenue cycle: codes, CDI, pre-bill review, claims alignment, prior auth with payers.
- Orders.
- Nursing and inpatient.
- CDS and evidence.
- Its own foundation models.

The stated pitch (Emory CEO) is to align providers and payers at the moment of care instead of arguing over the record afterward.

### Strengths
- Best in KLAS 2025 and 2026.
- Strong Epic integration.
- Linked Evidence.
- The most peer-reviewed evidence of any vendor (Kaiser, UChicago, KUMC: 61% less cognitive load).
- Multilingual.
- Physician-led culture and brand.
- Fast enterprise land-grab.

### Weaknesses and complaints
- Enterprise-only, with 3 to 6 month procurement and opaque pricing.
- No inline AI chat for editing in early versions (Abridge AI chat added in 2026).
- Limited style learning.
- Audio retention concerns in behavioral health.
- Non-Epic integrations are weaker.
- "Create Note" is final and cannot be undone.
- Small talk sometimes leaks into the draft.
- Measured time savings are modest (about 16 minutes a day).
- Deep dependence on Epic, which now competes with its own AI Charting.
- Recording failures after app updates.

---

## 2. Microsoft Dragon Copilot (formerly Nuance DAX Copilot + Dragon Medical One)

### Background
- Microsoft bought **Nuance** for $19.7B (closed March 2022). Nuance's Dragon Medical One (DMO) was the dominant clinical dictation product.
- **DAX** started as ambient with human reviewers (2020). **DAX Express/DAX Copilot** (2023) moved to GPT-4, fully automated, embedded in Epic.
- **Dragon Copilot** was announced on 2025-03-03. It combines DMO dictation, DAX ambient capture and generative-AI task automation in one "unified voice AI assistant."
  - GA in US/Canada in May 2025, then the UK, Ireland, France, Germany, Austria, Belgium and the Netherlands.
  - Sources: https://www.prnewswire.com/news-releases/microsoft-dragon-copilot-provides-the-healthcare-industrys-first-unified-voice-ai-assistant-that-enables-clinicians-to-streamline-clinical-documentation-surface-information-and-automate-tasks-302389092.html
- **Funding:** not applicable, since this is a Microsoft product line under Microsoft Cloud for Healthcare.

### Scale
- **Encounters documented:**
  - FY26 Q1 (July to September 2025): 17M+ patient encounters, about 5 times the prior year.
  - FY26 Q2 (October to December 2025): 21M in the quarter, 3 times the prior year.
- **Users:** 100,000+ clinicians use it daily (HIMSS, March 2026).
- **Organizations:** 650+ healthcare organizations have bought ambient.
- **Languages:** 58 conversation languages in 9 countries.
- Sources: https://www.microsoft.com/en-us/investor/events/fy-2026/earnings-fy-2026-q2 , https://www.microsoft.com/en-us/microsoft-cloud/blog/healthcare/2026/03/05/unify-simplify-scale-microsoft-dragon-copilot-meets-the-moment-at-himss-2026/

### Flagship customers
- University of Michigan Health (1,000+ physicians).
- Mount Sinai.
- Tampa General.
- Cooper University Health Care. Quote: "We ultimately went with Microsoft because of the security, the compliance, the scalability..."
- Sentara Health.
- Many Epic and Oracle systems.

### Exact clinician workflow (Dragon Copilot / DAX Copilot for Epic)
1. **One-time setup:**
   - Put the Dragon Copilot **SmartSections** into the Epic note template: **.hpisec, .pesec, .resultsec, .apsec**. These are the same dot-phrase pattern that Abridge uses at UCSF.
   - Set the primary **specialty** under Settings > Profile.
   - Turn on **Auto-style** so personal style rules apply to every new note.
2. **Consent:** handled by the organization's policy. The support docs do not show a consent screen.
3. **Record:**
   - Open **Haiku or Canto**, pick the patient and tap **"DAX Copilot"/"Dragon Copilot"** at the bottom, then tap the **ambient recording button** to start and again to stop.
   - Several recordings for the same note are combined.
   - The alternative is the stand-alone Dragon Copilot mobile/desktop/web app: **"New session"**, then the ambient button. Microsoft says mobile is best for recording.
   - PowerMic Mobile or a desktop microphone also works.
4. **Processing:** the note sections fill **automatically** in the Epic note via SmartSections, typically within minutes.
5. **Review and edit:**
   - From any ambient SmartSection, the **Action menu** opens "DAX/Dragon Copilot" in an **embedded window**. The other route is the **Dragon Copilot button on the EHR toolbar**, which opens the desktop app.
   - Editing options:
     - Add another recording ("recording-based updates").
     - Edit directly in the Note tab.
     - **Change Pronouns**.
     - **Apply My Style**, which creates a new version card.
     - Type a free-text AI prompt ("make the A&P bulleted", "add a referral letter").
     - Voice edits with the dictation microphone, "select-and-say" and "What can I say."
   - **Split view** compares versions.
   - The **Timeline** keeps version history, and older versions can be restored.
6. **Sync:** the clinician must click **"Sync to EHR"** after manual edits in Dragon Copilot. New recordings can overwrite manual edits, so recordings should be finished first.
7. **Sign in Epic.**

Extra outputs from the same session:
- **Orders tab:** medications, labs, imaging and procedures to queue.
- Referral letters and after-visit summaries.
- Custom documents.

Sources: https://support.microsoft.com/en-us/dragon-copilot/physicians/dragon-copilot-for-epic-quick-start-guide , https://support.microsoft.com/en-us/dax-copilot/epic/edit-in-dax-copilot-for-epic , https://support.microsoft.com/en-us/dragon-copilot/physicians/dragon-copilot-quick-start-guide , https://support.microsoft.com/en-us/dax-copilot/epic/dax-copilot-in-epic-mobile-apps

### Note formats
- **Default SmartSections:** HPI, Results, Physical Exam, Assessment & Plan.
- **Emergency Medicine:** uses an **Impression** section that combines Epic visit diagnoses with diagnoses heard in the conversation ("intelligent diagnosis retrieval," 5.0).
- **Specialty models:** set per specialty profile. "AI specialty enhancements" add specialty HPI content, risk detail in the A&P, and verbatim quotes from the transcript.
- **Style controls:**
  - **Note style & format > Style**: global and per-section writing and formatting (bullets or paragraphs, and so on).
  - **> Sections**: which sections and headings appear.
  - Auto-style.
  - AI-built **Templates** (5.0): describe a document or paste a sample and Copilot builds a reusable template that can run automatically.
- **Structured plan** section with custom prompts.
- **Proactive ICD-10 specificity suggestions** (HIMSS 2026).
- Quality is measured with the PDSQI-9 instrument.
- No verbatim sample note was found in public docs.
- Sources: https://support.microsoft.com/en-us/dragon-copilot/physicians/configure-your-settings , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/specialty-models/intelligent-diagnoses-retrieval

### Distinctive features
- **Dictation and ambient in one tool:**
  - Dictation with decades of Dragon vocabulary and accuracy, custom words and training audio.
  - Voice commands anywhere, including dictating into Word documents with protected sections.
  - Ambient capture in the same app.
  - This is unique among the three.
- **Nursing** (US GA):
  - Captures bedside conversations and turns them into **structured flowsheet rows**.
  - Supports all med-surg flowsheet templates.
  - Documents lines, drains and airways (LDAs).
  - Nurse Copilot Chat has numbered session transcripts.
- **Radiology** (US preview): works with **PowerScribe One**, summarizes prior reports and surfaces clinical context.
- **Copilot Chat:** asks questions of the chart and conversation. **Work IQ / Microsoft 365 Copilot** integration pulls in email, Teams, calendar and PDFs.
- **Desktop Copilot:** invoke it by clicking or highlighting text in any application or EHR.
- **Dragon Copilot AI apps and agents storefront** (Microsoft Marketplace, US, v5.0):
  - Partners: Canary Speech (voice biomarkers), Humata Health (prior auth), Optum (revenue cycle), Regard (diagnosis/CDI) and others.
  - Use cases: coding, CDS, risk adjustment, prior auth, behavioral health screening, preventive care.
- **Memos:** per-patient and global.
- **Security:** HITRUST, SOC 2, Azure hosting.
- **Admin analytics:** drop-risk users, per-site adoption.

### UI description
- **Older UI (2025):** tabs across the top: **Timeline** (default), **Memos**, **Note**, **Orders**, **Transcript**.
  - Upper right: help "?", microphone, settings gear, three-dot session details and a split-view icon.
  - Bottom toolbar: **Library** (Texts, Prompts, templates), **Quick AI actions** chips, dictation microphone, ambient recording button and a **prompt field** ("Ask Copilot...").
- **Dragon Copilot 5.0 "enhanced UI" (released 2026-08-20):**
  - Replaces timeline and tabs with a **content-first workspace**, with all session content in one scrolling view.
  - A **homepage** surfaces pending work across sessions.
  - **One microphone button** covers both dictation and ambient, and the chosen mode carries over between patients.
  - Toolbar icons: Copilot Chat, Transcript toggle (shows the transcript next to the note), notifications, memos, library and settings.
  - A **compact view** on desktop is a minimized floating bar that can start sessions.
  - Auto-style and edit intents (expand, condense, rephrase) appear as a **prompt library inside chat**.
  - A correction menu offers speech alternatives.
  - Haiku iOS uses a "Dragon webview" (SMART on FHIR).
- **Look:** Microsoft Fluent design, white and light gray surfaces, Copilot gradient accents (blue, purple, teal), and card-based note versions.
- Sources: https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/5-0 , https://support.microsoft.com/dragon-copilot/physicians/current/whats-new

### EHR integrations
- **Epic:** deepest. Built jointly with Epic, Workshop partner, SmartSections, Haiku/Canto/Hyperdrive. Epic's own AI Charting also runs on Microsoft's Dragon ambient technology.
- **Oracle Health (Cerner):** supported.
- **Other EHRs:** Meditech, athena and others through the stand-alone app plus copy or transfer. The desktop app's dictation works in any text field.
- Microsoft notes Dragon Copilot "is not an EHR."

### Pricing (unstable, treat all numbers as estimates)
- **Historic:**
  - DAX Copilot ran about $369 to $830+ per provider per month, and some quotes exceeded $1,000.
  - Haverin cites $444 to $600 per month (versus about $208 for Abridge).
- **2026 per blog reports:**
  - A short-lived "Physician Practice" self-serve tier was discontinued.
  - May 2026 restructuring: one lower per-user license plus per-encounter consumption fees.
  - Reported tiers: "Physician Flex" $604.80 per user per month (base plus pay-as-you-go ambient) and "Per User" unlimited $1,512 per month (down 57% from $3,528).
  - Partner catalogs list about $150 per user per month on an annual commitment.
  - Pivot Point cites a 60% rural-hospital discount.
- **Realistic planning range:** $150 to $600 per provider per month.
- Sources: https://www.plaud.ai/blogs/articles/dragon-copilot-review , https://samexpert.com/dragon-copilot-licensing-guide/ , https://www.veroscribe.com/blog/nuance-dax-review-2026

### Roadmap and direction
- A **platform/agent marketplace** play: Dragon Copilot becomes the clinician's "front door" for third-party agents (revenue cycle, prior auth, CDS).
- Role-based experiences for physicians, nurses and radiologists.
- Microsoft 365 / Work IQ context.
- Multilingual expansion in Europe.
- Fewer clicks through the new UI.
- It powers Epic AI Charting underneath, so Microsoft wins some revenue either way.
- Wider context: Microsoft's Copilot "Wave 3"/Cowork agent push (2026).

### Strengths
- Largest installed base (Dragon dictation users).
- Microsoft security, compliance and procurement ("nobody gets fired for buying Microsoft").
- Dictation and ambient in one product.
- Nursing flowsheets and radiology.
- Europe and multilingual reach.
- Scale (21M encounters a quarter).
- Epic co-development.
- Bundling power.

### Weaknesses and complaints
- **Worst KLAS score** of the leaders in 2025 (91.6). KLAS says its appeal "leaned on being a Microsoft solution."
- **Expensive, with confusing and changing pricing.**
- **Customer resentment** over the sunsetting of Dragon Medical Network Edition and legacy products ("steered to sunset rather than served"), plus 2023 layoffs.
- **Lost the VA rollout** in November 2025 (replaced by the startup Knowtex).
- **Market share** fell from Nuance's historic dominance to about 33% of ambient.
- **An RCT found no significant time savings.**
- **Workflow friction:**
  - Separate app and window.
  - A manual "Sync to EHR" step.
  - New recordings overwrite manual edits.
- **iOS-first ambient** through PowerMic Mobile.
- **UI churn:** major redesign in 5.0.

---

## 3. Ambience Healthcare

### Background
- **Founded:** 2020 in San Francisco by **Mike Ng** and **Nikhil Buduma**, who met at MIT in 2013.
  - Mike Ng: ex-Morgan Stanley, CEO from founding. He became President and Chairman in October 2025.
  - Nikhil Buduma: author of O'Reilly's *Fundamentals of Deep Learning*. He was co-founder and Chief Scientist, and has been CEO since October 2025.
- Nearly 20% of staff are practicing or trained clinicians embedded in model training and validation.
- Sources: https://www.ambiencehealthcare.com/blog/ambience-healthcare-announces-nikhil-buduma-as-new-chief-executive-officer , https://hitconsultant.net/2026/05/29/ambience-healthcare-launches-chart-aware-inpatient-ai/

### Funding and valuation
- **Series B:** $70M in February 2024 (Kleiner Perkins, OpenAI Startup Fund).
- **Series C:** **$243M in July 2025** at **$1.25B** post-money, co-led by Oak HC/FT and a16z. Also joined by the OpenAI Startup Fund, Kleiner, Optum Ventures, Frist Cressey, Town Hall, Smash, Georgian and Founders Circle.
- **Total raised:** about $345 to 373M.
- **No 2026 round found.**
- **ARR:** $19M at end of 2024, then about $30M in May 2025 (Sacra). One 2026 estimate is also about $30M. It is not disclosed.
- Sources: https://www.fiercehealthcare.com/health-tech/ambience-banks-243m-series-c-investors-continue-bet-big-ambient-ai , https://www.beckershospitalreview.com/healthcare-information-technology/ai/ambience-healthcare-reaches-1-25b-valuation/ , https://sacra.com/c/ambience/

### Scale and customers
- **Cleveland Clinic:**
  - Exclusive 5-year contract after a 6-month bake-off of 5 scribes.
  - 4,000+ ambulatory clinicians onboarded in about 4 months (spring 2025), used in 76% of scheduled visits by week 15.
  - npj Health Systems, August 2026: 97% satisfaction, 60% said it made them more likely to stay in practice, 70% encounter-level use after one year, about 2 minutes saved per visit.
- **MultiCare:** chose Ambience after a head-to-head test with 550+ clinicians across 3 vendors; 92% adoption.
- **Other customers:**
  - Houston Methodist ("part of our clinical infrastructure"; 40% less documentation time).
  - St. Luke's (Boise): 70%+ inpatient use, NPS up 31 points.
  - UCSF, Memorial Hermann, John Muir Health, Onvida Health, Ardent (3 times ROI).
  - The Oncology Institute, GI Alliance.
- **Health-system count** is not published and is far smaller than Abridge's.
- **Specialties:** "200+ specialties and subspecialties," with 80+ validated at Cleveland Clinic.
- Sources: https://medcitynews.com/2026/08/cleveland-clinic-ai-healthcare-ambient-scribes/ , https://hitconsultant.net/2026/02/12/ambience-healthcare-ai-chart-awareness-automated-coding/ , https://www.ambiencehealthcare.com/

### Exact clinician workflow
1. **Pre-visit, AutoPrep / Patient Recap:**
   - A chart-aware pre-visit summary built from the longitudinal record: prior notes, problems, labs, imaging, meds and pathology.
   - It can pre-write parts of the note.
2. **Start:**
   - Inside Epic, the clinician opens the patient in **Haiku** and launches Ambience from the Haiku ambient launcher (Epic **Toolbox** for Ambient Voice Recognition, August 2025; uses Epic's Ambient Module and FHIR APIs). It then **records**.
   - Stop and start are supported, which matters in the ED.
   - Non-Epic sites use the Ambience mobile app.
   - Consent verbiage is inserted into the HPI; UCSF's template shows an "Ambience HPI SmartPhrase" consent line.
3. **During the visit:**
   - Audio streams in.
   - **Real-time triage and diagnoses** surface possible missed conditions with ICD-10 suggestions (inpatient).
4. **After the visit:**
   - **AutoScribe** produces the note within about 20 to 90 seconds.
   - **AutoCDI** runs in parallel. It checks the note against coding rules and suggests ICD-10, CPT, E/M level and HCC/MCC codes, including chart-substantiated codes such as G2211 and chronic care management.
   - The **HCC Compliance Validator** flags documentation that does not support a code.
5. **Review:**
   - The note flows natively into Epic (Hyperspace/Hyperdrive) or Oracle/athena through bidirectional APIs.
   - The clinician edits and accepts the codes, then signs.
   - The coding suggestions are "documentation-level validation," not just informational.
6. **Downstream:**
   - **AutoAVS:** patient after-visit summary.
   - **AutoRefer:** referral letters.
   - Orders and tasks are tracked. "Tracks and completes clinical tasks."
7. **Inpatient (May 2026 suite):**
   - Patient Summary, then an **H&P** that combines bedside talk and chart data.
   - Daily **Progress Notes** built from yesterday's note plus new labs, meds and vitals, replacing copy-forward.
   - **One-click Handoff and Discharge Summaries** with an audit trail.
   - Ambience's rationale: "70% of clinically important inpatient diagnoses have no signal in a traditional audio transcript."
   - It resolved 91% of information gaps (4 systems, 66 encounters).

Sources: https://www.ambiencehealthcare.com/blog/ambience-healthcare-joins-epic-toolbox-unlocking-advanced-ai-functionality-within-haiku-for-epic-customers , https://hitconsultant.net/2025/09/03/ambience-and-onvida-health-launch-frontier-ai-in-epic-haiku/ , https://hitconsultant.net/2026/05/29/ambience-healthcare-launches-chart-aware-inpatient-ai/ , https://www.deepcura.com/resources/ambience-healthcare-review

### Note formats
- **Ambulatory:** CC, HPI, ROS, PE, Assessment & Plan, with specialty templates (surgical operative and procedure notes, psych, ED, oncology, GI and so on).
- **Inpatient:** H&P, Progress Note, Handoff, Discharge Summary.
- **Other outputs:** AVS and referral letter.
- **Personal style:** notes adapt to each provider's voice.
- **Chart-aware A&P:** automatically pulls in lab trends, such as an A1c trajectory, and grounds the assessment in history as well as today's talk.
- No verbatim public sample note was found.

### Distinctive features
- **Coding-first positioning:**
  - "95% coding compliance (AAPC-verified)" and "95% coding accuracy vs board-certified coders."
  - $13,000+ extra revenue per clinician per year.
  - 3 times ROI.
  - Returns $3 of operating margin per $1 spent (Ardent).
- **Chart Awareness** (February 2026): uses the full longitudinal record for summaries, diagnostics and coding. This is the main technical difference from conversation-only scribes.
- **Chart Chat:** EHR-embedded Q&A with source citations. It says so when it cannot find an answer.
  - **Chart Chat for Nursing** (April 2026, Cleveland Clinic pilot) targets the "chart dives" that eat up to 41% of nurse time.
- **Frontier features in Epic Haiku** with Onvida (September 2025).
- **KLAS Emerging Solutions 2025:** #1 for improving clinician experience.
- **Awards:** KLAS Trailblazer and Fast Company World Changing Ideas.
- **Buduma's framing:** "AI in healthcare has to do more than generate notes... Chart awareness is the foundation."

### UI description
- **Inside Epic:** runs natively, so the clinician mostly sees Epic.
  - A launcher in Haiku.
  - A record screen.
  - Generated sections in the Epic note.
  - A side-panel style companion (Chart Chat) with a chat box and cited sources.
  - Coding suggestions as accept/reject items.
- **Marketing site:** clean and light, with product mockups showing chart-reconciliation cards, chat answers with citations, task lists, code panels (ICD-10, HCC/MCC, E/M) and specialty notes.
- The site navigation is Products / Solutions / Evidence / Blog.
- Public screenshots were limited, so the visual detail here is lower-confidence than for the other two.

### EHR integrations
- **Epic:** Toolbox (Ambient Voice Recognition), Ambient Module, Haiku/Hyperspace/Hyperdrive and FHIR read/write. Live with Epic since 2023.
- **Oracle Health (Cerner):** native.
- **athenahealth:** reported.
- Others are claimed ("other major EHRs").

### Pricing
- **Custom enterprise contracts** plus a one-time implementation fee. Deployment takes 3 to 6 months.
- **Estimates:**
  - AutoScribe: $2,800 to 3,200 per provider per year, about $233 to 267 per month.
  - Full suite (CDI, AVS, Refer): $4,000 to 5,000 per year, about $333 to 417 per month.
- **Pitch:** the price pays for itself through coding uplift.

### Roadmap and direction
- A multi-year roadmap to "rebuild healthcare with AI" (Becker's).
- **Chart-aware intelligence** across every workflow: ambulatory, then ED, then the full inpatient stay (admission to discharge).
- Nursing (Chart Chat).
- Revenue integrity and CDI.
- Tasks and agents.
- Moving from "scribe" to "intelligence platform / clinical infrastructure."
- Source: https://www.beckershospitalreview.com/healthcare-information-technology/innovation/ambience-unveils-multi-year-roadmap-to-rebuild-healthcare-with-ai/

### Strengths
- Highest satisfaction and NPS claims ("63 points higher than runner-up").
- Wins head-to-head bake-offs (Cleveland Clinic against 5 vendors, MultiCare against 3).
- The strongest coding, CDI and revenue story.
- Chart awareness (uses the record, not just the audio).
- Inpatient depth.
- Broad specialty coverage.
- A clinician-heavy team.

### Weaknesses
- Much smaller scale and ARR than Abridge (about a quarter of Abridge's valuation).
- Enterprise-only, long implementations and opaque pricing.
- No self-serve or small-practice tier.
- Less peer-reviewed evidence beyond the Cleveland Clinic studies.
- Coding-uplift messaging may draw payer and audit scrutiny.
- Integrations outside Epic and Cerner are less proven.
- Exposed to Epic AI Charting like everyone else.

---

## 4. How they compete

| Dimension | Abridge | Microsoft Dragon Copilot | Ambience |
|---|---|---|---|
| Positioning | Clinician-trust and evidence (Linked Evidence), "clinician intelligence platform" | Unified voice assistant (dictation + ambient) and agent marketplace in the Microsoft stack | Chart-aware, coding-first "intelligence platform," revenue ROI |
| Scale | 300+ systems, about 100M conversations a year | 650+ orgs, 100k+ clinicians, 21M encounters a quarter | Dozens of large systems, 4,000+ at Cleveland Clinic alone |
| Epic depth | Workshop partner, Abridge Inside | Co-developed, also powers Epic AI Charting | Toolbox + Ambient Module |
| Main differentiator | Traceability, multilingual, research evidence, payer (Availity) link | Dictation heritage, nursing flowsheets, radiology (PowerScribe), M365 | Longitudinal chart context, CDI/coding accuracy, inpatient suite |
| KLAS | Best in KLAS 2025 and 2026 (94.7) | 91.6 (2025), last of 4 | 94.4 (2026), 97.7 (2025) |
| Price (est.) | about $200 per month | $150 to 600+ per month, volatile | about $230 to 420 per month |

**Shared strategic pattern:**
- All three are moving past the note into coding/CDI, orders, prior auth, nursing, inpatient and agents. The reason is Epic's native AI Charting (on Microsoft technology), which turns the basic note into a commodity.
- **Abridge** bets on trust plus aligning payer and provider data.
- **Ambience** bets on revenue integrity plus chart intelligence.
- **Microsoft** bets on distribution and being the platform other vendors' agents run inside.

**Design takeaways for Chartside (for the product):**
- The winning in-EHR workflow is converging on the same pattern:
  - Record on the phone from the patient's chart.
  - A status pipeline (Recording, Uploading, Processing, Ready, Reviewed).
  - Section-level insertion into the note template (HPI / PE / Results / A&P).
  - A side-by-side verification panel linking note, transcript and audio.
  - A patient summary.
  - Settings toggles (Concise/Comprehensive, Bulleted/Paragraph).
  - Codes as accept/reject suggestions.
  - An explicit sign or sync step.
- Openings the incumbents leave:
  - Transparent pricing and self-serve.
  - Shorter, less bloated notes.
  - Visible omission and error checks (omissions are 76% of errors).
  - Reversible "Create Note."
  - Non-Epic practices.
