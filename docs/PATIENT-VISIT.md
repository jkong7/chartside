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
2. `/visit/c/{token}` shows only the visit time and date. The link alone opens nothing. How they confirm depends on how the offer reached them, and there is no other way in:
   - **Offered by email.** The page names the masked address ("d•••@clinic.org"). They type the full address. If its keyed hash doesn't match the one stored for this visit, they see "That isn't the email this draft was offered to" and no email is sent. If it matches, a sign-in code goes to that address. Redeeming it signs into (or creates) the account for that email, an active guest is merged by `mergeGuest`, and only that account, with that code redeemed in the last 30 minutes, can claim. A signed-in account with a different email, or an account someone made with that email and a password but never proved, is refused.
   - **Offered by text.** The page says "the number ending in 0142" and has **Text me a code**. A 6-digit code goes to the stored number (single use, 10 minutes, 5 tries, 30 seconds between sends, 5 an hour). A right code sets a sealed, 30-minute, httpOnly proof cookie tied to this visit. Then they sign in or make an account with an email code (or use the session they already have), and claim.
   - **A link the patient shared.** No contact was given, so the only proof is an NPI whose registry surname matches the clinician name the patient typed for this visit, and whose state matches. Every claimant does this, signed in or not, on every visit. A matched NPI saved on an account from an earlier offer counts for nothing on a new one. The patient must give a name before a shareable link is made. Without a session, a guest with the NPI badge is created through `claimNpi` and the stack shows the usual "Save this note" banner. With a session, the draft goes to that account, and its own NPI must not differ or belong to another account.
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

**Contact storage.** The clinician's contact is never stored in plain text. `patient_visits` keeps its kind, a keyed HMAC (`keyedHash` in `src/lib/fhir/crypto.ts`, keyed by `CHARTSIDE_SECRET`) of the normalized value, and a sealed copy (`seal`, AES-GCM with the same key). The sealed email is dropped once the offer email is sent, and the sealed number once the offer is claimed or withdrawn, since it's only needed to text the claim code. Making a shareable link or withdrawing clears all of it. Audit rows carry a separate keyed HMAC of contacts, never a bare hash.

**Holder design.** Each visit has its own "holder" user, an isolated guest-like user and org with the email domain `patient.chartside.invalid` and no password. The holder never gets a session. The patient's credential is the random link token, stored hashed. Reusing a user lets the whole capture, consent, audio encryption and drafting stack run unchanged. Expiry uses `guest_expires_at`, so the existing guest purge deletes old visits, and `patient_visits` cascades with the user.

## Safety and PHI rules

- No clinical content in any text or email. Tests scan every message for patient names and diagnoses.
- Nothing about the patient is shown to the clinician before they confirm. The offer link is not a credential by itself: an emailed offer needs a code sent to that email, a texted offer needs a code texted to that number plus an account, and a shared link needs a matching NPI for that visit. Offer links are single use, hashed, expire in 7 days, and can be withdrawn.
- Residual risk: whoever controls the clinician's inbox or phone can claim, as with any code sign-in. On a shared link, someone who knows the clinician's name, NPI and state and also has the link can claim, which is why the patient is steered to give a mobile or email.
- Consent is on the ledger before any audio is accepted, and all-party states are enforced on the server.
- Unsaved patient data is purged after 7 days, or 90 once saved. "Delete everything" is immediate.
- Rate limits apply per IP, per contact and per day. One IP can start 30 visits a day (`CHARTSIDE_VISIT_IP_DAILY_CAP`), and the overall daily ceiling is 20000 (`CHARTSIDE_VISIT_DAILY_CAP`), high enough that a few IPs can't lock every patient out. Wrong emails on one offer lock after 20 an hour.
- Uploads are streamed with a byte counter and cut off with a 413 past the limit, even without a Content-Length. One patient visit holds at most 60 MB of audio (`CHARTSIDE_VISIT_MAX_MB`). The recorder asks for 32 kbps, so that is over four hours, and still an hour on phones that ignore the request and record at 128 kbps. The recorder already stops itself at 2 hours. When the cap is hit, the recorder finishes and writes the recap from what was saved.
- "Delete everything" runs under the same per-visit lock as uploads, so an upload in flight either lands first and is deleted, or finds the visit gone. The audio folder is removed again after the database rows.
- Every step is audited, and contacts in the audit log are keyed hashes.
- Security details: `docs/SECURITY-GHOST.md`, findings 22 to 29.

## Tests

- **Unit:**
  - `tests/unit/visit-recap.test.ts` (6): lay recap, dates, questions, plain reading level, PDF text
  - `tests/unit/patient-visit.test.ts` (24): holder isolation and purge, the consent method, the all-party rule, decline, contact parsing, recap, family link and revoke, delete, save, the offer text (PHI-free, sent once), keyed and sealed contact storage, the text-code claim (a stranger's account refused, wrong code, single use, a proof cookie from another visit refused, guests refused), text code lockout after 5 tries, the email claim (wrong email refused with no email sent, a stranger's proven account and a password squatter refused, the right email's code claims), the per-visit NPI rule (a guest's NPI from offer A refused on offer B, signed-in accounts need the NPI too), a name before a shared link, expiry, withdraw, per-IP and overall daily caps, the per-visit audio cap with an early 413 on a chunked upload, delete racing uploads, keyed audit hashes
  - `tests/unit/capture-body-limit.test.ts` (4): chunked raw and multipart uploads stop at the limit, a declared length over it is refused, uploads under it still read
- **E2E:** `tests/e2e/patient-visit.spec.ts` (4, at phone width):
  - the full loop: fake mic, clinician tap, recap, PDF, family link and revoke, save text, the clinician text through the Twilio mock, a stranger with a verified email refused, the text-code claim (wrong code, right code, then email sign-in), the stack badge and transcript, sign, link reuse refused, delete, and axe checks
  - the declined path
  - an all-party California visit claimed through the shared link with an NPI, a stranger's account refused, then the same NPI guest refused on another clinician's shared link
  - an email offer: a stranger's own email refused with the generic message, then the offered email's code claims

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
