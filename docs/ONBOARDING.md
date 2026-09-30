# Onboarding: fastest time to first note, no back-office overwhelm

Branch `interface/onboard`. Research: `docs/research/_raw-onboarding-2.md`.

## The bet

The browser phone already produced a readable note with nothing typed, faster than any scribe we looked at. But the home page sent new people to a five-field password form, new accounts landed on a 20-item back office with a survey before any value, and demos showed times in the server's time zone (a "1:17 AM call", visits at 3:30 AM). This branch makes the fast door the front door and keeps everything else out of the way until the clinician has signed a few notes.

## The flow

1. **Front door.** `/` leads with **Hear it write a note, no signup** (`/go/phone?autopilot=1`). **Create account** is the second button. Signed-in guests and clinicians on the simple nav go to `/go`, not `/today`.
2. **Sign up without a password.** `/register` asks for name, email and an optional NPI. We email a 6-digit code and a one-time link. After the code, the clinician lands on `/go?welcome=1`. If `CHARTSIDE_LINE_NUMBER` is set, a one-line card reads "Your line: call (312) 555-0199 before your next visit". Password sign-in still works for accounts that have a password, and invited team members still set one.
3. **Continue with Google or Microsoft.** This uses the existing OIDC code (discovery, PKCE, signature and nonce checks) and the same `/sso/callback`. The buttons show only when `CHARTSIDE_GOOGLE_CLIENT_ID` or `CHARTSIDE_MICROSOFT_CLIENT_ID` is set. Only a verified email is accepted (`email_verified`, or Microsoft's `xms_edov`). Domains that require SSO are refused, and accounts with two-step verification are sent to password or code sign-in. The Microsoft multi-tenant issuer (`{tenantid}`) is resolved from the token's `tid`. The tests cover Google against `tests/e2e/mock-oidc.mjs`. Microsoft uses the same code, but it has not been tried against the real tenant endpoints.
4. **One NPI fills the rest.** Typing 10 digits calls `/api/auth/npi` (NPPES, the same lookup as `/go/settings`). It fills name and credential, picks the specialty, and shows a "Found in the national NPI registry" badge. The taxonomy chooses the default template and note length (`src/lib/engine/specialty.ts`). For example, a physical therapist gets the PT daily note (brief), a clinical social worker gets DAP, and a psychiatric NP gets med management. At account creation the NPI is claimed exactly as in settings: the name must match, and the NPI must not already be on another account.
5. **Save a phone call with a text code.** A guest who called the line (or used the browser phone) sees **Text a code to •••-1234** on the stack. The code goes only to the number stored on the guest from that call, never to a number typed in. It works once, is limited to 5 tries, expires in 10 minutes, and is rate limited per number and per IP. If a real account already has that verified number, the guest's notes merge into it. Otherwise the guest becomes a phone-only account (placeholder email `…@phone.chartside.invalid`). A later email code attaches a real email to that account instead of creating a second account. The email path is one tap away ("Use my email instead"). On the browser phone, the code arrives in the phone's Messages tab.
6. **Simple nav until three signed notes.** New accounts get `prefs.simpleNav = true`: Record, To review, Patients, Settings, plus **Show all tools**. The full nav opens after three signed notes of the clinician's own (sample-clinic notes are excluded through `prefs.demoSigned`) or on click. Existing accounts, admins, owners of teams, and non-clinician roles always get the full nav. The rules are in `src/lib/nav.ts`.
7. **Survey after five signed notes**, counting only the clinician's own notes. Before, the sample clinic's signed history triggered the survey on the first screen.
8. **Paste an old note, we'll match it.** Under the first note on the stack (and in Settings), the clinician pastes one old note. `src/lib/engine/styleMatch.ts` reads, offline and deterministically: section order, heading names, bullets or prose per section, standard abbreviations, "Pt" or "client" wording, and overall length (mapped to the Brief, Standard or Detailed note length). A section much shorter than ours gets a word cap. When Claude is configured, it may add up to four "always add" or "never write" habits, and those are checked against the section keys. The clinician sees what we noticed, a before and after of the note they just made, and the rules we'll save. **Use my style** saves them as visible manual style rules (toggle or delete them in Settings) and rewrites the unsigned draft. Pasted notes with names, dates of birth, record numbers, SSNs or phone numbers are refused with a plain request to remove them. The sample is not stored.
9. **Times in the viewer's zone.** An inline script sets a `cs_tz` cookie from the browser. It is saved to `prefs.tz` at signup, at guest creation, at browser-phone calls, and on page loads. Spoken times on calls, texts ("your note from the 2:05 PM call"), push notices, stack card titles, `/today` day bounds, clinic nudge hours, recovery texts and the sample clinic day all use it, falling back to `CHARTSIDE_TZ`. The sample day is built on local wall-clock time, so 8:30 AM means 8:30 AM where the clinician is.
10. **Guest hygiene.** A guest's stack shows only note cards ("Your note", not "4 to review, 1 to fix first"), with no Full app link. Sign-up no longer adds the sample clinic unless the box is ticked. Engine names ("On-device clinical engine", model ids, "Claude was unavailable") are gone from the sidebar, the note footer, the history and warnings. Settings still describes the engine for owners.

## Causes of the wrong-zone times

- **Visits at 3:30 AM.** `seed.ts` used `Date.setHours` in the server's zone, which is UTC on Cloud Run. So an 8:30 visit was 08:30 UTC, and a Chicago browser showed 3:30 AM. Fixed with `wallTime(…, tz)` in `src/lib/tz.ts`. `/today` also counted "today" by server midnight. It now uses the viewer's day bounds.
- **The "1:17 AM call" text.** Every server-side time used a fixed `CHARTSIDE_TZ || "America/Chicago"`, whatever the caller's zone. It now uses the caller's saved zone.
- **Hostnames.** Nothing in `src/` hardcodes a hostname. Texted and emailed links come from `CHARTSIDE_PUBLIC_URL` (`publicOrigin`), which the deploy scripts already pin.

## Time to first note

`scripts/time-to-first-note.mjs` is a Playwright script: `BASE_URL=… MOCK_MAIL_URL=… RUNS=3 node scripts/time-to-first-note.mjs`. It measures from loading `/` to a readable note on the stack.

- **(a) No signup:** home CTA, browser phone, sample visit with skip, then open the texted link.
- **(b) Create account:** home, then sign-up, typing at 90 ms per character. It reads the email code from the mock mailbox. Then it records 20 s with the one-tap recorder.

The "before" run reaches the recorder from `/today` through the nav link. Both runs were local production builds on the same machine, with the offline engine, the mock Deepgram and the mock mail (3 runs each; medians).

| Path | Before (890433f) | After | Typed fields before the note |
|---|---|---|---|
| (a) No signup | 14.5 s | 14.5 s | 0 → 0 |
| (b) Create account | 28.6 s | 27.7 s | name, email, password (+ specialty, practice) → name, email, 6-digit code |

How to read these numbers:
- The local clock hides most of the change. The live measurement in the research was about 65 s for (a), because live speech and Claude drafting dominate. Both are mocked here.
- The main gain on (a) is that the zero-field door is now the primary button, not a secondary link. The clock is the same once you're in it.
- For (b), the time gain is small (0.9 s): 18 fewer password keystrokes, offset by the email code round trip. What changed more:
  - The new account lands on the recorder, not a 20-item back office with a survey.
  - The old run assumes the clinician finds "Quick record" in that nav. A realistic first-timer on `/today` would pick a demo patient and consent first, which takes longer.
  - With an NPI, name and specialty are filled from 10 digits.

## Safety and PHI

- Texts carry only a code or a link. The claim code goes through `sendText`, which refuses anything that looks like PHI. Browser-phone numbers (+1555) stay in the in-page outbox.
- Codes are hashed, single use, limited to 5 tries and 10 minutes, and throttled (30 s apart, 6 per hour per number or email).
- The phone claim cannot target a typed number. Only the guest's own caller number is used.
- Consumer OIDC is limited to verified emails. It refuses SSO-required domains and does not bypass two-step verification.
- Pasted sample notes are checked for identifiers, used in memory, and never saved. Only the derived rules are kept.

## Tests

- **Unit (vitest):**
  - `tests/unit/tz.test.ts`: 6 tests on zone validation, fallback, formatting, wall-clock days, DST, and day bounds.
  - `tests/unit/nav.test.ts`: 6 tests on the disclosure rules and on excluding sample notes.
  - `tests/unit/specialty.test.ts`: 25 tests on taxonomy to specialty, template and note length.
  - `tests/unit/style-match.test.ts`: 9 tests on splitting, order, headings, bullets, abbreviations, pronouns, length, before and after, split A/P, and the identifier check.
  - `tests/unit/survey.test.ts`: 1 added test, on the five-own-notes threshold.
  - Full unit suite: 88 files, 415 tests passing.
- **E2E (Playwright), `tests/e2e/onboard.spec.ts`:**
  - the front door
  - passwordless sign-up to `/go` with the simple nav and no survey, and Show all tools
  - password sign-in still works
  - NPI fill with badge and template
  - phone-code claim, including a wrong code
  - paste an old note with the identifier refusal, before and after, rules in Settings
  - simple nav opens at 3 signed notes, and the survey appears at 5
  - Los Angeles `timezoneId` for the demo day and stack times
  - axe and no horizontal scroll on `/register` at 390 px
  - Continue with Google against the mock IdP, including returning sign-in
- **E2E specs updated where behavior changed on purpose:**
  - the `register` helper now uses the password API, then turns on the full nav to keep the old coverage
  - `auth`: landing CTA and validation
  - `voice` and `guest-claim`: the email claim is one tap behind the phone claim for callers
  - `ehr`: passwordless sign-up during an EHR launch
  - `extension`
  - `magic`: an explicit `next` is honored

## What's left

- **Sign in by text code on `/login`.** A phone-only account signs in again by calling the line (texted sign-in links) or by adding an email. There is no "text me a sign-in code" on `/login` yet.
- **Microsoft sign-in with a real tenant.** Try it against a real Azure app registration and document the `xms_edov` claim setup.
- **Edit a style rule in place.** Rules can be toggled and deleted, but not edited.
- **Specialty-matched sample scripts and "set up by phone"** (research upgrade 5) are not built.
- **Guessing a caller's time zone from the area code** is not built. Callers who never open a browser get `CHARTSIDE_TZ`.
