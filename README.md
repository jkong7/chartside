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
| **Order sets** | One-click bundles (diabetes annual, hypertension, fatigue, chest pain, urinary, adult preventive) plus organization and personal sets saved from a visit's orders. Duplicates are skipped and recent results are noted. |
| **PDF forms** (`/forms`) | Upload any fillable (AcroForm) PDF, map its fields once (Chartside guesses from field names), and fill it from any visit with editable values and a flattened download. |
| **Referral loop** | Importing a specialist's consult note closes the matching open referral task. |
| **Rehab therapy** | PT and OT daily notes and evaluations: interventions with minutes, objective measures, evaluation complexity (97161–97168), and units by the CMS 8-minute rule for Medicare or per service for other payers, billed with GP or GO and no E/M. |
| **Social needs** | Food, housing, transportation, utilities, cost-related medication underuse, unemployment, and isolation heard in the visit become Z-codes (Z59.x, Z91.120, Z56.0, Z60.2), count as "treatment limited by social determinants" in MDM risk when they change the plan, and open a community-resources task. |
| **Sharing** | Share a visit with a colleague (view or edit) or with an outside clinician by email. External links open only after a one-time code sent to that address, are view only, expire, can be revoked, and log every view. Behavioral health notes can't leave the organization, and admins can turn external sharing off. |
| **Research** (`/research`) | Admins enter their studies' criteria (age, sex, diagnoses, lab thresholds, exclusions). Each visit is pre-screened, possible matches show what still needs confirming, and a referral opens a task for the study team. |
| **Restricted notes** | Behavioral health notes open only for the author, their supervisor, or a colleague they shared with. Anyone else must break the glass with a reason, and every view, export, share, and break-the-glass open appears in the patient's access report (`/patients/[id]/access`, CSV export) for HIPAA access and disclosure requests. |
| **Clinician experience** | An in-app NPS survey after ten signed notes (snoozable), and an Impact panel that flags low ambient use, after-hours charting, and unsigned backlogs with a specific tip for each. |
| **Long visits** | Recordings stop at a configurable cap (`CHARTSIDE_MAX_RECORDING_MIN`, default 120) with a 30-minute warning, and notes stuck drafting after a crash are recovered automatically. |
| **Chrome extension** (`extension/`) | Side panel with today's notes beside any web EHR, section copy, and one-click push into EHR fields mapped by pointing at them once. |

## Platform and security

- **Public API** at `/api/v1` with an OpenAPI 3.1 spec at `/api/v1/openapi.json`: create patients and encounters, post a transcript (consent is recorded on first call), generate the note, and read JSON or FHIR. Organization API keys are hashed, scoped, and rate limited.
- **Webhooks** for `note.generated`, `note.signed`, `claim.status_changed`, `task.created`, and `message.received`, signed with HMAC-SHA256 in `Chartside-Signature: t=…,v1=…`, retried with backoff, and logged in Admin → Developers.
- **Patient delivery:** summary, intake, and reply-notification links go out by SMS (Twilio) or email (SendGrid) with no clinical content in the message; every attempt is logged in the patient's outbox. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SENDGRID_API_KEY`, `CHARTSIDE_EMAIL_FROM`, and `CHARTSIDE_PUBLIC_URL`; without them Chartside logs the attempt and offers the link to copy.
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

Create an account. This creates your organization with you as its owner. Each new account gets today's five-patient demo clinic plus two weeks of signed history. Open a visit, record consent, and choose **Play demo conversation** to watch a full visit, or **Start listening** in Chrome to use your microphone.

Optional configuration is in `.env.example`: `ANTHROPIC_API_KEY`, `CHARTSIDE_MODEL`, `CHARTSIDE_ENGINE=local`, `DEEPGRAM_API_KEY`, `SMART_CLIENT_ID`/`SMART_ISS`/`SMART_ALLOWED_ISS`, `CHARTSIDE_SECRET` (encrypts EHR tokens and SSO client secrets), `CHARTSIDE_DB` (SQLite path), `DATABASE_URL` (Postgres), `SSO_REDIRECT_URI` (override when running behind a proxy), and `CHARTSIDE_CODESETS_DIR` / `CHARTSIDE_LICENSED_DIR` (code-set locations).

## Tests

```bash
npm test               # 211 unit tests: extraction, notes, verification, coding, orders, summaries, style, speech, billing, prior auth, FHIR mapping, SMART flow,
                       # org scoping, RBAC, admin rules, OIDC token verification, SSO provisioning, Claude + Deepgram (mock servers),
                       # official code sets (hash verification, DOS release selection, pricing, HCC V28), diagnosis review, Medicare rules,
                       # NCCI/MUE/LCD logic, the claim lifecycle, co-signature and addenda, inbox triage and drafts, dictation grammar,
                       # snippets, letters and PDF output, eCQMs, calculators (published reference values), evidence retrieval, inpatient
                       # notes and hospital coding, nursing flowsheets, public API and signed webhooks, TOTP (RFC 6238 vectors), SCIM,
                       # behavioral health risk assessment, outside records (C-CDA, PDF), schedule import, note QA, telehealth channels,
                       # ED course and disposition, oncology staging and CTCAE grading, group therapy attribution, psychotherapy add-ons,
                       # SDOH Z-codes, visit sharing and one-time codes, research pre-screening, the 8-minute rule, procedures and
                       # J-code units, prenatal gestational age and flags, AcroForm filling, order sets, agenda, and access control
npm run codesets:build # re-download and rebuild the official code sets (verifies pinned hashes)
npm run test:e2e       # 65 Playwright end-to-end flows against a production build, mock Deepgram, SMART/FHIR, OIDC, and SendGrid servers, and a fake microphone
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
