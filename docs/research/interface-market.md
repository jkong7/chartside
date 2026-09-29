# Interface market research: what gets a layman to try an AI scribe

This is research slice A for the `interface/ghost` branch. It pulls together six raw reports in this folder:

- `_raw-viral-formats.md`
- `_raw-clinician-adoption.md`
- `_raw-growth-loops.md`
- `_raw-thin-front-heavy-back.md`
- `_raw-device-surfaces.md`
- `_raw-voice-agent-ux.md`
- `_raw-novel-paradigms.md`

Engineering feasibility is covered in `interface-feasibility.md` (slice B). The plan that came out of both is `docs/INTERFACE-PLAN.md`.

## The short version

1. **Scribes are no longer rare.** Epic ships AI Charting, Doximity gives a scribe away free, and the measured time saved is small. What decides whether someone uses one is how easy it is to start and how little it asks of them during clinic.
2. **The formats that took off in 2025-2026 need no app and no setup:**
   - Instinct AI works by texting or calling a phone number. It raised money at a $10B valuation on 2026-09-28.
   - Poke works in iMessage.
   - Meta Muse needs no setup because it already knows who you are. It hit #1 on the App Store on 2026-09-18.
   - Granola writes notes without adding a bot to your meeting.

   Hardware that tries to replace the phone failed: Humane, Rabbit, Friend.
3. **No modern AI scribe offers "call a number, get a note."** The format is familiar, though. Many clinicians trained on dial-in dictation lines (2 to record, 4 to pause, 5 to end), and those services still sell today.
4. **Clinicians' biggest complaints are about the interface, not note quality:**
   - copying text into the EHR
   - installs and logins at the point of care
   - phone battery drain
   - lost recordings
   - consent friction
   - notes that run too long

   A phone call removes four of these at once.
5. **In medicine, growth spreads from doctor to doctor.** OpenEvidence reached 40% of US physicians with free access for verified clinicians, and 95% of new users heard about it from another physician. Output that doubles as an ad (like Loom and Calendly links, or Granola's shared notes) is well documented. Paying cash for referrals is a real Anti-Kickback risk (eClinicalWorks settled for $155M, athenahealth for $18.25M). Free months, equal for both sides and capped, are the safe pattern.
6. **Heavy software gets a thin front door through cards and an agent** (Ramp, Brex, Abridge). The consistent safety rule is that the agent proposes and a person decides on a screen. No leading product signs, orders or submits by voice.

## Concepts, ranked for a layman

Each concept is scored 1 to 5 on four things:

- **Zero setup:** how little a clinician must do before the first note.
- **Aha under 60 seconds:** how fast they see the value.
- **Spreads by itself:** whether using it naturally shows it to others.
- **Fits clinic:** whether it fits a real clinic day.

| Rank | Concept | Zero setup | Aha under 60 s | Spreads by itself | Fits clinic | Why a layman would use it |
|---|---|---|---|---|---|---|
| 1 | **The line** (call a number, hang up, tap the text) | 5 | 5 | 4 | 5 | Every clinician knows how to make a call. It works on a clinic landline, needs no Wi-Fi, and doesn't drain the phone battery. |
| 2 | **Try in the browser** (`/go/phone`, `/go`) | 5 | 5 | 4 | 3 | One link, and it works on any laptop. It is the demo and the fallback when a call isn't practical. |
| 3 | **The stack** (swipe to sign at the end of clinic) | 4 | 4 | 2 | 5 | Heavy workflows (codes, co-sign, queries) shrink to one decision per card. Clinicians reach "inbox zero" before leaving. |
| 4 | **Text the line** (STATUS, LINK, end-of-clinic nudge) | 5 | 3 | 3 | 4 | It is a pager for your chart. Texts never carry patient details. |
| 5 | **EHR side panel** (record beside the EHR, fill the fields) | 2 | 4 | 2 | 5 | This removes the copy-paste hop, which is the number one complaint. It needs Chrome and an extension install. |
| 6 | **iPhone Shortcut + Voice Memos** | 2 | 3 | 3 | 4 | Records with the screen locked, which a web page on iOS cannot do. Setup is involved. |
| 7 | **Ask your chart** (voice or text agent) | 4 | 3 | 1 | 4 | Handy once people are hooked, but not what brings them in. |
| 8 | Wearables, glasses, Watch | 1 | 3 | 3 | 2 | These need hardware or native apps. Meta's glasses toolkit bars audio streaming in published apps. |
| 9 | iMessage / WhatsApp agent | 5 | 4 | 5 | 1 | Neither platform signs a BAA, and Meta banned general chatbots from WhatsApp in January 2026. |
| 10 | Computer-use agent that drives the EHR | 3 | 2 | 2 | 1 | The best agent finished only 36% of HealthAdminBench tasks. It isn't ready. |

## Viral angles we combine

These combine formats that are already viral with pieces new to healthcare:

1. **"Your scribe is a phone number."** Instinct AI's format (a phone number, not an app) plus the old dictation keypad, rebuilt for ambient AI.
2. **First note free, no signup.** Any caller gets a guest note, and signing up is the "save" button (the Meta Muse "it already works" effect). A phone guest verifies their number just by tapping the texted link.
3. **The text is the receipt.** Instinct users posted screenshots of finished tasks. Our text-back ("your note from the 3:42 PM call is ready") is the moment clinicians screenshot.
4. **Save to contacts.** A contact card (vCard) puts "Chartside Scribe" in the phone book, next to the numbers clinicians already call all day.
5. **Seeing it work in the browser.** A browser phone runs the real call with captions. A sample visit lets anyone try it without a patient. A 30-second real call plays on the landing page.
6. **Output as the ad, with no patient data.** Four places carry it:
   - The patient recap footer says "Prepared with Chartside for Dr. X".
   - Colleague share links say "Written with Chartside in 41 seconds".
   - A weekly receipt card shows hours back.
   - Each has its own share image.
7. **Doctor to doctor.** Referral links show "Dr. X invited you" on the landing page. Both sides get a free month, capped, with no cash. A one-time invite prompt appears after the third signed note.
8. **Speaks Spanish on day one.** Press 9 and the line asks the patient for consent in Spanish and records the visit in both languages. That opens bilingual clinics, which general tools serve poorly.
9. **Self-attested NPI.** An NPI (the national clinician ID) plus state matched against the public NPPES registry gives a "clinician" badge. It is treated as self-attested and grants nothing abusable.

## Who to aim at first

Private-practice therapists, chiropractors, and solo PT, OT and speech clinicians adopt fastest with the least IT. Veterinarians are faster still and aren't covered by HIPAA. Residents bring their attendings along through co-signing. Enterprise buyers keep the web app, SSO and SMART launch.

## What would change the plan

- **A real Twilio number and BAA.** The line is built and tested against Twilio's exact Media Streams protocol, but not yet on a real number.
- **Evidence that clinicians won't leave a phone face down in the room.** The browser recorder and side panel cover that case.
- **Carrier or state rules on recording by phone.** Consent is asked and logged on every call regardless of the state's rules.
