# Bring your own scribe (`/visit`)

Branch `interface/patient`.

## The bet

Patients already record their own doctor visits with apps like Kin, Medcorder and VisitRecall, and Abridge started as one. Every one of them stops at the patient. Chartside closes the loop:

1. The patient's recording, made with the clinician's OK, becomes a plain-English recap the patient keeps and can share with family.
2. A draft note is offered to the clinician who was in the room.

That offer is how clinicians find Chartside for free: every patient becomes an inviter. Nobody else sends the draft back to the clinician. Research: `docs/research/_raw-new-interfaces-2.md` (idea #1) and `docs/research/_raw-onboarding-2.md` (white space #5 and bet #3).

## The flow

**Patient** (phone, no app, no account):

1. At `/visit` the patient reads what it does and the FAQ (is it legal, who sees it, how to delete). They enter an optional first name and their state (guessed from the time zone), then tap **Record my visit**.
2. They get a private page, `/visit/r/{token}`. It says "Ask your clinician first" and has an "I'm handing my phone over" button.
3. The clinician sees "Maria would like to record this visit for their own notes. A draft note can be offered to you. OK to record?" with **Agree** and **Not today**. Optionally they add their name and a mobile number or email for the draft. In an all-party state (`ALL_PARTY_STATES`), they check whether anyone else is in the room, and Agree stays disabled until they confirm everyone agreed.
4. On Agree, the consent is written to the ledger with the new method `clinician_tap_patient_device`, and recording starts on its own. The recorder works like `/go`: 5-second chunks, retry and backoff that survive a dropped connection, a wake lock, pause and resume, and a "Visit is over" button. If the page is reloaded mid-visit, the patient can write the recap from what was saved.
5. The server drafts the note as usual (`processEncounter` under the holder). The page then shows the recap:
   - a headline
   - what you talked about
   - diagnoses in lay words, with the chart term alongside
   - medicines tagged New, Stop, Higher dose and so on
   - next steps with approximate dates ("around Wednesday, October 14", "in December 2026")
   - questions to ask next time
   - when to get help
6. Below the recap:
   - **Your own notes**
   - **Share with family**: a read-only `/visit/f/{token}` link that lasts 7 days and can be revoked
   - **Offer the draft to your doctor**: a copy or share link when no contact was given, or the status of the text that went out
   - **Keep this page**: texts or emails a PHI-free link and keeps the visit 90 days
   - **Download as PDF** (the existing `textPdf` writer)
   - **Delete everything**
   - the full conversation
   - a PHI-free footer: "Recorded with Chartside. Clinicians: get this note as a draft, free."
7. **Declined.** Nothing is recorded, and the patient gets a notes-only page with prompts, save, family share and PDF.

**Clinician:**

1. If they left a mobile number or email, then once the recap is ready they get exactly one message: "A patient recorded your 3:40 PM visit with Chartside and offered you a draft note. Review it free: https://…/visit/c/…". There's no PHI in it, and `sendText` refuses anything PHI-shaped.
2. `/visit/c/{token}` shows only the visit time and date. They confirm who they are with either:
   - **an email code**, which reuses `/api/auth/magic`. A new email creates an account. An existing email signs into that account, and an active guest is merged by `mergeGuest`.
   - **an NPI**, offered only when the patient typed a clinician name. It must match the registry surname and state, and it creates a guest with the NPI badge through the existing `claimNpi`. The stack then shows the usual "Save this note" claim banner.
3. The draft is copied into their org as an unmatched visit: transcript, consent record, and a note drafted with their own template. It lands at `/go/stack?focus=…` titled "(from a patient's recording)", with a "From a patient's recording" badge and a "Read the conversation the patient recorded" panel. They edit and sign as usual.
4. The patient's page then says the clinician accepted. The patient's copy stays the patient's.

## Where the code lives

| Piece | File |
|---|---|
| Recap engine, offline | `src/lib/engine/visitRecap.ts` |
| Recap with Claude, when a key is set | `visitRecapWithClaude` in `src/lib/llm.ts` |
| Holder, consent, upload, recap, family, save, delete, offer, claim | `src/lib/server/patientVisit.ts` |
| Table | `patient_visits` in `src/lib/db.ts` |
| Consent method | `clinician_tap_patient_device` in `ConsentRecord`, and its statement in `recordConsent` |
| API | `src/app/api/visit/**` |
| Pages | `/visit`, `/visit/r/[token]`, `/visit/f/[token]`, `/visit/c/[token]`, and the OG image |
| UI | `src/components/visit/*` |
| Stack badge | `fromPatient` in `decisions.ts`, rendered in `Stack.tsx` |
| Loop metric | `patient_visit` in `loops.ts`: offer sent or link made is an exposure, offer page opened is a click (deduped per visitor), then signup and activation through the loop cookie or the guest's `acq_loop` |
| Links in | Home page footer, the existing patient recap footer (`ShareView`), and `/line?src=patient_visit` |

**Holder design.** Each visit has its own "holder" user, an isolated guest-like user and org with the email domain `patient.chartside.invalid` and no password. The holder never gets a session. The patient's credential is the random link token, stored hashed. Reusing a user lets the whole capture, consent, audio encryption and drafting stack run unchanged. Expiry uses `guest_expires_at`, so the existing guest purge deletes old visits, and `patient_visits` cascades with the user.

## Safety and PHI rules

- No clinical content in any text or email. Tests scan every message for patient names and diagnoses.
- Nothing about the patient is shown to the clinician before they confirm with an email code or a matching NPI. Offer links are single use, hashed, expire in 7 days, and can be withdrawn.
- Consent is on the ledger before any audio is accepted, and all-party states are enforced on the server.
- Unsaved patient data is purged after 7 days, or 90 once saved. "Delete everything" is immediate.
- Rate limits apply per IP, per contact and per day. Every step is audited, and contacts are hashed in the audit log.
- Security details: `docs/SECURITY-GHOST.md`, findings 22 to 29.

## Tests

- **Unit:**
  - `tests/unit/visit-recap.test.ts` (6): lay recap, dates, questions, plain reading level, PDF text
  - `tests/unit/patient-visit.test.ts` (15): holder isolation and purge, the consent method, the all-party rule, decline, contact parsing, recap, family link and revoke, delete, save, the offer text (PHI-free, sent once), verify-before-claim, single use, expiry, withdraw, NPI name and state matching
- **E2E:** `tests/e2e/patient-visit.spec.ts` (3, at phone width):
  - the full loop: fake mic, clinician tap, recap, PDF, family link and revoke, save text, the clinician text through the Twilio mock, the email-code claim, the stack badge and transcript, sign, link reuse refused, delete, and axe checks
  - the declined path
  - an all-party California visit claimed through the shared link with an NPI

## Live check (2026-09-30)

A sample blood pressure visit was run through `visitRecapWithClaude` with a real key.

- The recap kept the lisinopril change from 10 mg to 20 mg exactly, listed the lab test next week and the visit in 4 weeks, and turned the warning signs into plain words ending with "Call 911 for any emergency."
- The first headline counted 2 next steps against a list of 3. The prompt now requires the headline counts to match the lists, and a rerun matched.

## What's left

- Resuming a recording after a page reload only finishes with what was saved. A second MediaRecorder stream can't be appended to the first file.
- An NPI lookup picker on the patient side, instead of a typed name.
- Fax cover sheet delivery for offices without a mobile number.
- Importing VisitRecall exports (that service closed 2026-09-30).
- A written FTC Health Breach Notification process for the patient side.
- Spanish UI for the patient pages. The recap engine is English only offline, and Claude could translate it.
- A post-claim "record your own visits" prompt to convert the clinician to the Line or `/go`. The existing next-time card covers part of this.
