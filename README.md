# Chartside

Ambient clinical documentation you can verify. Chartside listens to a visit and drafts a specialty-ready note, ICD-10 and E/M codes, staged orders, a plain-language patient summary, and referral letters. Every sentence in the note links back to the moment in the conversation it came from.

Chartside is built on a study of the ten leading ambient scribes: Abridge, Microsoft Dragon Copilot, Epic AI Charting, Ambience, Commure, Suki, Nabla, Heidi, DeepScribe, and Freed. See [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) for the synthesis and [docs/research](docs/research) for the sourced deep dives. It combines what those products do best and adds a trust layer none of them ship:
- an omission detector
- unsupported-claim flags
- a provable consent ledger
- live coverage nudges
- order safety checks
- an audit-defensibility meter for coding
- a patient correction loop

## Clinician workflow

1. **Today.** The schedule shows status pills: ready to record → recording → drafting → ready for review → signed. Each row also shows the patient's last visit plan.
2. **Pre-visit brief.** Problems, medications, allergies, recent labs, and last visit's plan. Pick the template and the conversation and summary languages.
3. **Consent.** Read the script, pick the patient's state, and record the decision. All-party states require every person in the room to agree. The record is hashed, and the attestation is written by the system, never by the model. If the patient declines, ambient capture stays off and manual documentation remains available.
4. **Capture.** Three ways to feed the visit:
   - Live microphone (Web Speech API), with a level meter and a silent-mic alarm.
   - A demo conversation you can play back.
   - Typed or pasted transcript.

   Speakers are auto-detected and can be corrected with one click, and any line can be redacted. The coverage rail tracks HPI elements, red-flag questions for the chief complaint, and closing steps, and nudges you on what's missing.
5. **Review.**
   - **Note:** a trust bar, "said in the visit, missing from the note" flags, and click-any-sentence evidence. Templated normals stay pending until you accept them. Sections are edited line by line and keep their evidence links, with 👍/👎 and copy on each.
   - **Codes:** E/M from the MDM elements, ICD-10, HCC with MEAT, CDI, and an audit meter.
   - **Orders:** accept or reject, with safety alerts.
   - **Patient summary:** reading grade, translation, and a share link.
   - **Letters and Audit.**
   - **Ask Chartside:** answers questions about the visit with transcript citations, or edits the note on request.
6. **Sign.** Signing is blocked while orders are unreviewed or sentences are unsupported (you can override with an explicit confirmation). Accepted orders with blocking alerts can't be signed. At signing, Chartside learns style rules from your edits.
7. **Export.** Copy for the EHR, or download a FHIR R4 document Bundle (Composition, DocumentReference, Condition, MedicationRequest, ServiceRequest).
8. **Billing.** Signing turns the note and accepted orders into a professional claim, validated and priced from official code sets (see [Coding & revenue cycle](#coding--revenue-cycle)). Prior-authorization packets score payer criteria against transcript evidence and draft a medical-necessity letter. The **Revenue** page tracks every claim from pre-bill review through clearinghouse acceptance, payment, denial, and appeal.
9. **Insights.** Median time to sign, unedited-sign rate, after-hours signing, evidence coverage, omissions caught, capture rate by visit type, coaching, and learned rules.

## Beyond the visit

Chartside covers the work around the note that enterprise scribes compete on. The feature research behind this list is in [docs/research/feature-gaps-2026.md](docs/research/feature-gaps-2026.md).

| Area | What it does |
|---|---|
| **Inbox** (`/inbox`) | Patient messages triaged as emergency, same day, or routine, with chart-grounded reply drafts in English or Spanish; `***` blanks block Send. Follow-ups, results to review, referrals, paperwork, and callbacks detected in each visit become tasks. Co-sign requests, unsigned notes, coding queries, and patient corrections in one queue. Patients can message from their visit link. |
| **Dictation and voice** | Dictate into any section (Deepgram live with personal keyterms, or the browser's speech engine). Voice commands: punctuation, "new line", "bullet", "scratch that", "go to plan", "insert normal exam", "stop dictation". Snippets with `{{patient.first}}`, `{{meds}}`, `{{allergies}}` placeholders via `/shortcut`, Epic SmartPhrase CSV import, and vocabulary replacements. |
| **Note control** | Brief / Standard / Detailed drafts, assistant rewrites (bullets or prose, abbreviations, word caps) that become style rules when you say "always…", and a full revision history with sentence diffs, restore, and AI-provenance counts. An optional AI-assistance disclosure is added to signed notes. |
| **Co-signature and addenda** | Residents, fellows, students, and optionally NPs and PAs sign into the supervising physician's queue. CMS teaching attestations add GC or GE, and the claim is held until co-signed. Signed notes accept hash-chained addenda, late entries, and corrections, filed to Epic as `DocumentReference` with `relatesTo: appends`. |
| **Letters and forms** | Work and school notes, return to sports, medical necessity, FMLA, jury duty, caregiver, and patient letters, prefilled from the visit with missing fields flagged, signed, exported as PDF, and shared on the patient page. Letters requested during the visit are drafted automatically. |
| **Quality** (`/quality`) | CMS eCQMs (CMS122, 165, 2, 138, 69, 125, 130, 147, 347, 951, 139) evaluated from the chart, conversation, orders, and note. Care gaps appear in the pre-visit brief with one-click orders or documentation, and a dashboard reports performance by clinician. |
| **Calculators and evidence** | eGFR (CKD-EPI 2021), CHA₂DS₂-VASc, HAS-BLED, CURB-65, Centor, Wells PE, PHQ-9, PHQ-2, GAD-7, BMI, and pediatric dosing, prefilled from the chart and inserted with citations. Guideline questions are answered from an offline USPSTF, ADA, CDC/ACIP, ACC/AHA, KDIGO, GINA, AAP, and IDSA library with sources. |
| **Hospital** (`/hospital`) | Census, admission H&P, daily progress notes that open with what changed since yesterday and carry forward unaddressed problems for verification, an auto-built hospital course, a discharge summary with medication reconciliation and pending results, I-PASS handoff, and hospital E/M codes (99221–99239, POS 21). |
| **Nursing** | A nurse role, spoken assessments turned into flowsheet rows for review and filing, a rolling pending-care list, a shift summary, and questions over the shift's documentation. |
| **Emergency department** (`/ed`) | Track board with ESI acuity, beds, door-to-provider and length-of-stay metrics, LWBS, and boarding flags. Picking up a patient starts an ED note with a timed course of re-evaluations, a disposition heard from the conversation, critical care time (99291/99292), ED E/M (99281–99285), POS 23, and one-click admission to the hospital census. |
| **Oncology** | Stage and TNM, biomarkers, regimen, cycle, intent and line of therapy, ECOG (stated or inferred and flagged), CTCAE v5.0 toxicity grades from the conversation and labs, and the treatment decision (proceed, hold, dose reduction, growth factor, switch). Chemotherapy toxicity monitoring codes as high-risk MDM with manifestation codes plus T45.1X5A, and each signed visit updates the patient's lines of therapy and toxicity-by-cycle grid. |
| **Behavioral health** | Psychotherapy, DAP, BIRP, and GIRP templates, psychiatric E/M with psychotherapy add-ons (90833/90836/90838) from separately documented time, group therapy (one recording split into per-member notes that never name other members, billed 90853 each), interventions and response from the session, a C-SSRS-style risk assessment that blocks signing when suicidal ideation is disclosed without plan, intent, means, history, and a safety plan, psychotherapy time codes (90832–90838, 90791), and restricted handling (FHIR `R` confidentiality, no transcript on the patient page, no retained audio). |
| **Outside records** | Upload a C-CDA, text PDF, or pasted note. Problems, medications, allergies, results, vitals, and plans are shown as new, changed, or already charted, and only what you accept is added, labeled as outside data. |
| **Scheduling** | Import a clinic day pasted from an EHR schedule screen or a CSV, with patient matching by MRN or name and DOB, and book follow-ups from a queue with calendar invites. |
| **Telehealth** | Share the video visit tab: the clinician's microphone and the patient's side are recorded on separate channels, so speaker attribution is exact in live captions and the final transcript. |
| **Note QA** (`/qa`) | Trust metrics by clinician (unedited-sign rate, edited lines, most-edited sections), a sampled review queue scored against a rubric, and engine regression cases saved from real visits. |
| **Visit agenda** | A prioritized checklist in the pre-visit brief built from urgent intake answers, oncology treatment decisions, abnormal results, the last plan, open referrals and tasks, care gaps, and risk-adjustment suspects. Items tick themselves off live as they come up in the conversation. |
| **Office procedures** | Joint injections and aspirations (with or without ultrasound), shave, punch, and incisional biopsies with add-on lesion counts, cryotherapy of AKs and benign lesions, laceration repairs by length and site, I&D, cerumen removal, and IM injections are captured from what you say, with J-code drug units, RT/LT/50, modifier 25 on the E/M, and a procedure note whose consent and complications lines stay blank until documented. |
| **Obstetrics** | A prenatal visit template with gestational age from the EDD on the chart, the four warning signs, fundal height and fetal heart rate, preeclampsia symptoms and blood pressure flags, a size/dates check, what is due at this gestational age (GCT, Tdap, Rh immune globulin, GBS), Z34 and Z3A codes, and CPT II 0502F inside the global OB package. |
| **Ask the chart** | Ask "when was the last colonoscopy?", "A1c trend", or "what did we decide about the eye exam?" on the patient page or in the pre-visit brief. Answers come from the chart, prior signed notes, and outside records with dated citations (restricted notes excluded unless you're on the care team). Claude synthesizes when enabled, with verified citations. |
| **Pediatrics** | A well-child template on Bright Futures periodicity: developmental, autism, and maternal depression screens, hemoglobin, lead, fluoride varnish, vision and hearing, detected from the visit and billed (96110 x2, 96161, 99188, 99173, 92551), immunizations due, anticipatory guidance covered, and age- and new/established-correct preventive codes (99381 to 99397). |
| **Medicare AWV** | Required annual wellness visit elements with what's missing, a personalized screening and vaccine schedule (flu by season), advance care planning time, and G0438 or G0439 with G0444 only on subsequent visits and 99497-33. |
| **Cardiology** | A heart failure follow-up with a four-pillar HFrEF GDMT check: current dose against target, metoprolol tartrate flagged, and holds for potassium, eGFR, blood pressure, and heart rate. |
| **Transitional care** | Discharge opens a TCM episode with a 2-business-day contact task and a visit deadline. Contact attempts are logged on the patient page, and the follow-up visit is coded 99496 or 99495 when contact, timing, medication reconciliation, and MDM qualify, with the unmet requirement named when they don't. |
| **Pre-bill CDI** | For each hospital stay: KDIGO AKI, hyponatremia, hypoxia, blood-loss anemia, SIRS, heart failure specificity, and BMI queries with the lab evidence by day and CC/MCC impact, non-leading options including "clinically undetermined", attending answers filed as addenda, and POA indicators. |
| **Order sets** | One-click bundles (diabetes annual, hypertension, fatigue, chest pain, urinary, adult preventive) plus organization and personal sets saved from a visit's orders. Duplicates are skipped and recent results are noted. |
| **PDF forms** (`/forms`) | Upload any fillable (AcroForm) PDF, map its fields once (Chartside guesses from field names), and fill it from any visit with editable values and a flattened download. |
| **Referral loop** | Importing a specialist's consult note closes the matching open referral task. |
| **Rehab therapy** | PT and OT daily notes and evaluations: interventions with minutes, objective measures, evaluation complexity (97161–97168), and units by the CMS 8-minute rule for Medicare or per service for other payers, billed with GP or GO and no E/M. |
| **Social needs** | Food, housing, transportation, utilities, cost-related medication underuse, unemployment, and isolation heard in the visit become Z-codes (Z59.x, Z91.120, Z56.0, Z60.2), count as "treatment limited by social determinants" in MDM risk when they change the plan, and open a community-resources task. |
| **Sharing** | Share a visit with a colleague (view or edit) or with an outside clinician by email. External links open only after a one-time code sent to that address, are view only, expire, can be revoked, and log every view. Behavioral health notes can't leave the organization, and admins can turn external sharing off. |
| **Research** (`/research`) | Admins enter their studies' criteria (age, sex, diagnoses, lab thresholds, exclusions). Each visit is pre-screened, possible matches show what still needs confirming, and a referral opens a task for the study team. |
| **Restricted notes** | Behavioral health notes open only for the author, their supervisor, or a colleague they shared with. Anyone else must break the glass with a reason, and every view, export, share, and break-the-glass open appears in the patient's access report (`/patients/[id]/access`, CSV export) for HIPAA access and disclosure requests. |
| **Clinician experience** | An in-app NPS survey after ten signed notes (snoozable), and an Impact panel that flags low ambient use, after-hours charting, and unsigned backlogs with a specific tip for each. |
| **Consistency checks** | Before signing, the note is checked against itself: a symptom both reported and denied, left and right for the same body part, an age or pronouns that don't match the patient, and one drug at two doses with no change documented. Issues show live in the editor and hold signing until reviewed. |
| **Sign queue** (`/queue`) | Every note waiting for your signature with what still blocks it, one-click signing for ready notes, and "review next" for the rest. |
| **Post-visit check-ins** | After signing, schedule a one-minute check-in by text or email built from the visit (overall, new medicines and side effects, acute problems, tests, referrals). Answers arrive in the Inbox triaged, and the visit shows what the patient said. |
| **Orthopedics and dermatology** | Structured special tests with results and side, range of motion, strength, and neurovascular status; lesion descriptions with size, color, morphology, surface, and location, with ABCDE flags for pigmented lesions. |
| **Care management** (`/care-management`) | Chronic care management for patients with two or more chronic conditions: recorded consent, a care plan drafted from the chart, monthly time by staff or practitioner, and month-end 99490, 99439, 99491, and 99437 with a billing CSV. |
| **HL7 v2 interface** | Signed notes go to your interface engine as MDM^T02 over MLLP, wait for the ACK, and are logged with resend. Restricted notes are withheld unless you opt in. |
| **Record on phone** | "Record on phone" shows a QR code. A signed-in phone opens the same visit with a single-use, 5-minute link, and the draft opens on the desktop when the phone ends the visit. |
| **Compliance center** (`/compliance`) | Checks MFA coverage, SSO, idle sign-out, recorded visits without consent, audio and transcript retention, break-the-glass volume, external disclosures, AI disclosure, and interface settings. Exports a 30-day audit log CSV and a full FHIR NDJSON export of patients and visits. An organization transcript retention policy (at signing, or 7 to 365 days) removes transcripts while keeping signed notes. |
| **Plans and onboarding** | A 14-day trial with 3 clinician seats, Pro seats, or Enterprise. Seat limits apply to invites, role changes, SSO, and SCIM. Usage metering, a trial-ending banner, and a getting-started checklist driven by real activity. |
| **Long visits** | Recordings stop at a configurable cap (`CHARTSIDE_MAX_RECORDING_MIN`, default 120) with a 30-minute warning, and notes stuck drafting after a crash are recovered automatically. |
| **Chrome extension** (`extension/`) | Side panel with today's notes beside any web EHR, section copy, and one-click push into EHR fields mapped by pointing at them once. |

## Chartside Line and the ghost interface

The full web app is the back office. The ghost interface is the front door: record a visit without opening the app, get the note behind one tap, and decide everything else from a phone. The plan and research are in [docs/INTERFACE-PLAN.md](docs/INTERFACE-PLAN.md) and [docs/research](docs/research).

### The doors

| Door | Where | What it does |
|---|---|---|
| **Chartside Line** (call a number) | Twilio webhook `{PUBLIC}/api/voice/incoming`, media stream `/api/voice/stream` | The call is the recorder. Consent by voice or keypad, then silence until "Chartside, end visit" or hang-up. A read-back of the note. Spoken edits go through the chart agent and become suggestion cards in the Stack, never direct changes. Then a text with a sign-in link. A number Chartside hasn't seen before gets a free note as a guest. A verified phone plus PIN unlocks a schedule-aware greeting ("Your 2:40 is…") and chart questions. |
| **Browser phone** | `/go/phone` | The same call bridge in the browser, with captions, a keypad, a sample visit and a Messages tab. No Twilio account is needed. |
| **One-tap recorder** | `/go` | A single button, a consent sheet, 5-second chunks to `/api/capture`, a wake lock, and a floating picture-in-picture recorder. It works for guests too. |
| **iPhone Shortcut** | `/go/shortcut` | Record in Voice Memos, share to "Send to Chartside". A one-time 30-day device key, step-by-step build instructions, and a test `curl`. |
| **The Stack** | `/go/stack` | One card per pending decision: sign a note (with the full note on screen), co-sign, answer a coding question, match a recording to a patient, reply to a patient, finish a task, apply a suggestion. Swipe right to approve, left for later. |
| **Ask** | `/go/ask`, `POST /api/agent` | Claude with tools over the chart. It answers from the chart and only proposes changes, which land in the Stack. Without an API key a small local router answers common questions. |
| **Settings** | `/go/settings` | Phone verification, call PIN, connected devices, NPI, the weekly receipt, referral link and credits. |
| **Text the line** | Twilio messaging webhook `{PUBLIC}/api/sms/incoming` | STATUS for what's waiting, SCHEDULE for today's visit count and first time, LINK for a sign-in link, HELP, STOP and START, "nudge 5" for a daily end-of-clinic text at 5 PM (12 to 8 PM), and "brief 7" for a morning count of the day's visits (5 to 11 AM). Replies never carry patient details. Unknown numbers get the line's pitch. |
| **EHR side panel** | `extension/` (Chrome, Manifest V3) | Record visit beside any web EHR, then fill each note section into the mapped EHR field in one click. A one-time page grants the microphone. |
| **Android share** | Web app share target `/go/share` | Share a recording from any Android recorder to the installed web app. The file is held in memory for 10 minutes until the clinician confirms the patient agreed, then drafted. |
| **Live call banner** | `/go`, `/go/stack` and the web app | While you're on a call, any of your signed-in screens shows the call's state and last captions, with Pause, Resume and End visit. |
| **Landing** | `/line`, `/line/contact.vcf` | The public page for the number: a real sped-up call, "Watch a call play itself" (`/go/phone?autopilot=1`), save to contacts, an FAQ, and "invited by" and patient-recap variants. |
| **Admin → Line** | `/admin?tab=line` | Setup checks, the webhook addresses, calls and texts by door, the team roster (phone, PIN, calls) with a setup link the admin texts themselves, and one-step Twilio number connection for operators. |

**On a call:**

| Key | Action |
|---|---|
| 2 | Patient agreed, start recording |
| 3 | Chartside asks the patient itself |
| 9 | Ask the patient in Spanish |
| 0 | Patient declined, hang up with nothing kept |
| 4 | Pause (2 resumes) |
| 5 | End the visit and write the note |
| 1 | At read-back: ready to sign |
| 8 | Next patient on the same call |
| 7 | Text the patient their summary once the note is signed |
| 6 | Set a phone PIN. It's texted as a link and turns on only when the same PIN is typed there |
| `*` | Skip the PIN |
| `#` | Finish the PIN |

Voice works too:

- "they agreed"
- "Chartside, pause" and "Chartside, resume"
- "Chartside, end visit"
- "ready"
- "next patient"
- "make the plan shorter"
- after the PIN, "Chartside, what's left today?"

Pressing a key while the line is talking cuts it off. A printable card of all of this is at `/line/card`.

For developers, `POST /api/capture` is the one capture endpoint behind every door. It takes raw or multipart audio (webm, m4a, mp4, wav, ogg, mp3 or aac, up to 100 MB) with `consent=granted`, authenticated by the session cookie or a `Bearer cs_cap_…` capture token. It drafts in the background, with `GET /api/capture/{id}` for status and `GET /api/capture/{id}/note` for the note. Mint a token with `POST /api/capture/token` (session) or `POST /api/v1/capture/token` (API key with `encounters:write`).

### Bring your own scribe (`/visit`)

A patient records their own visit on their phone. The clinician taps Agree on the patient's screen first, the patient gets a plain-English recap, and the clinician can be offered a free draft note they claim after confirming who they are. See [docs/PATIENT-VISIT.md](docs/PATIENT-VISIT.md).

### Identity without signup

- **Email:** sign in with an emailed 6-digit code or a single-use link. The link page only shows a Continue button, so link scanners can't spend it. Org MFA and SSO still apply.
- **Try first:** `POST /api/auth/try` creates a guest who can record right away. Guests can't sign, share, create keys, invite or message patients. Saving with an email claims the visits, either into a new account or merged into an existing one. Unclaimed guests and their audio are deleted after `CHARTSIDE_GUEST_HOURS`.
- **Phone:** verify a number by SMS code. A text link to a phone guest proves possession of that number. The call PIN is 4 to 6 digits, hashed with scrypt, and locks for 30 minutes after five misses.

### Safety rules

- **What carries patient data:** voice calls may. Text messages never do: they carry only a time, a count and a sign-in link. Emails carry only codes and links. The page behind the link carries the PHI.
- **Nothing is signed, ordered, billed or sent from voice, text or the agent.** Those channels can only snooze or propose. Approvals happen on screen, and a sign of a note over 300 words in under 20 seconds is flagged for QA.
- **Caller ID can be spoofed.** Without a PIN a call can only record and hear back the note it just made. Those visits are marked "Caller ID only" on the Stack with a delete button. Chart questions on a call need the PIN and the wake word ("Chartside, what's left today?"), so ask them before you're in the room.
- **Consent must be explicit.** On the line, recording starts only on "they agreed" (or similar), the keypad, or the patient's own yes right after Chartside asks them (3, or 9 in Spanish). Questions and small talk never count, and the line ignores its own prompts heard back through the speaker.
- **The line only acts on what's aimed at it.** During the read-back, room conversation is ignored. It responds to the wake word, clear commands and the keypad.
- **Deepgram model improvement is off.** Every Deepgram request sends `mip_opt_out=true`.
- **Recordings stop at the cap.** A call or a one-tap recording ends and drafts at `CHARTSIDE_MAX_RECORDING_MIN` (default 120).
- **Consent comes first.** Consent is recorded before audio is kept, in the same consent ledger as the web app. All-party states ask about others in the room.
- **Audio at rest is encrypted** with AES-256-GCM under `CHARTSIDE_SECRET`.
- **Growth loops never include patient data.** The weekly receipt, share footers and referral links are built from counts only, and e2e tests scan them against every demo patient.

### Growth

- **NPI:** self-attested, matched against the public NPPES registry. It adds a badge and grants nothing.
- **Referral credits:** two-sided, flat and capped at 12 months, with no cash.
- **Weekly receipt:** a receipt card with a share image.
- **Footers:** attribution footers on the patient recap and on shared notes.
- **Invite:** a one-time invite card after the third signed note.
- **Analytics:** every loop is measured in `loop_events` (exposure, click, signup, activation). **Admin → Growth** shows the funnel per loop, weekly K (signups per active inviter), time to first note, and activation (3 signed notes within 7 days).

### Configuration

| Variable | Purpose |
|---|---|
| `CHARTSIDE_PUBLIC_URL` | The public origin used in texts, emails, sign-in links and receipts, e.g. `https://chartside.example.com` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Twilio Voice and SMS. Point the number's voice webhook at `{CHARTSIDE_PUBLIC_URL}/api/voice/incoming` (HTTP POST). Requests are checked against `X-Twilio-Signature`. |
| `TWILIO_BASE_URL` | Override the Twilio API base URL, used for tests |
| `CHARTSIDE_PHONE_NOTE_MODEL` | Model for notes captured on the phone line, so callers wait less for the read-back. Unset uses `CHARTSIDE_MODEL`. Measured on a 101 s visit: Opus 5 took 21.6 s, Sonnet 5.5 24.5 s, Haiku 4.5 11.3 s. |
| `CHARTSIDE_SIM_RATE` / `CHARTSIDE_SIM_DAILY_CAP` | Browser phone calls allowed per IP per hour (default 12) and across all visitors per day (default 300). |
| `CHARTSIDE_LINE_NUMBER` | The E.164 number shown on `/line` and in the vCard |
| `CHARTSIDE_LINE_DISPLAY` | The label for the browser phone at `/go/phone` (default `Demo line`) |
| `CHARTSIDE_TZ` | The time zone for spoken times and the schedule-aware greeting (default `America/Chicago`) |
| `CHARTSIDE_PHONE_VOICE` | The Deepgram Aura voice for prompts (default `aura-2-thalia-en`) |
| `CHARTSIDE_PHONE_VOICE_ES` | The Spanish voice for the patient consent script (default `aura-2-celeste-es`) |
| `CHARTSIDE_CRON_SECRET` | Bearer secret for `POST /api/cron/nudges`. Schedule it hourly, for example with Cloud Scheduler, to send end-of-clinic texts. |
| `CHARTSIDE_GUEST_CALLS_PER_NUMBER` / `CHARTSIDE_GUEST_CALL_DAILY_CAP` | Free calls from numbers Chartside doesn't know: per number per day (default 5) and across all numbers per day (default 200). Verified clinicians aren't limited. |
| `CHARTSIDE_VAPID_PUBLIC`, `CHARTSIDE_VAPID_PRIVATE`, `CHARTSIDE_VAPID_SUBJECT` | Web Push keys for "Note ready" notifications to installed web apps. Generate them with `npx web-push generate-vapid-keys`. Notifications carry only the visit time. |
| `CHARTSIDE_PROXY_HOPS` | How many proxies add to `X-Forwarded-For` in front of the app (default 1 for Cloud Run; 2 behind a load balancer). Rate limits use the address the last trusted proxy saw. |
| `CHARTSIDE_WS_PER_IP` / `CHARTSIDE_WS_TOTAL` | Phone media sockets allowed per address and in total (defaults 30 and 60). A socket that doesn't start a call within 5 seconds is closed. |
| `CHARTSIDE_MAX_CALL_MIN` / `CHARTSIDE_MAX_SIM_CALL_MIN` | Hard length limit for a call (default 240 minutes, enough for a clinic session with "next patient"), and for browser-phone and guest calls (default 20). |
| `CHARTSIDE_SHARE_MEMORY_MB` | Memory held for shared recordings awaiting consent (default 300), with at most 4 uploads in flight. |
| `CHARTSIDE_PUSH_HOSTS` | Extra push-service hosts to accept besides FCM, Apple, Mozilla and Windows. |
| `CHARTSIDE_SHARE_RATE` | Recordings shared to `/go/share` allowed per IP per hour (default 30) |
| `CHARTSIDE_MAX_RECORDING_MIN` | Recording cap for every door (default 120) |
| `CHARTSIDE_SKIP_WARM` | Skip pre-rendering the fixed phone prompts at startup |
| `CHARTSIDE_PHONE_DEBUG` | Log call state-machine events |
| `DEEPGRAM_API_KEY` | Speech to text for the web app and the phone line, plus text to speech on calls |
| `ANTHROPIC_API_KEY` | Claude for notes and the agent |
| `CHARTSIDE_MODEL` | The note model (default `claude-opus-5`) |
| `CHARTSIDE_AGENT_MODEL` | The agent model (default `claude-sonnet-5-5`, chosen for voice latency) |
| `CHARTSIDE_GUEST_HOURS` | How long an unclaimed guest visit is kept (default 2) |
| `CHARTSIDE_VISIT_DAYS` / `CHARTSIDE_VISIT_SAVED_DAYS` | How long a patient's own recording and recap at `/visit` are kept: unsaved (default 7) and after the patient saves the link (default 90) |
| `CHARTSIDE_VISIT_OFFER_DAYS` / `CHARTSIDE_VISIT_FAMILY_DAYS` | How long a draft offer to the clinician and a family link last (default 7 each) |
| `CHARTSIDE_VISIT_RATE` / `CHARTSIDE_VISIT_DAILY_CAP` | Patient visits started (and save links sent) per IP per hour (default 10), and patient visits per day across everyone (default 500) |
| `CHARTSIDE_VISIT_OFFERS_PER_CONTACT` | Draft offers one clinician phone or email can receive per day (default 5) |
| `CHARTSIDE_VISIT_UPLOAD_RATE` | Audio uploads per IP per hour on patient visits (default 2000) |
| `CHARTSIDE_DELIVERY` | `file` writes outgoing email and SMS to `data/outbox/` instead of sending, and `none` disables delivery. By default, outside production, messages go to `data/outbox/` when no provider is configured. |
| `SENDGRID_API_KEY`, `CHARTSIDE_EMAIL_FROM` | Email for sign-in codes and shares. SendGrid does not sign a BAA, so email carries no patient data. |
| `NPPES_BASE_URL` | Override the NPI registry base URL, used for tests |
| `CHARTSIDE_OPERATOR_EMAILS` | Comma-separated emails that may see growth and line metrics across all organizations and connect the phone number. An operator must have signed in once with an emailed code or link, which proves they own the address. |
| `HOSTNAME_BIND`, `PORT` | Where `server.ts` listens (default `0.0.0.0:3100`) |
| `CHARTSIDE_PRACTICE_RATE` | Practice cases a visitor may start per IP per hour (default 30). Note grading allows twice this. See `docs/PRACTICE.md`. |
| `CHARTSIDE_PRACTICE_TURN_RATE` | Practice questions and patient voice clips per IP per hour (default 600) |
| `CHARTSIDE_PRACTICE_SPEECH_RATE` | Practice speech tokens per IP per hour (default 60) |
| `CHARTSIDE_PRACTICE_LLM_DAILY` | Claude calls for practice patients and reference notes across all visitors per day (default 3000). Past the cap, the offline patient answers. |
| `CHARTSIDE_PRACTICE_VOICE_F` / `CHARTSIDE_PRACTICE_VOICE_M` | Aura voices for female and male practice patients (defaults `aura-2-luna-en` and `aura-2-arcas-en`) |
| `CHARTSIDE_PRACTICE_LINE` | Set to `0` to turn off "press 7 to practice" on the phone line |

### Running the phone line

The phone line needs a WebSocket upgrade for Twilio media streams, so it runs through the custom server rather than `next start`:

```bash
npm run build
NODE_ENV=production npx tsx server.ts        # http://localhost:3100, with /api/voice/stream
```

`npm run dev` still serves every page and API except the phone WebSocket. For a real number, expose the server publicly (for example `cloudflared tunnel --url http://localhost:3100`), set `CHARTSIDE_PUBLIC_URL` to that address, and point the Twilio number's voice webhook at `/api/voice/incoming` and its messaging webhook at `/api/sms/incoming`. **Admin → Line** can set both on the number in one step for an operator.

On Google Cloud Run, run `deploy/gcp-grant.sh` once. It creates the `chartside-run` service account, grants it the app's secrets (keys, the encryption secret, push keys and the cron secret), and creates the Litestream bucket. Then run `deploy/gcp-deploy.sh` for each release, and `deploy/gcp-scheduler.sh` once to call the nudge job hourly.

To place a call without a phone, use the fake Twilio caller:

```bash
TWILIO_AUTH_TOKEN=… node scripts/fake-twilio-call.mjs --base=http://localhost:3100 --from=+13125550123
node scripts/fake-twilio-call.mjs --base=http://localhost:3100 --sim   # through the browser-phone simulator: no Twilio token, but the server needs DEEPGRAM_API_KEY
```

It dials the bridge, streams `tests/e2e/fixtures/visit.wav` as 8 kHz mu-law, says "Chartside, end visit", and prints the call result and any texts it sent. Pass `--cookie='cs_session=…'` to call as a signed-in clinician, `--mock=http://localhost:3299` to use the mock Deepgram, or `--script='[...]'` to change the steps.

### Live evaluation of the line

`scripts/eval-line.mjs` places real calls through the browser-phone bridge, with the caller's side spoken by Deepgram voices, and checks each outcome:

- consent small talk that must be ignored
- a full visit through to the text
- a split wake word
- pause and resume
- a decline
- Spanish consent
- a patient saying no when asked
- a chart question after a PIN

It uses real Deepgram and Claude, so each full run costs well under a dollar.

```bash
DEEPGRAM_API_KEY=… node scripts/eval-line.mjs --base=http://localhost:3100
node scripts/eval-line.mjs --base=… --only=full_visit,split_wake
node scripts/eval-line.mjs --base=… --cookie='cs_session=…' --pin=5937   # adds the chart question
```

### Testing the doors

Two sessions share one machine in this project, so run Playwright through the lock:

```bash
scripts/e2e-locked.sh                        # the whole suite
scripts/e2e-locked.sh tests/e2e/stack.spec.ts tests/e2e/voice.spec.ts
```

It waits for `/tmp/chartside-e2e.lock` and clears it if the owning process has died. The suite starts mock Deepgram (including `/v1/speak` and mu-law listen), Twilio Messages, SendGrid, NPPES, FHIR, OIDC and MLLP servers, and runs the app through `server.ts` against `data/e2e/`.

## Chartside Practice

Free OSCE-style practice for students and residents at `/practice`: interview a fictional standardized patient by text or voice, examine, write a SOAP note, and get a shareable scorecard, a note comparison with Chartside's own draft, and an AI attending who grades your oral presentation. Callers to the line can press 7 to practice by phone. Details, safety rules and test counts are in `docs/PRACTICE.md`.

## Platform and security

- **Public API** at `/api/v1` with an OpenAPI 3.1 spec at `/api/v1/openapi.json`: create patients and encounters, post a transcript (consent is recorded on first call), generate the note, and read JSON or FHIR. Organization API keys are hashed, scoped, and rate limited.
- **Webhooks** for `note.generated`, `note.signed`, `claim.status_changed`, `task.created`, and `message.received`, signed with HMAC-SHA256 in `Chartside-Signature: t=…,v1=…`, retried with backoff, and logged in Admin → Developers.
- **Patient delivery:** summary, intake, and reply-notification links go out by SMS (Twilio) or email (SendGrid) with no clinical content in the message; every attempt is logged in the patient's outbox. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SENDGRID_API_KEY`, `CHARTSIDE_EMAIL_FROM`, and `CHARTSIDE_PUBLIC_URL`. Signed documents and referral letters can be faxed through a Phaxio-compatible API (`PHAXIO_KEY`, `PHAXIO_SECRET`, optional `PHAXIO_BASE_URL`). Inbound faxes arrive by webhook (`/api/fax/inbound/<org id>` with the `X-Chartside-Fax-Secret` header from Admin, Developers), show up in the Inbox with suggested patients from names, DOBs, and MRNs in the text, and are filed as outside records; without them Chartside logs the attempt and offers the link to copy.
- **Security:** TOTP two-step verification with recovery codes, an organization-wide requirement, idle sign-out with a warning (15 minutes to 8 hours), active sessions with "sign out everywhere", and SCIM 2.0 user provisioning at `/scim/v2` for Okta and Entra ID.

## EHR integration (Epic / SMART on FHIR)

Chartside is a SMART on FHIR R4 app. It works with Epic's sandbox and with any SMART-compliant EHR.

- **Launch.** In an EHR launch, Epic opens `/smart/launch?iss=…&launch=…`. Chartside discovers the EHR's OAuth endpoints, runs the authorization-code flow with PKCE (S256) and `aud`, and receives the patient and encounter in context. If the clinician isn't signed in to Chartside, they sign in first and the launch resumes. A standalone connection (`/smart/connect`) works from Settings. Only issuers on the allowed list are accepted.
- **Tokens.** Access and refresh tokens are stored AES-256-GCM encrypted, refreshed automatically, and never sent to the browser.
- **Import.** Patient demographics and preferred language, active problems (with ICD-10), active medications with sigs, allergies with reactions, and the latest labs and vitals (by LOINC) populate the pre-visit brief. They also feed the engine's allergy, kidney-dose and duplication checks. The EHR encounter becomes the Chartside visit, and Resync pulls the chart again.
- **Write-back.** At signing, the note (including the system-written consent attestation and an electronic signature line) is filed as a clinical note DocumentReference. It has status `current`, docStatus `final`, a LOINC note type, the patient as subject, the encounter context, and the clinician as author. Failures show a retry button, and every step is audited.

**Verified against a live server:** a full EHR launch, chart import and note write-back against the public SMART Health IT sandbox (launch.smarthealthit.org, synthetic data), with the filed DocumentReference read back from the server.

**Connect the Epic sandbox:**
1. Register at fhir.epic.com as **Clinicians or Administrative Users**, SMART on FHIR **R4**, public client.
2. Set the redirect URI to `http://localhost:3100/smart/callback` and the launch URI to `http://localhost:3100/smart/launch`.
3. Select the APIs: Patient.Read, Condition.Search (Problems), MedicationRequest.Search, AllergyIntolerance.Search, Observation.Search (Labs, Vitals), Encounter.Read, DocumentReference.Create (Clinical Notes).
4. Set `SMART_CLIENT_ID` to the non-production client ID. `SMART_ISS` defaults to Epic's sandbox (`https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`).
5. Launch from Epic's sandbox launcher.

## Coding & revenue cycle

Every code Chartside suggests, prices, or edits comes from an official, versioned source, and every edit shows which rule and release produced it. None of the ten scribes we studied publishes its code-set provenance; see [docs/research/revenue-cycle-coding.md](docs/research/revenue-cycle-coding.md).

**Official sources.** `npm run codesets:build` downloads the government files and records each file's SHA-256 in `codesets/manifest.json`. A later run refuses a silently re-posted file unless you pass `--update`. It then writes compact, versioned artifacts to `codesets/dist`, and a unit test re-verifies their hashes.

| Code set | Source | Used for |
|---|---|---|
| ICD-10-CM FY2026 (April 1 update) and FY2027 | CDC NCHS order files and tabular XML | Validity and billable level by date of service; the release is chosen by DOS (9/30 vs 10/1). Also Excludes1, code-first / use-additional, 7th characters, and specificity options |
| HCPCS Level II, October 2026 | CMS quarterly file | Level II codes, modifiers, and add/termination dates |
| Physician fee schedule RVU26D and GPCIs | CMS | Allowed amounts with locality GPCIs, facility vs non-facility by POS, the 2026 conversion factors ($33.4009, or $33.5675 for qualifying APM participants), and Medicare status indicators |
| Clinical lab fee schedule, 2026 Q4 | CMS | Lab and CLIA-waived (QW) pricing |
| Part B drug and vaccine payment limits, October 2026 | CMS ASP files | Vaccine pricing and coinsurance |
| Vaccine administration rates, 2026 | CMS | Locality-adjusted G0008/G0009/G0010 |
| CMS-HCC V28, payment year 2026 | CMS model software | HCC mapping with the model's age and sex conditions, hierarchies, interactions, and relative factors |
| Place of service | CMS | POS validity and the facility rate differential |

**What it catches** (each edit is tagged with its source):
- **Diagnosis codes:**
  - codes that are invalid, header-level, or missing a 7th character (with the official options);
  - Excludes1 conflicts;
  - manifestation codes listed first or without their etiology;
  - use-additional codes the medication list implies (Z79.4, Z79.84, Z79.85);
  - maternity age and sex conflicts.
- **Medicare-only codes and non-covered services:**
  - non-covered services, such as 99397, which Medicare doesn't pay (use G0438/G0439);
  - 99417 billed to Medicare instead of G2212, plus the G2212 time thresholds;
  - G2211 with modifier 25, which is allowed only alongside an AWV, vaccine administration, or a Part B preventive service.
- **Vaccines:**
  - 90471 billed instead of G0008/G0009/G0010;
  - Part D vaccines (Shingrix, routine Tdap) on a Part B claim;
  - vaccines with no current payment limit, such as discontinued quadrivalent flu vaccines.
- **Code and modifier validity:** inactive HCPCS codes and invalid modifiers.
- **Specificity queries.** Unspecified diagnoses get a query written to ACDIS/AHIMA compliant-query practice: a non-leading question, the official ICD-10-CM options, "clinically undetermined", and nothing preselected. The clinician's answer updates the diagnosis, adds a clarification to the note, and re-prices the claim.
- **Risk adjustment.** The V28 raw risk score is computed per visit, with superseded HCCs shown. Suspects on the problem list that haven't been captured this calendar year are listed with the score they would add, plus a reminder to code them only when clinically assessed.

**Licensed edits.** NCCI procedure-to-procedure and MUE edits, and Medicare Coverage Database LCD billing articles (covered diagnoses by MAC), contain AMA CPT content. Chartside never ships them. An administrator runs `npm run codesets:licensed -- --accept-cms-ama-license` to download them into `data/codesets/licensed` under the CMS/AMA terms. Once loaded, claims get:
- PTP edits by modifier indicator and effective date;
- MUE unit limits with the adjudication indicator;
- MAC-specific LCD coverage checks for the org's locality.

Until then, Chartside applies its own clearly labeled clinical-necessity rules. CPT descriptors are never displayed; lines show Chartside's own service summaries or official HCPCS Level II text.

**Lifecycle.**
1. Pre-bill review: approve or hold.
2. Submission through a pluggable clearinghouse adapter. The built-in sandbox runs front-end checks: NPI check digit, tax ID, and open errors.
3. Acceptance or rejection with a control number.
4. ERA posting at the official allowed amount, with CO-45 contractual and PR-2 coinsurance adjustments, or manual posting from an EOB.
5. Denial root-cause categories mapped from CARCs.
6. An appeal letter built from the signed note, with the outcome recorded.
7. Corrected claims (frequency 7) and write-offs.

The Revenue page reports:
- collected vs expected allowed;
- A/R aging buckets;
- first-pass resolution and denial rates;
- net collection rate;
- charge lag;
- a denials worklist.

Admin → Billing & code sets holds the billing NPI and TIN, the Medicare locality, the charge-master multiplier, commercial and Medicaid estimate multipliers, and qualifying-APM status. It also shows every loaded code set with versions and source hashes.

## Organizations, roles & SSO

Every account belongs to one or more organizations. Patients, visits, templates, claims, and the audit trail are scoped to the organization, and people who belong to several organizations switch between them from the sidebar.

| Role | Visits and notes | Sign | Claims | Admin |
|---|---|---|---|---|
| Owner / Admin | Org-wide; document their own visits | Their own visits | Review, approve, submit | Members, invites, SSO, org analytics, audit log |
| Clinician | Their own visits | Their own visits | Their own claims (read-only review) | — |
| Scribe | Org-wide; capture visits and edit drafts for any clinician | Never. The note waits for the treating clinician | — | — |
| Coder / biller | Org-wide, read-only | — | Review, edit, approve, submit, 837P | — |
| Viewer | Org-wide, read-only | — | Read-only | — |

- **Enforcement.** Permissions are checked on the server for every route (403 with a plain-language reason). The UI hides what a role can't do: scribes see "Awaiting Dr. X's signature", coders get a read-only note with the billing queue, and admin pages redirect.
- **Admin console** (`/admin`):
  - Change roles, disable or remove members. Disabling a member revokes their sessions immediately. There must always be an active owner, only owners manage owners, and nobody can change their own access.
  - Invitation links that carry a role and expire in 7 days. An invitee signs up with the invited email, or an existing user accepts and gains the org.
  - Organization settings, per-clinician analytics (time to sign, unedited-sign rate, after-hours signing, evidence coverage), and an org-wide audit log.
- **Single sign-on (OIDC).** Works with Okta, Microsoft Entra ID, Google Workspace, Ping, or any OpenID Connect provider. Each organization sets:
  - the issuer, client ID and client secret (stored AES-256-GCM encrypted);
  - the email domains it claims;
  - the default role for new users;
  - just-in-time provisioning;
  - "require SSO", which blocks password sign-in and registration for those domains.

  Sign-in uses the authorization-code flow with PKCE, state and nonce. Every ID token is verified: RS256/PS256/ES256 signature against the provider's JWKS (with key rotation), issuer, audience/azp, expiry, nonce, and a verified email in a claimed domain. Identities are linked by issuer and subject. Rejections are audited. The redirect URI is `<origin>/sso/callback`.

## Audio & speech

- **Recording.** The browser records Opus audio in 4-second chunks. Chunks go into an IndexedDB-backed upload queue that survives network drops and page reloads, and retries with backoff. The server stores chunks per visit, serves the stitched recording with HTTP Range support, and deletes it per the retention policy (default: at signing).
- **Live captions.** With `DEEPGRAM_API_KEY`, the server mints a 60-second Deepgram token. The browser streams to Nova-3 over `wss` with `["bearer", token]` subprotocols, so the key never reaches the browser, using `diarize=true` and `language=multi` for Spanish–English code-switching. Without a key, captions fall back to the browser's speech engine. Speakers are then separated on-device by clustering per-utterance pitch and spectral centroid, and mapped to clinician, patient or interpreter from what each voice says.
- **Post-visit pass.** When the visit ends, the full recording is re-transcribed with diarization and utterance timestamps. It replaces the live transcript (kept in the audit artifacts) before the note is drafted.
- **Interpreted visits.** Every line is language-tagged. Source/rendition pairs are checked for mismatched numbers, dropped negations, changed laterality, and medication names (for example "cada cuatro horas" rendered as "every six hours").
- **Review.** Click any sentence, then **Play source** to hear the exact audio behind it.
- **Resilience.** Microphone mute or ended events (phone calls, Bluetooth drops) show an interruption banner and resume automatically. A silent-mic alarm catches muted inputs. Media Session handlers give lock-screen pause and resume on phones.

## Architecture

```
codesets/                 Official code-set sources (sources.json), pinned hashes (manifest.json), built artifacts (dist/)
scripts/codesets.mjs      Downloads, verifies, and builds the code sets; --licensed for NCCI/MUE/MCD after license acceptance
src/
  app/                    Next.js 16 App Router: pages + REST route handlers under /api
  components/             UI: workspace (capture, note editor, panels, transcript, assistant), pages
  lib/
    engine/               On-device clinical engine (pure TypeScript, no network)
      lexicon.ts          Symptoms, conditions→ICD-10, meds, orderables, referrals, exam systems, consent states
      extract.ts          Transcript → structured facts with utterance evidence (negation, Q/A linking,
                          HPI attributes, med actions, vitals, results, exam, problems, plan attribution)
      note.ts             Template-driven note composer (every sentence carries evidence)
      verify.ts           Support scoring + omission detector
      coding.ts           ICD-10, 2021 E/M MDM levels, HCC/MEAT, CDI, audit defensibility
      orders.ts           Order staging + safety checks
      coverage.ts         Live HPI / red-flag / closing coverage
      summary.ts          Patient summary (EN/ES) with reading grade
      billing.ts          Claim builder, payer-style edits, missed-revenue finder, 837P export
      priorauth.ts        Prior-authorization criteria engine + medical-necessity letters
      lang.ts, interpreter.ts, diarize.ts   Language tagging, interpretation checks, speaker roles and voice clustering
      letter.ts, style.ts, assist.ts
    fhir/                 SMART client (discovery, PKCE, token exchange/refresh), FHIR→chart mapping, DocumentReference builder, token crypto
    audio/                Browser recorder, offline upload queue, voice features, Deepgram live client, segment player
    llm.ts                Claude provider (structured outputs via @anthropic-ai/sdk)
    codesets/             Loader for the official code sets: ICD-10-CM releases by DOS, HCPCS, MPFS/GPCI, CLFS, ASP, HCC V28, POS, licensed NCCI/LCD
    rcm/                  Diagnosis review and CDI queries, claim reference (pricing and Medicare/NCCI/LCD rules), risk scores, remittance and appeals
    sso/                  OIDC discovery, PKCE, ID-token signature and claim verification
    roles.ts              Roles and their descriptions
    server/               Org-scoped repositories, permission policy, auth, SSO, admin, pipeline, seeding, insights
    db.ts                 Async data layer: node:sqlite by default, Postgres when DATABASE_URL is set
```

**Two engines, one verifier.** With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5` by default) drafts the note as structured JSON that cites utterance IDs. It also translates summaries into any language and handles free-form assistant requests. Without a key, the deterministic on-device engine does all of this offline. Either way the on-device engine re-verifies the draft: it scores evidence, flags unsupported numbers, detects omissions, computes codes, and stages orders with safety checks. If Claude errors or declines, Chartside falls back to the local engine and says so in the note.

## Run it

Requires Node 22.13+. By default Chartside stores data in SQLite through the built-in `node:sqlite`, with no native dependencies. Set `DATABASE_URL=postgres://…` to run on Postgres instead; the schema is created on first start.

```bash
npm install
npm run dev            # http://localhost:3100
```

The phone line needs the custom server. See [Running the phone line](#running-the-phone-line).

Create an account. This creates your organization with you as its owner. Each new account gets today's five-patient demo clinic plus two weeks of signed history. Open a visit, record consent, and choose **Play demo conversation** to watch a full visit, or **Start listening** in Chrome to use your microphone.

Optional configuration is in `.env.example`: `ANTHROPIC_API_KEY`, `CHARTSIDE_MODEL`, `CHARTSIDE_ENGINE=local`, `DEEPGRAM_API_KEY`, `SMART_CLIENT_ID`/`SMART_ISS`/`SMART_ALLOWED_ISS`, `CHARTSIDE_SECRET` (encrypts EHR tokens and SSO client secrets), `CHARTSIDE_DB` (SQLite path), `DATABASE_URL` (Postgres), `SSO_REDIRECT_URI` (override when running behind a proxy), and `CHARTSIDE_CODESETS_DIR` / `CHARTSIDE_LICENSED_DIR` (code-set locations).

## Tests

```bash
npm test               # 329 unit tests: extraction, notes, verification, coding, orders, summaries, style, speech, billing, prior auth, FHIR mapping, SMART flow,
                       # org scoping, RBAC, admin rules, OIDC token verification, SSO provisioning, Claude + Deepgram (mock servers),
                       # official code sets (hash verification, DOS release selection, pricing, HCC V28), diagnosis review, Medicare rules,
                       # NCCI/MUE/LCD logic, the claim lifecycle, co-signature and addenda, inbox triage and drafts, dictation grammar,
                       # snippets, letters and PDF output, eCQMs, calculators (published reference values), evidence retrieval, inpatient
                       # notes and hospital coding, nursing flowsheets, public API and signed webhooks, TOTP (RFC 6238 vectors), SCIM,
                       # behavioral health risk assessment, outside records (C-CDA, PDF), schedule import, note QA, telehealth channels,
                       # ED course and disposition, oncology staging and CTCAE grading, group therapy attribution, psychotherapy add-ons,
                       # SDOH Z-codes, visit sharing and one-time codes, research pre-screening, the 8-minute rule, procedures and
                       # J-code units, prenatal gestational age and flags, AcroForm filling, order sets, agenda, and access control
                       # e2e also runs an axe WCAG 2.1 AA scan of clinician pages and patient-facing pages (summary, intake, check-in)
npm run codesets:build # re-download and rebuild the official code sets (verifies pinned hashes)
npm run test:e2e       # 122 Playwright end-to-end flows against a production build, mock Deepgram, SMART/FHIR, OIDC, SendGrid, and MLLP servers, and a fake microphone
npm run test:pg        # both suites against Postgres (DATABASE_URL must point at a disposable database)
npm run typecheck
```

The end-to-end suite covers:
- co-signature, addenda, inbox and patient messaging, dictation and voice commands, letters, quality gaps, calculators,
  hospital rounds and discharge, nursing, developers API and webhooks, two-step verification, behavioral health,
  outside records, scheduling, note QA, telehealth, the Chrome extension's field filling, the ED track board, an oncology
  treatment visit, group therapy, external sharing with an emailed code, research pre-screening, a PT daily note, a knee
  injection, a prenatal visit, PDF form filling, order sets, the visit agenda, and the access report
- auth
- a full ambient visit from consent to signed FHIR export
- transcript redaction with redraft
- pediatric allergy blocking, Spanish summary, and the patient correction loop
- all-party and declined consent
- a pasted-transcript strep visit
- the assistant
- templates, insights and settings, and patients
- a microphone visit with a fake audio device: live diarized captions, chunk upload through an offline period, post-visit re-transcription, audio playback, and retention purge
- an interpreted visit with a flagged dosing discrepancy
- the revenue cycle:
  - official pricing and cited edits;
  - clearinghouse acceptance and ERA posting;
  - a denial and appeal;
  - A/R aging;
  - a CDI query answered by the clinician;
  - admin billing settings and code-set provenance
- organizations: an owner invites a scribe who drafts a note that only the clinician can sign, role changes (scribe to coder), disabling a member, multi-org switching, the audit log and analytics
- SSO: configuring an OIDC provider, just-in-time provisioning, SSO-required domains blocking passwords, and rejected sign-ins (forged signature, denied user)
- an Epic-style EHR launch (sign-in resume, chart and encounter import, note write-back), a standalone connection with resync and a filing-error state, and refusal of unknown EHRs

## Notes

Chartside is a demonstration product. The demo patients are fictional. Do not use it with real patient data without a HIPAA business associate agreement, a security review, and your organization's approval. Coding and order suggestions are decision support and must be reviewed by a licensed clinician.
