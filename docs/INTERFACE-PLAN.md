# Chartside Line: the ghost interface plan

Branch `interface/ghost`. Built by two sessions working in parallel (dev-d1 and dev-dc). Research lives in `docs/research/interface-*.md` and `docs/research/_raw-*.md`.

## The bet in one line

**Your scribe is a phone number.** Call it before a visit, put the phone on the desk, hang up when you're done. Your note is waiting behind one tap. No app, no install, no login screen, no setup, no laptop in the room. It works from any phone a clinician already owns, including a clinic landline.

The web app does not go away. It becomes the back office: everything heavy (coding, claims, inpatient boards, admin, analytics) stays there, and the new front door hands off to it through one-tap links.

## Why this, why now (research summary)

1. **The viral AI formats of 2026 are "no app" formats.** Instinct AI (text or call a number; $10B valuation on 2026-09-28), Poke (iMessage), and Meta Muse (zero setup because identity is already connected; #1 on the App Store 2026-09-18) all spread because the first value lands before any setup. Hardware that replaces the phone (Humane, Rabbit, Friend) failed. The phone call is the one interface every layman already knows. (`_raw-viral-formats.md`)
2. **No modern AI scribe offers "call a number, get a note."** The format is familiar, because older clinicians grew up dictating to a phone line with a PIN, but nobody has rebuilt it with ambient AI. (`_raw-clinician-adoption.md`)
3. **The top clinician complaints are all interface problems, not model problems.** They are: the copy-paste hop, app installs and logins at the point of care, battery drain, lost recordings, consent friction, and verbose notes. A phone call removes the first four. (`_raw-clinician-adoption.md`)
4. **Scribes are a commodity now.** Epic's AI Charting reached broad availability in February 2026 and Doximity gives a scribe away free. The measured time saved is small, and adoption follows the interface. (`_raw-novel-paradigms.md`, `_raw-growth-loops.md`)
5. **Growth in medicine is doctor to doctor.** OpenEvidence reached 40% of US physicians with free, NPI-verified access and word of mouth, and 95% of its new users heard about it from another physician. The loops that work are output-as-the-ad (Loom, Calendly, Granola shared notes), a verified-clinician gate, and two-sided free-month credits. Cash referral rewards are an Anti-Kickback risk. (`_raw-growth-loops.md`)
6. **Heavy software gets a thin front through cards and an agent.** The pattern comes from Ramp, Brex and Abridge. Every workflow that needs a human becomes a one-decision card, and the agent answers questions and *proposes* changes. Voice never commits a signature, an order or a claim. (`_raw-thin-front-heavy-back.md`)
7. **Engineering says it's cheap.** The server already turns uploaded audio into a full note, codes and a claim (`processEncounter`). The work is identity plus capture shells. (`interface-feasibility.md`)

## Who uses it first

- Solo and small-practice clinicians with no IT: private-practice therapists, chiro, PT/OT/SLP, urgent care, and primary care.
- Vets, the fastest-adopting segment (not HIPAA-covered).
- Residents, who seed their attendings.

Enterprise keeps the web app, SSO and SMART launch.

## What a layman sees (the 60-second aha)

1. They see a number anywhere: a colleague's text, a patient recap footer, a TikTok, or the landing page. For example, "(312) 555-0199. Call it before your next patient."
2. They call. "Hi, this is Chartside. I'll write the note for your visit. Ask your patient if it's OK to record, then say 'they agreed' or press 1."
3. They put the phone down and see the patient. Chartside stays silent.
4. They hang up, or say "Chartside, end visit."
5. If they stayed on the line, it reads back: "Got it. Twelve-minute follow-up. Assessment: type 2 diabetes, improving on metformin, and hypertension, at goal. Plan: A1c in three months. It looks like a level 4 visit. Want any changes?"
6. A text arrives with no patient data in it: "Your Chartside note is ready (3:42 PM visit). Review and sign: https://…/m/…". One tap lands them, already signed in, on the note, with every sentence linked to the moment it was said. Swipe to sign.
7. For a first-time caller the text says "Save your note: tap to claim". Claiming means an email or NPI plus a code. Signup is the save button, not a gate.

## The three layers

### 1. Capture ("the Line" plus two backup doors)

- **Door A: Chartside Line (phone call).** Twilio Voice → `<Connect><Stream>` → our WebSocket bridge. Consent is gated by speech or keypad, and audio before consent is discarded. The call streams to `appendCaptureAudio` in 8 kHz blocks. Live Deepgram (nova-3, mulaw) listens only for commands, and Deepgram Aura speaks the prompts. On hangup it finishes capture and sends an SMS link. The caller is identified by a verified phone, and an unknown number gets a phone-keyed guest (try-first, then claim).
- **Door B: the Button (`/go`).** A one-button installable web page with consent tap, wake-lock, the offline IndexedDB queue and a "Record visit" manifest shortcut. For people who'd rather tap than call.
- **Door C: the Shortcut.** An iOS Shortcut ("Send to Chartside") for Voice Memos and the Action button. It posts to `/api/capture` with a `cs_cap_` token, and `/go/shortcut` issues the token and gives install steps. This covers iOS pocket recording, which web pages can't do.

### 2. Decisions ("the Stack")

`src/lib/server/decisions.ts` lists everything waiting on this clinician as typed cards with stable ids:

- a note ready to sign
- a co-sign request
- a CDI query
- a patient-match suggestion
- an agent-proposed edit (as a diff)
- a care gap to add to the plan
- inbox reply drafts
- claim exceptions

`/go/stack` is a phone-first swipe stack: one decision per card, expand for the evidence, and the web app for anything deeper. Signing always happens here, on screen, with the note visible. The server records review time and flags a suspiciously fast sign.

### 3. The agent ("talk to your chart")

- **On the phone line after a visit, or by pressing 2 at the greeting:** voice answers questions and proposes changes, with read-back.
- **In the `/go` chat:** the same agent, by text.
- **Tools** call the existing server functions directly: today's queue, patient summary, results, meds, `assist()` edits, proposed orders and codes, and "open in web".
- **Write tools only create cards.** Nothing is committed by voice.

## Safety rules (non-negotiable)

1. **What can carry PHI.** Voice (a Twilio call under BAA) may carry PHI. SMS carries no PHI: only a time, a count and a single-use login link. The web page behind the link carries the PHI.
2. **No signing, orders or claims from voice, a notification, or in bulk.** Voice can mark a note "ready to sign".
3. **Consent comes first and is recorded.** Consent is gated before any audio is kept, and the moment and method are recorded in the consent ledger. All-party states ask about others in the room.
4. **Login links.** They are single use, hashed and short-lived, need a POST to redeem (so link prefetch can't burn them) and respect org MFA.
5. **Guests.** A guest capture is unclaimed PHI: it is purged if not claimed and can't be signed or shared until claimed.
6. **Audio at rest** is encrypted with AES-256-GCM (done).
7. **Patient-facing texts** contain no marketing, which keeps the TCPA treatment exemption. Attribution lives only on the web page.
8. **Email carries no PHI.** SendGrid won't sign a BAA, so email carries only codes and links until the vendor changes.
9. **Caller ID is not a password.** The schedule greeting, capture into a scheduled visit, and chart questions all need the phone PIN. Without it, the line records into a new unmatched visit and reads back only that call's note.
10. **Room conversation is not a command.** During read-back, the line acts only on the wake word, a clear command, or the keypad.

## Growth loops we build (all without PHI in the loop)

1. **Try-first by phone.** An unknown caller gets a real note before signup, and claiming is the signup.
2. **NPI instant claim.** An NPI (the public national clinician ID) pre-fills name and specialty from the NPPES registry, and a clinician-verified badge unlocks free use.
3. **Patient recap attribution.** The patient's summary page footer says "Prepared with Chartside for Dr. X", with a "Does your other doctor use Chartside?" forward that contains no PHI.
4. **Shared-note footer.** Colleague share links say "Written with Chartside in 41 seconds. Call (xxx) to try it on your next patient."
5. **Pajama-time receipt.** A weekly PHI-free card ("38 charts closed before you left clinic, 4.2 hours back"), with a share image and an OG card.
6. **Colleague invite after the 3rd signed note,** shown once. The clinician sends it themselves.
7. **Two-sided free-month credits,** flat and capped, with no cash.
8. **Demo line.** A number anyone can call to hear a simulated visit get written, which is the TikTok moment. `/go/phone` is an in-browser phone simulator that runs the real bridge.

## Work split

| Area | Owner | Files |
|---|---|---|
| Audio encryption, capture tokens, `/api/capture` | dev-dc | done |
| Magic links, `mintLoginLink`, try-first guests, claim, phone verification, `userByPhone`, `guestForPhone` | dev-dc | `magic.ts`, `guest.ts`, `/m/[token]`, `/api/auth/*` |
| `decisions.ts` + `/api/decisions` + approve/reject actions | dev-dc | `decisions.ts`, `/api/decisions/**` |
| The Stack (`/go/stack`) | dev-dc | `src/app/go/stack/**` |
| Growth: NPI claim (NPPES + mock), recap attribution, shared-note footer, receipt card + OG image, invite at 3rd note, credits ledger | dev-dc | `growth.ts`, `/api/growth/**`, `/receipt/**` |
| Telephony bridge, call flow, TTS/STT, SMS inbound/outbound, custom server | dev-d1 | `telephony/**`, `/api/voice/**`, `/api/sms/**`, `server.ts` |
| Voice/text agent (tools that propose cards) | dev-d1 | `agent/**`, `/api/agent/**` |
| `/go` Button, `/go/shortcut`, `/go/phone` simulator, landing page `/line` | dev-d1 | `src/app/go/**` (except `stack`), `src/app/line/**`, `src/components/ghost/**` |
| Mocks (Twilio, Deepgram speak and mulaw listen), e2e wiring | dev-d1 | `tests/e2e/mock-*.mjs`, `playwright.config.ts` |
| GCP Cloud Run deploy (chartside project), live E2E with a real call | dev-d1 | `deploy/**` |

**Shared contracts.**
- Capture: `captureAudio`, `appendCaptureAudio`, `finishCaptureFor`, `captureStatus`, `captureNote`.
- Identity: `userByPhone`, `guestForPhone`, `mintLoginLink`.
- Decisions: `listDecisions(user)` returns `Decision[]`, plus `actOnDecision(user, id, action, payload)`.
- Agent proposals: `proposeDecision(user, kind, payload)` returns a decision id.

## Testing

- **Unit.** Codec, signatures, the call state machine with fake deps, the SMS parser, agent tool routing (Claude mocked), decisions, magic links and growth math.
- **E2E (Playwright).** Also starts a fake Twilio that dials the bridge with a real WAV (`tests/e2e/fixtures/visit.wav`) as mu-law media frames. It asserts consent gating, a note drafted, an SMS with no PHI, the login link landing on the Stack, and a sign. Plus the `/go` button with a fake mic, the Shortcut upload, claim as a guest, the phone simulator, the receipt card PHI scan, and the patient recap footer.
- **Live.** A Cloud Run deploy with real Deepgram and Claude, a real call through the phone simulator over the public WebSocket, and a real Twilio number if an account is available.

## Out of scope for this branch

- iMessage and WhatsApp (no BAA).
- A native Apple Watch app.
- Email-in.
- Computer-use EHR driving (the best agents complete 36% of HealthAdminBench tasks).


## Status (2026-09-29, overnight build)

Everything below is on `interface/ghost`, committed one component at a time.

- **Tests:** 356 unit tests and 150 or more end-to-end tests, all green on the last full run.
- **Live evaluation:** `scripts/eval-line.mjs` places real calls through Deepgram and Claude and checks 8 scenarios. All 8 passed.

| Door or layer | Where | State |
|---|---|---|
| The line (phone) | `src/lib/server/telephony/*`, `/api/voice/*`, `server.ts` | Explicit-consent gate, keypad (1 2 3 4 5 7 8 9 0 * #), wake words, PIN-gated schedule greeting and chart questions, Spanish consent, streamed speech, keypad barge-in, cues while drafting, spoken brief, agent at read-back, "next patient" on the same call, recording cap, dropped-call recovery, text-back. Tested against Twilio's protocol with a fake caller and live through the browser bridge. Not yet on a real Twilio number. |
| Text the line | `/api/sms/incoming`, `/api/cron/nudges` | STATUS, SCHEDULE, LINK, HELP, STOP, START, NUDGE, BRIEF. Opt-in end-of-clinic and morning texts. PHI-free. |
| Browser phone | `/go/phone` | Real bridge, captions, keypad, sample visit, autopilot demo, Messages tab, share button. |
| One-tap recorder | `/go` | Guest try-first, consent sheet, chunked upload that survives dropped connections, wake lock, floating recorder, setup checklist. |
| EHR side panel | `extension/` 1.1.0 | Record beside the EHR, then fill the fields in one click. Survives dropped connections. |
| iPhone Shortcut | `/go/shortcut` | 30-day device key that can upload but not read notes. |
| Android share | `/go/share` | Shared recordings are held in memory until consent is confirmed. |
| Stack | `/go/stack` | Swipe to sign, live call banner, "Caller ID only" warning with delete, patient summary on sign, next-time card, notifications, home-screen tip. |
| Ask | `/go/ask`, on the call | Tool use over the chart; writes are proposals only. |
| Notifications | Web Push, `public/sw.js` | "Note ready" with the visit time only. |
| Landing | `/line`, `/` | Real call video, autopilot, contact card, FAQ, share images. |
| Admin → Line | `/admin?tab=line` | Setup checks, stats by door, PHI-free call log, team roster, one-step Twilio connection. |
| Growth | `growth.ts`, `loops.ts` | NPI claim, credits, receipts, footers, invite, loop metrics. |

**Live checks that passed (real Deepgram and Claude):**

- Consent small talk was ignored, and "she agreed" started recording.
- A full 101-second visit went through read-back, "ready" and the text.
- Noisy room audio produced 35 utterances across 2 speakers.
- A split wake word worked.
- Pause and resume worked.
- A decline was handled.
- Spanish consent, and a visit spoken in Spanish, produced a correct English note.
- A chart question after the PIN was answered.
- The `/go` compressed-audio recording produced 31 utterances and a correct note.
- A Voice Memos `.m4a` upload produced 33 utterances and a note.

**An independent code review** found 15 issues in the phone code. All 15 are fixed and covered by tests.

**Waiting on Jonathan:**

1. Run `deploy/gcp-grant.sh`, then `deploy/gcp-deploy.sh`, then `deploy/gcp-scheduler.sh`. The auto-mode check blocked IAM changes and a public tunnel, so nothing is hosted yet. The secrets already exist in Secret Manager.
2. A Twilio number, connected from Admin → Line.
3. BAAs before any real PHI.
4. The dev-dc session has been waiting on a prompt since about 1 AM.
