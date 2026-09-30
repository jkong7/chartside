# Security review: the ghost interface

A review of the endpoints added on `interface/ghost`:

- capture
- capture and device tokens
- magic links, guests and phone identity
- decisions
- the agent
- growth and loop analytics
- the voice routes

Each finding has a severity, a status and the file it lives in. "Fixed" means the change is in this branch with a test.

## Threat model in one paragraph

The new front doors accept audio and identity from places the web app never did: phone numbers, SMS links, email links, iOS Shortcuts and anonymous guests. The main risks are:

- someone reading PHI they shouldn't through a link, token or spoofed caller ID
- someone committing a clinical action (signing, sending, ordering) from a channel without a screen
- unauthenticated endpoints being abused to create accounts or send messages

Data at rest and the existing web app are covered by the earlier reviews.

## Findings

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Device keys (`captureTokens.ts`, `capture.ts`) | A 30-day iPhone Shortcut key could read the note text of visits it uploaded through `GET /api/capture/{id}/note`. A leaked Shortcut would expose those notes for a month. | High | **Fixed.** Device keys are marked in `capture_tokens.device` and get a 403 on the note endpoint. They can still upload and read status, which carries no PHI. Unit test in `tests/unit/capture.test.ts`. |
| 2 | Guests (`/api/auth/try`) | Unauthenticated guest creation had no limit, so a script could fill the database with guest users and orgs. The 2-hour purge cleans them up, but only afterward. | Medium | **Fixed.** Per-IP limit of 20 per hour (`CHARTSIDE_GUEST_RATE`), HTTP 429. |
| 3 | Magic links (`/api/auth/magic`, `/verify`) | The per-email throttle (30s, 6 per hour) stopped repeat sends to one address, but one IP could send codes to many addresses (email bombing), and verify had no per-IP cap. | Medium | **Fixed.** Per-IP limits: 30 requests and 60 verifies per hour (`CHARTSIDE_AUTH_RATE`). Codes still lock after 5 wrong tries and expire in 10 minutes. |
| 4 | Magic link page (`/m/{token}`) | The link token is in the URL path. If the page ever loads a third-party resource, the Referer header would carry it. | Low | **Fixed.** `referrer: no-referrer` on the page. The token is also single use, and redeeming it needs a POST. |
| 5 | Rate limits | The limiter is in memory, per instance. With more than one Cloud Run instance, each has its own counters. | Low | Open. Acceptable at one instance. Move to the database or Redis before scaling out. |
| 6 | Capture body size | `/api/capture` reads up to 100 MB into memory per request. Only authenticated users and token holders can reach it, but ten parallel uploads would use about 1 GB. | Low | Open. Put a request-size limit at the proxy (Cloud Run allows 32 MB per request by default, which also caps this) or stream to disk. |
| 7 | Agent (`agent/`) | Prompt injection: patient messages and note text reach the model through tools, and a malicious message could tell the model to propose something. | Low | Mitigated by design. Every write tool only calls `proposeDecision`, and approval needs a screen channel (`stack` or `web`), enforced in `actOnDecision`. There is no sign, order, claim or send tool. Proposed note edits are checked against the note's content hash at approval. |
| 8 | Decisions (`decisions.ts`) | Approvals from voice, SMS or the agent. | None | By design, `approve` and `reject` throw 403 unless the channel is `stack` or `web`. A voice caller can only snooze or propose. Unit tested. |
| 9 | Loop analytics (`loops.ts`, `/r/{code}`) | Clicks and exposures are written by unauthenticated requests, so a script without cookies can inflate counts. They are deduped per visitor cookie for 24 hours. | Low | Open, by design. The metrics are marketing counts with no PHI. Credits are only granted on a referred account's first signed note, never on clicks. |
| 10 | Referral credits | Self-referral and credit farming. | Low | Mitigated. Self-referral is blocked, credit comes only from a real signed note, one credit per referred account, the referrer is capped at 12 months, and there is no cash. |
| 11 | NPI claim | NPPES is public, so anyone can type any NPI. | Low | Mitigated. The badge is labeled self-attested and grants nothing. One account per matched NPI, and the name and state must match. |
| 12 | Voice webhook (`/api/voice/incoming`) | Correctly rejects unsigned and forged Twilio signatures when `TWILIO_AUTH_TOKEN` is set. In production without the token it returns 503 unless `CHARTSIDE_ALLOW_UNSIGNED_VOICE` is set. With that flag, anyone could POST `From=<a clinician's number>` and get a call token for that clinician. | Medium if the flag is set | **Fixed** by the telephony owner. The unsigned-voice flag is removed, and production answers 503 without `TWILIO_AUTH_TOKEN`. |
| 13 | Voice webhook origin | `publicOrigin` trusts `X-Forwarded-Host` when `CHARTSIDE_PUBLIC_URL` is unset. A forged host can't pass the signature check (Twilio signs the real URL), but the stream URL in the TwiML would point at the forged host. | Low | **Fixed.** `publicOrigin` no longer trusts `X-Forwarded-Host`. |
| 14 | Call token (`telephony/token.ts`) | Sealed with AES-GCM, 2 to 5 minute TTL, and bound to the `callSid` from the stream's start frame. But it isn't single use: within the TTL the same token could open a second stream for the same call. | Low | **Fixed.** `claimCallStart` makes each `callSid` single use, and an e2e replay gets close code 1008. |
| 15 | Browser-phone sim (`/api/voice/sim/start`) | Unauthenticated, no rate limit, and it creates a phone guest (user plus org) on every call without a session. It also spends Deepgram credit on each call. | Medium | **Fixed.** Limited per IP per hour (`CHARTSIDE_SIM_RATE`, default 12) with an overall daily cap (`CHARTSIDE_SIM_DAILY_CAP`, default 300). |
| 16 | Sim inbox (`/api/voice/sim/messages`) | The inbox key is a sealed `{phone, exp}` that is valid for 6 hours, and it covers only `+1555…` simulator numbers. | None | Fine as is. |
| 17 | Caller ID spoofing | A spoofed caller ID reaches a verified clinician's account. | Mitigated | Without the PIN a call can only record into a new unmatched visit and hear that visit's own read-back (`phiScope: "call"`). The schedule, other patients and chart questions need the PIN. The PIN is scrypt-hashed and locks for 30 minutes after 5 misses. |
| 18 | SMS content | PHI in texts. | Mitigated | Texts carry only a time, a count and a sign-in link. The e2e tests scan every text against patient names and diagnoses. Login links are single use, last 15 minutes, respect MFA, and only redirect to same-site paths. |
| 19 | Guest data | Unclaimed PHI with no accountable user. | Mitigated | Guests are purged with their audio after 2 hours (`CHARTSIDE_GUEST_HOURS`). They can't sign, share, create keys, invite or message patients. |
| 20 | Email vendor | SendGrid does not sign a BAA. | Mitigated | Email carries only codes and links. Switch to a BAA-covered provider before any PHI goes by email. |
| 21 | Preferences (`PATCH /api/auth/me`) | The endpoint merged any `prefs` keys, so a user could write `prefs.npi` with `matched: true` and fake a badge, or squat on another clinician's NPI so their real claim reads "already on another account". | Medium | **Fixed.** Server-managed prefs (`npi`, `invitePromptSeenAt`) are stripped, `clinicNudgeHour` is validated to 12 through 20, and `textOptOut` is coerced to a boolean. Covered in `tests/e2e/settings.spec.ts`. |

## Checked and fine

- **Open redirects:** `safePath` rejects `//host`, `/\host`, schemes and CRLF, and the `/r/{code}` redirect target is fixed.
- **Session fixation:** redeeming a magic link for a different user ends the current session before starting the new one.
- **CSRF:** the session cookie is `SameSite=Lax`, so cross-site form posts to `/api/capture` and `/api/decisions` don't carry it. Magic-link redemption is a POST from our own page.
- **Token storage:** capture tokens, login links, codes and PINs are stored only as hashes (SHA-256 for random tokens, scrypt for PINs). Device key lists never return the token.
- **Tenant scoping:** captures, decisions, proposals and the agent's tools all go through the existing org- and clinician-scoped repositories. Tests show a stranger's token or session gets a 404.

## Telephony follow-ups

Findings 12 to 15 are fixed. The texting webhook (`/api/sms/incoming`) validates the Twilio signature exactly like voice and returns 503 without a token, and the e2e checks both the 403 and that replies carry no PHI.

## Patient-held recordings (`/visit`, "bring your own scribe")

A patient records their own visit on their phone, and the clinician can be offered a draft note. This adds unauthenticated patient endpoints and a new path by which a clinician receives PHI they didn't capture.

| # | Area | Risk | Status |
|---|---|---|---|
| 22 | Holder isolation (`patientVisit.ts`) | Patient audio must not mix with clinician orgs. | **By design.** Each visit gets its own holder user (`@patient.chartside.invalid`, no password, `guest_expires_at` set) in its own org. The holder never gets a session: the patient's only credential is the 32-byte random link token, stored as a SHA-256 hash. Holders can't sign or share (they're guests), and the capture and consent code paths are the same ones clinicians use. |
| 23 | Consent before audio | Audio kept before the clinician agrees. | **Enforced on the server.** `/api/visit/{token}/audio` refuses anything until `recordVisitConsent` has written a `clinician_tap_patient_device` row to the consent ledger. In all-party states, a grant with others in the room needs `allPartiesConfirmed` (422 otherwise). Declined visits never get an upload target. The clinician-side consent route no longer accepts that method, so it only comes from the patient's device. Unit and e2e tested. |
| 24 | Clinician offer link (`/visit/c/{token}`) | The link reaches a phone or inbox we can't verify, and the patient may type the wrong contact. | **Mitigated.** The text or email has no PHI (only the visit time and a link; `sendText` refuses PHI-shaped text, and the e2e scans every message). The offer page shows only the time and date. PHI appears only after the clinician confirms who they are with an emailed code, or with an NPI whose registry surname matches the name the patient typed and whose state matches. The offer token is stored hashed, is single use (cleared at claim, atomically), expires in 7 days (`CHARTSIDE_VISIT_OFFER_DAYS`), can be withdrawn by the patient, and dies when the patient deletes the visit. |
| 25 | NPI claim | NPI numbers are public. | **Mitigated, residual risk accepted.** NPI alone is not enough: it must match the name the patient entered, the state must match the registry, and it creates a short-lived guest that must save with an email to keep the note. Someone who knows the clinician's name, NPI and state and also has the link could claim the draft. The email path is the default. |
| 26 | The clinician's copy | Mixing the patient's copy with the clinician's record. | **By design.** Claiming copies the transcript and consent record into a new unmatched visit in the clinician's org, labeled "From a patient's recording". The patient's copy stays theirs, and deleting it doesn't reach into the clinician's record (the patient is told this). No audio is copied. |
| 27 | Retention | Unclaimed patient data. | Patient visits are purged by the existing guest purge after 7 days (`CHARTSIDE_VISIT_DAYS`), or 90 after the patient saves the link. "Delete everything" removes the audio files, encounter, transcript, recap and holder at once. |
| 28 | Abuse | Visit creation, texting clinicians, and save links used to spam. | **Rate limited.** Per IP: 10 visits and 10 save links an hour (`CHARTSIDE_VISIT_RATE`), NPI attempts share the auth limit. A daily cap of 500 visits overall (`CHARTSIDE_VISIT_DAILY_CAP`). Per clinician contact: 5 offers a day (`CHARTSIDE_VISIT_OFFERS_PER_CONTACT`). Per patient contact: 5 save links a day. Every step writes an audit row (`patient_visit.*`) with hashed contacts only. |
| 29 | FTC Health Breach Notification Rule | The patient side is a personal health record, not HIPAA. | **Noted.** No ad pixels or third-party scripts on `/visit` pages, `referrer: no-referrer` on token pages, and no marketing in patient texts. A breach-notice process is still to be written before launch. |
