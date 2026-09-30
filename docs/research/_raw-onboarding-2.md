# Onboarding teardown and competitor moves, round 2 (raw research)

Research date: 2026-09-30. Branch `interface/ghost`. Companion to `_raw-growth-loops.md`, `_raw-clinician-adoption.md` and `INTERFACE-PLAN.md`.

Method and confidence:
- Competitor onboarding was reconstructed from help centers, vendor pages, third-party reviews, and onboarding strings found in each vendor's public signup JavaScript (Freed, Heidi, Commure Scribe, Scribeberry, Mentalyc, DeepCura). Findings from the JS show what the app contains, not the guaranteed screen order, and are marked [code].
- No competitor accounts were created. Competitor times to first note are **estimates** (vendor claims plus step counts), not stopwatch measurements.
- Chartside was **measured** on the live Cloud Run deploy with Playwright on 2026-09-30.
- The session web-search budget (200 calls) ran out partway through. Doximity's help center and openevidence.com sit behind bot walls. Items marked [unverified] come from a search snippet or one secondary source.

## TL;DR

- **Median competitor time to first note: about 3 minutes** across 12 self-serve scribes. Six of the 12 are at about 2.5 minutes. The fastest ones all put a no-patient sample visit inside onboarding. Enterprise scribes (Abridge, Suki, Commure Ambient) take weeks.
- **Chartside's browser-phone door took about 65 seconds to a readable note, with zero fields typed** (measured). That is the fastest in the set. But the front page steers new users to a 5-field `/register` that lands on a 20-item back office, with an NPS survey showing before any value.
- **Patterns we lack:**
  - a template built from a pasted old note (Heidi, OpenEvidence)
  - OAuth sign-in (Google, Apple or Microsoft; nearly everyone has it)
  - NPI auto-fill at signup or claim (OpenEvidence, Doximity)
  - a phone-based setup agent (DeepCura "Emily")
  - claiming by SMS code on the number that just called
  - a specialty-specific demo script (Freed)
  - learning from the website URL (DeepCura)
- **Nobody** connects a calendar at onboarding, detects the EHR automatically, or offers "Sign in with Doximity".
- **June to September 2026 moves:**
  - Incumbents bundled ambient into the EHR for free or at no extra cost (athenaAmbient GA on 08-13, Epic Ergo announced at UGM).
  - The free scribes grew fast: Doximity Scribe users grew 10x in July, and OpenEvidence raised at $15B.
  - Heidi shipped supervised agents (Heidi II, 09-28) and a wearable (context: March).
  - Abridge won the VA contract (09-22).
- **No competitor offers a clinician call-in scribe, SMS sign-off, WhatsApp capture, or a free tier for non-prescribers** such as therapists, PT/OT/SLP, chiropractors and vets.

---

# Part 1: Onboarding teardown

## 1A. Medical scribes, product by product

### Freed (getfreed.ai)
- **Steps:**
  1. secure.getfreed.ai/signup: email and password, or Google. No card.
  2. "Hello, welcome to Freed": first name, last name, specialty. The code also has clinician count, "Which EHR do you currently use?" and "Where did you hear about us? (optional)" [code, placement unverified].
  3. The new-user tour offers three paths:
     - "Try AI Assistant: chat with AI to get set up faster"
     - "Start a demo: record a simulated patient visit", with a read-aloud script written for your specialty
     - "Record a live patient visit"
  4. Tooltips ("You're recording", "Stop your visit to generate notes", "Templates built for your specialty") [code].
  5. Enter the patient name, Capture conversation, End visit. The note appears in the sidebar. Copy-paste it or use the Chrome extension.
- **Fields:** 2 plus 3, and up to 3 optional. **Auth:** email and password, or Google; SSO on Groups plans. **Verification:** none. **Trial:** 7 days, no card. Starter $39/mo for 40 notes. Free for residents and students.
- **Time to first note (estimate):** 2 to 4 minutes. The vendor says "two minutes". Note generation takes 60 to 90 seconds, and 3 to 5 minutes at peak (Vero, 2026-03-24).
- **Why it's fast:** default templates come from the specialty choice, and the demo script is specialty-specific. Templates learn from edits ("Learn format"; Auto Learn is off by default).
- **Sources:**
  - https://help.getfreed.ai/en/articles/9391550-get-started-with-freed (updated 2026-09-30)
  - https://help.getfreed.ai/en/articles/11796456-templates-that-learn
  - https://www.getfreed.ai/pricing
  - https://www.trytwofold.com/compare/freed-ai-scribe-review (2026-06-11)
  - https://www.veroscribe.com/blog/freed-ai-review-2026 (2026-03-24)
  - https://www.deepcura.com/resources/freed-ai-review (2026-09-27)

### Heidi Health
- **Help-center flow (2026-07-11):** sign up, email one-time code, set password, profile (name, specialty, role), organisation name, "Just me".
- **Newer personalization flow [code], "Spend just 2 minutes":**
  1. Name.
  2. Clinic: org name, clinician count, EHR (optional).
  3. "What type of note do you usually write? We'll create a tailored template". **"Have an existing note? Paste it above and we'll use it as a reference."**
  4. "Here's your template". Refine it by typing.
  5. Pick your most-used documents.
  6. Mic permission (skippable).
  7. "Let's produce your first note", with three options:
     - read a script (about 20 s)
     - **"Play a sample conversation: no mic needed"**
     - **"Auto-fill the transcript: see the note without recording"**
  8. Tour: detail level, abbreviations, evidence.
- **Fields:** email, code, password, about 7 profile fields, note type, optional pasted note. **Auth:** email OTP plus password, Google, Apple. **Verification:** email only.
- **Free tier:** Free forever with unlimited notes on default templates, plus 10 premium credits a month. Practice plans get a 14-day trial.
- **Time to first note (estimate):** 2 to 3 minutes to a sample note.
- **Why it's fast:** a sample with no mic needed, and a template built from a pasted note during onboarding. After onboarding, Memory learns from edits.
- **Sources:**
  - https://support.heidihealth.com/en/articles/14648388-set-up-your-heidi-account (2026-07-11)
  - https://support.heidihealth.com/en/articles/14648425-getting-started-with-heidi (about 2026-09-29)
  - https://intercom.help/heidi-health-handbook/en/articles/10043142-auto-generate-a-template-from-an-existing-note

### Doximity Scribe (free)
- **Registration:**
  1. "Find your profile" by name or NPI. **The profile already exists** (built from NPPES), so you claim it.
  2. Identity questions. The NYC H+H tip sheet lists medical school, graduation year, date of birth and zip.
  3. Email and password.
  4. Verification by professional email or government ID, with a code by email or text. Manual verification averages 3 days.
- **Scribe:** open the Scribe tab or doximity.com/scribe/home, New, note type (SOAP, H&P, Consult, Progress, Procedure, Dictation, Custom), record, review, copy.
- **Eligibility:** free for US MD/DO, NP, PA, CRNA and students. 140-minute sessions. Notes kept 29 days.
- **Time to first note (estimate):** 3 to 5 minutes if verification is instant, up to about 3 days if it is manual. The vendor says setup takes "less than five minutes" and notes take "under one minute".
- **Personalization:** custom templates, a per-specialty prompt, Smart Edits ("More concise", "Add billing codes"). No onboarding survey.
- **Sources:**
  - https://www.doximity.com/clinicians/scribe
  - https://support.doximity.com/hc/en-us/articles/360047630573-How-to-Register-on-Doximity
  - https://support.doximity.com/hc/en-us/articles/24772213507731-How-to-get-Verified-on-Doximity
  - https://www.doximity.academy/public/blogs/how-to-set-up-doximity-scribe-for-your-specialty-2026-05-15 (2026-05-15)
  - https://www.veroscribe.com/blog/doximity-scribe-review-2026 (2026-09-02)
  - https://ess.nychhc.org/uploads/Doximity-Tip-Sheet-Licensed-Providers.pdf

### OpenEvidence (NPI flow) and OpenEvidence Visits
- **Signup:**
  1. Email.
  2. 6-digit code (passwordless).
  3. Attest you are an HCP and enter your NPI, checked against NPPES. Verification is "often instant" for US doctors. Name and license state may also be asked [unverified]. Students upload proof of enrollment.
- **Visits** (launched August 2025, free, ad-funded):
  1. "New Visit" (the button is visible even in the logged-out header).
  2. Optionally set template, Voice, AVS template, input device and telehealth mode (system audio).
  3. Transcribe, with running notes live.
  4. Complete Note, then copy (rich or plain, with or without citations).
- **Fields:** email, code, NPI, and about 2 to 3 attestation fields [unverified].
- **Time to first note (estimate):** 2 to 4 minutes.
- **Personalization:**
  - **"Generate from Note"** builds a template from an existing note.
  - A community template library by specialty.
  - "Voices" for style (February 2026).
  - Automatic CPT, E/M and ICD-10 (March 2026).
  - No demo patient.
- **Sources:**
  - https://www.openevidence.com/user-guide
  - https://www.openevidence.com/user-guide/visits-templates
  - https://libguides.uams.edu/c.php?g=1526391&p=11432933 (2026-05-13)
  - https://www.iatrox.com/blog/openevidence-outside-us-access-verification-uk-alternatives (2025-12-27)
  - https://www.nbcnews.com/tech/tech-news/openevidence-ai-doctor-medical-physician-login-app-what-npi-uptodate-rcna341064 (2026-05-13)

### Abridge
- **No self-serve.** Enterprise contracts only, mostly Epic. No individual tier, price or trial. Time to first note is weeks to months.
- **Sources:**
  - https://www.abridge.com
  - https://www.trytwofold.com/compare/abridge-ai-review

### Nabla
- **Steps (help article edited 2026-08-10):**
  1. app.nabla.com, Sign In.
  2. **Specialty, country and EHR come before the email.**
  3. Email.
  4. Email code.
  The same flow runs in the Chrome extension and the iOS and Android apps.
- **Fields:** 4 plus a code, with **no password**. **Free tier:** about 30 encounters a month, unlimited for students and residents [unverified for 2026].
- **Time to first note (estimate):** 2 to 3 minutes. The shortest form in the set.
- **Sources:**
  - https://help.nabla.com/en/articles/781890
  - https://www.commure.com/blog-scribe/nabla-ai-review

### Suki
- **No self-serve found.** Sales-led, custom quotes, a weeks-long implementation, reportedly about $299 to $399 per user per month. Whether an individual app-store signup exists is [unverified].
- **Sources:**
  - https://www.suki.ai
  - https://www.deepcura.com/resources/suki-ai-review

### Tali AI
- **Steps:**
  1. Get Started.
  2. Google, or email plus a 4-digit code.
  3. Country, specialty, EMR, phone (optional), terms checkboxes.
  4. The trial starts immediately.
  5. Start Recording, Done, Copy.
- **Fields:** about 5 to 7. **Trial:** 14 days, no card, unlimited.
- **Onboarding extras:** Tali suggests role-playing the patient yourself, and offers a "Book an onboarding session" button.
- **Time to first note (estimate):** 3 to 5 minutes. The vendor says "less than 5 minutes".
- **Sources:**
  - https://help.tali.ai/en/articles/8940511-create-a-new-tali-ai-account (2026-02-05)
  - https://help.tali.ai/en/articles/8632291-trying-ai-scribe-for-the-first-time
  - https://tali.ai/start-free-trial

### Scribeberry
- **Steps:**
  1. Google, or email and password.
  2. Specialty, first name, title.
  3. Tour [code]: Start a New Visit, Choose Template, Start Transcribing, then **"Generate Your Note: we'll throw in a mock transcript"**.
- **Fields:** about 5. **Free:** Trial Mode, 20 uses a month plus 3 days unlimited. Pro is $99/mo. Over 2,000 templates.
- **Time to first note (estimate):** about 2 minutes to a mock-transcript note.
- **Sources:**
  - https://www.scribeberry.com/pricing
  - https://www.scribeberry.com/resources/faq

### Twofold
- **Steps (help article from 2024-08-29, possibly dated):**
  1. Email and password, or Google.
  2. Terms **and the BAA accepted at signup**.
  3. Therapist or physician?
  4. **Read a demo script.**
  5. Watch the note generate live.
  6. First real session.
- **Fields:** 2 to 3 plus 1 choice. The lightest questionnaire. **Trial:** 7 days, no card, then $19 for the first month ($69/mo normally).
- **Time to first note (estimate):** 2 to 3 minutes.
- **Sources:**
  - https://help.trytwofold.com/en/articles/9780209-creating-an-account
  - https://www.trytwofold.com/pricing

### Mentalyc (therapy)
- **Steps:**
  1. Email, Google or **Microsoft** [code].
  2. Note format (SOAP, DAP, BIRP...).
  3. Add a client.
  4. Record, upload, dictate a recap, or type a summary.
- **Trial:** 14 days, 15 notes, no card. Plans from $14.99/mo.
- **Time to first note:** the FAQ says "under 5 minutes". Estimate 4 to 6 minutes.
- **Sources:**
  - https://www.mentalyc.com/faqs
  - https://www.mentalyc.com/pricing
  - https://www.mentalyc.com/help-articles/how-to-record-and-upload

### DeepCura (bonus)
- **The form has 8 fields,** including "Practice Website (Recommended for Personalization)".
- **The alternative is "Call Emily":** an AI onboarding agent on a phone number (+1 415 549 1829, 24/7) that "sets up your entire practice: scribe, receptionist, billing, EHR in a single phone call".
- **Trial:** credits, no card. Then $129/mo.
- **Time to first note:** the vendor claims "30 seconds". Estimate 2 to 3 minutes.
- **Sources:**
  - https://app.deepcura.com/register
  - https://www.deepcura.com/plans-pricing

### Sunoh.ai (bonus, worst in class)
- **Steps:** EMR question, then a 4-step wizard:
  1. About 10 contact fields.
  2. **Mobile and email OTPs.**
  3. Pricing and terms.
  4. **Payment card.**
  Then a password.
- **Size:** about 13 fields plus 2 OTPs plus a card. $149 per user per month.
- **Time to first note (estimate):** 10 minutes or more.
- **Sources:**
  - https://sunoh.ai/sign-up/
  - https://sunoh.ai/pricing/

### Commure Scribe (bonus)
- **Steps:** a **survey before the account** (specialty, practice name and size, how heard), then email and password, then "Welcome", then an optional "Interested in a live demo?" with a phone number.
- **Trial:** 7 days, no card. $59/mo annual. The marketing says "43-second charts". Estimate 2 to 3 minutes.
- **Sources:**
  - https://getscribe.commure.com/pricing-page
  - https://scribe.commure.com/lp-demo

## 1B. Scoreboard

| Product | Typed fields before first note | Auth | Clinician verification | No-patient demo | Time to first note |
|---|---|---|---|---|---|
| **Chartside `/go/phone` (measured)** | **0** | none until save | none (NPI optional later) | yes, sample visit plus skip | **about 65 s** |
| Chartside `/register` (measured form) | 5 plus checkbox | email and password | none | demo clinic day | form about 45 to 60 s human, then about 2 to 3 min to note |
| Heidi | about 10 | email OTP, Google, Apple | email | yes, no mic needed | about 2.5 min |
| Twofold | about 3 | email, Google | email | read-aloud script | about 2.5 min |
| Scribeberry | about 5 | email, Google | email link | mock transcript | about 2 to 2.5 min |
| Commure Scribe | 6 | email | none | optional live demo | about 2.5 min |
| DeepCura | 8 | email, Apple | none | phone setup agent | about 2.5 min |
| Nabla | 4 plus code | email OTP | none | no | about 2.5 min |
| Freed | 5 to 8 | email, Google | none | specialty script | about 3 min |
| OpenEvidence | 3 to 5 plus code | email OTP | NPI auto-check | no | about 3 min |
| Doximity | about 8 plus code | Doximity account | profile claim, ID or professional email | no | about 4 min (up to 3 days) |
| Tali | 5 to 7 | Google, email OTP | none | role-play tip | about 4 min |
| Mentalyc | 3 to 5 | email, Google, Microsoft | email | no | about 5 min |
| Sunoh | about 13 plus 2 OTP plus card | email | phone and email | no | 10 minutes or more |
| Abridge, Suki, Commure Ambient | enterprise | SSO | employer | n/a | weeks |

**Median time to first note across the 12 self-serve scribes: about 3 minutes (estimated).** Six of the 12 are at about 2.5 minutes. For a first note from a real visit, add the visit length plus about 1 minute of processing.

## 1B-2. Patterns observed and who does them

1. **A no-patient demo inside onboarding:**
   - Heidi: sample or auto-filled transcript.
   - Freed: specialty script.
   - Twofold: script.
   - Scribeberry: mock transcript.
   - Tali: suggests role-play.
   - Chartside has this.
2. **Specialty asked up front to pick templates:** Freed, Heidi, Nabla, Tali, Scribeberry, DeepCura, Commure. Mentalyc asks for the note format instead. Chartside asks only on `/register`, not in the guest flow.
3. **A template from a pasted existing note:** Heidi (inside onboarding) and OpenEvidence ("Generate from Note"). DeepCura personalizes from the practice website URL. **Chartside lacks this.**
4. **Learning style from edits:** Freed, Heidi Memory, Commure, Doximity. Chartside has it, but only after signing.
5. **Passwordless email code:** Nabla, Tali, OpenEvidence, Heidi. Chartside has it on `/login` and at claim, but `/register` still uses a password.
6. **Social sign-in:**
   - Google: Freed, Heidi, Tali, Scribeberry, Twofold, Mentalyc.
   - Apple: Heidi, DeepCura.
   - Microsoft: Mentalyc.
   - **Chartside: none.**
7. **Clinician identity:** OpenEvidence (NPI auto-check) and Doximity (a pre-built profile to claim). Everyone else is email only. Chartside has an NPI check hidden in `/go/settings`.
8. **EHR asked at onboarding:** Nabla (required), Tali, Freed, Heidi, Sunoh. **Nobody auto-detects the EHR.**
9. **A survey before the account exists:** Commure, Nabla.
10. **Human or AI setup help:** DeepCura's phone agent "Emily", Commure's live demo, Tali's onboarding session, Freed's AI Assistant chat.
11. **A mic check on first run:** Heidi, Freed, Mentalyc. Chartside warns on silence during recording.
12. **Calendar connect at onboarding:** **nobody.**
13. **"Sign in with Doximity" as an identity provider:** **nobody observed.**
14. **BAA accepted at signup:** Twofold (every plan).

## Part 1C: Best in class outside medicine

Research limit: the session web-search budget was exhausted by the parallel competitor sweep, so this section rests on direct page fetches (2026-09-30) plus well-documented public flows. Items marked [known pattern] are from widely reported product behavior, not a fresh fetch.

| Product | Steps to first value | Fields typed | Auth | What makes it fast | Source |
|---|---|---|---|---|---|
| ChatGPT | 0 steps. Land on chatgpt.com and type. Account only needed for history, files, longer use. | 0 | Google, Apple, Microsoft, email, phone | Logged-out use; the input box is the landing page; signup is deferred until you want to save [known pattern] | chatgpt.com (help article 403 on fetch) |
| Granola | Download app, sign in with Google or Microsoft, grant calendar and mic, next meeting shows up and one click starts notes | 0 (OAuth only) | Google or Microsoft workspace | Calendar connect means the first meeting is already listed; notes are generated from "meeting context" with no template setup; free tier is unlimited notes, 30-day history | https://www.granola.ai/ (fetched 2026-09-30) |
| Otter | Sign up with Google or Microsoft, connect calendar, OtterPilot auto-joins the next Zoom/Meet/Teams call | 0 to 2 | Google, Microsoft, Apple, email | The bot auto-joins so the user does nothing at the first meeting; attendees receive the notes, which recruits them [known pattern] | help.otter.ai (403 on fetch) |
| Loom | Sign up, install extension or desktop app, record, link copied to clipboard on stop | 1 to 3 | Google, Slack, Apple, email | The output (a link) is ready the instant you stop; viewers need no account. Starter: 25 videos per person, 5 minutes each, 720p | https://www.loom.com/pricing (fetched 2026-09-30) |
| Superhuman | Historically a 30-minute 1:1 onboarding call gated by a waitlist; now self-serve signup at superhuman.com/auth/signup with a demo request only for enterprise | OAuth plus payment | Google or Microsoft | Status and teaching: onboarding teaches the three habits that make the product good (keyboard, split inbox, Get Me To Zero) instead of settings | https://superhuman.com/ (fetched 2026-09-30); growth-loop sources in `_raw-growth-loops.md` |
| Cursor | Install, open, sign in, pick a folder, "ask Cursor to explain the codebase" | 0 | GitHub, Google, email | First-run imports VS Code extensions, settings and keybindings in one click [known pattern], so the tool feels already yours; the suggested first task is zero-risk and uses the user's own code | https://cursor.com/docs/get-started/quickstart (fetched 2026-09-30) |

What the best non-medical products share:

1. **Your own data is the demo.** Granola shows your next meeting, Cursor opens your repo, Otter joins your call. The first output is about the user's real life, not a sample.
2. **Import instead of configure.** Cursor imports VS Code, Granola imports your calendar, Superhuman imports your mailbox. None asks you to build a template from scratch.
3. **OAuth-only signup.** Zero typed fields is normal. A password field is now a tell of old software.
4. **Signup deferred until save.** ChatGPT and Loom viewers get value with no account. Chartside already does this on the Line and /go.
5. **The output travels.** Loom links, Granola shared notes, Otter emails to attendees. The artifact recruits the next user.
6. **Teach the habit, not the settings.** Superhuman's onboarding existed to install three behaviors. The clinician equivalent is: "call before every visit, hang up, sign from the text."

## Part 1D: Chartside today, timed on the live app (2026-09-30)

Tested on https://chartside-792894733520.us-central1.run.app (branch interface/ghost) with Playwright, desktop Chromium, test account test+research@example.com (no real personal data).

### Door 1: browser phone, no signup (`/go/phone`)

| Step | What happens | Clock |
|---|---|---|
| 1 | Page load | 0.1 s |
| 2 | Tap "Call Chartside". Greeting explains consent keys (2 agreed, 3 ask for me, 9 Spanish, 0 declined) | 1 s |
| 3 | Consent given (autopilot), "No patient handy? Play a sample visit" offered | 2 s |
| 4 | Sample visit plays (104 s of audio), or "Skip to end" | 3.7 s with skip |
| 5 | "Writing your note..." | 5.2 s |
| 6 | Spoken read-back of the note on the line | 34.5 s |
| 7 | Text message in the Messages tab: "your note from the 1:17 AM call is ready. Tap to save it (free): .../m/..." | 61.7 s |
| 8 | Tap link, interstitial "Your note is ready. Tap to open it", tap "Open my note" | about 2.5 s more |
| 9 | Stack with the full SOAP note, "Save this note" banner (email, then 6-digit code), "Save to sign" disabled until claimed | total about 65 s |

Without skip, the full sample visit run was about 106 s of audio plus about 30 s to draft. Measured: **first note visible in about 65 s with zero fields typed**, which beats every scribe in the teardown. Signing needs 2 more fields (email, code).

### Door 2: classic signup (`/register`)

- 5 typed fields plus 1 checkbox: full name, specialty (dropdown of 15), practice name, email, password, "Load a demo schedule" (pre-checked). SSO and "Email me a sign-in code" exist on `/login` but not on `/register`. No Google, Microsoft, Apple or Doximity sign-in.
- Filled by script in 3.1 s; a human needs about 45 to 60 s. Lands on `/today`.
- `/today` shows: a sidebar with 20+ destinations (Emergency, Hospital, Groups, Care management, Revenue, Risk adjustment, Quality, Research, Note QA, Impact, Insights, Templates, PDF forms, Compliance, Admin...), a "Getting started 0 of 5" checklist (record, make the note yours, connect EHR, two-step verification, invite team), 8 demo patients, and an **NPS prompt ("How likely are you to recommend Chartside to a colleague?") on the very first screen, before any value.**
- First note from here: pick a patient, Start, consent, record, end. Realistic 2 to 3 minutes including a short recording.

### Friction found (ranked)

1. **The landing page `/` leads with the web app, not the Line.** The hero is "Talk to your patient. Sign a note you can trust." with a long feature wall; the Line is a small "New" pill. "Try it free" goes to `/register` (5 fields), while the zero-field door is the secondary link "Try a sample call, no signup". The best door is hidden behind the worst one.
2. **Registered users land on the heavy back office.** New signups hit `/today` with 20+ nav items, EHR, 2FA and invite tasks, and an NPS survey. Nothing on `/today` shows the phone number or `/go`. The Line checklist exists only on `/go`.
3. **NPS asked before first value.** Remove for accounts younger than about 5 signed notes.
4. **Two hostnames.** The live site is `chartside-792894733520.us-central1.run.app` but SMS links point to `chartside-3zllbxrjya-uc.a.run.app`. A clinician signed in on one host will land signed out on the other; it also looks like phishing. Pin one canonical `APP_URL` (and a real domain before launch).
5. **Timestamps in the wrong zone.** The demo text said "your note from the 1:17 AM call" and the demo day lists visits at 3:30 AM to 11:00 AM for a US afternoon test. The layman will read this as broken. Use the browser or caller's time zone.
6. **Claim needs an email round trip.** Email then 6-digit code. For a phone caller, the verified caller number could claim with one SMS code, and "Continue with Google/Microsoft/Apple" or Doximity would remove typing entirely.
7. **Specialty is a dropdown, not inferred.** An NPI lookup already exists in `/go/settings` (`GoSettings.tsx` Npi section) but is not used at signup or claim. Typing an NPI (or name plus state) could fill name, credential, specialty and practice address in one field.
8. **Stack counts confuse a first-time guest.** After two demo calls the guest Stack said "4 to review, 2 to sign" and "1 to fix first", which reads as homework before they understand the product.
9. **No personalization in the first run.** Nothing asks "paste an old note" or "pick your note style"; style learning only starts at signing edits.
10. **Engine label visible to clinicians** ("Engine: Claude · claude-opus-5") in the sidebar; harmless but reads as developer UI.

## 1E. Onboarding upgrades for Chartside, ranked by impact over effort

Chartside already wins on the one metric that matters most: a note in about 65 s with zero fields typed. The gaps are three:
- the best door is hidden
- the claim step is heavier than it needs to be
- nothing makes the first note feel like *yours*

| Rank | Upgrade | Impact | Effort | Evidence |
|---|---|---|---|---|
| 1 | **Make the zero-signup door the front door.** On `/`, the hero CTA becomes "Hear it write a note (60 s, no signup)", linking to `/go/phone?autopilot=1`. "Try it free" goes to `/go`, not `/register`. After `/register`, land on `/go` (or `/today` in Line mode) with the phone number and `/go` shown first. Hide the back-office nav until the third signed note. Drop the NPS prompt until about 5 signed notes. | High | Small (copy, routes, one flag) | We already beat the about 3-minute median by 2 minutes, but only on the secondary link. Every fast competitor puts the demo in the main path (Heidi, Freed, Twofold). |
| 2 | **One-tap claim tied to the channel the user came from.** A caller claims with an SMS code to the number that just called (the number is already known). A browser guest gets "Continue with Google / Microsoft / Apple" plus the email code. Make `/register` passwordless. | High | Small to medium (the phone OTP exists in `api/auth/phone`; OAuth is new) | Nobody else claims by phone. OAuth is table stakes in 7 of 12. The password on `/register` is the only password-first flow among the fast scribes. |
| 3 | **NPI at claim fills everything.** One field (NPI, or name plus state) returns name, credential, taxonomy (so specialty and the default template), and practice city, plus a verified badge. Reuse the Npi lookup from `GoSettings.tsx`. For non-NPI users (vets, some therapists), offer a license number or "skip". | High | Small (the lookup exists) | OpenEvidence and Doximity grew on NPI verification. No scribe uses NPI taxonomy to auto-pick the specialty template. |
| 4 | **"Paste an old note, we'll match it" on the Stack after the first note.** Right under the first draft: "Want it to sound like you? Paste one of your old notes (names removed)". Regenerate the same visit in that style and show a before/after. Save as a visible style rule. | High | Medium (a template-from-example prompt plus a PHI scrub warning) | Heidi does it inside onboarding; OpenEvidence does it after signup. The Chartside twist: apply it to the note they just made, so the aha is immediate. |
| 5 | **Specialty-matched demo script and "call me to set up."** The sample visit picks up the specialty from NPI or a one-tap chip (therapy, PT, chiro, vet, primary care). Plus a "Set up by phone" option: keypad 6 already sets the PIN, so extend it to name, specialty and note style by voice. | Medium | Medium | Freed's scripts are per specialty. DeepCura's phone agent "Emily" is the only voice onboarding in the category, and it fits our phone-first bet. |

Smaller fixes (do anyway):
1. Use one canonical host in SMS links. Today the links point at `chartside-3zllbxrjya-uc.a.run.app` while the site runs on `chartside-792894733520...`.
2. Show local-timezone times in texts and the demo day ("1:17 AM call" confused the test).
3. Show a guest only their own new note, without "4 to review / 1 to fix first".
4. Hide the engine label from clinicians.
5. Add BAA acceptance to the claim step for paying users (Twofold does this at signup).

Deliberately not recommended now:
- **Calendar connect.** Nobody in medicine does it at onboarding. The Line's "next patient" flow doesn't need a schedule, and it adds an OAuth scope clinicians distrust.
- **EHR auto-detection.** Nobody does it. The Chrome side panel could sniff the EHR host later, but that is low leverage for phone-first solo users.

## 1F. Candidate patterns nobody in the category ships (could differentiate)

- **Claim by the phone you called from.** An SMS code to the verified caller ID. Zero typing on a phone.
- **NPI taxonomy picks the template.** Specialty inferred, not asked.
- **Style match on the note they just made** (not on a blank template).
- **"Sign in with Doximity."** Doximity has no public OAuth for third parties that we could find; worth one email to their partnerships team.
- **Pocket-card onboarding.** The printable `/line/card` plus the number saved as a contact is already built. Push "save Chartside to contacts" (vCard) right after the first note. It is the phone equivalent of "install the app".

---

# Part 2: Competitor moves, June through September 2026

Research limits: the search budget ran out, so some companies were searched lightly (Hippocratic AI, Google, Mentalyc, ScribbleVet, Freed, Ambience, Amazon). Several primary pages returned 403. Items marked **(context)** fall outside June to September 2026.

## 2A. By company

### Abridge
- **2026-06-11:**
  - Relaunched as a "clinician intelligence platform": pre-visit summaries, in-visit decision support in 28+ languages, post-visit notes, codes and orders.
  - Eli Lilly strategic investment (trial eligibility).
  - Nvidia model partnership.
  - Payer mediation with Aetna and Cigna.
  - Sources: https://medcitynews.com/2026/06/abridge-clinical-ai/ and https://www.statnews.com/2026/06/11/abridge-inks-deals-with-nvidia-and-lilly/
- **2026-08-28:** "Speak to Abridge AI" voice on the phone, Voiceprints enrollment, pre-visit and pre-round summaries, inline CPT, CME credits, and calculators filled from the conversation. https://www.abridge.com/blog/now-in-practice-august-2026
- **2026-09-14:** Pre-bill review for CDI and coding. https://www.abridge.com/blog/pre-bill-review-for-cdi-and-coding-teams-at-partner-health-systems
- **2026-09-22:** VA enterprise ambient contract (multi-award, $775.72M ceiling over 5 years, 75+ centers; Knowtex also selected). Scope includes behavioral health and PM&R. https://www.nextgov.com/artificial-intelligence/2026/09/va-selects-abridge-ambient-scribe-under-new-enterprise-contract/416140/
- **2026-09-29:** Allergy/Immunology and Palliative specialty models, Visit Dx grouping, self-serve user management. No patient-facing features. https://www.abridge.com/blog/now-in-practice-september-2026

### Epic
- **2026-08-17 to 20 (UGM):**
  - **Ergo**, a new AI-native clinician interface, ships November 2026.
  - Ergo Visit uses Art for pre-visit topics and in-visit queries.
  - **Emmie** (patient-facing, in MyChart) gathers the patient's topics for the physician.
  - Agent Factory (120+ agents).
  - 60+ orgs use Chart with Art.
  - Sources: https://www.techtarget.com/searchhealthit/news/366649337/Epic-unveils-AI-driven-Ergo-Visit-at-2026-UGM and https://healthtechhotspot.com/epic-ugm-2026-recap-cosmos-curiosity-epicops-and-an-expanding-ai-footprint/
- **(context) 2026-02-04:** AI Charting generally released. https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/

### Microsoft Dragon Copilot
- **2026-08:** A Marketplace offer type for partner "apps and agents" inside Dragon Copilot. https://learn.microsoft.com/en-us/partner-center/announcements/2026-august
- **2026-09-30:** "Clinical Applications" partner specialization. https://learn.microsoft.com/en-us/partner-center/announcements/2026-september
- **(context) 2026-03:** Nurse mobile app and radiology. https://www.healthcaredive.com/news/microsoft-expands-dragon-copilot-ai-assistant-nurses/802883/
- No new clinician-facing scribe interface in the window.

### Heidi Health
- **2026-06-03:** Floating picture-in-picture over the EHR, 16 more languages, Comms caller briefing. https://www.heidihealth.com/en-us/progress-notes/may-2026
- **2026-07-01:** "Dictate" into any app (90+ languages), Tasks, Forms (PDF to template), Remote firmware. https://www.heidihealth.com/en-us/progress-notes/june-2026
- **2026-07-15:** NHS Midlands sole supplier (70,000 clinicians, 1,239 GP practices). https://www.heidihealth.com/en-us/blog/nhs-launches-largest-ever-ai-scribe-procurement
- **2026-08-05:** Patients sidebar, system-level telehealth audio capture. https://www.heidihealth.com/en-us/progress-notes/july-2026
- **2026-09-07:** Team session view on the Free plan, offline recording on Remote. https://www.heidihealth.com/en-us/progress-notes/august-2026
- **2026-09-22:** $340M total ($100M Series C at a $900M valuation plus $240M from GC CVF). 2.8M visits a week, about $50M ARR. https://www.heidihealth.com/en-us/blog/heidi-secures-us340m-to-scale-agents-across-health-systems-globally
- **2026-09-28:** **Heidi II**, supervised agents that act on visit admin, plus Memory. Not in the UK or EU. https://finance.yahoo.com/healthcare/articles/heidi-ii-puts-agents-visit-130000837.html
- **(context) 2026-02:** Heidi Comms AI receptionist for patient calls and SMS. https://support.heidihealth.com/en/articles/13396153-heidi-comms
- **(context) 2026-03-23:** Heidi Remote, a 21 g clip-on wearable with on-device transcription. https://www.heidihealth.com/en-us/blog/heidi-launches-hardware

### OpenEvidence
- **About 2026-09-25:** $250M at a $15B valuation, about $300M annualized revenue. https://www.axios.com/pro/health-tech-deals/2026/09/25/openevidence-250m-raise-15b-valuation-a16z
- **(context)** Visits is a free ambient scribe with evidence-cited A&P. Coding was added March 2026.
- **(context) 2026-02-26:** **Doctor Dialer** wide release: free calls with practice caller ID, texting, fax, and automatic notes from patient calls. https://www.prnewswire.com/news-releases/openevidence-wide-releases-ai-integrated-doctor-dialer-for-privacy-centric-doctor-patient-telemedicine-calls-messaging-and-voicemail-in-one-unified-clinical-platformwith-live-clinical-decision-ai-deeply-integrated-302698511.html

### Doximity
- **2026-08-13 (FY27 Q1 call):** Scribe users grew **10x in July**. The company claims top-3 in AI search and in scribe. Scribe sits between telehealth, Dialer and Ask, and monetization is early. https://www.fool.com/earnings/call-transcripts/2026/08/13/doximity-docs-q1-2027-earnings-call-transcript/
- Free for MD, NP, PA and students only. Notes are generated from Dialer calls. https://www.doximity.com/clinicians/scribe

### athenahealth
- **2026-08-13:** **athenaAmbient GA to 170,000+ clinicians at no extra cost** in athenaOne. It drafts notes, infers diagnoses, suggests orders and flags care gaps. https://hitconsultant.net/2026/08/13/athenahealth-launches-native-ai-ambient-capabilities-athenaone/

### Oracle Health
- **2026-08-19:** Pro-fee coding, dictation into any field, chart review. https://www.fiercehealthcare.com/ai-and-machine-learning/oracle-health-announces-expansion-clinical-ai-agent-capabilities
- **2026-09-14:** Clinical AI Agent for inpatient nurses. https://hitconsultant.net/2026/09/14/oracle-health-launches-clinical-ai-agent-for-nurses-inpatient-ehr-documentation/

### Nabla
- **2026-07-28:** Nabla Dictation for Mac, on-device and integrated with Epic. https://www.nabla.com/press-release/nabla-launches-medical-grade-dictation-product-built-for-apple-devices

### Suki
- **2026-06-10:** The Developer Platform turns two (an embed SDK). https://www.suki.ai/blog/two-years-in-suki-developer-platform-clinical-ai/
- SDK updates in August and September. No new self-serve surface.

### Commure
- Free ambient scribe for providers at major health systems (work-email signup), a Chrome extension, and sync to 60+ EHRs. https://scribe.commure.com/lp-g
- EU MDR Class I on 2026-09-03 [unverified].

### Ambience, Sunoh, Amazon
- **Ambience:** no in-window launch found. (context: April roadmap, AutoAVS.)
- **Sunoh:** customer stories only (2026-06-04).
- **Amazon:** no in-window news.

### General-purpose AI
- **OpenAI 2026-09-01:** a read-only Epic connector for ChatGPT for Healthcare. https://techcrunch.com/2026/09/01/chatgpt-health-adds-epic-integration-for-clinicians-to-import-patient-data/
- **(context 2026-04-22):** ChatGPT for Clinicians is free for verified prescribers, with **no ambient recording**. https://hitconsultant.net/2026/04/23/chatgpt-for-clinicians-openai-launch-gpt-5-4/
- **Anthropic (context, January):** Claude for Healthcare. No scribe.

### Verticals and startups
- **Jane App, 2026-07-02:** AI Scribe for UK allied health, £15/mo with **5 free notes a month**, built into the PMS. https://londonlovestech.com/health-tech-company-launches-ai-scribe-for-private-health/
- **Patient-side scribes are rising:**
  - STAT 2026-06-04 covered VisitRecall, Advoca, AlignCare and Kin Health: https://www.statnews.com/2026/06/04/after-doctors-patient-ai-scribes-track-visits/
  - AHCJ 2026-07-17, "your patient may be recording this visit" (11 all-party states): https://healthjournalism.org/blog/2026/07/dear-doctor-your-patient-may-be-recording-this-visit/
  - (context) Kin raised a $9M seed in May: https://techcrunch.com/2026/05/18/kin-health-raises-9m-to-build-an-ai-notetaker-for-patients/
- **(context) Vertical EHR scribes:**
  - SPRY Agentic Scribe for PT/OT/SLP (April).
  - Instinct acquired ScribbleVet (January).
  - Covetrus scribe free inside Pulse.
  - DeepScribe SmartPrep for oncology (April).
- **(context) Smart glasses:** a Flinders study (Gemini on Ray-Ban Meta), research only. https://www.nature.com/articles/s41746-026-02494-9
- **Current offers (no launch date):**
  - Freed Front Desk AI receptionist with two-way SMS, from $149/mo.
  - DeepCura receptionist, $129/mo.
  - Plaud NotePin S wearable, about $169, with a BAA.
  - Small-vendor Apple Watch scribe apps.

## 2B. Interface modality matrix

"Phone" here means any phone channel. **None of these is "the clinician calls a number to create a note."**

| Company | Phone | SMS | WhatsApp | Wearable | Patient-side | Browser overlay | EHR-embedded | Free tier |
|---|---|---|---|---|---|---|---|---|
| Abridge | No | No | No | No | No | No | Yes | No |
| Epic Art / Ergo | No | No | No | No | Emmie (MyChart) | n/a | Native | Bundled |
| Dragon Copilot | No | No | No | No | No | No | Yes | No |
| athenaAmbient | No | No | No | No | No | n/a | Native | Included |
| Oracle | No | No | No | No | No | n/a | Native | No |
| Heidi | Comms receptionist (patient calls) | Comms | nav mention [unverified] | Remote | No | PiP window | Integrations | Yes |
| OpenEvidence | Doctor Dialer (clinician calls patient) | Dialer | No | No | [unverified] | No | Via deals | Yes |
| Doximity | Dialer notes | Dialer | No | No | No | No | Claimed | Yes (MD/NP/PA) |
| Commure | Sold separately | No | No | No | No | Chrome | 60+ sync | Yes (health-system staff) |
| Freed | Front Desk receptionist | 2-way | No | No | Patient instructions | Chrome | Browser push | Residents; trial |
| DeepCura | Receptionist, onboarding agent | Yes | No | No | Intake links | ? | Some | No |
| Nabla | No | No | No | No | No | Mac dictation | Epic | Yes |
| Plaud | No | No | No | NotePin | No | No | No | 300 min |
| Kin, VisitRecall, Medcorder | No | No | No | No | Patient records | No | No | Some |
| **Chartside (built)** | **Clinician call-in line** | **PHI-free note-ready and sign links** | No (no BAA) | Via phone and AirPods | Recap page and feedback link | Chrome side panel | SMART, HL7 | First note free |

## 2C. White space

1. **The clinician call-in scribe is uncontested.**
   - Every phone surface in the market is either an outbound patient-call app with notes (OpenEvidence and Doximity Dialers, which need their app, a verified prescriber and a patient on the line) or a patient-facing AI receptionist (Heidi Comms, Freed Front Desk, DeepCura).
   - Nobody lets a clinician dial from any phone, including a landline, car Bluetooth or a locked-down hospital phone, and get a note.
   - The closest is dictation (Heidi Dictate, Nabla Mac, Oracle), and all of it needs installed software.
2. **SMS as the sign-off loop is open.**
   - SMS is used to reach patients (reminders, intake, payments), never to hand the clinician a secure review-and-sign link.
   - Heidi II's "supervised agents, clinician approves" framing makes the approval surface the next battleground. A PHI-free text with a one-tap approve card is the lightest possible version of it.
3. **Free scribes shut out non-prescribers.**
   - Doximity, OpenEvidence and ChatGPT for Clinicians require prescriber or NPI status. The EHR-bundled ambient products (Epic, athena, Oracle, eCW) only reach their own EHR users.
   - Therapists, PT/OT/SLP, chiropractors, dietitians and vets pay $39 to $129/mo or get a scribe tied to a vertical EHR (SPRY, Jane, Covetrus, Instinct).
   - The big in-window deals (VA scope including behavioral health and PM&R, NHS Midlands) prove demand in rehab and behavioral health but serve only enterprise buyers.
   - A free-first-notes, phone-first product for solo non-prescribers has no free competitor.
4. **Zero-install for low-tech and locked-down clinicians.** This covers home health, mobile PT, house-call vets, rural solos, older clinicians who avoid apps, and residents on managed phones where app installs are blocked. Every competitor assumes an app, extension or EHR.
5. **Patient-made recordings have no clinician-side home.**
   - Kin, VisitRecall and Medcorder let patients record, and Epic Emmie gathers the patient's topics.
   - No clinician tool accepts a patient's recording (with consent) and turns it into the clinician's draft.
   - No product sends the patient a plain-language recap by SMS the moment the clinician signs.
   - Chartside's recap page could do both.
6. **A wearable without hardware.** Heidi Remote, Plaud and Omi sell devices. A phone call gives a "wearable" through AirPods or a car headset for $0.
7. **WhatsApp and iMessage voice notes outside the US.** Uncontested but blocked for us by the lack of a BAA. Worth revisiting for vets (not HIPAA-covered) and for non-US allied health.

Risks: free is squeezing the prescriber market (Doximity 10x, OpenEvidence at $15B, athena and Epic bundled). Enterprise buyers are consolidating on pre-visit through coding platforms (Abridge, Heidi II, Ambience). Stay focused on solo and non-prescriber clinicians, and make the all-party consent prompt on the line bulletproof.

## Top 3 white-space bets (summary)

1. **"Call-in scribe for everyone the free scribes exclude."** Therapists, PT/OT/SLP, chiropractors and vets, free for the first notes and priced below Freed. Nobody offers a phone door, and the free incumbents exclude these clinicians by design.
2. **"Approve by text."** Own the clinician approval loop, where a PHI-free SMS opens a one-card Stack for notes, agent-proposed edits and claims. It is the lightweight answer to Heidi II and Abridge's agent platforms.
3. **"The patient's recording becomes your draft."** Accept patient-side recordings and send the patient's recap after signing, turning the rising patient-scribe wave (Kin, VisitRecall, Emmie) into a clinician acquisition channel through the recap footer.
