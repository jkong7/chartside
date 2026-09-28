# Feature gaps vs. the top ambient scribes (late September 2026)

Scope: product features, not market stats. The core loop (record, note, codes, sign) is table stakes. This doc covers the features the leading products ship around that loop, how each one behaves, the evidence that clinicians want it, and a ranked build list for Chartside.

Vendors covered: Abridge, Microsoft Dragon Copilot, Epic AI Charting / Art, Ambience, Commure, Suki, Nabla, Heidi Health, DeepScribe, Freed, Oracle Health Clinical AI Agent, Doximity Scribe, athenaAmbient, Sunoh.ai.

Method: vendor product pages, release notes (Dragon Copilot 3.6, Heidi April and May 2026 changelogs, Doximity product updates), help centers (Heidi, Freed, Commure docs), developer docs (Suki for Partners, Nabla Core API), press releases, KLAS Arch Collaborative 2026 coverage, and third-party roundups of Reddit threads (r/medicine, r/FamilyMedicine). Some press pages (Fierce, BusinessWire, Oracle newsroom) blocked direct fetch; those facts come from syndicated copies (HIT Consultant, Bio-IT World, HLTH) and are linked. Review sites written by competitors (Commure blog-scribe, DeepCura, Twofold, Vero) are used only for Reddit quotes and pricing, and are flagged as such.

Chartside already has: sentence-level evidence links, E/M + ICD-10 + HCC with MEAT and CDI queries, order staging with safety checks, template library/editor with live preview, style learning from edits, pre-visit brief, EN/ES patient summaries + share link, referral letters, command bar assistant, per-section feedback, omission detector, consent ledger, Deepgram live captions + diarization, offline upload queue, claims/837P/prior auth/remits/denials, SMART on FHIR Epic launch + DocumentReference write-back, orgs/RBAC/OIDC SSO/admin console/audit log, insights metrics. Where a competitor goes deeper on one of these, it is noted under "Depth differences" at the end.

---

## 1. Voice: dictation mode, voice commands, vocabulary

### 1.1 Dictation mode alongside ambient (at-cursor dictation)
**Who ships it:** Dragon Copilot, Suki, Nabla (Nabla Dictation, plus a Mac app with on-device recognition), Commure (Commure Dictation), Heidi (Dictate, Session Dictation, Inline Dictation), Freed (Dictation & Phrases), Doximity (simple dictation template), Abridge (clinician dictation for ED, urgent care, nursing, MAs).

**How it works:**
- **Dragon Copilot** merges Dragon Medical One dictation, ambient capture, and chat in one app. Its "full text control" lets you select, correct, and navigate text by voice inside Word and Outlook as well as the EHR. Migrated users keep their DMO commands, vocabularies, auto-texts, and formatting preferences, and 3.6 added a settings page for dictation formatting (numbers, units, punctuation).
- **Nabla Dictation** is real-time "at-cursor" speech-to-text inside any application, with built-in commands and automatic punctuation, started by a click or hotkey. The Mac app (2026) runs speech recognition on-device (Core ML on the Neural Engine), sends no audio to the cloud, and supports PowerMic and SpeechMike hardware. Nabla positions it for in-basket messages, referrals, and follow-up coordination, meaning the work outside the visit.
- **Commure Dictation** is a speech-to-cursor extension for any text field or desktop app, pitched for referrals, inbox messages, and orders.
- **Heidi** has three dictation modes: (a) the desktop app's hotkey Dictate works in any application; (b) Session Dictation produces word-for-word documents such as operative notes and letters, with no AI summarizing; (c) an inline mic icon in the Note or Context tab dictates into that field.
- **Suki** offers voice editing ("dictate corrections into the note by voice") plus an inbox-note scratchpad.

**Demand:** Dragon's migration pitch is built on the installed base of dictation users. Nabla's and Commure's 2026 launches both frame dictation as the tool for the rest of the day's work (inbox, referrals). M Health Fairview bought Nabla's "combined ambient + dictation" product specifically. Reddit threads complain that Suki's physical-exam dictation "feels clunky", which shows people actually use exam dictation.

**Sources:** https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.nabla.com/press-release/nabla-launches-medical-grade-dictation-product-built-for-apple-devices , https://www.nabla.com/dictation , https://www.commure.com/press-releases/commure-introduces-dictation-ai-powered-clinical-voice-now-at-the-cursor , https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary , https://www.nabla.com/press-release/m-health-fairview-selects-nablas-combined-ambient-ai-assistant-and-dictation-solution-to-power-next-generation-clinical-documentation

### 1.2 Voice commands (edit, format, navigate, act)
**Who ships it:** Suki (the most complete: "Suki, ..." commands for ordering, adding diagnoses, navigating, querying), Dragon Copilot (step-by-step workflows triggered by voice, shortcut, PowerMic button, or mobile mic button; "what can I say" help), Epic AI Charting (voice commands that restructure the note, e.g. "format HPI as a bulleted list", applied to this note and future notes), Oracle (voice-driven chart search for nurses).

**How it works:**
- **Dragon 3.6** added mapping of user "workflows" (multi-step macros) to mobile mic buttons. Saying "what can I say" opens a help page listing the available commands, which now sits at the top of the Help menu.
- **Epic** treats voice as a personalization channel. A spoken formatting instruction is saved as a preference for future notes, not just applied once.
- **Oracle's nursing agent** answers voice queries such as "what was the last potassium" at the bedside.

**Demand:** In the KLAS Arch Collaborative 2026 data, order creation (+9%) and EHR data discovery (+5%) are among the biggest efficiency gains. Both are things voice commands do.

**Sources:** https://www.healthcaredive.com/news/epic-rolls-out-ai-charting-art-notetaking-documentation-scribe/811462/ , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://hitconsultant.net/2026/09/14/oracle-health-launches-clinical-ai-agent-for-nurses-inpatient-ehr-documentation/ , https://hitconsultant.net/2026/07/17/klas-arch-collaborative-2026-healthcare-ai-insights/

### 1.3 Personal vocabulary, word library, find-and-replace
**Who ships it:** Dragon ("User vocabulary" and "User texts" libraries, on by default in 3.6), Heidi (Word Library auto-corrects or abbreviates; right-click a word to replace it in this output, in all session outputs, or add it to the permanent library; bulk find-and-replace), Nabla API (custom dictionary).

**Demand:** In an end-user safety study, the largest error category was medication errors (18.5% of safety feedback), including misspelled drug names. Reddit users say accents and uncommon terms trip up Suki's speech model.

**Sources:** https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary , https://www.heidihealth.com/en-us/product/customisation , https://arxiv.org/html/2512.04118

### 1.4 Snippets / smart phrases / dot phrases
**Who ships it:** Heidi (Snippets triggered by "/" plus a shorthand such as `/normROS`, stored in a Memory tab and shareable with the team), Freed (saved phrase blocks), Nabla (dot phrases in the product and the API), Dragon (auto-texts / "User texts").

**Demand:** Clinicians coming from Epic expect SmartPhrases. Heidi advertises team-shared snippets as a way to "standardize naming conventions across departments."

**Sources:** https://www.heidihealth.com/en-us/product/customisation , https://www.getfreed.ai/features , https://docs.nabla.com/guides/intro

---

## 2. Note control: length, style, structure

### 2.1 Detail level presets (verbosity control)
**Who ships it:** Heidi (Voice Settings presets Brief / Goldilocks / Detailed / Super Detailed / custom; Scribe Settings Fast vs Best), Freed (Learned templates show the desired length by example).

**Demand:** Long notes are the single most common content complaint on Reddit: "long, formal, bloated AI notes", Suki's "bloated" A&P, and Commure/Abridge being called wordy.

**Sources:** https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary , https://support.heidihealth.com/en/articles/14648718-get-more-out-of-heidi , https://www.deepcura.com/resources/best-ai-medical-scribe-reddit (competitor-authored Reddit roundup)

### 2.2 Natural-language whole-note edits ("Magic Edit")
**Who ships it:** Freed (Magic Edit: "Shorten the subjective section", "Rewrite in more clinical language"), Nabla ("Edit note with instructions" API: "Make note more concise", "Add more details in the Plan section"), Heidi (Ask Heidi chat bar edits notes), Abridge ("natural language customization via AI agent", June 2026), Epic (voice restructuring).

**How it works:** a free-text instruction is applied to the whole note or to one section, and the result replaces the draft. Freed preserves the medical content while changing the style. In Freed's learned templates, text in quotation marks is included verbatim and text in [brackets] is an instruction to the model, shown in blue.

**Sources:** https://www.getfreed.ai/blog/customize-edit-notes-freed , https://docs.nabla.com/user/edit-note-with-instructions , https://www.abridge.com/press-release/patient-centered-clinician-intelligence-platform-keynote

### 2.3 Problem-oriented / diagnosis-aware A&P
**Who ships it:** Suki (problem-based charting: the note is organized by active problems and diagnoses rather than SOAP), Dragon Copilot for Epic ("diagnosis-aware notes": the A&P is structured per diagnosis and sent to Epic as discrete problem-linked data, overriding custom A&P templates), Ambience (chart-aware A&P that "clearly highlights what changed").

**Demand:** Reddit: scribes that "collapse a 4-problem encounter into a single narrative paragraph" are "useless for downstream care coordination." Multi-problem structuring is one of the five most-requested features in that roundup.

**Sources:** https://developer.suki.ai/documentation/overview , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.ambiencehealthcare.com/blog/expanding-chart-awareness-across-the-ambience-intelligence-platform , https://www.deepcura.com/resources/best-ai-medical-scribe-reddit

### 2.4 Template power features
- **Heidi:** tables inside templates; "Auto Mode", which picks the template itself; several templates queued or auto-generated per session; cross-organization template sharing; template search with author filter; a "Template Manager" role that can manage templates without full admin rights; markdown previews.
- **Dragon:** org, site, or group shared templates, read-only for users.
- **Freed:** drag-and-drop sections, an eye icon to toggle sections, custom subsections.
- **Suki:** LOINC-coded note sections.
- **DeepScribe:** Customization Studio with 50+ options.

**Sources:** https://www.heidihealth.com/en-us/progress-notes/april-2026 , https://www.heidihealth.com/en-us/changelog/may-2026 , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.getfreed.ai/blog/customize-edit-notes-freed

---

## 3. After the visit: tasks, documents, forms, letters

### 3.1 Auto-detected clinical tasks
**Who ships it:** Heidi (Tasks), Oracle (captured "next-step actions" such as "see you back in three months", queued as follow-up appointments), Epic Art (care-gap identification turns result recommendations into discrete follow-up tasks; imaging follow-up extraction), Dragon nursing ("Summary of pending care activities", which adds new items after each recording and drops completed ones).

**How it works:** Heidi reads the note after the session and lists tests, referrals, reviews, and needed documents (referral letter, patient explainer, GP letter) as tasks, each with one-click generation. In 2026 this runs in the background for mobile sessions. The May 2026 desktop redesign shows tasks as a flat list with a detail panel.

**Demand:** Oracle pitches it as "removing the cognitive load of remembering to schedule". KLAS shows shift and patient-stay summaries (the nursing equivalent) at +6% efficiency.

**Sources:** https://support.heidihealth.com/en/articles/14648718-get-more-out-of-heidi , https://www.heidihealth.com/en-us/changelog/may-2026 , https://hitconsultant.net/2026/02/02/ehr-oracle-health-clinical-ai-agent-automated-order-creation/ , https://www.epic.com/software/art/

### 3.2 Documents section with auto-run letters
**Who ships it:** Dragon Copilot 3.6 (new "Documents" nav section: consultation letter to the GP, letter to the patient, referral letter; each can be set to "auto-run" after every ambient recording), Heidi (Default Document Templates and "Queue in all sessions"), Freed (14+ letter types including **work notes, school notes, caregiver letters**, referrals).

**Sources:** https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.getfreed.ai/features , https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary

### 3.3 Form filling from the conversation
**Who ships it:** Heidi (Forms Editor turns static PDFs into dynamic forms that are filled inside the session and stored alongside the transcript), Suki (Form Filling API/SDK returns structured JSON by callback or webhook), Epic (OASIS home-health assessment suggestions; faxed referral order parsed into discrete fields).

**Sources:** https://www.heidihealth.com/en-us/progress-notes/april-2026 , https://developer.suki.ai/documentation/overview , https://www.epic.com/software/art/

### 3.4 Patient instructions, delivered
**Who ships it:** Freed (patient instructions in 90+ languages, emailed with "Secure Send"; the learned format also applies to instructions), Epic (drafts patient instructions from the A&P), Nabla (patient-friendly notes), Dragon (letter to the patient). Reddit roundups list "direct patient letter email delivery" as a gap in competing tools.

**Sources:** https://help.getfreed.ai/en/articles/8971923-securely-send-patient-instructions , https://www.epic.com/software/art/

---

## 4. Chart awareness and context

### 4.1 Context tab / document upload
**Who ships it:** Heidi (Context tab: upload discharge summaries, scan results, monitoring data, and letters, which flow into the note without anyone saying them aloud; typed or dictated context too), Doximity (pre-charting, June 2026: type, dictate, or paste context before the encounter).

### 4.2 Patient profile auto-extraction
**Who ships it:** Heidi (Patient Profiles automatically detect and save meds, allergies, past history, DOB, and address, then fill them into referral letters), Freed (Continuous Context and shared patient records across clinicians).

### 4.3 Longitudinal synthesis ("what changed")
**Who ships it:** Ambience (chart-aware A&P; chart-aware diagnostics pulling lab, path, and imaging trends into the note; chart-aware coding for multi-visit codes such as **G2211** and the Annual Wellness Visit), DeepScribe SmartPrep (initial consult: up to 2 years of oncologic history turned into an HPI; follow-up: interval events, reconciliation against the prior plan, unresolved items, a prioritized checklist; refreshes automatically as documents arrive, up to 7 days ahead), Dragon (Epic FHIR reads of allergies, notes, meds, and fills), Epic Insights (16M uses per month).

**Demand:** KLAS 2026: patient-history summaries are used by 51 to 52% of physicians and APPs. Ambience reports closing "91% of information gaps" in inpatient pilots.

**Sources:** https://support.heidihealth.com/en/articles/14648718-get-more-out-of-heidi , https://blog.doximity.com/updates , https://www.ambiencehealthcare.com/blog/expanding-chart-awareness-across-the-ambience-intelligence-platform , https://www.prnewswire.com/news-releases/deepscribe-introduces-smartprep-comprehensive-pre-visit-intelligence-for-oncology-302753452.html , https://hitconsultant.net/2026/07/17/klas-arch-collaborative-2026-healthcare-ai-insights/

---

## 5. Inpatient, ED, and nursing

### 5.1 Inpatient physician suite
- **Ambience (May 2026):** pre-encounter patient summary, H&P, real-time triage and diagnoses with ICD-10 suggestions, **daily progress notes built from prior records plus new labs, med changes, and vitals (explicitly anti copy-forward)**, handoff and discharge summaries synthesized continuously through the stay. 70%+ active use at Saint Luke's.
- **Epic Art:** draft hospital course (discharge summaries 20 to 30% faster), ED problem summaries, transition summaries for care managers, discharge planning extraction, nephrology rounding summaries.
- **Abridge Inside for Inpatient:** choose H&P, progress, or consult note type, each mapped to the Epic note type; "pre-round notes" that pull together ED documentation, nursing assessments, labs, and imaging (June 2026).
- **Oracle (March 2026):** ED and inpatient notes that combine multiple clinical events and interactions into a single draft.
- **Commure:** 12-hour summaries of significant changes.

**Sources:** https://hitconsultant.net/2026/05/29/ambience-healthcare-launches-chart-aware-inpatient-ai/ , https://www.epic.com/software/art/ , https://www.abridge.com/press-release/abridge-inside-for-inpatient-and-outpatient-orders , https://www.abridge.com/press-release/patient-centered-clinician-intelligence-platform-keynote , https://distilinfo.com/2026/03/12/oracle-health-ai-agent-transforms-clinical-documentation/ , https://docs.ambient.commure.com/

### 5.2 ED-specific
**Abridge Inside for Emergency Medicine:** pick the patient from the department Track Board and start recording right away in Haiku. The UI teardown in `ui-teardown.md` also covers Commure's ED re-evaluations. Dragon 3.6 raised the recording cap to **120 minutes**, with a warning when 30 minutes remain.

**Sources:** https://www.abridge.com/press-release/abridge-inside-for-emergency-medicine-announcement , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6

### 5.3 Nursing
**Dragon Copilot for nurses (3.6):**
- The conversation turns into flowsheet rows that the nurse reviews and files in Epic Rover.
- Admins configure row visibility: previously documented rows only, or all rows for admissions.
- Admins can exclude rows, groups, macros, or LDAs from extraction.
- Templates cover restraints, blood administration, CIWA, admission, and discharge.
- The home page is patient-centric: pin patients, mark unread, search by MRN or room.
- Each patient has a "pending care activities" summary.
- A single nurse-note action covers narrative, provider notification, and incident notes.
- Copilot chat answers questions across all of the shift's transcripts.
- A 30-day post-go-live survey prompt.

**Abridge for Nurses:** GA to 250+ systems in May 2026; KLAS First Look score of 94.3.
**Commure nursing in Epic Rover:** flowsheet and LDA suggestions.
**Ambience Nursing Suite:** June 2026.
**Oracle nursing agent:** GA September 2026; discrete vitals, I&O, and assessments from voice, acute shift summaries, voice chart search.
**Epic Art:** end-of-shift care plan notes, nurse assignment suggestions.

**Demand:** KLAS: 30% of nurses use shift summaries, +6% efficiency. Every major vendor launched nursing in 2026.

**Sources:** https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://hitconsultant.net/2026/04/02/klas-report-abridge-ambient-ai-nursing-flowsheets-ehr/ , https://www.commure.com/blog/introducing-commure-ambient-for-nursing-in-epic-rover , https://hitconsultant.net/2026/09/14/oracle-health-launches-clinical-ai-agent-for-nurses-inpatient-ehr-documentation/ , https://www.bio-itworld.com/news/2026/06/24/ambience-healthcare-introduces-nursing-suite-to-extend-system-of-intelligence-across-inpatient-nursing

---

## 6. Clinical Q&A, evidence, decision support

- **Heidi Evidence:** citation-backed answers from HealthPathways, BMJ, and NICE. Available as a sidebar and inside "Ask Heidi" during a session, and the search bar stays visible while recording. Voice-dictated questions; conversations can be shared with colleagues; library and export shortcuts; drug interaction checks and dose calculations.
- **Freed Clinical Evidence:** cited answers from 50+ sources inside the note view.
- **Abridge:** UpToDate content in context during the visit (conversation plus chart), adding ADA, AAFP, and JCO content and CME credit (MedicusCME) in June 2026. Site-specific protocols are on the roadmap.
- **Dragon Information Assist:** admin-configured source lists (CDC, FDA, MedlinePlus, Merck, DailyMed), multi-intent questions, a "clinical coder" skill, and a safeguarded global search fallback.
- **Doximity Ask:** calculators, 2,200+ drug monographs, ClinicalTrials.gov, user memories, reusable prompt templates, and a sidebar inside Scribe (September 2026).
- **Epic:** "Ask Art" natural-language chart questions with cited answers and visualizations.
- **Commure:** CareCues and chat over patient data.

**Demand:** Nearly every vendor added evidence Q&A in 2026. Doximity's free Ask anchors its adoption.

**Sources:** https://www.deepcura.com/resources/heidi-health-review , https://www.heidihealth.com/en-us/changelog/may-2026 , https://www.getfreed.ai/features , https://www.abridge.com/blog/clinical-decision-support , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://blog.doximity.com/updates , https://www.epic.com/software/art/

---

## 7. Orders and follow-up (depth beyond order staging)

Chartside already stages orders. The leaders add:
- **Oracle:** proposes doses from patient history, the physician's "favorites", and org standards, and queues follow-up appointments.
- **Sunoh:** multi-order entry with one click and pre-filled meds, labs, imaging, and referrals on mobile.
- **Epic / athenaAmbient:** prescriptions and diagnoses drafted from conversation.
- **Abridge:** real-time prior auth with Availity and Highmark.

**Demand:** KLAS: order creation has the largest efficiency gain of any AI task (+9%).

**Sources:** https://hitconsultant.net/2026/02/02/ehr-oracle-health-clinical-ai-agent-automated-order-creation/ , https://www.trytwofold.com/compare/sunoh-ai-review , https://www.fiercehealthcare.com/ai-and-machine-learning/jpm26-abridge-teams-availity-scale-real-time-prior-authorization

---

## 8. Quality, compliance, and revenue beyond coding

- **Commure CareCues:** inline prompts shown as the note is finalized for missing MDM statements, **MIPS guideline gaps**, and HCC MEAT cues (for example, "Provider should Monitor, Evaluate, Assess, or Treat ... T2DM with neuropathy").
- **Abridge:** pre-visit care gap and chronic-condition identification; clinical trial screening (e.g. Alzheimer's risk); and pre-bill review for CDI and coding teams (September 2026), which checks DRGs and diagnoses against the encounter and audits present-on-admission status to avoid HAC penalties. It never changes codes autonomously.
- **Epic:** social drivers flagging (housing, food, transport, finances); cancer staging extraction for registries; service-level coding.
- **Ambience:** AWV and G2211 support.

**Demand:** Reddit and industry reviews say scribes "do not file MIPS or HEDIS data for you", so the gap is real. Abridge was Best in KLAS for RCM ambient in 2026.

**Sources:** https://www.commure.com/blog/why-ambient-ai-needs-rcm-integrating-clinical-and-financial-objectives , https://www.abridge.com/press-release/patient-centered-clinician-intelligence-platform-keynote , https://hitconsultant.net/2026/09/14/abridge-launches-pre-bill-review-cdi-coding-teams-inpatient-claims-drg-integrity/ , https://www.epic.com/software/art/ , https://www.commure.com/blog-scribe/best-ai-scribe-for-family-medicine

---

## 9. Patient communication

### 9.1 In-basket / portal message reply drafting
**Who ships it:** Epic Art (the original gen-AI feature; drafts use message text, org prompts, meds, and recent results, and show a medication, problem, and result context panel while replying; translates Spanish messages to English with an urgency preview), Doximity Ask (drafts letters and messages), Suki (agentic patient-messaging tasks), Nabla and Commure (dictation into inbox replies).

**Evidence:** 58% overall adoption of drafts across studies. Memorial Hermann: 55,000+ drafted messages since December 2025, only ~9 seconds saved per message, but **patients sent 32% fewer follow-up questions about results**, and replies were "longer and warmer". Mayo reports nurse time savings.

**Sources:** https://healthsystemcio.com/2026/09/10/in-basket-ai-wrong-metric/ , https://pubmed.ncbi.nlm.nih.gov/42361849/ , https://www.epicshare.org/share-and-learn/mayo-ai-message-responses , https://www.epic.com/software/art/

### 9.2 Outbound follow-up calls
**Heidi Comms** (February 2026): an AI voice, SMS, and messaging agent for bookings, reminders, and post-visit or post-discharge check-ins ("did you get your medication, are you tolerating it"). Every call is logged and summarized. It is unproven in the US.

**Sources:** https://heidihealth.com/product/calls , https://support.heidihealth.com/en/articles/13396153-heidi-comms

---

## 10. Collaboration, supervision, versioning

- **Version history** (Heidi, April 2026): "every edit to a note is tracked by user... see exactly what changed, who made the change, and roll back."
- **Session sharing** (Heidi): with colleagues at View, Edit, or Full access, or by an external link protected with a one-time password. Admins can enforce sharing policy.
- **Note status** (Heidi): Draft vs Approved for team review.
- **MA seats** (Freed): MAs prepare and draft, and the clinician reviews and signs. Shared patient records across clinicians.
- **Teams** (Heidi): shared templates, snippets, and Evidence guidelines, central billing.
- **Resident / teaching physician attestation:** **no vendor markets a first-class resident workflow.** PubMed and AMEP 2026 papers say no major body (ACGME, AAMC, AMA) has resident-specific guidance, and they call for workflows covering "resident review, note sign-off, accountability, patient consent." Teaching-physician billing rules require a specific attestation statement. This is an open gap.

**Sources:** https://www.heidihealth.com/en-us/progress-notes/april-2026 , https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary , https://www.getfreed.ai/features , https://pubmed.ncbi.nlm.nih.gov/41709948/ , https://med.uth.edu/mshbc/teaching-physician-rules-the-basics/teaching-physician-attestations-e-m/

---

## 11. Capture surfaces

- **Chrome extension over any web EHR:**
  - Freed: a floating widget that can be moved and resized. Recording continues across EHR page navigation, with an animated badge. "Copy all" or "Push to EHR" maps sections into SimplePractice, Tebra, Elation, TherapyNotes, athena, DrChrono, and others. Push is a Premier-tier feature.
  - Heidi: a picture-in-picture floating window that follows you across tabs, with pause and resume, in Chrome and Edge.
  - Commure: a Chrome extension with one-click upload.
  - Nabla Connect: an iFrame embed.
- **Telehealth:** Doximity Scribe has a toggle inside Dialer voice and video calls, and the note is generated when the call ends. Dialer added LanguageLine interpreters (300+ languages) and e-prescribing. Nabla supports in-person and telehealth in 35+ languages.
- **Schedule import:** Heidi's "Upcoming Patients" creates a session tab for each patient from an appointment-book screenshot or a CSV upload. Connect integrations pull schedules.
- **Mobile:** Epic Haiku/Rover (Abridge, Dragon, Heidi, Commure); Dragon Android for nurses; Heidi mobile has offline and low-bandwidth mode, background transcription, and remote Bluetooth devices with bulk sync.
- **Watch:** only small players (medicalscribe.app on Apple Watch with Siri). No major vendor ships it, so it is low priority.
- **Audio upload** (Heidi, Chartside has this).

**Sources:** https://help.getfreed.ai/en/articles/10355976-freed-chrome-extension , https://www.getfreed.ai/ehr-push , https://www.heidihealth.com/en-us/changelog/may-2026 , https://blog.doximity.com/articles/ai-tools-for-telemedicine-how-virtual-care-platforms-like-doximity-dialer-are-integrating-clinical-ai , https://medicalscribe.app/

---

## 12. Multilingual counts (conversation input)

| Vendor | Languages | Notes |
|---|---|---|
| Heidi | 110+ | up to 3 input languages per session, separate output language, auto-detect; app UI in 16 languages |
| Commure | 100+ | |
| Freed | 90+ | patient instructions also in 90+ |
| Suki | 80+ | English note output |
| Dragon Copilot | 58 spoken | "Multilingual" mode; transcript in the spoken language, note in English; diarization only EN/ES in US |
| Nabla | 35+ | includes Haitian Creole and Arabic dialects |
| Abridge | 28+ | auto-detects language and specialty with no settings |
| Epic Art | Spanish message translation | |

**Sources:** https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.commure.com/blog-scribe/nabla-ai-review , https://developer.suki.ai/documentation/overview , https://www.getfreed.ai/features , https://docs.ambient.commure.com/

---

## 13. Trust, QA, and admin

- **DeepScribe Trust and Safety Suite:** "Note Insights" dashboard (edits per 100 notes; a Trust Score percentile based on average edit distance compared with peers), and Expert Human Audits, where the clinical team grades sampled notes against an accuracy rubric.
- **Human-in-the-loop tiers:** Commure Ambient self-serve AI vs "Assist" vs "Live" modes with human documentation specialists.
- **Dragon "Tune accuracy":** admins build test cases (transcript plus expected output) per service line and role, import Microsoft's library, annotate expected outputs (manually or with AI), run them against templates, and send failing cases to Microsoft's Clinical Integrity team. Template profiles show coverage. Responsible-AI feedback categories cover offensive, inappropriate, or biased output.
- **Adoption analytics:**
  - Dragon: org overview plus per-user engagement to find under-users for training.
  - Freed: admin dashboards per clinician (volume, coding patterns).
  - Abridge: ships validated SQL for work-outside-work, % utilization, wRVU per encounter, clean claims, CDI queries, same-day closure, and retention.
- **Security admin:**
  - Heidi: "Log out everywhere", Template Manager role.
  - Dragon: stand-by and session timeouts with a warning.
  - Freed: SAML SSO (Okta, Entra) for groups.
  - Heidi: ISO 27001 and SOC 2 Type II.
  - No vendor publicly documents SCIM, so it is a differentiator rather than a gap to close.

**Demand:** only 25% of clinicians say they were trained adequately on AI content (KLAS). Satisfaction plateaus after 4 AI tools, so admins need usage data to consolidate.

**Sources:** https://www.deepscribe.ai/resources/deepscribe-launches-new-and-innovative-trust-and-safety-suite-for-its-ambient-ai-technology , https://docs.ambient.commure.com/ , https://www.commure.com/blog/commure-ambient-ai-going-beyond-the-note , https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-6 , https://www.abridge.com/reports/adoption-scale-impact , https://help.getfreed.ai/en/articles/10968499-freed-sso-setup-advanced-instructions , https://hitconsultant.net/2026/07/17/klas-arch-collaborative-2026-healthcare-ai-insights/

---

## 14. Public API / SDK / webhooks

- **Nabla Core API:** transcription over REST, WebSocket, or async (audio up to 60 min); note generation (SOAP, APSO, and others); FHIR-normalized data extraction; multilingual patient summaries; magic edit; custom dictionary; dot phrases; dictation. OAuth2 client credentials for the server, JWT for users. Date-versioned (e.g. 2026-04-24).
- **Suki for Partners:** REST plus WebSocket audio plus webhooks; Web SDK (hosted UI), Headless React SDK, iOS SDK, Dictation SDK (in-field or scratchpad), Form Filling SDK; FHIR ingestion into a knowledge graph for summaries; LOINC sections; `emr_encounter_id` interoperability. Partners include athenahealth, MEDENT, and Azalea.
- **Dragon:** partner app and agent storefront (see abridge-dragon-ambience.md).

**Sources:** https://docs.nabla.com/guides/intro , https://docs.nabla.com/server/generate-note , https://developer.suki.ai/documentation/overview , https://www.suki.ai/partners/

---

## 15. Specialty packs

- **Oncology:**
  - DeepScribe: about 3.1M oncology visits a year, SmartPrep.
  - Doximity: 6 oncology templates (May 2026).
  - Epic: cancer staging extraction.
  - Commure: oncology blog.
- **Behavioral health:**
  - Formats: DAP, BIRP, GIRP, SOAP.
  - Group therapy: per-member notes from one group session.
  - Privacy: a no-audio-retention mode (PMHScribe, TasiPsych delete audio after transcription).
  - Psychiatry: MSE and risk sections.
  - Telehealth: Zoom/Doxy capture (Upheal).
  - Doximity also discards audio once the note is generated.
- **Therapy (PT/OT/SLP):** Epic therapy progress notes.
- **Cardiology:** Epic procedure narratives from intraprocedural data.
- **Home health:** Epic OASIS suggestions.
- **Breadth:** 100+ specialties (Suki), 50+ (Abridge), 40+ (Abridge site).

**Sources:** https://www.deepscribe.ai/specialties/oncology , https://blog.doximity.com/updates , https://www.epic.com/software/art/ , https://www.sully.ai/blog/ai-scribe-for-behavioral-health-and-how-to-choose-the-right-one , https://www.deepcura.com/resources/best-ai-scribe-for-therapists , https://www.fiercehealthcare.com/ai-and-machine-learning/doximity-jumps-ai-scribe-market-offering-free-tool-doctors

---

## 16. What users say they want (demand summary)

1. **Shorter, selective notes** with a length control (the most frequent Reddit complaint).
2. **Problem-by-problem A&P** for multi-problem visits.
3. **Real EHR write-back**, not copy-paste ("copy-paste into the EHR becomes a daily bottleneck").
4. **Medication accuracy**: medication errors are the #1 safety feedback category (18.5%), and misattribution of who said what is 9.5%.
5. **Order creation, shift summaries, and data discovery** give the biggest efficiency gains (KLAS 2026).
6. **Transparent pricing and fast onboarding** ("I need this tonight, not in 3 months").
7. **Consistency**: Freed "style drifts between notes."
8. **Few tools, consolidated**: value plateaus after 4 AI tools, which favors one assistant that also handles dictation, inbox, Q&A, and letters.

**Sources:** https://www.deepcura.com/resources/best-ai-medical-scribe-reddit , https://www.trytwofold.com/blog/reddit-family-medicine-scribe-review , https://arxiv.org/html/2512.04118 , https://hitconsultant.net/2026/07/17/klas-arch-collaborative-2026-healthcare-ai-insights/

---

## Depth differences on features Chartside already has

- **Style learning:** Freed shows the learning explicitly. You edit, click "Learn format", and use quoted verbatim text and [bracket] instructions. Epic stores spoken formatting commands as a persistent preference. Chartside's learning is implicit, so an explicit "learn from this edit" action and a visible list of rules would match both.
- **Evidence links:** DeepScribe lets you highlight any span and jump to the moment in the audio (Clinical Moments). Abridge links at section and sentence level. Chartside is at parity, and its evidence could also feed the Trust dashboard (edits per 100 notes).
- **Patient summaries:** Freed covers 90+ languages and sends them by Secure Send email. Chartside has EN/ES and a share link.
- **Referral letters:** Dragon and Heidi auto-run letters after every recording and generate several documents per session. Chartside generates on demand.
- **Pre-visit brief:** SmartPrep refreshes as documents arrive, works up to 7 days ahead, has visit-type variants (new vs follow-up), and includes a prioritized checklist. Doximity lets the clinician add pre-chart context by typing or dictating.
- **Orders:** Oracle uses favorites and org standards and queues follow-up appointments. Sunoh does multi-order in one click.
- **Coding:** Ambience covers multi-visit codes (G2211, AWV). Abridge does inpatient pre-bill DRG/POA review.
- **Insights:** Abridge's metric set (WOW, same-day closure, wRVU per encounter) and Dragon's per-user engagement view.
- **SMART launch:** Dragon 3.6 reads allergies, notes, MedicationDispense, and MedicationRequest through FHIR to ground the note.
- **Consent ledger:** no competitor has anything comparable. Keep it as a differentiator.

---

## Ranked build list: the 20 highest-value features to build next

Ranking weighs demonstrated demand, how many leaders ship the feature, whether it is a real gap in Chartside, and how well it fits a Next.js + SQLite + deterministic NLP stack with Claude as an optional layer.

### 1. Dictation mode and voice commands
Add a "Dictate" mode next to "Ambient" that streams Deepgram into whichever textarea has focus (note section, letter, message reply), plus a command grammar handled by the deterministic engine before any text is inserted. Commands include "new line", "next section", "delete last sentence", "insert <snippet>", "make this a bulleted list", "go to plan", "sign note", and "what can I say". Put a `voice_commands` table (phrase pattern, action, args, scope) in SQLite, seed it with defaults, and let users add their own. The client keeps a small intent matcher (regex plus fuzzy match on the final Deepgram transcript) and falls back to Claude only for free-form edit commands. A "Session Dictation" variant saves the text verbatim with no summarizing, for op notes and letters. A hotkey (Ctrl+Space) toggles dictation, and a help sheet listing the commands matches Dragon's "what can I say".

### 2. Detail level and style controls (verbosity, bullets vs prose, magic edit)
Add a per-user and per-template `note_style` record: detail level (Brief / Standard / Detailed), format (bullets, prose, mixed), abbreviation policy, and pronoun and tense rules. The deterministic generator already selects sentences. Brief keeps only the highest-salience facts per section (drop negatives except pertinent negatives, collapse ROS) and Detailed keeps everything. Add a "Rewrite" box at note and section level. Common instructions ("shorten", "bullets", "more clinical") are handled deterministically, and anything else goes to Claude with evidence links re-anchored after the rewrite. Save instructions that the user repeats as persistent style rules, the way Epic does, and show them in Settings.

### 3. Problem-oriented A&P with per-problem codes and plans
Add a problem-oriented mode that splits the A&P into one block per problem, each with its status (new, stable, worsening), evidence links, ICD-10 chip, MEAT checklist, and linked staged orders. The engine clusters transcript utterances by problem using the existing diagnosis extraction and code sets, and carries forward any active problems from prior encounters that were not discussed (shown greyed out for the clinician to accept or drop). Store the blocks in an `encounter_problems` table so claims, CDI, and FHIR write-back (Condition plus note sections) can use them. This answers the "4-problem visit collapsed into a paragraph" complaint and matches Suki and Dragon's diagnosis-aware notes.

### 4. Post-visit task detection and auto-run documents
After a note is generated, run a deterministic extractor for follow-up intents ("see you in 3 months", "get a CBC", "refer to cardiology", "I'll write you a work note") into an `encounter_tasks` table (type, due date, source span, status). Show them as a checklist on the encounter page with one-click actions: create a staged order, generate a letter, create a follow-up appointment request, add a patient reminder. Let users mark document templates as "auto-run", so a referral letter or patient instructions are generated for every visit that matches. Tasks roll up into a "My open tasks" view on Today.

### 5. Letters and forms library, including form filling
Extend the referral-letter generator into a document type registry (`document_templates`) covering work or school excuse, return to work or sports with restrictions, caregiver letter, jury duty excuse, DME justification, letter of medical necessity, FMLA narrative, and to-whom-it-may-concern. Each type declares the fields it needs, and the engine fills them from the note, patient, and encounter data, highlighting missing fields for the clinician. Add PDF form filling: an admin uploads a fillable PDF (read its AcroForm fields with pdf-lib), maps each field to an extractor key once, and the tool fills it per encounter. Documents are versioned, exportable as PDF or DOCX, and shareable with the patient through the existing share link.

### 6. Patient message reply drafting (in-basket)
Add a Messages inbox where portal messages arrive (manual entry or paste, a demo seed, and FHIR Communication later). For each message, show a context panel with active meds, problems, and recent results from SQLite. Draft a reply with deterministic templates for the common intents (refill request, result question, appointment, side effect) using chart facts, with an optional Claude rewrite for warmth and reading level. Include urgency triage (keyword and symptom rules flag chest pain, SI, and similar for a same-day call) and translation to and from Spanish using the existing EN/ES stack. Track draft-used rate and edit distance in insights. The evidence to cite is fewer patient follow-up messages, not time saved.

### 7. Note version history, addenda, and AI-provenance
Store every save as a row in `note_versions` (author, timestamp, source: ai, user, or voice) with a diff view and a "restore" action. After signing, the note is locked, and changes go only through addenda (type: addendum, late entry, correction; reason required), each appended with its own signature and timestamp and written back to FHIR as a new DocumentReference with `relatesTo` set to `appends` or `replaces`. Mark each sentence as AI-drafted, clinician-edited, or clinician-authored for audit, and show an optional disclosure footer. This matches Heidi's version control and meets medico-legal expectations that competitors mostly leave to the EHR.

### 8. Resident, APP, and MA co-signature with teaching attestation
Add supervision relationships to RBAC (resident to attending, APP to collaborating physician, MA or scribe to clinician), plus note states: Draft, Ready for review, Co-signed, Signed. A resident signs "pending co-sign". The attending sees a review queue with diffs against the AI draft and adds a teaching-physician attestation chosen from CMS-compliant templates (primary care exception, key portions, personally performed), then co-signs. Billing picks up the right modifier (GC/GE) and blocks claims on notes that are not co-signed. Add an MA "pre-chart" role that can prepare context and draft but cannot sign. No major vendor ships this, and the academic literature explicitly asks for it.

### 9. Snippets, smart phrases, and personal vocabulary
Add `snippets` (owner, org-shared flag, trigger such as `/normros`, body with `{{placeholders}}` resolved from patient and encounter data), expanded in any editor by a "/" menu and by voice ("insert normal ROS"). Add `vocabulary` terms (drug names, clinic names, colleague names) that are passed to Deepgram as keyterms, and a `replacements` table for automatic corrections and preferred abbreviations applied deterministically after generation. Right-clicking a word gives "Replace here / everywhere in this note / always". Admins can publish org snippet and vocabulary packs, and a CSV import converts exported Epic SmartPhrases.

### 10. Inpatient suite: H&P, daily progress notes that show what changed, hospital course, discharge
Add an admission entity grouping encounters by day. The H&P uses the existing template path. The daily progress note is built from yesterday's signed note, a structured delta (new labs, vitals, and med changes from FHIR or manual entry), and today's bedside transcript. Unchanged content is marked "carried forward, verify" rather than copied silently, and the changes are highlighted. The hospital course is built incrementally: each signed daily note adds a problem-by-problem entry, so the discharge summary is assembled from them, then the clinician reviews it with discharge meds, follow-ups (from task detection), and pending results. An I-PASS handoff view reuses the same data. The ED gets a track-board style patient list and multi-event notes (re-evaluations with timestamps).

### 11. Clinical evidence Q&A with citations, plus calculators
Add an "Ask" panel beside the note. Offline mode uses a bundled, versioned corpus of openly licensed guideline summaries and drug label sections (DailyMed SPL, USPSTF, CDC schedules) indexed with SQLite FTS5, and returns extractive answers with citations. With Claude enabled, answers are synthesized only from the retrieved passages, and citations are required and verified to exist. Add deterministic calculators (CHA2DS2-VASc, HAS-BLED, Wells, CURB-65, eGFR CKD-EPI 2021, ASCVD PCE, BMI, peds weight-based dosing) that pull inputs from the chart and can insert the result and the formula into the note. Log questions so admins can see what clinicians ask.

### 12. Context upload and patient profile auto-extraction
Add a Context tab per encounter or patient that accepts PDFs, images (OCR with tesseract.js), pasted text, and dictated notes. The deterministic extractor pulls meds, allergies, PMH, PSH, family history, last results, and prior plan into a `patient_profile` table with provenance (document, page, span), shown as evidence links like the transcript links. The note generator and pre-visit brief use profile facts, labelled "from outside records". The brief refreshes automatically as documents arrive and gets new-visit vs follow-up variants with a prioritized checklist (SmartPrep style).

### 13. Quality measure and care gap prompts (MIPS / HEDIS / preventive)
Build a deterministic rules engine over the patient profile, problems, and the current note. Rules come from a JSON measure library (e.g. MIPS 001 HbA1c poor control, 134 depression screening, 226 tobacco screening and cessation, 236 BP control, 112 and 113 breast and colorectal cancer screening, childhood immunizations) with denominator, numerator, and exclusion logic plus the documentation phrase that satisfies each. Before the visit, open gaps appear in the brief. At sign time, CareCues-style prompts show unmet numerators and missing MDM elements with one-click insertion of compliant text or a staged order. A quality dashboard in insights shows performance rates per clinician and per measure, with QRDA-III export as a later step.

### 14. Chrome extension with floating recorder and DOM push
Build a Manifest V3 extension with a side panel or picture-in-picture recorder that keeps capturing across tab navigation (an offscreen document holds the MediaStream), authenticated against the Chartside origin. After the note is done, "Push" uses per-EHR mapping profiles (a CSS selector or ARIA label for each note section, stored server-side, editable by admins, with a point-and-click "teach this field" mode) to fill the web EHR's note fields. There is also a section-by-section copy fallback. It reaches every browser-based EHR that has no FHIR write, which is how Freed and Commure reach small practices.

### 15. Telehealth capture
In the recorder, add "Telehealth mode", which captures tab audio with `getDisplayMedia({audio:true})` for the far end plus the mic for the clinician, mixed into two channels. That gives near-perfect diarization, because each channel is a speaker. Show a consent script prompt for remote patients, logged in the consent ledger with a timestamp, and support an interpreter as a third speaker. In the extension from #14, auto-detect Zoom, Doxy, and Teams tabs. This matches Doximity Dialer's toggle and the behavioral-health Zoom workflows.

### 16. Nursing mode: flowsheet extraction and shift summary
Add a nurse role with a patient-list home (pin, unread, search by MRN or room). Each short recording is mapped to flowsheet rows by the deterministic engine (vitals, pain score, I&O, neuro checks, skin, LDAs, education given) with values, units, and source spans. Show them as a review grid, then file them as FHIR Observations (vital-signs and survey categories). Admins configure visible rows and exclusions per unit. A rolling "pending care activities" summary per patient updates after each recording (open items are added and completed ones removed), and a shift Q&A answers questions across the shift's transcripts. It covers the fastest-growing segment of 2026.

### 17. Trust and QA dashboard with a human review queue
Compute edit distance between the AI draft and the signed note per section (the data already exists in versions and feedback), and show edits per 100 notes, sections edited most, a peer percentile trust score, and omission-detector hits. Add a sampling-based review queue: an admin sets "review 5% of notes per clinician" or "all notes for new users for 2 weeks", and reviewers grade them against a rubric (accuracy, omissions, attribution, medication correctness). Add golden test cases (a stored transcript with expected facts) that run the deterministic engine in CI and in-app when templates change, like Dragon's Tune accuracy. Results feed insights and per-template regression alerts.

### 18. Public API, webhooks, and API keys
Expose versioned REST endpoints (`/api/v1/encounters`, `/transcribe` for audio upload, `/generate-note`, `/notes/{id}`, `/codes`, `/fhir/extract` returning a FHIR Bundle of Conditions, MedicationStatements, and Observations) authenticated with org-scoped API keys (hashed in SQLite, with scopes and rate limits) or OAuth2 client credentials. Add a webhooks table (url, secret, events) with HMAC-signed deliveries and a retry log for `note.generated`, `note.signed`, `claim.status_changed`, and `task.created`. Publish an OpenAPI spec generated from the route handlers' zod schemas. This matches Nabla Core API and Suki for Partners, and lets telehealth and EHR partners embed Chartside.

### 19. Specialty packs: behavioral health, oncology, pediatrics
Package template sets, extractors, and code sets per specialty.
- **Behavioral health:** DAP, BIRP, GIRP, and SOAP; a structured MSE; a risk assessment section (C-SSRS phrasing) that must be completed when SI or HI is mentioned; group therapy with one session transcript producing one note per member (per-member diarization labels); psychotherapy add-on time tracking (90833/90836/90838); and an org-level "no audio retention" mode that deletes audio after transcription and records the deletion in the audit log.
- **Oncology:** a staging (TNM) extractor, line-of-therapy and regimen tracking, ECOG, and toxicity grading.
- **Pediatrics:** historian-aware HPI ("per mother"), weight-based dose checks in order staging, growth percentiles, and a vaccine schedule gap check.

### 20. Schedule import and follow-up scheduling queue
Add an "Upcoming patients" day view populated from a CSV upload, a pasted list, a screenshot (OCR and a line parser), or FHIR Appointment search after SMART launch. It creates an encounter shell per patient with the pre-visit brief pre-computed overnight. Follow-up tasks from #4 feed a scheduling queue (`followup_requests`: patient, interval, reason, provider) that front-desk users work through, with an ICS or FHIR Appointment proposal export. This mirrors Heidi's Upcoming Patients and Oracle's queued follow-ups, and makes Chartside usable for a full clinic day.

### Also worth doing (smaller or lower priority)
- Long-visit support: a 120-minute cap with a warning when 30 minutes remain, and automatic recovery of stuck sessions (Dragon, Heidi).
- Security admin: SCIM 2.0 provisioning, TOTP/WebAuthn MFA, "log out everywhere", idle timeout with a warning, and a template-manager role (Heidi, Dragon). SCIM is not publicly documented by any competitor, so it is a sales differentiator.
- Session sharing: colleague access at View, Edit, or Full, plus external links protected by an OTP (Heidi).
- Patient instruction delivery by email or SMS, and more languages beyond EN/ES, using Claude when enabled (Freed has 90+).
- SDOH flagging and clinical trial pre-screening from the transcript (Epic, Abridge).
- A 30-day in-app satisfaction survey and training nudges for under-users (Dragon).
- Outbound AI follow-up calls (Heidi Comms). High effort, unproven in the US, so defer.
- A watch app. No major vendor ships one, so skip.
