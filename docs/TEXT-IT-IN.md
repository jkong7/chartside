# Text it in, WhatsApp for non-HIPAA practices, and Barn Line

Branch `interface/memo`. Research: `docs/research/_raw-messaging-2.md` (bets 1 and 3) and `docs/research/_raw-niches-2.md` (#1 Barn Line).

## The bet

1. **Text a voice memo to the Line (MMS).** Twilio's BAA covers Programmable MMS, so this is the one messaging capture path inside a BAA we can sign. A clinician who dictates after a visit, or records in Voice Memos, texts the recording to the same number they call.
2. **WhatsApp lane** for practices HIPAA does not apply to (veterinary, and clinics outside the US). Meta will not sign a BAA, so US human-care practices are refused.
3. **Barn Line.** Ambulatory, equine and farm vets work from trucks with gloved hands, and one farm call covers many animals. No dial-in or text-in vet scribe exists.

## Flows

### MMS memo (`POST /api/sms/incoming`, signed like every Twilio webhook)

1. Twilio posts `NumMedia`, `MediaUrlN`, `MediaContentTypeN`. Audio types include what carriers produce: `audio/amr`, `audio/3gpp`, `video/3gpp`, `audio/mp4`, `audio/ogg`, `video/quicktime` (see `normalizeMime`).
2. Each audio item is downloaded with Basic auth from `TWILIO_BASE_URL` (only URLs on that host and the Twilio media path are fetched), then Twilio's copy is deleted with `DELETE .../Media/ME….json`. Pictures and other media are deleted unread. Every delete is audited (`memo.media_deleted`).
3. **Consent.** Unless the clinician has standing consent, the audio is sealed (AES-GCM) into `data/memo-holds` and a `memo_holds` row is written. The reply is: "Got your 0:22 recording. Reply YES if your patient agreed to be recorded, or NO to delete it…". Vets see "client".
   - `YES` starts the capture with consent method `text-confirmed` in the consent ledger.
   - `NO` deletes the file (`memo.consent_declined`).
   - No reply within `CHARTSIDE_MEMO_HOLD_HOURS` (default 24): the hourly job and every inbound text purge it (`memo.hold_expired`).
   - `ALWAYS` (verified clinicians only) confirms the held memo and sets standing consent ("I get consent in the room"), method `standing`. `ALWAYS OFF` turns it back off. Both are audited.
4. The note is written in the background (Deepgram, then Claude or the offline engine). When it is ready, a PHI-free text goes out through `sendText` with a single-use `mintLoginLink`: "Chartside: your note from the 0:22 recording is ready. Review and sign: …/m/…".
5. **Unknown numbers** get a guest (phone-keyed, try-first like the phone line, capped by `CHARTSIDE_GUEST_MEMOS_PER_NUMBER`), and the ready text says "Tap to save it (free)". Guests are purged if unclaimed.
6. **Too big.** Anything over `CHARTSIDE_MEMO_MAX_MB` (default 25), or a text of `UPLOAD`, gets a single-use link to `/go/upload`, a phone-first page that takes any audio file with a consent checkbox and posts to `/api/capture`.
7. **Text dictation.** A text starting with `NOTE`, or 25 or more words that aren't a command, becomes a dictated note for a verified clinician. The offline engine places each dictated sentence in the right section (`placeDictation`). Inbound SMS is inside the BAA. Outbound stays PHI-free.

### WhatsApp (`POST /api/whatsapp/incoming`)

- Org setting `jurisdiction`: `us_hipaa` (default), `veterinary`, `non_us`. The owner changes it in Admin, Line ("Who your practice treats"). It is owner-only and audited (`org.jurisdiction`). Signing up with a Veterinary specialty sets `veterinary`.
- Unknown senders and senders in a `us_hipaa` org get a polite refusal. Their media is deleted unread.
- Eligible senders: voice notes (`audio/ogg` Opus) go through the same download, delete, consent and capture path. Text starting with `NOTE` is dictation. The ready reply carries the note inline, split into numbered messages of at most 1600 characters, plus "Edit and sign: <link>". It is sent with the Messages API with the `whatsapp:` prefix (`TWILIO_WHATSAPP_FROM`).
- **24-hour window.** Free-form replies are only sent within 24 hours of the sender's last message (`messaging_sessions`). Outside it, the send is skipped and audited (`whatsapp.skipped`). Proactive WhatsApp messages would need an approved PHI-free utility template (Content API), which is not built.

### Barn Line (vet mode)

- Signup specialties: Veterinary: Large animal, Equine, Mixed, Small animal. These set the default template, set the org to `veterinary`, and skip the human demo clinic.
- Templates (`src/lib/engine/templates.ts`): `vet_equine`, `vet_lameness` (AAEP grade and limb), `vet_herd` (withdrawal times only as stated), `vet_repro`, `vet_small_soap`. Vet users see vet and general templates only. Human users never see vet templates.
- Vet vocabulary (`src/lib/engine/vet.ts`): species and sex words, breeds, drugs (xylazine, detomidine, Banamine, bute, Excede, Draxxin…), and fixes for common mishearings ("banana mean" becomes Banamine). Vet notes are written by the vet builder (or Claude with vet section instructions), never by the human engine, so animal terms are never filed as human diagnoses or codes. No coding, claims or orders run for vet visits.
- Animals are patients with `chart.animal` (species, breed, sex, age, tag, owner, owner phone, herd or barn).
- **One call, many animals.** `splitAnimals` finds markers like "first horse is Biscuit", "next horse, Duchess", "moving on to cow 214". Each animal gets its own encounter, consent copy, transcript slice and record. The shared farm preamble (owner, barn) fills in every animal. Each animal's template is picked from what was said (lameness, repro, herd, small animal). This works for calls, texted memos, WhatsApp notes and typed notes.
- **Texts carry the record** for non-HIPAA orgs: the vet's ready text includes the records plus the edit link.
- **Owner instructions.** After the vet signs, if the org is `veterinary`, owner texts aren't turned off (`settings.ownerTexts`), the animal has an owner phone, and the owner hasn't replied STOP (`text_optouts`), the owner gets one text: "Care instructions for Biscuit from Dr. Lee:", then plain-language lines ("PO BID" becomes "by mouth twice a day"), then "Prepared with Chartside. Reply STOP to opt out." It is transactional only and sent at most once per visit.
- `/barn` landing page ("Your vet scribe is a phone number."), with a sample farm call, how multi-animal works, the record and owner text, a pricing placeholder, the FAQ and an OG image.

## Safety and PHI rules kept

- Webhooks are signature-checked. Media is fetched only from the Twilio host. Twilio's copy is always deleted.
- No audio becomes a note until consent is confirmed by YES, or by a verified clinician's standing attestation, and it is recorded in the consent ledger with the new `text-confirmed` or `standing` method.
- Outbound SMS for `us_hipaa` orgs always goes through the PHI guard. Only `veterinary` and `non_us` orgs may send note content (`sendText(..., { content: true })`), and WhatsApp is hard-gated the same way.
- Nothing is signed, ordered or billed by text. Links are single-use magic links.

## Manual testing

`TWILIO_AUTH_TOKEN=… node scripts/fake-twilio-text.mjs --base=http://localhost:3153 --from=+15550100001 --media=<twilio-style media url> [--whatsapp] [--body="YES"]` posts a signed webhook.

## Tests

Last full runs: unit 406 passed (89 files, 38 new tests in 5 files), e2e 163 passed (9 new in `memo.spec.ts`).


- Unit: `memo.test.ts` (media fields, SSRF guard, durations for wav, m4a, ogg and amr, intents, consent hold state machine, message splitting), `memo-flow.test.ts` (YES, NO, timeout, ALWAYS and ALWAYS OFF, guest, oversize, non-audio, dictation, all against a local fake Twilio and Deepgram), `whatsapp.test.ts` (eligibility, owner-only jurisdiction, refusal, inline vet reply, 24-hour window), `vet.test.ts` (vocabulary, species, AAEP grade, animal markers, splitting, template choice, owner text), `barn.test.ts` (texted farm call split into 3 records, owner text on sign, STOP honored).
- E2E `tests/e2e/memo.spec.ts`: MMS YES path with deletion and PHI-free link, then sign; NO path; text dictation; oversize upload link to `/go/upload`; WhatsApp refusal for a US practice and an unknown sender; WhatsApp inline record for a vet; Barn Line farm call split and owner text after signing; owner-only jurisdiction toggle; axe checks on `/barn` and `/go/upload`, plus the OG image.

## What's left

- The phone line's spoken consent prompt still says "patient" for vets. A vet voice for the call script is next.
- WhatsApp utility templates for proactive messages (brief, sign reminders), and a Twilio Content API mock.
- `SEND owner`, `LAST` and `HORSE Biscuit` SMS commands. Invoice lines from spoken charges.
- Carrier behavior for oversized MMS (strip, compress or link) needs testing on real AT&T, Verizon and T-Mobile phones. AMR and 3GPP decoding depends on Deepgram's format support and should be checked with a real key.
- The draft-ready hook is in memory. If the server restarts mid-draft, the ready text for that memo is not sent (the note still lands in To review), the same as the phone line.
- Meta's AI Providers clause: WhatsApp use must be positioned as the clinic's own documentation service, and access can be cut by Meta.
