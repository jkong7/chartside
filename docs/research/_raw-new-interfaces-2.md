# New Interfaces and Viral Loops, Round 2 (raw research, 2026-09-30)

Scope: new front doors and growth loops that Chartside does not have yet. I skimmed `_raw-novel-paradigms.md`, `_raw-device-surfaces.md`, `_raw-viral-formats.md`, `_raw-growth-loops.md`, `interface-market.md` and `feature-gaps-2026.md` first. I did not re-propose anything they already cover: Chartside Line, SMS commands, /go PWA, Shortcut, Android share target, the Chrome side panel, the swipe stack, Ask your chart, Web Push, NPI claim, recap footers, pajama receipts, referral credits, the phone simulator, telehealth tab-audio capture, generic "demo mode video", or the trainee-seeding loop.

The rest of this document gives the 2026 facts I found for each track, then scores each idea, ranks the top 5 with overnight MVPs, and ends with sources. Every date comes from the cited page.

Repo leverage I checked on branch `interface/ghost`:
- `src/lib/server/pipeline.ts` has the consent engine (`recordConsent`, `consentScript`), with `ALL_PARTY_STATES` in `src/lib/engine/lexicon.ts`.
- `src/lib/server/captureTokens.ts` handles scoped capture tokens.
- `/api/v1` has an OpenAPI spec.
- `src/lib/server/sharing.ts` with `/x/[token]` handles external shares.
- `src/lib/server/loops.ts` (`trackLoop`) and `growth.ts` handle loop attribution.
- `src/lib/server/agent/tools.ts` defines 15 agent tools, including `list_my_queue`, `get_note` and `propose_note_edit`.
- `src/lib/server/telephony/*` runs the Twilio voice bridge.
- `src/lib/demo/scripts.ts` holds scripted demo patients.
- `guest.ts` supports guest accounts.
- `CHARTSIDE_ENGINE=local` gives a deterministic engine with no LLM, which makes every MVP below testable offline.

One data mismatch to fix: the lexicon lists 14 all-party states (CA, CT, DE, FL, IL, MD, MA, MI, MT, NV, NH, OR, PA, WA). AHCJ (2026-07-17) lists 11 and leaves out CT, DE and NV. Check with counsel which is right. For a patient-held recorder, the stricter list is the safe default.

---

## 1. Patient-side recording and the "patient invites the doctor" loop

**What exists in 2026**
- **Kin Health.** Raised a $9M seed on 2026-05-18, led by Maveron, with the GoodRx co-founders investing. It is a free patient notetaker that records visits and returns a clinical narrative plus a plain-language summary that can be shared with family. It makes money from referrals to specialists and labs, GoodRx style. Its roadmap is to pull in physicians' own notes from EHRs "later this year". It does not bring the clinician in as a user. (TechCrunch)
- **Other apps.** Medcorder (free, with a secure chat room per appointment for family), Advoca, AlignCare, AI Doctor Notes (Show HN, 2026-05-20), and Sidekick by openhand.health (Show HN on 2026-09-29, a desktop companion that sits in a patient's telehealth visit and explains terms live). STAT covered the category on 2026-06-04 ("After doctors, patients turn to AI scribes"). KevinMD ran "Recording medical visits is your legal right" on 2026-06-11.
- **VisitRecall shuts down today.** Its site says recording stops on 2026-09-30 and data stays downloadable through 2026-12-31. Users can export "formatted visit records suitable for printing and sharing with doctors" or a JSON file "for transferring information to another application". That is a stranded user base with a portable export as of this week.
- **Abridge started here.** Its first product (2020) was a patient app that recorded visits and bookmarked instructions. It reached more than 200,000 patients before pivoting to enterprise. (Contrary Research, UPMC 2020)

**Demand**
- Patients forget about 80% of what is said in a visit (AHCJ).
- 35% of people surveyed would consider recording, and another 34% would record if they could ask permission first. In the US, 2.7% admit to covert recording and 25.7% know someone who has. In the UK, 15% have covertly recorded. (Becker's, summarizing Elwyn et al.)
- 21.1% of patients who read their notes found a perceived mistake (JAMA Netw Open, cited by KevinMD).

**Law**
- Most states (39 plus DC) are one-party consent, so a patient may record their own visit.
- In all-party states, recording without the clinician's consent can be a felony (AHCJ list: CA, FL, IL, MD, MA, MI, MT, NH, OR, PA, WA).
- HIPAA does not cover patient-made recordings.
- A consumer app that holds health records the patient controls is a "vendor of personal health records" under the FTC Health Breach Notification Rule (amended July 2024, up to $53,088 per violation). The patient side of this product is therefore under FTC rules, not HIPAA.
- Once a clinician accepts the recording into Chartside, their copy becomes PHI under our BAA.

**The gap nobody fills.** Every patient app stops at the patient and the family. None turns the recording into a draft note for the clinician who was in the room. Medcorder's own blog pitches physicians on why recording helps them but gives them nothing to receive. This loop is Chartside's to take.

**Loop design ("Bring your own scribe")**
1. The patient opens `/p` (a PWA, no account) and taps Record. The screen shows a consent card: "I'm recording so I remember. Dr. ___, is that OK?" In all-party states the doctor taps "OK" on the patient's phone, or says "yes" and the recorder hears it, and the phone stores a hash of the consent in the same way `recordConsent` does. One-party states still get a courtesy disclosure, because that builds trust and keeps the doctor willing to claim.
2. The patient gets a plain-language recap: meds changed, tests to book, questions to ask next time. It is shareable to a caregiver through a family link with the `/x/[token]` mechanics.
3. At the end, one optional toggle: "Send Dr. ___ a draft chart note of this visit (free for them)." The patient enters the doctor's name or office phone, or picks the NPI from a lookup.
4. The doctor gets a PHI-free text or fax cover: "A patient shared a draft note from today's 2:40pm visit. Claim it: chartside.app/c/…". The existing NPI instant claim verifies the doctor, and the draft SOAP opens in the swipe stack.
5. After claiming, the doctor sees: "Record your own visits and every patient gets this recap automatically." That converts them to Chartside Line or /go. Each patient is an inviter, and each doctor claim is an acquisition that cost nothing.

**Risks**
- Doctors may feel ambushed. Mitigation: the doctor-consent tap is mandatory in all-party states, and "courtesy disclosure" mode is the default everywhere.
- Accuracy disputes. Mitigation: the doctor's version is marked as a draft they sign, and the patient version is never presented as the medical record.
- FTC HBNR duties on the patient side: breach notice, no ad tracking pixels.

**Leverage: very high.** It reuses the recorder, consent engine, share tokens, NPI claim, recap footers and loop tracking. The new pieces are a patient-facing recap template and the claim handoff.

---

## 2. Meeting bots and telehealth

**Facts**
- **Recall.ai**: $0.50 per recording hour on the Meeting Bot API (a price cut announced for 2026), the first 5 hours free, and transcription $0.15 per hour. It is HIPAA compliant, and a BAA is signed on the Enterprise plan or by emailing hello@recall.ai (post updated 2026-05-06). Its Desktop Recording SDK captures bot-free on Mac and Windows at the same $0.50 per hour.
- **Zoom Realtime Media Streams (RTMS)**: generally available since 2025-06-25. It gives bot-free access to audio and transcripts, but through a Developer Pack with sales-only pricing. Video SDK RTMS costs $0.01 to $0.02 per minute.
- **Zoom's own scribe**: at HIMSS26 (2026-03-10) Zoom shipped Clinical Notes inside Epic Haiku and Hyperspace, with Suki as a partner.
- **Google Meet Media API**: still in Developer Preview as of April 2026.
- **Doxy.me**: ships its own Scribe, which added French and Spanish in April 2026 and is free in early access for Pro users.
- **Doximity**: Dialer plus Scribe are free for verified US clinicians.

**Read.** Scribing inside a telehealth platform is being commoditized by the platforms themselves, including Doxy.me, Zoom and Doximity. A Chartside bot is not novel as a feature. The one angle that is still open is the calendar as the trigger: the clinician adds `scribe@chartside.app` to any video visit invite, or pastes the link into SMS, and a bot named "Chartside Scribe for Dr. Lee (notes only)" joins. That fits clinicians who switch between Zoom, Meet, Teams and their EHR's video. A second, smaller viral surface is that every patient sees the bot's name in the participant list.

**Cost.** $0.50 per hour plus our own ASR works out to about $0.25 for a 30-minute visit, which is fine at Pro pricing. The BAA requires Recall's Enterprise plan, which is a procurement step and cannot be done overnight for production. A local MVP with mocks is fine.

**Leverage: medium.** It reuses the encounter pipeline, consent script and Web Push. The new pieces are a Recall webhook ingest and calendar parsing.

---

## 3. AI assistant surfaces (MCP, ChatGPT Apps, Claude connectors)

**Facts**
- **Anthropic.** Claude for Healthcare was announced on 2026-01-11 and 12, with HIPAA-ready Enterprise, connectors for the CMS Coverage DB, ICD-10 and NPI, and consumer health records through HealthEx and Function. The BAA covers only the first-party API and sales-assisted Enterprise. Anthropic's BAA does not cover data sent to third parties through connectors or MCP. On 2026-05-21 an open GitHub issue (anthropics/claude-ai-mcp #339) reported that turning on HIPAA in Claude Enterprise blocks every custom remote MCP connector, with no admin control to unblock it and no Anthropic reply.
- **OpenAI.** ChatGPT for Healthcare launched in January 2026 (Boston Children's, Cedars-Sinai, MSK). ChatGPT for Clinicians launched 2026-04-23: free for verified US MDs, DOs, NPs, PAs and pharmacists, BAA-eligible, with skills and CME tracking. On 2026-09-01 it added a read-only Epic connection and a nine-source "Healthcare Public Data" plugin. The Apps SDK (built on MCP) opened a directory with submissions starting 2025-12-17. The submission guidelines list "Protected health information (PHI)" as Restricted Data that apps "must not collect, solicit, or process". Third-party apps are not covered by the clinician BAA.
- **MCP Apps.** Claude, ChatGPT, Goose and VS Code support MCP Apps (UI in an iframe). UI-initiated tool calls go over loggable JSON-RPC.
- **Precedent.** Plaud shipped an MCP server and CLI on 2026-09-22 (ChatGPT, Claude Desktop, Claude Code, Cursor, Gemini CLI). HappyScribe shipped one in March 2026. PatientNotes ships an MCP server that only answers questions about pricing, features and compliance, which is marketing through the assistant.

**Read.** A PHI-bearing Chartside app inside ChatGPT or Claude is blocked by policy today. OpenAI forbids PHI in third-party apps, and HIPAA-mode Claude blocks custom MCP. It is not a clinical distribution channel in 2026. Three things still work:
1. **A PHI-blind MCP server.** Tools return counts, opaque encounter IDs and deep links only, for example `queue_status` saying "7 notes waiting, oldest 2h", `open_sign_stack`, or `start_line_call`. The PHI stays in Chartside's own UI. This is the same PHI-free design as the Line texts.
2. **A developer-facing MCP** over `/api/v1` so integrators can build against Chartside from Claude Code or Cursor. This is developer-led growth, not clinician use.
3. **A marketing MCP** in the PatientNotes style, so assistants quote correct Chartside pricing and features when clinicians ask "which scribe should I use".

**Leverage: high for building** (the tool registry already exists in `agent/tools.ts`). **Low for clinician distribution** until the policies change.

---

## 4. Wearables

- **Plaud.** 1.5M users. It markets HIPAA compliance, 100+ medical templates and "send write-ups to your EHR". An NP on TikTok uses a NotePin for daily notes, and TikTok has a "Plaud AI medical scribe" discover page.
- **Plaud integration paths (new ground).** (a) **AutoFlow** can email the transcript, the summary or both to any address automatically after every sync. (b) Zapier triggers on "transcript generated" and "summary generated". (c) Plaud MCP and CLI (2026-09-22). (d) Plaud Embedded, a developer platform with iOS and Android SDKs, device binding, a transcription API, and a free tier of 300 transcription hours and 50 devices.

  The cheapest real path is AutoFlow emailing the transcript to a per-clinician Chartside inbound address, for example `dr-lee.k3f9@in.chartside.app`. It needs a HIPAA-eligible inbound mail receiver such as AWS SES inbound. Zapier is not an option because it does not sign BAAs, so avoid it for PHI.

  **Precedent for the pitch:** "Your Plaud already records the visit. Chartside turns it into a coded, signable note in your EHR." Plaud's own summaries are generic templates with no coding, no EHR fill and no sign workflow.
- **Omi.** Webhook apps receive real-time transcript segments, conversation events and raw audio, and can be published in the Omi App Store. There is a known bug where webhooks do not fire for Limitless Pendant sessions (issue #11365). A Chartside Omi app is a small webhook.
- **Meta Ray-Ban Display.** Opened to developers on 2026-05-14 in two ways: a native SDK, and **Web Apps built in HTML, CSS and JS that deploy to the glasses by URL**. Web Apps get Neural Band input and local storage, and can have up to 100 testers per project. Microphone access for Web Apps is not documented, and public publishing is not generally available yet. The earlier DAT preview (2025-12-04) allowed Bluetooth audio in and out but no public shipping. A Next.js route could render a glance card with the next patient and "3 notes to sign", signed with a Neural Band pinch. That makes a great demo but has a tiny audience, and a HUD in the exam room raises privacy questions.
- **Apple Watch, AirPods.** Nothing new beyond prior research. Chartside Line already works from a Watch or AirPods as an ordinary phone call.

**Leverage.** The Plaud email path is high because it reuses the pipeline's transcript entry. Omi is high. The glasses are medium. Each is a web route.

---

## 5. Car and time between visits

- iOS 26.4 (beta 2026-02-18) added a CarPlay category for **voice-based conversational apps**. It requires voice as the main mode at launch, has a template depth of 3, and needs its own entitlement. ChatGPT, Claude and Gemini use it.
- Chartside is a PWA, so it cannot join the category without a native app.
- **Chartside Line already works in the car**: "Hey Siri, call Chartside" goes through CarPlay phone.
- Home health context: OASIS-E2 took effect 2026-04-01, and vendors pitch "finish the note in the car after each visit".

**Cheapest new work.** A "car debrief" mode on Line. When a caller ID is set to home-health mode, Line asks the OASIS-relevant questions one at a time (GG functional items, wounds, meds) instead of listening passively. This is a script change, not a new surface. Novelty is low to medium, and it is a strong niche fit.

---

## 6. Embeddable "Chartside button" (developer-led)

- **Competitors.** Nabla (white-label, Nabla Connect iframe), Suki for Partners (Web SDK, headless React SDK, iOS SDK), Twofold (white-label, $19 per month intro), Corti (API), AWS HealthScribe (API).
- **Buyers.** Small EHRs and telehealth apps. Doxy.me built its own scribe, which shows that platforms want this.
- **Our edge.** A one-line `<script src="https://chartside.app/embed.js" data-key="pk_…">` that renders a `<chartside-button>` web component. It records in a shadow-DOM popover, uses a short-lived capture token minted by the host's backend (the scoped tokens already exist), and returns a structured note plus codes through a DOM event and a webhook. Clinicians who meet the button in a partner app see "Powered by Chartside", which gives brand exposure without PHI.
- **Novelty: medium.** Others have SDKs, but none is a paste-in script with self-serve keys. **Feasibility: high.** **Leverage: very high** (`/api/v1`, capture tokens, OpenAPI).
- The PHI-blind MCP from section 3 ships as part of this same developer kit.

---

## 7. Multiplayer

- **Supervisor and trainee.** Prior research covers the trainee-to-attending seeding loop, so I skip it. One new detail I could not re-verify this session: CMS lets teaching physicians verify rather than re-document medical student E/M documentation (the 2018 rule change). This makes a "student drafts, attending co-signs" flow billable. Confirm with CMS MLN 4059467 before building.
- **Care team huddle / shared live note.** A single live note that the MA, the RN and the clinician all append to, with presence dots. Heidi and Freed ship shared patient records and MA seats (feature-gaps doc). A live cursor is novel, but the demand evidence is weak and the collaboration infrastructure needs a BAA vendor. **Rank low.**

---

## 8. Viral formats for trainees and the public

- **Evidence**
  - An NEJM AI RCT (DocSimulator ASCE): students trained with an AI standardized patient scored higher on the OSCE (median 11.4 vs 10.7, p = 0.02) and reported less stress.
  - CPX-MATE (npj Digital Medicine 2026): 97.7% voluntary adoption among eligible seniors before Korea's national OSCE.
  - MLAbuddy: 6,000+ students practicing OSCE cases with AI patients.
  - Heidi gives students and residents its paid tier free (restructured February 2026). Doximity includes students.
- **The format no one ships: "Call your standardized patient."**
  1. A student dials the Chartside Line number with a practice code, or taps "Practice" in the browser phone simulator.
  2. An AI standardized patient built from `DEMO_PATIENTS` answers in character (the Twilio voice bridge already exists).
  3. The student takes a 7-minute history.
  4. Chartside writes the reference note from the transcript. The student types or dictates their own note.
  5. A grader scores it against a rubric: history checklist items elicited, plus PDSQI-9 style attributes such as accurate, thorough, succinct and not stigmatizing.

  The output is a **shareable scorecard image**: "History 14/18, missed: red-flag weight loss; Note: 82". It contains no PHI because the patient is synthetic, so it can go on TikTok, Instagram and group chats. Suki's whitepaper on why holistic PDQI-9 Likert scores miss dose errors is a caution: grade specific checklist items, not vibes.
- **"Roast my note."** A clinician pastes a de-identified note and gets a funny but accurate critique plus a score. It is fun, but a PHI paste is likely, and it needs a de-identification gate. Better as a feature inside the OSCE product, grading the student's own note, than as a standalone.
- **Public note-quality scorecard.** A leaderboard of scribes graded on synthetic encounters (Chartside vs others) is a credible marketing asset but a competitive and legal minefield. Keep it internal.

---

## 9. Other 2025 to 2026 launches worth noting

- **YC W26** (about 10% healthcare): Beacon Health, Eos AI, ClaimGlide, Overdrive Health, MochaCare, Opalite Health (translation).
- **YC S26**: Care GP (AU GP agents), Standard Medical, Radley, Allia, Hubble (patient-data layer for EHR access).
- No YC scribe launched in either batch. The batches are shifting to AI-native services and clinics, which suggests scribing is seen as saturated and the white space is in distribution and adjacent loops.
- **Show HN**: Notation for PTs (2026-03-05), Trayce local WASM scribe (2026-02-03), Adentris (YC P25, record error finder, 2026-04-02), Kula family health (2026-05-04), Sidekick patient telehealth companion (2026-09-29).
- **Signal**: patient-side and family-side tools are where new launches are happening.

---

## 10. Scoring (1 to 5; higher is better)

| # | Idea | Novelty | Demand evidence | Feasibility (API, cost, legal) | Stack leverage | Viral loop | Total |
|---|------|---|---|---|---|---|---|
| A | Patient recorder that invites the doctor (plus VisitRecall import) | 5 | 4 | 3 | 5 | 5 | 22 |
| B | Call-your-standardized-patient OSCE with graded note scorecard | 5 | 4 | 5 | 4 | 5 | 23 |
| C | Plaud AutoFlow and Omi inbox ("forward your pendant") | 4 | 3 | 4 | 5 | 3 | 19 |
| D | Embeddable `<chartside-button>` plus PHI-blind MCP dev kit | 3 | 3 | 5 | 5 | 3 | 19 |
| E | Calendar-invited telehealth bot (Recall.ai) | 3 | 3 | 3 | 4 | 3 | 16 |
| F | Home-health car debrief on Line | 2 | 3 | 5 | 5 | 1 | 16 |
| G | Ray-Ban Display glance web app | 4 | 1 | 2 | 3 | 3 | 13 |
| H | PHI-bearing ChatGPT or Claude app | 3 | 3 | 1 | 4 | 2 | 13 |
| I | Live multiplayer huddle note | 3 | 2 | 3 | 3 | 2 | 13 |

Final ranking below. A is placed first even though B scores one point higher. Explicit caveat: A's loop creates paying clinicians directly, while B's creates future clinicians.

---

## 11. Top 5 with overnight MVPs

### 1. "Bring your own scribe": the patient recorder that invites the doctor
**Aha in 60 seconds.** A patient demos it to a friend. They tap Record, the phone shows "Dr. Lee, OK to record so I remember?", and the doctor taps OK. After the visit the patient reads "3 things to do" in plain English and texts a family link to their daughter. Two minutes later the doctor's phone buzzes: "A patient shared a draft note of your 2:40 visit. Claim free." The doctor taps once and a coded SOAP note is waiting in the sign stack.

**MVP (overnight)**
- `src/app/p/page.tsx`: a patient recorder. Reuse the /go recorder component and create a guest encounter with `origin: "patient"`.
- A consent card. The state picker defaults from geolocation or the timezone guess. In `ALL_PARTY_STATES` the doctor-tap or a spoken "yes" is required before recording. Store it through `recordConsent` with a new method `patient-held`.
- A patient recap template: plain language, meds changed, to-dos, questions for next time. Put it in `src/lib/engine`, and render it deterministically in local mode.
- Family share: reuse `sharing.ts` to create a `/x/[token]` link with a "family" scope and no doctor fields.
- Doctor invite: `POST /api/p/[id]/invite {npi | phone}` sends a PHI-free SMS through `telephony/sms.ts` with a `/c/[token]` claim link. It reuses the NPI instant claim. On claim, the draft note is copied into the doctor's org as an encounter with provenance "patient-shared, unverified" and a banner.
- Loop tracking: `trackLoop({ loop: "patient_invite", kind: "exposure" | "claim" })`.
- A bonus that fits this week: `/p/import` accepts the VisitRecall JSON export (the service closed today) and turns each visit into a patient recap, with an optional doctor invite.

**Local end-to-end test with mocks**
1. Run `CHARTSIDE_ENGINE=local npm run dev`, with Twilio in mock mode (the existing telephony mock or the SMS outbox table).
2. Write a Playwright spec, `tests/e2e/patient-invite.spec.ts`:
   - Open `/p` and grant a fake mic (Chromium `--use-fake-device-for-media-stream` with a WAV fixture, or inject a `DEMO_PATIENTS` transcript through the existing demo path).
   - Select state CA and assert that Record stays disabled until "Doctor approves" is tapped.
   - Stop, then assert the recap renders with the med change.
   - Create a family link and open it in a new context. Assert the recap is visible and no MRN or doctor-only fields appear.
   - Invite an NPI from the fixture. Read the mock SMS outbox and assert the body contains no name or DOB (regex for the fixture patient name).
   - Open the claim link, complete the NPI claim, and assert a draft appears in the swipe stack with the "patient-shared" banner.
   - Assert the loop events.
3. Add a unit test that feeds VisitRecall JSON fixtures to the importer.

### 2. "Call your standardized patient": OSCE practice with a graded note scorecard
**Aha in 60 seconds.** A med student calls the number and a tired-sounding "Mr. Alvarez, 58" describes chest pressure. After 7 minutes the student hangs up and gets a text: "History 14/18. Missed: exertional pattern, family history. Your note: 82. See the model note." They screenshot the scorecard for the class group chat.

**MVP (overnight)**
- Extend `DEMO_PATIENTS` into OSCE cases. Each case gets a hidden `facts` list, a checklist of things that must be elicited, and a persona prompt.
- Add a Line mode: `/api/voice` routes a caller who enters a practice code (for example "press 7") to `telephony/live.ts` with an SP persona. In local mode, a scripted rule-based SP answers by keyword matching from the case facts, so no LLM is needed.
- Add `/osce/[sessionId]`: the transcript, a textarea or dictation for the student's note, and a Grade button.
- Grader, `src/lib/engine/osce.ts`:
  - Checklist coverage is computed deterministically by matching the student's questions in the transcript against the checklist items.
  - Note score = coverage of the case facts in the student's note, penalties for contradictions against the facts, and succinctness by length ratio. PDSQI-9 style attribute labels come from the LLM when it is enabled, and from heuristics when it is not.
- Scorecard OG image through the existing `og.tsx`, on the share route `/osce/s/[token]`. Synthetic patients only; keep an explicit "no real patient data" banner.
- Growth: the scorecard footer says "Practice free. Residents get Chartside free." It links into the NPI or student claim.

**Local end-to-end test with mocks**
- A Vitest unit test for `osce.ts` with a fixture transcript and note. Assert that the exact missed-item list and the score are deterministic.
- A Playwright spec that drives the browser phone simulator into practice mode, plays the scripted student questions from a fixture (the simulator already accepts typed utterances), hangs up, pastes the fixture note, grades, and asserts the score. It then opens the share URL in a logged-out context and asserts the OG meta tags and the no-PHI banner.
- For telephony, reuse the existing Twilio webhook tests with a mocked media stream carrying the mulaw fixture.

### 3. "Forward your pendant": Plaud AutoFlow and Omi to a Chartside inbox
**Aha in 60 seconds.** A doctor who already clips on a NotePin goes to Plaud AutoFlow, then "Send email", and pastes their Chartside address, which Chartside displays with a copy button and a QR code. They record a visit and sync. Before they reach the next room a Web Push arrives: "Note ready from Plaud, 99213, 1 item to check." Nothing new to wear or install.

**MVP (overnight)**
- Per-user ingest address: `ingest_addresses(user_id, local_part, secret)`. The UI lives in `/go/settings` as "Connect a recorder" with the Plaud, Omi and "any email" options.
- `POST /api/ingest/email` accepts the SES inbound webhook (or a generic MIME POST). It parses the Plaud email, extracts the transcript block, and creates an encounter with `source: "plaud"`. It then calls `processEncounter` and sends Web Push.
- Consent: the encounter is flagged "consent attested by clinician" and the swipe card asks for a one-tap attestation. Plaud has no consent capture of its own.
- Omi: `POST /api/ingest/omi?uid=` accepts the Omi "conversation created" webhook payload, using the same path.
- Security: an HMAC secret in the address, a reject list for unknown senders, and a size limit. Note in the README that SES inbound (HIPAA-eligible) should be used in production and Zapier should not.

**Local end-to-end test with mocks**
- Fixtures: `tests/fixtures/plaud-autoflow.eml` (a realistic MIME body with "Transcript" and "Summary" sections) and `omi-conversation.json`.
- Vitest: parse the fixture, assert that speaker turns are extracted, and assert that a bad HMAC is rejected.
- Playwright: POST the fixture to `/api/ingest/email` with the test address, then open /go/stack and assert that a card with source badge "Plaud" appears, and that signing it requires the attestation tap. Assert the push payload through the existing push mock.

### 4. `<chartside-button>` plus a PHI-blind MCP: the developer kit
**Aha in 60 seconds.** A telehealth startup developer pastes two lines into their visit page. A "Chart it" button appears. They talk for 30 seconds, and a `chartside:note` event fires with SOAP, ICD-10 and CPT. In Claude Code, they ask the Chartside MCP to "scaffold a webhook handler for note.signed", and it does.

**MVP (overnight)**
- `public/embed.js`: a small vanilla web component (no React) with a shadow DOM, MediaRecorder and chunk upload to `/api/v1/capture` using a token the host backend mints (`POST /api/v1/capture/token` with a secret key, which already exists). It emits `chartside:status` and `chartside:note` events, with a "Powered by Chartside" link.
- `src/app/embed-demo/page.tsx`: a fake "TinyEHR" host page for demos.
- `mcp/` stdio server using `@modelcontextprotocol/sdk`:
  - Dev tools: `get_openapi`, `mint_test_key`, `send_test_webhook`.
  - PHI-blind clinician tools: `queue_status` (counts only), `open_sign_stack` (returns a deep link), `start_line_call` (returns the tel: link and PIN).
  - The tools wrap `agent/tools.ts` but whitelist their output fields so no PHI can pass through.

**Local end-to-end test with mocks**
- Playwright on `/embed-demo` with a fake mic and the local engine. Assert that the `chartside:note` event payload has sections and codes, and that the host page cannot read the shadow-DOM transcript.
- A Vitest MCP test that spawns the stdio server with the MCP SDK client, calls `queue_status`, and asserts the result has only numeric fields (recursively reject any key in a PHI denylist such as `name`, `dob` or `mrn`).

### 5. "Invite the scribe to the call": a calendar-triggered telehealth bot
**Aha in 60 seconds.** The clinician adds `scribe@chartside.app` to tomorrow's Zoom invite. At start time, "Chartside Scribe for Dr. Lee (notes only)" joins and posts the consent line in chat. When the call ends, the note is waiting in the sign stack. There is no tab to share and nothing to remember.

**MVP (overnight)**
- `POST /api/ingest/calendar` parses an ICS attachment (from the inbound address in #3) and extracts the meeting URL and start time. It stores a `scheduled_bots` row.
- A cron (`/api/cron` exists) calls Recall.ai `POST /bot` behind `RECALL_API_KEY`, with a mock adapter when the key is unset.
- `POST /api/ingest/recall` takes the webhook for `bot.done` plus the transcript. It creates the encounter (consent method `telehealth-bot-announced`) and runs the pipeline.
- Production needs the Recall Enterprise BAA. Before then, keep this behind a feature flag.

**Local end-to-end test with mocks**
- A `RecallMock` adapter records `createBot` calls. The test clock advances to start time. The test then POSTs `tests/fixtures/recall-bot-done.json` (a transcript with two speakers) to the webhook, and asserts that the encounter exists, the consent is logged, and the card appears in the stack. Also add a unit test for the ICS parser with Zoom, Meet and Teams links.

---

## 12. Strongest single recommendation

**Build #1, "Bring your own scribe", first, with the VisitRecall import as its launch hook.**

It is the only idea here that turns a new population (patients and caregivers) into a free acquisition channel for clinicians, and the only one where no competitor closes the loop:
- Kin, Medcorder and Advoca stop at the family.
- Kin's EHR plan pulls data in, not clinicians.
- Abridge left the patient side in 2020.

It uses the most existing Chartside plumbing, including consent, share tokens, NPI claim, SMS, loops and the sign stack. The timing is good: VisitRecall stopped recording today and is telling its users to export JSON "for transferring information to another application."

Ship the OSCE scorecard (#2) the following night. It needs no PHI, it is the most TikTok-able format on this list, and it feeds the trainee pipeline that turns into doctors who claim patient invites.

---

## Sources

Patient-side and legal
- TechCrunch, Kin Health $9M seed (2026-05-18): https://techcrunch.com/2026/05/18/kin-health-raises-9m-to-build-an-ai-notetaker-for-patients/
- STAT, patients turn to AI scribes (2026-06-04): https://www.statnews.com/2026/06/04/after-doctors-patient-ai-scribes-track-visits/
- AHCJ, "Dear doctor: Your patient may be recording this visit" (2026-07-17): https://healthjournalism.org/blog/2026/07/dear-doctor-your-patient-may-be-recording-this-visit/
- KevinMD, recording is your legal right (2026-06-11): https://kevinmd.com/2026/06/recording-medical-visits-is-your-legal-right.html
- Becker's, 1 in 5 covert recording: https://www.beckershospitalreview.com/patient-experience/1-in-5-patients-no-strangers-to-covertly-recording-medical-visits/
- Physician experiences of patient-initiated recording (PMC): https://pmc.ncbi.nlm.nih.gov/articles/PMC13169550/
- Medcorder physician pitch: https://medcorder.com/blog/five-reasons-physicians-should-encourage-recording-doctors-visits/
- Medcorder app: https://apps.apple.com/us/app/medcorder-understand-your-doc/id1392651594
- VisitRecall closure notice (fetched 2026-09-30): https://www.visitrecall.com/
- Show HN, AI Doctor Notes (2026-05-20): https://news.ycombinator.com/item?id=48205825
- Show HN, Sidekick telehealth companion (2026-09-29): https://news.ycombinator.com/item?id=49894384
- Abridge origins: https://research.contrary.com/company/abridge and https://www.upmc.com/media/news/052020-upmc-abridge
- FTC Health Breach Notification Rule guidance: https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0

Meeting bots and telehealth
- Recall.ai pricing 2026: https://www.recall.ai/blog/new-recall-ai-pricing-for-2026 and https://www.recall.ai/pricing
- Recall.ai HIPAA (updated 2026-05-06): https://www.recall.ai/blog/recall-ai-is-officially-hipaa-compliant
- Recall.ai Desktop Recording SDK: https://www.recall.ai/product/desktop-recording-sdk
- Zoom RTMS GA (2025-06-25): https://developers.zoom.us/changelog/rtms/june-25-2025/
- Zoom HIMSS26 Clinical Notes in Epic (2026-03-10): https://hitconsultant.net/2026/03/10/zoom-himss-2026-epic-ehr-integration-ambient-ai-clinical-notes/
- Google Meet Media API overview: https://developers.google.com/workspace/meet/media-api/guides/overview
- Doxy.me April 2026 release notes: https://helpcenter.doxy.me/en/articles/14471108-what-s-new-april-2026
- Doximity Scribe: https://www.doximity.com/clinicians/scribe

AI assistants
- OpenAI, ChatGPT for Clinicians (2026-04-23): https://hitconsultant.net/2026/04/23/chatgpt-for-clinicians-openai-launch-gpt-5-4/ and https://openai.com/index/making-chatgpt-better-for-clinicians/
- PYMNTS, Epic in ChatGPT for Clinicians (2026-09-01): https://www.pymnts.com/news/artificial-intelligence/2026/openai-brings-epic-health-records-to-chatgpt-for-clinicians/
- OpenAI Healthcare Public Data help: https://help.openai.com/en/articles/20001489-using-healthcare-public-data-in-chatgpt-and-codex
- OpenAI app submission guidelines (PHI restricted): https://developers.openai.com/apps-sdk/app-submission-guidelines
- OpenAI, developers can submit apps: https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/
- BleepingComputer, Claude for Healthcare (2026-01-12): https://www.bleepingcomputer.com/news/artificial-intelligence/anthropic-brings-claude-to-healthcare-with-hipaa-ready-enterprise-tools/
- Claude HIPAA-ready Enterprise: https://support.claude.com/en/articles/13296973-hipaa-ready-enterprise-plans
- GitHub issue, HIPAA blocks custom MCP (2026-05-21): https://github.com/anthropics/claude-ai-mcp/issues/339
- Strac, Claude BAA coverage: https://www.strac.io/blog/is-claude-hipaa-compliant
- MCP Apps (2026-01-26): https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- PatientNotes MCP: https://glama.ai/mcp/servers/JobXDubai/patientnotes-mcp
- HappyScribe MCP: https://www.happyscribe.com/blog/mcp-server

Wearables and car
- Plaud MCP and CLI (2026-09-22): https://global.plaud.ai/blogs/news/introducing-plaud-mcp-and-cli
- Plaud developer docs: https://docs.plaud.ai/documentation/get_started/overview and https://docs.plaud.ai/llms.txt
- Plaud SDK: https://github.com/Plaud-AI/plaud-sdk
- Plaud healthcare: https://www.plaud.ai/pages/healthcare-solution
- Plaud AutoFlow: https://support.plaud.ai/hc/en-us/articles/50835520394009-AutoFlow
- Plaud on Zapier: https://zapier.com/apps/plaud/integrations
- TikTok, Plaud AI medical scribe: https://www.tiktok.com/discover/plaud-ai-medical-scribe
- Omi integration apps: https://docs.omi.me/doc/developer/apps/Integrations and https://github.com/BasedHardware/omi/issues/11365
- Meta, build for display glasses (2026-05-14): https://developers.meta.com/blog/build-for-display-glasses/
- UploadVR, DAT public preview (2025-12-04): https://www.uploadvr.com/meta-wearables-device-access-toolkit-public-preview/
- 9to5Mac, CarPlay voice-based conversational apps (2026-02-18): https://9to5mac.com/2026/02/18/ios-26-4-adds-support-for-voice-based-ai-apps-to-carplay/
- MacRumors, CarPlay ChatGPT/Claude/Gemini: https://www.macrumors.com/2026/02/18/ios-26-4-carplay-support/
- Home health AI documentation 2026: https://worldviewltd.com/blog/home-health-clinical-documentation-strategies-2026

Embeddable, trainees, quality
- Twofold, scribe partner programs: https://www.trytwofold.com/compare/best-ai-scribe-partner-programs
- Heidi free for trainees: https://www.heidihealth.com/en-us/trainee-sign-up
- NEJM AI, AI-standardized clinical exam RCT: https://ai.nejm.org/doi/abs/10.1056/AIoa2500066
- npj Digital Medicine, CPX-MATE naturalistic adoption (2026): https://www.nature.com/articles/s41746-026-03024-3
- MLAbuddy: https://www.mlabuddy.co.uk/
- Suki, PDQI-9 critique: https://www.suki.ai/whitepapers/one-score-nine-dimensions-zero-signal-the-problem-with-holistic-likert-ratings/
- PDQI-9 ambient scribe evaluation: https://pmc.ncbi.nlm.nih.gov/articles/PMC12586549/
- LLM-as-judge with PDSQI-9: https://www.nature.com/articles/s41746-025-02005-2

Launches
- TechCrunch, YC W26 demo day (2026-03-26): https://techcrunch.com/2026/03/26/16-of-the-most-interesting-startups-from-yc-w26-demo-day/
- Extruct, YC W26 breakdown: https://www.extruct.ai/research/ycw26/
- Extruct, YC S26 list: https://www.extruct.ai/data-room/ycombinator-companies-s26/
- Show HN, Notation for PTs (2026-03-05): https://news.ycombinator.com/item?id=47259848
- Show HN, Trayce WASM scribe (2026-02-03): https://news.ycombinator.com/item?id=46865563
- Show HN, Adentris (2026-04-02): https://news.ycombinator.com/item?id=47617852
