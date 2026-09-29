# Interface feasibility: reusing chartside for a new front door

Research slice B for the `interface/ghost` branch. Part 1 maps what already exists and can be reused. Part 2 assesses each candidate channel: technical fit, HIPAA exposure, effort, blockers, and how much can be tested end to end on a laptop. Part 3 ranks them from the engineering side, for dev-d1 to weigh against the market findings in `interface-market.md`.

Effort is in focused build days for one developer working with Claude, and covers a demo-quality slice with tests, not a production launch.

## Part 1: What already exists

### The key finding

**The full pipeline already runs on the server, from raw audio to a finished note.** A new channel only has to do three things:

1. Create an encounter.
2. Get audio chunks or transcript lines into it.
3. Call `processEncounter`.

The web app's live transcript is a UX layer on top of this, not a requirement. `processEncounter` runs the Deepgram final pass itself when no final transcript exists yet (`src/lib/server/pipeline.ts`). So a channel that only uploads audio still gets:

- diarization
- the note
- codes
- orders
- the patient summary
- the claim

Any new channel is therefore a thin capture shell plus an auth story. The note engine, review UI and back office stay as they are.

### Reusable pieces

| Piece | Where | What a new channel gets from it |
|---|---|---|
| Encounter create | `src/app/api/encounters/route.ts` (POST) | `patientId` is optional, so a "just record" visit with no patient chosen already works. Patient matching can happen afterward in the back office. |
| Consent ledger | `src/app/api/encounters/[id]/consent/route.ts`, `recordConsent` + `consentScript` in `src/lib/server/pipeline.ts` | A hashed consent record with all-party state logic. Methods today: `verbal`, `written`, `patient-device`. A phone or voice channel could add a `spoken-recorded` method that points to the audio timestamp where consent was given. |
| Audio chunk upload | `src/app/api/encounters/[id]/audio/route.ts`, `saveChunk` in `src/lib/server/audio.ts` | Accepts webm, ogg, mp4, mpeg, wav and aac. Chunks are limited to 5 MB each and sequenced by `seq`. The encounter must be in `recording` or `paused`. **Does not accept `audio/basic` or mulaw.** Telephony would need a WAV wrapper or a small mime addition. |
| Offline-safe upload queue | `src/lib/audio/queue.ts` (IndexedDB `chartside-audio`) | Chunks survive dropped Wi-Fi and a tab reload. A PWA can reuse this directly. |
| Browser capture | `src/lib/audio/capture.ts` (`AudioCapture`, MediaRecorder at 32 kbps, or 64 kbps for dual channel) | Mic capture, level meter and interruption handling are already built. |
| Live streaming ASR | `src/lib/audio/deepgram.ts` (`DeepgramLive`), `src/app/api/speech/token/route.ts` (60 s grant), `LIVE_PARAMS` in `src/lib/server/audio.ts` | Deepgram nova-3 over a WebSocket with a short-lived browser token. The raw key never reaches the client. |
| Final pass | `finalPass` / `transcribeWithDeepgram` in `src/lib/server/audio.ts`, `src/app/api/encounters/[id]/transcribe/route.ts` | Batch re-transcription with diarization and speaker role assignment. Supports `multichannel`, which is useful when a phone call has clinician and patient on separate legs. |
| Finish and draft | `src/app/api/encounters/[id]/finish/route.ts` calls `processEncounter` | This is the single "make the note" call. |
| Note engine | `src/lib/engine/*` (local rules engine), `src/lib/llm.ts` (`generateNoteWithClaude`, default `claude-opus-5`, set by `CHARTSIDE_MODEL`) | Works with no API key (local engine) or uses Claude. Demos never depend on a key. |
| Phone pairing by QR | `src/lib/server/pairing.ts`, `src/app/pair/[token]/page.tsx`, `src/components/workspace/PhonePairing.tsx` | A 5-minute, single-use, hashed token that sends the phone to `/encounters/{id}?device=phone`. **This is already the "desktop shows a code, phone records" flow**, but it requires the phone to be logged in as the same user. |
| Public token pages | `src/app/c/[token]` (patient check-in), `src/app/s/[token]` (patient share), `src/app/x/[token]` + `src/app/api/x/[token]/{code,verify}` (external share with emailed one-time code) | The email one-time code flow in `src/lib/server/sharing.ts` (`sendCode`, `verifyCode`) is most of a magic-link or one-time-code login already. |
| API keys and v1 API | `src/lib/server/platform.ts` (`apiActor`, `apiHandler`, scopes, rate limit), `src/app/api/v1/encounters/*` | Bearer `cs_live_…` keys act as the key's creator. `POST /v1/encounters/{id}/transcript` takes consent plus utterances. `POST /v1/encounters/{id}/generate` drafts the note. **A Shortcut, extension or bot can use this today with no cookie.** It has no audio upload endpoint yet, only transcript lines. |
| Outbound SMS and email | `src/lib/server/notify.ts` (Twilio SMS, SendGrid email, Phaxio fax, each with a `*_BASE_URL` override) | "Your note is ready, tap to review" texts and emails already have a sender. The base URL overrides allow local mock servers, and `tests/unit/notify.test.ts` already does this. |
| Chrome extension | `extension/` (MV3 side panel, `lib.js` with `cssPath`, `setValue`, `fill`, a field picker and per-host mappings) | Pulls today's notes from `/api` using the session cookie and pushes each section into mapped EHR fields. **It does not record audio yet.** It is an output channel only. |
| PWA shell | `src/app/manifest.ts`, `public/sw.js`, `src/components/ServiceWorker.tsx`, `public/offline.html` | Installable, standalone display, with shortcuts to `/today`, `/inbox` and `/hospital`. A "Record" shortcut is a one-line addition. |
| Auth | `src/lib/server/auth.ts` (`cs_session`, httpOnly, SameSite lax, 14 days), MFA and SSO/SCIM, `security.ts` org policy (`requireMfa`, idle minutes) | Password signup with an optional demo seed (`src/app/api/auth/register/route.ts`). There is no passwordless path today. |
| Voice agent stack (sibling repo) | `~/dev/persona-onboarding/server/src/voice`, `server/scripts/voice-spike.ts` (`wss://agent.deepgram.com/v1/agent/converse`), think endpoint pattern tested in `server/test/call.test.ts` | Working Deepgram Voice Agent integration with Claude as a custom think endpoint, cloudflared tunnels for local dev, and a Cloud Run deployment with Litestream. This can be adapted for any talk-back channel. |

### Gaps a new channel will hit

1. **Audio at rest is not encrypted.** Chunks are plain files under `data/audio/{encId}/` (`audioDir` in `src/lib/server/audio.ts`). This matters more once audio arrives from phones and phone lines with no clinician watching a screen. It needs envelope encryption or a HIPAA-eligible bucket before any real PHI flows.
2. **No passwordless or zero-signup identity.** Pairing and every capture route require a full session. See the magic-link section below.
3. **The v1 API accepts transcripts but not audio.** Add `POST /v1/encounters/{id}/audio` that wraps `saveChunk`, and `POST /v1/encounters` already exists. Together these unlock Shortcuts and bots with about half a day of work.
4. **Audio MIME types.** `ALLOWED_MIME` lacks `audio/basic`, `audio/x-mulaw` and `audio/x-m4a`. iOS Voice Memos exports `.m4a`, which arrives as `audio/x-m4a` or `audio/mp4` depending on the client.
5. **Email vendor.** SendGrid does not sign a BAA. Anything that emails PHI, or receives it by email, needs a different provider. See the email-in section.
6. **Consent has no voice or telephony method.** That is fine for a demo, but the attestation text in `recordConsent` assumes an in-person or telehealth visit.

## Part 2: Candidate channels

The same three vendor facts apply to every channel:

- **Anthropic** signs a BAA for API use under its commercial terms, with zero data retention available.
- **Deepgram** signs a BAA on paid plans (Growth and up).
- **Twilio** signs a BAA only for HIPAA-eligible products and requires an Enterprise or Security edition account. Programmable Voice, Media Streams and Programmable Messaging are eligible. SendGrid is not.

For a portfolio demo none of this blocks anything, because it runs on synthetic visits. It matters for the "real clinicians install it" pitch.

### 1. Call a number (telephony)

Two ways to do it:

- **A. Silent scribe line.** The clinician calls a number, sets the phone on the desk, and the call is the recorder. Twilio `<Connect><Stream>` sends 8 kHz mulaw frames over a WebSocket to our server. We buffer them to WAV chunks, call `saveChunk`, and on hangup call `processEncounter`. The note link is texted back through `notify.ts`.
- **B. Talk-back agent.** Deepgram Voice Agent answers ("Chartside here, who's the patient? Did they consent?"), then goes quiet and listens. At the end it reads back the plan. Persona-onboarding already has the agent, the think endpoint and the tunnels.

What it involves:

- **Fit.** Very high "it just works" value, with no app and no login screen. The caller is identified by caller ID plus a 4-digit PIN, or by a per-clinician dial-in number.
- **Quality risk.** Narrowband phone audio from a phone lying on a desk. Nova-3 handles phone audio well, but room pickup through a phone call is worse than a local recording. Mitigation: Twilio records the call at 8 kHz anyway, and we can offer "record on the phone, upload after" as a fallback. Diarization on mono room audio works the same way it does in the web app.
- **HIPAA.** Twilio BAA, Deepgram BAA and Anthropic BAA are all available. Call recording consent is the same state all-party issue the app already handles. The agent can say the consent script aloud and log the moment it was given.
- **Effort.**
  - Option A: 3 to 4 days. That covers the WebSocket bridge, the mulaw to WAV conversion, caller lookup, the end-of-call pipeline and the SMS link.
  - Option B: add 3 to 5 days on top of A to port the persona voice agent and tune the "go silent and listen" state.
- **Blockers.**
  - A phone number costs about $1.15 a month plus per-minute charges.
  - A public URL is needed for Twilio webhooks. Persona's cloudflared setup handles this.
  - A real phone is needed to hear it.
  - A2P 10DLC registration is needed before sending SMS at any volume. The first texts can go to a verified number on a trial account.
- **Local end to end.**
  - Almost entirely testable without Twilio. Write a fake Media Streams client that reads a WAV file, sends `start`, `media` (base64 mulaw) and `stop` frames to the local WebSocket, then assert the encounter reaches `ready for review`.
  - Deepgram is already mockable through `DEEPGRAM_BASE_URL` (`tests/unit/audio.test.ts`).
  - Only the final "dial it from my phone" step needs the tunnel and a real account.

### 2. SMS, iMessage and WhatsApp

- **SMS (Twilio).**
  - Good as the return channel: "Note ready for Maria G., tap to review" plus a signed short link. This is already half built in `notify.ts`.
  - Weak as a capture channel. MMS audio caps at about 5 MB and carriers transcode it, so SMS is useful only for a "text a 30-second memo" or dictation-addendum case.
  - Effort: 1 day for outbound note-ready links, 2 days for inbound commands ("sign", "redo shorter").
  - HIPAA: minimum necessary. Put no PHI in the SMS body, only a link behind auth.
- **iMessage.**
  - Apple has no bot API. Apple Messages for Business requires an approved messaging service provider and business registration, and there is no path to a BAA from Apple.
  - Not feasible. Drop it.
- **WhatsApp Business.**
  - Meta does not sign BAAs, so it is a non-starter for PHI in the US.
  - It could matter for non-US markets, which is out of scope.
  - Drop it for now.

### 3. PWA with one-tap record (home screen, lock screen)

- **Fit.** The strongest code reuse of any channel. A new `/go` or `/r` route shows one giant button. It creates the encounter, records consent with one tap ("patient agreed"), and runs `AudioCapture` plus `UploadQueue`. Tapping Stop calls `finish`. Nothing else is on screen.
  - The manifest adds a "Record visit" shortcut, so a long-press on the icon starts recording.
  - The existing QR pairing becomes "scan once to install on your phone."
- **Hard blocker on iOS.** Safari suspends `getUserMedia` capture when the screen locks or the PWA goes to the background. A clinician who pockets the phone mid-visit loses audio.
  - Android Chrome keeps recording with the screen off in most cases.
  - Workarounds: keep the screen awake with the Wake Lock API (supported in iOS 16.4+ standalone PWAs) and a dim black "recording" screen, or hand off to Voice Memos (see Shortcuts below).
  - Native apps (Freed, Heidi) exist largely because of this.
- **Lock screen.** A PWA cannot put a widget or control on the iOS lock screen. On iOS 18+, a Shortcut assigned to a Control Center or Lock Screen control, or to the Action Button, can open the PWA's `/go` URL. That gives two taps from a locked phone.
- **HIPAA.** Same posture as the current web app. Audio sits in IndexedDB on the device until uploaded, so it needs a purge-after-upload check (the queue deletes on success, which should be verified).
- **Effort.**
  - 2 to 3 days for the one-button route, the consent tap, the wake lock screen, the manifest shortcut and the "note ready" push or SMS.
  - Web Push on iOS works only for installed PWAs (16.4+). Add 1 day for it.
- **Blockers.** The iOS background limit, which is mitigated but not solved.
- **Local end to end.**
  - Fully testable with Playwright's fake media stream, as `tests/e2e/audio.spec.ts` already does, with device emulation for the mobile layout.
  - The screen-lock behavior needs a real iPhone on the LAN over HTTPS. Use `next dev --experimental-https` or a tunnel.

### 4. Apple Watch and AirPods

- **AirPods.** They are just a Bluetooth mic. They work today with any of the web or PWA flows if chosen as the input device. But AirPods pick up the wearer (the clinician) well and the patient poorly, which is bad for an ambient scribe. They are better for dictation.
  - No effort needed.
  - Not a channel by itself.
- **Apple Watch.** Needs a native watchOS app written in Swift and SwiftUI.
  - The watch can record audio with `AVAudioRecorder` and hand it to the paired iPhone, or upload it directly over Wi-Fi or LTE.
  - Mic quality from a wrist is fine for a one-on-one visit.
  - The "raise wrist, tap, done" story is strong for virality.
  - Effort: 5 to 8 days for someone new to Swift. That covers a companion iOS app or a Shortcut bridge, Xcode, a signing certificate, TestFlight and a $99 a year Apple Developer account.
  - It cannot be tested end to end without real hardware. The simulator has no real mic path to the paired phone.
  - Defer it. It could be version 2 once one of the web channels proves out.

### 5. iOS Shortcuts and the share sheet

This is the sleeper option:

1. The clinician records in **Voice Memos**, which keeps recording with the screen locked and is reliable and familiar.
2. They share the file to a "Send to Chartside" Shortcut, or trigger it from the Action Button.
3. The Shortcut runs "Get Contents of URL": a POST of the file to a new `/v1/encounters/{id}/audio` endpoint (or a combined `/v1/capture`), with the API key in a header.
4. The server runs the pipeline and texts back the review link.

What it involves:

- **Fit.** It solves the iOS background-recording blocker with zero native code. The "install" is one iCloud Shortcut link. Clinicians already share Shortcuts on Reddit and TikTok, which suits virality.
- **What to build.**
  - An audio upload endpoint in the v1 API.
  - A combined create, upload and finish call.
  - `audio/x-m4a` in `ALLOWED_MIME`.
  - A per-user capture token scoped to `capture:write` only, so a leaked Shortcut can upload but not read PHI.
  - The published Shortcut.
- **Consent.** A "Did the patient agree?" prompt inside the Shortcut before upload posts `consent.obtained`. The v1 transcript route already enforces this pattern.
- **HIPAA.** The file is on the device in Voice Memos, which syncs to iCloud if enabled. Apple does not sign a BAA for consumer iCloud, so the Shortcut should delete the memo after upload (the "Delete Files" action) and the docs should say to turn off Voice Memos iCloud sync.
- **Effort.** 1.5 to 2 days of server work, plus half a day to build and publish the Shortcut.
- **Blockers.**
  - Upload size. A 20-minute m4a is about 10 to 20 MB, and `saveChunk` caps chunks at 5 MB. The endpoint needs to accept a large body and split it, or raise the limit for this route.
  - Android has no equivalent. Its path is the PWA plus the Web Share Target API, which Android Chrome supports and iOS Safari does not.
- **Local end to end.** The server side is fully testable with a vitest or Playwright request that POSTs a fixture m4a with a capture token. The Shortcut itself needs an iPhone that can reach a tunnel URL.

### 6. Chrome extension overlay on any EHR

- **What exists.** `extension/` already does the hard EHR part: a field picker, stable selectors and pushing sections into React-controlled inputs and contenteditable fields. It is covered by `tests/e2e/extension.spec.ts`.
- **What is missing.**
  - Capture. MV3 allows `getUserMedia` from the side panel after a one-time permission grant through an extension page, or from an offscreen document (`chrome.offscreen`, reason `USER_MEDIA`).
  - `chrome.tabCapture` can also grab the telehealth tab's audio for exact two-channel attribution. The web app already supports dual channel (`mode: "dual"` in `finalPass`).
- **The flow.** Click the icon beside the EHR, then Record, then Stop. The note appears in the panel, and "Fill EHR" pushes it into the fields. This is soapnotebuddy's shape with our evidence and trust layer behind it.
- **Auth.** It rides the `cs_session` cookie (SameSite lax plus host permission works). Good for people already signed in. For zero signup, it needs the magic-link flow.
- **HIPAA.** `host_permissions: <all_urls>` means the extension can read EHR pages. Chrome Web Store review for health data is strict, so narrow the permissions to `activeTab` plus optional host permissions requested per EHR domain. Chrome does not sign a BAA, but no PHI is stored by Google as long as `chrome.storage.sync` holds only selector mappings. Today's mappings and base URL are fine. Never sync note text.
- **Effort.**
  - 2 to 3 days to add capture (offscreen document, reuse `capture.ts` logic by porting it to plain JS or bundling it) and the panel UI states.
  - 1 more day for tab audio.
  - Web Store listing: $5 one-time, and review takes days.
- **Blockers.**
  - Web Store review timing.
  - The extension is desktop only. Many clinicians chart on a clinic PC they cannot install extensions on, because IT locks them down.
- **Local end to end.** Yes. Playwright can load an unpacked extension with a persistent context and a fake mic (`--use-fake-device-for-media-stream`, `--use-file-for-fake-audio-capture=visit.wav`). The existing extension spec shows the pattern.

### 7. Email-in

- **The idea.** Forward a voice memo or a dictation to `notes@…` and get a note link back. Or email a pasted transcript.
- **Fit.** Low virality, but it works from anywhere, including locked-down hospital PCs. It is closer to a fallback than a front door.
- **HIPAA.** This is the real problem.
  - Inbound mail must be processed by a BAA-covered provider: AWS SES inbound to S3 (HIPAA-eligible), Postmark (no BAA), SendGrid inbound parse (no BAA), Google Workspace with a BAA plus the Gmail API, or Paubox.
  - Clinicians emailing PHI from personal Gmail breaks the chain anyway.
- **Effort.** 2 days with SES, including verifying the sender against the user's email and a per-user secret address such as `u-7f3k@in.chartside…` so spoofed From headers do not matter.
- **Blockers.** An AWS account, a domain with MX records and a public endpoint.
- **Local end to end.** Yes. POST a raw MIME fixture to the inbound handler. Only live delivery needs DNS.
- **Recommendation.** Skip it for the viral front door. It could be a line in the back office later.

### 8. Magic-link, zero-signup flow

This is not a channel. It is the identity layer every channel above needs to feel install-free.

- **Today.** Password registration with a demo seed.
- **The target.** Enter email (or phone), get a link or 6-digit code, tap it, and you are recording.
  - `src/lib/server/sharing.ts` `sendCode` and `verifyCode` already implement a hashed, expiring, emailed one-time code for external shares.
  - Generalize it into `auth/magic` (request plus verify) that calls `users.create` on first use and `startSession`. `register/route.ts` shows the org-creation half.
  - SMS code via Twilio is the same shape.
- **"Try before signup."** Let `/go` record a demo or real visit before any identity exists, holding it under an anonymous session. Claim it by email after the note is shown ("Save this note: enter your email").
  - This is the Muse-style "it just works" moment. The note is the hook, and signup is the save button.
  - For real PHI it is unsafe, because an unclaimed visit is PHI with no accountable user. Two options:
    - A: allow it only with the sample conversation or a clearly labeled "practice visit" mode.
    - B: allow real capture but purge unclaimed encounters after 1 hour and require a claim before the note is shown in full.
- **HIPAA.**
  - MFA policy (`security.ts` `requireMfa`) must still apply for orgs that turn it on. Magic link counts as one factor.
  - SSO domains must still redirect. `orgs.requiringSso` is already checked in register.
  - Links need to be single use, short-lived and bound to the device that requested them, to stop email-scanner prefetch from burning the token. That means a POST confirmation page, not a GET that logs in.
- **Effort.** 1.5 days for the magic link and code. Add 1 day for anonymous try-first with claim and purge.
- **Local end to end.** Yes. Mock the email and SMS base URLs as `tests/unit/notify.test.ts` does, and read the code from the mock in Playwright.

## Summary table

| Channel | Reuse | Effort (days) | HIPAA path | Hard blocker | Local end to end |
|---|---|---|---|---|---|
| PWA one-button (`/go`) | Very high | 2 to 3 | Same as web app | iOS stops recording when locked (wake lock mitigates) | Yes (fake mic); lock behavior needs an iPhone |
| Magic link plus try-first | High (`sharing.ts` code flow) | 1.5 to 2.5 | Fine with claim and purge rules | None | Yes |
| iOS Shortcut + Voice Memos | High (v1 API) | 2 to 2.5 | Delete memo after upload; iCloud caveat | Upload size vs the 5 MB chunk cap | Server yes; Shortcut needs an iPhone |
| Chrome extension capture | High (`extension/`, capture logic) | 2 to 4 | Narrow permissions; nothing in sync storage | Web Store review; locked clinic PCs | Yes (unpacked + fake audio file) |
| Call a number, silent | Medium (new WebSocket bridge) | 3 to 4 | Twilio Enterprise BAA | Public URL, phone number, 10DLC for SMS | Mostly (fake Media Streams client) |
| Call a number, talk-back agent | Medium (port persona) | 6 to 9 | Same, plus Deepgram agent BAA | Same, plus agent tuning | Mostly |
| SMS note-ready link | Very high (`notify.ts`) | 1 | No PHI in body | 10DLC registration | Yes (mock base URL) |
| Email-in | Low | 2 | Needs SES or Paubox, not SendGrid | Domain + MX | Yes (MIME fixture) |
| Apple Watch | None | 5 to 8 | Native, fine | Swift, Xcode, hardware, $99 account | No |
| AirPods | Already works | 0 | n/a | Poor patient pickup | n/a |
| iMessage, WhatsApp | n/a | n/a | No BAA | Platform policy | n/a |

## Part 3: Engineering recommendation

From the feasibility side, the best build is **one capture core with three thin doors**, all landing in the existing back office:

1. **Core, built first.** Four pieces:
   - Magic-link or code login with try-first and claim.
   - A `capture:write`-scoped token.
   - A single `POST /api/capture` (or `/v1/capture`) that creates an encounter, takes consent and audio of any length, and finishes.
   - Audio-at-rest encryption.

   About 3 to 4 days. Every door below depends on it.
2. **Door 1: the PWA `/go` one-button page.** This is what "install it and it just works" looks like on Android and desktop, and on iOS with the wake-lock screen. It reuses `AudioCapture` and `UploadQueue` directly.
3. **Door 2: the iOS Shortcut with Voice Memos.** It covers the iOS pocket case the PWA cannot, and it is very shareable ("add this Shortcut, press the Action Button").
4. **Door 3, pick one by market signal.**
   - The **Chrome extension** if dev-d1's research says clinicians discover tools while charting at a desk (the soapnotebuddy path).
   - The **call-a-number** line if the viral hook is "no app at all, just call this number." It has the most demo magic, the most moving parts, and it is the one place the persona voice stack pays off.

Leave out iMessage, WhatsApp and the Watch. Email-in can wait for the back office.

### Direction-changing notes for dev-d1

- "Ghost UI" is cheap here because the back end needs no changes to produce notes from uploaded audio alone. The work is identity plus the capture shell, not the AI.
- The biggest real constraint on any phone-first story is **iOS killing web audio when the screen locks**. It decides between the PWA alone and the PWA plus the Shortcut or a native app. It deserves a 30-minute spike on a real iPhone before we commit.
- Before any real clinician uses a new channel, fix two things: plaintext audio on disk and SendGrid for email.
