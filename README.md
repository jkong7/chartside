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
8. **Billing.** Signing turns the note and accepted orders into a professional claim with E/M and modifier 25, G2211, point-of-care tests (QW), vaccine product and administration codes, diagnosis pointers, and place of service. Payer-style claim edits run on it. Missed revenue is listed with dollar values. Prior-authorization packets score payer criteria against transcript evidence and draft a medical-necessity letter. The **Revenue** page is a pre-bill review queue (approve, hold, submit, 837P export), a missed-revenue report, and a prior-auth worklist.
9. **Insights.** Median time to sign, unedited-sign rate, after-hours signing, evidence coverage, omissions caught, capture rate by visit type, coaching, and learned rules.

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

## Audio & speech

- **Recording.** The browser records Opus audio in 4-second chunks. Chunks go into an IndexedDB-backed upload queue that survives network drops and page reloads, and retries with backoff. The server stores chunks per visit, serves the stitched recording with HTTP Range support, and deletes it per the retention policy (default: at signing).
- **Live captions.** With `DEEPGRAM_API_KEY`, the server mints a 60-second Deepgram token. The browser streams to Nova-3 over `wss` with `["bearer", token]` subprotocols, so the key never reaches the browser, using `diarize=true` and `language=multi` for Spanish–English code-switching. Without a key, captions fall back to the browser's speech engine. Speakers are then separated on-device by clustering per-utterance pitch and spectral centroid, and mapped to clinician, patient or interpreter from what each voice says.
- **Post-visit pass.** When the visit ends, the full recording is re-transcribed with diarization and utterance timestamps. It replaces the live transcript (kept in the audit artifacts) before the note is drafted.
- **Interpreted visits.** Every line is language-tagged. Source/rendition pairs are checked for mismatched numbers, dropped negations, changed laterality, and medication names (for example "cada cuatro horas" rendered as "every six hours").
- **Review.** Click any sentence, then **Play source** to hear the exact audio behind it.
- **Resilience.** Microphone mute or ended events (phone calls, Bluetooth drops) show an interruption banner and resume automatically. A silent-mic alarm catches muted inputs. Media Session handlers give lock-screen pause and resume on phones.

## Architecture

```
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
    server/               SQLite repositories, auth, pipeline, seeding, insights
    db.ts                 node:sqlite schema (no native dependencies)
```

**Two engines, one verifier.** With `ANTHROPIC_API_KEY` set, Claude (`claude-opus-5` by default) drafts the note as structured JSON that cites utterance IDs. It also translates summaries into any language and handles free-form assistant requests. Without a key, the deterministic on-device engine does all of this offline. Either way the on-device engine re-verifies the draft: it scores evidence, flags unsupported numbers, detects omissions, computes codes, and stages orders with safety checks. If Claude errors or declines, Chartside falls back to the local engine and says so in the note.

## Run it

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
npm install
npm run dev            # http://localhost:3100
```

Create an account. Each new account gets today's five-patient demo clinic plus two weeks of signed history. Open a visit, record consent, and choose **Play demo conversation** to watch a full visit, or **Start listening** in Chrome to use your microphone.

Optional configuration is in `.env.example`: `ANTHROPIC_API_KEY`, `CHARTSIDE_MODEL`, `CHARTSIDE_ENGINE=local`, `DEEPGRAM_API_KEY`, `SMART_CLIENT_ID`/`SMART_ISS`/`SMART_ALLOWED_ISS`, `CHARTSIDE_SECRET`, and `CHARTSIDE_DB`.

## Tests

```bash
npm test               # 69 unit tests: extraction, notes, verification, coding, orders, summaries, style, speech, billing, prior auth, FHIR mapping, SMART flow, Claude + Deepgram (mock servers)
npm run test:e2e       # 21 Playwright end-to-end flows against a production build, mock Deepgram and SMART/FHIR servers, and a fake microphone
npm run typecheck
```

The end-to-end suite covers:
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
- the revenue cycle: claim edits, approve, submit, 837P, prior auth, and the Revenue queue
- an Epic-style EHR launch (sign-in resume, chart and encounter import, note write-back), a standalone connection with resync and a filing-error state, and refusal of unknown EHRs

## Notes

Chartside is a demonstration product. The demo patients are fictional. Do not use it with real patient data without a HIPAA business associate agreement, a security review, and your organization's approval. Coding and order suggestions are decision support and must be reviewed by a licensed clinician.
