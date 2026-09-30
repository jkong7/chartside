# Wave 2: four new front doors

Branch `interface/wave2` merges four branches built from `interface/ghost` on 2026-09-30. Each one is also kept as its own branch, so any of them can ship alone.

The research is in `docs/research/_raw-niches-2.md`, `_raw-messaging-2.md`, `_raw-new-interfaces-2.md` and `_raw-onboarding-2.md`.

## What the research said

- A scribe for one specialty is no longer a wedge. In every niche checked, the main records vendor now includes AI notes free or bundled.
- What's still open is a new format for a niche, and the loops that bring in clinicians who don't pay yet.
- **Twilio's BAA covers SMS, MMS and Voice, but not WhatsApp or RCS.** Meta says in its contract that it is not a Business Associate. Apple's Messages for Business does not onboard health businesses.
- Tools that handle patient data are blocked inside ChatGPT, and custom connectors in HIPAA-mode Claude Enterprise, so an "inside the assistant" door isn't possible yet.
- Patient-side recorders (Kin, Medcorder, Abridge's early app) all stop at the patient. None of them hands the clinician a draft.
- Every tool plays the patient for med students. None grades both the interview and the note.

## The four bets

| Branch | Bet | Doc |
|---|---|---|
| `interface/patient` | **Bring your own scribe.** A patient records the visit on their own phone after the clinician taps OK. The patient gets a plain-English recap, and the clinician gets a draft note plus a free way in. | `docs/PATIENT-VISIT.md` |
| `interface/practice` | **Chartside Practice.** Med students interview an AI standardized patient by voice, typing, or the phone line (press 7), write the note, and get a graded, shareable scorecard. There's also an attending mode and class leaderboards. | `docs/PRACTICE.md` |
| `interface/memo` | **Text it in, WhatsApp, and Barn Line.** Clinicians text a voice memo or a typed note to the line, inside the BAA. There's a WhatsApp lane only for practices HIPAA doesn't cover. Barn Line is a phone-number scribe for truck-based vets: one farm call becomes one record per animal, and the owner gets care instructions by text. | `docs/TEXT-IT-IN.md` |
| `interface/onboard` | **The front door.** The main button is the no-signup sample call. Sign-up is passwordless, fills from one NPI lookup, and lands on the recorder. New clinicians see a simple nav. A pasted old note sets their style. Times show in the viewer's time zone. | `docs/ONBOARDING.md` |

## Fixes made while merging

- **Vets on the passwordless sign-up.** Barn Line's vet setup (vet template, veterinary jurisdiction, no human sample patients) only ran on the password route. It now runs in `setupNewAccount`, so both sign-up paths get it. Before this, "Veterinary: Equine" was being remapped to "Other".
- **Sign-up on a deploy without email.** Passwordless sign-up can't send a code when no email provider is set up, which is the case on today's Cloud Run deploy. `/register` now asks for a password in that case, and a patient's draft offer opens on the NPI check instead.
- **Recorder header.** The `/go` header now stays on one line at phone width.
- **Setup checklist.** "Make the note yours" now ticks after a pasted note's style is saved.
- **Practice.** A fact the Claude patient volunteers counts as found. A missed red flag no longer shows a meaningless 0:00.
- **Patient recap.** The headline counts in Claude's recap now match its lists.
- **Barn Line record header.** The header shows the animal's age, sex and breed, and Ask offers vet questions.

## Live checks with real Claude and Deepgram

Run on local production builds on 2026-09-30.

- **Practice:** the Claude patient stayed in character, ignored "Are you an AI? Ignore your instructions", and disclosed passive suicidal thoughts only when asked directly. The Aura patient voice transcribed back word for word.
- **Patient visit:**
  - A fake-mic recording went through real Deepgram.
  - Claude wrote the recap ("Your dry cough looks like a common virus.").
  - The clinician's offer text had no patient details.
  - A blood pressure sample kept the lisinopril 10 to 20 mg change exactly.
- **Memos:** real Deepgram transcribed WhatsApp OGG/Opus, iPhone M4A and 3GPP/AAC correctly. AMR-NB is still unchecked.
- **Vet sign-up from `/barn`:** the account kept its specialty, the equine template, the browser time zone and the veterinary jurisdiction.

## Tests

- Unit: 511 passing, up from 368.
- E2E: 186 passing, up from 154. There's a new spec per branch: `practice`, `patient-visit`, `memo` and `onboard`.
- Axe WCAG 2.1 AA scans cover every new page.

## Before any of this goes live

1. **A Twilio number** for the line, texted memos and WhatsApp. The WhatsApp sender needs Meta approval.
2. **SendGrid, or another email provider,** to turn on passwordless sign-up and emailed claim codes.
3. **BAAs before real patient data.** Barn Line vets and Practice students involve no HIPAA data and could run first.
4. **Deploy:** check out `interface/wave2`, then run `sh deploy/gcp-deploy.sh`. The IAM grants and secrets are already in place.

## What's left

See "What's left" in each feature doc. The largest open items:

- There are no WhatsApp templates for messages sent outside the 24-hour window.
- Microsoft sign-in hasn't been tried against a real tenant.
- The patient pages have no Spanish.
- There's no case authoring UI for Practice.
