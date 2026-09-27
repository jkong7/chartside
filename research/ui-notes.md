# Hands-on UI teardown

Source material: vendor product pages, live hero demos, and the App Store screenshot sets for each iOS app, saved under `research/ui/appstore/*.jpg`. Each vendor below is described as a clinician would move through it.

## Abridge (Abridge for Clinicians, plus inside Epic Haiku/Hyperdrive)
- **Worklist**: header reads "WORKLIST", with a TODAY date chip, a filter, and a red "+" button. Each patient card shows the scheduled time, name, and DOB, plus a status on the right: recording duration with a note icon, a paused timer, or an empty dashed circle for not started.
- **Recording**: the whole screen turns brand red. The header shows the time and patient name with a switcher chevron, and there's an X to cancel and a kebab menu. The waveform glyph animates, a line below says "Your conversation will be summarized.", and a large stop button sits at the bottom. The Epic-embedded version adds a SHE/HER pronoun picker and a black "CREATE NOTE" pill.
- **Note**: stacked white cards titled History of Present Illness, Physical Exam, and so on, each with a pencil edit icon. The HPI opens with a narrative line ("Flora, with chronic kidney disease Stage 4 secondary to type 2 diabetes, presents with abdominal pain") followed by symptom bullets.
- **Edit**: tapping a card opens a blue-bordered edit mode where voice-to-text dictation appends new sentences to that section.
- **Signature features**: Linked Evidence (tap any sentence to hear or see the transcript span behind it), patient visit summaries, 28+ languages, and 50+ specialties.
- **Look**: minimal UI in red, black, and cream, with editorial typography. The emphasis is on trust and enterprise polish.

## Suki (Suki Assistant)
- **Home**: a "Suki" wordmark with search and profile icons. Below it sit Recent Notes (with an orange dot for unsigned), Today's Schedule (time, patient, visit reason), and a "Start a visit" card: "Can't find patient? Start ambient and add patient later" with a yellow **Start Ambient** button. A floating voice orb stays pinned at the bottom.
- **Patient page**: name, age, sex, DOB, and MRN. An icon row covers **Summary, Vitals, Meds, Labs, More**, which is pre-charting context pulled from the EHR. Below it: Start Ambient, Current Notes (Follow Up, Clinic Note), and Prior Notes with sign-off checkmarks.
- **Recording**: a bottom sheet with a yellow-on-black waveform, "Listening…" and a timer, a Pause button, and a yellow check to finish.
- **Note**: A&P problems are numbered, each with an inline ICD-10 chip (Type 2 Diabetes Mellitus **ICD E11.9**, Hypertension **I10**, Gout **M10.07**). A yellow **Send** button pushes the note to the EHR. The voice orb supports commands ("Suki, add…").
- **Signature features**: voice commands and dictation, ambient plus dictation hybrid, Q&A over the chart, order staging, coding, and pre-charting.

## Heidi (Heidi, AI Care Partner)
- **Sessions list**: a search bar and a "1 session waiting to be uploaded" banner (offline capture). Rows under Today have colored initials avatars and read "Name age sex, time · visit reason". A pinned "+ New session" button sits at the bottom, and a bottom tab switches between Scribe and Evidence.
- **Capture**: a mic source picker ("Kate's Airpods" with a live level meter) and a **Transcribe | Dictate** segmented control. A large green pause button, the elapsed time with a red dot, and the patient name. The web version adds a red "Stop transcribing" pill.
- **Session tabs**: **Context | Transcript | SOAP note | Referral letter | +**. Clinicians can add any number of documents per session. Context is where pre-visit information gets pasted.
- **Session settings sheet**: session time, **Voice: Brief (Custom)**, **Scribe: Fast**, **Input language**, **Output language** (separate, so the patient can speak one language and the note comes out in another), and a Session ID.
- **Template picker**: Favourites (SOAP note, HOPC note, SOAP + Issues list, GP note, Patient explainer), then a long "All" list: Patient History Summary, Clinical Assessment Report, Treatment Plan, Medication Reconciliation, Follow-Up Care Instructions, Referral Letter, Patient Consent Form, Discharge Summary, Progress Note…
- **Export & share**: Send as email, Download PDF, Open in web, Share to…, and a primary **Push to EHR** button.
- **Evidence**: guideline answers with source chips (RACGP, Vidal, BMJ) and a toggle between "Clinical web" and "Literature & guidelines" sources.
- **Hardware**: Heidi also sells a clip-on mic for rounds, and has an Ask Heidi command bar.
- **Look**: a warm aubergine and cream palette, a serif display font, and a consumer-grade feel.

## Freed
- **Visits list**: "+ New Visit", search, export, and an "All Visits" filter. Rows under Today and Yesterday show a status dot (uploading, done, paused, error) with the name, time, and duration. A big purple **Capture** button sits at the bottom.
- **Recording**: "Recording in Progress" with the date. Two dropdowns (**Add or select Patient**, **Select Template**) sit above a big purple mic or pause orb, with the mic source and a timer. When the visit ends, a "Recording completed ✓" state appears.
- **Note**: each section header collapses (Subjective, Objective, Assessment & Plan), with 👍 👎 and a copy icon per section. The feedback trains Freed to the clinician's style. A **Learn format** button sits next to the template chip ("Returning Patient"), and pasting an example note makes Freed copy its structure.
- **Patient instructions**: a "Secure send to patient" composer (HIPAA secure email) with Cancel and Send.
- **Desktop**: a Chrome-extension-style mini recorder (green timer, Pause, red End, expand) plus a web app with a split view (visits sidebar, Note/Transcript tabs) and an "Ask about this patient" box.
- **Look**: purple and white with soft gradients. Very simple, one-tap, and aimed at solo clinicians.

## Nabla (Assistant Mobile, Dictation Mobile, Chrome extension)
- **Recording**: a full purple screen with a pulsing circle and timer. The live transcript streams underneath with timestamps (00:14, 00:16…), and a dark **Generate note** button finishes the visit.
- **Encounter note**: purple uppercase section labels: CHIEF COMPLAINT, HISTORY OF PRESENT ILLNESS, PAST MEDICAL HISTORY, MEDICATIONS (with doses), ALLERGIES, OBJECTIVE, ASSESSMENT. Notes come back "in less than 20 seconds".
- **Normal exam insertion**: templated exam text ("General appearance: alert, well appearing…") is highlighted in lavender with ✓ accept and 🗑 reject buttons, so auto-inserted defaults are *visibly different* from what was actually said. This is an important trust pattern.
- **Patient instructions**: a plain-language list ("Order a home sleep test…", "Keep a sleep diary…", next appointment) with a Send button.

## DeepScribe
- **Schedule**: a date picker ("March 28th") and appointment cards with a status pill (Imported, **Ready to record**, **Ready to scribe**) and visit type (New Consult, Follow-up).
- **Recording**: a large timer (14:34), "Recording…" with a flowing multicolor waveform, and a round pause button.
- **Note tabs**: **Note | HCC | E/M**. There are dedicated tabs for Hierarchical Condition Category risk-adjustment capture and E/M level justification, and the note is split into Subjective, Chief Complaint, HPI, Previous Treatment, Medications, and Medical History. The focus is oncology and specialty care.

## Microsoft Dragon Copilot
- **Patient header**: a back arrow and name, plus icons for templates, library, and more. A disclaimer banner reads "Check for mistakes in all content created by AI." A "Manage default templates" link sits above the note tab.
- **Note**: sections with checkboxes (HISTORY OF PRESENT ILLNESS, Social History, Family History). A checkbox selects a section for bulk copy. Section bodies are tinted blue while AI generates them, and each has copy, history, and link icons.
- **Bottom bar**: a persistent recording pill (● 02:08 ▾) and a Copilot button. **Copilot Chat** covers clinical Q&A with "Trusted sources" citations (MSD Manual) and AI-response badges, plus natural-language tasks ("Request received: Summarize note").
- **Signature features**: one assistant that combines dictation (Dragon Medical One), ambient (DAX), and chat. It has the deepest Epic integration and orders and referral letter tasks.

## Commure Ambient (formerly Augmedix and Athelas)
- **Day list**: "Mar 20th, Today" with search and filter. Status badges read **Generated**, **Paused**, or nothing (pending), and each row shows age, sex, and the assigned scribe or provider.
- **Scribe detail**: "John Doe — Chest Pain · Age 42 · Sex M · Room 389 · 15m 36s". Tabs: **Clinical Note | ICD10/CPT Code | Transcription | Pre-charting**. Toggles for **Highlight Off, Citation Off, Compare View**. "+ Add Re-evaluation" adds an ED re-eval addendum.
- **Sections**: HPI, ROS, and others, each with Edit and Copy. Handles 2+ hour multi-speaker encounters in 60+ languages.
- **Recording**: a full-screen blue gradient with the patient, "SOAP Note · Virtual", a big timer, a waveform, and "Pause Recording".
- **Signature features**: an ED and inpatient focus (re-evaluations), coding tab, citation highlight, and a compare view against the transcript.

## Sunoh.ai (eClinicalWorks)
- **Home**: "My Recordings" with a date stepper, a pink "Start Recording" button, and a filter. Cards show the time, patient name (editable), reason for visit, a Sunoh waveform icon, and a kebab menu.
- **Voice signature onboarding**: "Configure your Voice Signature" asks the clinician to read a paragraph so the system can tell the clinician's voice apart from the patient's. A progress bar tracks it, with a "Do you wish to re-record?" prompt.
- **In eCW**: the note lands in the progress note sections, and orders (labs, imaging, meds) get staged for one-click acceptance. The product is aimed at eCW's large ambulatory base at low price points.

## Ambience Healthcare (no public iOS app; web and Epic-embedded)
- Ambience lives inside Epic (Haiku, Rover, Hyperspace). The clinician starts recording from the Epic mobile app and the note flows into Epic. Its differentiator is **coding-aware documentation**: real-time CDI nudges, ICD-10 and CPT suggestions with rationale, and an E/M level. It also covers ED, inpatient, and nursing.

## Cross-vendor UI patterns worth copying
1. **One primary action per screen**: Start, Pause, Stop/Create note (every vendor).
2. **Schedule or worklist with status pills**: ready to record, recording, generating, ready for review, signed.
3. **Sections as cards** with per-section edit, copy, and thumbs feedback (Freed, Commure, Abridge).
4. **Tabs per session**: Transcript / Note / Patient letter / Referral / Codes (Heidi, Commure, DeepScribe).
5. **Evidence and citation mode**: tap a sentence to see its source (Abridge Linked Evidence, Commure Citation toggle).
6. **Visibly different auto-inserted defaults** that need accept or reject (Nabla normal exam).
7. **Inline ICD-10 chips on each A&P problem** (Suki) plus a separate Codes tab with E/M and HCC (DeepScribe, Commure).
8. **Template library plus learn-from-example** (Heidi templates, Freed Learn format).
9. **Pre-chart context tab** (Heidi Context, Suki Summary/Vitals/Meds/Labs, Commure Pre-charting).
10. **Patient-facing instructions** with a send action (Nabla, Freed, Abridge).
11. **Input vs output language** (Heidi).
12. **An assistant chat or command bar** (Dragon Copilot Chat, Ask Heidi, Ask Suki).
