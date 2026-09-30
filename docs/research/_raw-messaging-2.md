# Messaging as a scribe interface (raw research, track 2)

Date: 2026-09-30. Branch context: `interface/ghost` (Chartside Line). Author: research subagent. No code was changed.

Scope: can a clinician use a messaging thread (SMS/MMS, RCS, WhatsApp, iMessage, Telegram, Signal, Slack, Teams, secure texting apps) to send a visit recording or a voice memo and get a note back, without leaking PHI? Which bets are buildable on the Twilio + Deepgram + Claude stack Chartside already has?

Confidence tags: **[verified]** means I read the primary source on the date above. **[secondary]** means a third-party summary. **[unverified]** means inference or something to test on a device before shipping.

---

## 0. TL;DR

1. **MMS is the only consumer messaging channel that is on Twilio's HIPAA-eligible list.** Twilio's "HIPAA Eligible Services" document (last updated 2026-06-30) lists Programmable SMS, Programmable MMS, phone numbers, Messaging Features, Voice, Media Streams, Conversation Relay and Conversations (classic) SMS/MMS. It does **not** list WhatsApp or RCS. [verified]
2. **Meta will not sign a BAA, and says so in its contract.** Meta Terms for WhatsApp Business Platform, section 4.2 (last modified 2026-09-23): "Meta is not a Business Associate or Subcontractor ... and the WhatsApp Business Platform is not HIPAA compliant." No BSP can fix that, because Meta is always in the path. [verified]
3. **Apple is not onboarding health businesses to Messages for Business at all.** Apple's policies page: "At this time, Apple is not onboarding businesses that primarily offer medical or health-related services or products." It also forbids "bot-only" solutions. [verified]
4. **WhatsApp also bans AI-first businesses** unless AI is "incidental or ancillary" (section 4.7, AI Providers). Carve-outs were time-boxed for the EU and Italy (2026-02-16 to 2026-05-12) and are live for Brazil since 2026-03-11 with a per-message fee. A scribe is AI-primary, so outside Brazil it is a policy-risk channel even where HIPAA does not apply. [verified]
5. **Carrier MMS size is the real constraint, not Twilio.** Twilio has no inbound MMS size cap, but carriers cap MMS at roughly 1 MB (AT&T), about 1.7 MB (Verizon) and 3 MB (T-Mobile). That covers a 1 to 3 minute dictation, not a 20 minute visit. [secondary]
6. **Best bet:** "Text a voice memo to the Line." Extend `/api/sms/incoming` to accept MMS audio, transcribe with the existing `transcribeWithDeepgram`, reply with the existing PHI-free link text, and hand anything too big for MMS to a single-use upload link. Zero new vendors, stays inside the Twilio BAA.

---

## 1. WhatsApp

### 1.1 Healthcare policy and BAA status (2026)

| Question | Answer | Source |
|---|---|---|
| Does Meta sign a BAA? | No. Contract says Meta is not a BA and the platform is not HIPAA compliant (section 4.2, "Prohibited Data"). Also: "We make no representations or warranties that the WhatsApp Business Platform meets the needs of businesses regulated by laws ... such as healthcare." | Meta Terms for WhatsApp Business Platform, modified 2026-09-23, https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform [verified] |
| Can a BSP (Twilio, 360dialog, Infobip, Vonage, Sinch, Gupshup) sign one that covers WhatsApp? | A BSP can sign a BAA for its own processing, but Meta still receives, stores (media for up to 30 days) and routes the message, and Meta refuses BA status. Twilio explicitly leaves WhatsApp off its HIPAA list. Vonage documents BAAs for Video, Voice and SMS, not WhatsApp. I found no BSP that claims WhatsApp is BAA-covered. | Twilio HIPAA Eligible Services PDF (2026-06-30), https://twil.io/HIPAA-eligible-products-and-services [verified]; Vonage HIPAA page https://www.vonage.com/communications-apis/healthcare/hipaa-compliance/ [secondary] |
| Business Messaging Policy on health | "Don't use WhatsApp for telemedicine or to send or request any health related information, if applicable regulations prohibit distribution of such information to systems that do not meet heightened requirements." Also requires opt-in and "prompt, clear, and direct escalation paths" to a human. Effective 2026-09-23. | https://whatsappbusiness.com/policy/ [verified] |
| AI Providers clause | Section 4.7: "AI Providers" (LLMs, generative AI platforms, general-purpose assistants, "as determined by Meta in its sole discretion") are "strictly prohibited" when AI is the "primary (rather than incidental or ancillary) functionality." Rolled out to new users 2025-10-15 and all users 2026-01-15. | Meta terms above [verified]; respond.io, https://respond.io/blog/whatsapp-general-purpose-chatbots-ban [secondary] |
| Regional AI carve-outs | Meta's AI-provider pricing page: EU/EEA countries and Italy allowed with per-message charges 2026-02-16 to 2026-05-12 (ended); **Brazil** allowed with charges from 2026-03-11 (current). Third-party report quotes about EUR 0.049 to 0.132 per non-template message. Note: our earlier `_raw-viral-formats.md` says the EU ban was reversed on 2026-07-13; Meta's own page shows the EU window as ended 2026-05-12. Treat the EU as closed unless re-verified. | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers [verified]; https://almcorp.com/blog/meta-whatsapp-rival-ai-chatbots-eu/ [secondary] |

**Bottom line for the US:** any PHI through WhatsApp is out. Even a PHI-free "your note is ready" message is fine legally, but a clinician will reply with a voice note of the visit, and at that point PHI has transited Meta with no BAA. You cannot un-receive it.

**Bottom line outside the US:** HIPAA does not apply, but local law does (India DPDP Rules notified 2025-11-14 with full obligations from 2027-05-13; Brazil LGPD treats health data as sensitive; UK GDPR plus NHS/GMC guidance). And the AI Providers clause applies everywhere except Brazil. A scribe whose entire product is AI would be arguing that AI is "ancillary," which is weak.

Sources: DPDP timeline https://www.india-briefing.com/news/india-dpdp-compliance-timeline-enforcement-2026-27-44740.html/ [secondary]; PIB notification PDF https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf.

### 1.2 Voice notes through the API

| Item | Meta Cloud API | Twilio WhatsApp |
|---|---|---|
| Inbound voice note type | `audio` message; voice notes are OGG with Opus codec, mono. No separate "voice" flag documented on the media page. | Webhook form fields `NumMedia=1`, `MediaUrl0`, `MediaContentType0=audio/ogg`. WhatsApp inbound carries at most one media item per message. |
| Supported audio | AAC, AMR, MP3, M4A, OGG (Opus only, mono). 16 MB max each. | Twilio outbound WhatsApp media cap 20 MB (Twilio accepted-MIME page). |
| Download | `GET /{MEDIA_ID}?phone_number_id=...` returns a URL that **expires after 5 minutes**; then `GET <url>` with bearer token. Webhook media IDs expire after 7 days, API-uploaded IDs after 30 days. | `GET MediaUrl0` with HTTP Basic auth (API key SID/secret) when media protection is on. Twilio keeps media until you `DELETE /2010-04-01/Accounts/{Sid}/Messages/{MsgSid}/Media/{MediaSid}.json`. |
| Delete | `DELETE /{MEDIA_ID}?phone_number_id=...` | Media resource DELETE returns 204. |
| Extra webhook fields | n/a | `ProfileName`, `WaId`, `Forwarded`, `FrequentlyForwarded`, `OriginalRepliedMessageSid`, `ButtonPayload`, `ChannelMetadata`. |

Sources: Meta media docs https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media [verified]; Twilio webhook request https://www.twilio.com/docs/messaging/guides/webhook-request [verified]; Twilio media resource https://www.twilio.com/docs/messaging/api/media-resource [verified]; Twilio accepted MIME types https://www.twilio.com/docs/messaging/guides/accepted-mime-types [verified]; Twilio WhatsApp audio tutorial https://www.twilio.com/en-us/blog/transcribe-audio-messages-with-twilio-whatsapp-and-openai-speech-to-text [secondary].

Practical size math [unverified estimate]: WhatsApp voice notes are low-bitrate Opus (tens of kbps), so 16 MB is on the order of an hour of speech. That is the one thing WhatsApp does much better than MMS.

Deepgram accepts OGG/Opus directly, so no transcode is needed for `transcribeWithDeepgram(buffer, "audio/ogg", lang)`.

### 1.3 24-hour window and templates

- Any user message opens a 24-hour customer service window; within it the business may send free-form (non-template) replies. Outside it, only approved templates. [verified, WhatsApp Business Messaging Policy]
- Template categories: marketing, utility, authentication. Utility templates sent inside an open window are free (since 2025-07-01). [verified, Meta pricing page https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing]
- **Conflict to resolve before launch:** EngageLab (updated 2026-09-11, citing a Meta update of 2026-09-10) says that from **2026-10-01** service (non-template) replies are charged after the first 1,000 per business number per month, at the market's utility rate. Meta's pricing page as fetched today still says non-template messages in the window are free and describes 2026-10-01 only as market-specific rate-card changes. https://www.engagelab.com/blog/whatsapp-business-api-pricing [secondary]. Re-check the day of launch.
- Clinician-initiated flow ("here is my voice note") always opens the window, so the note-ready reply is free-form. Only proactive nudges (morning brief, "3 notes to sign") need a utility template, which must itself be PHI-free.

### 1.4 Cost

- Twilio fee: $0.005 per WhatsApp message, inbound and outbound. Meta fee passed through: utility or authentication template outside the window about $0.0034 (US/North America rate as shown by Twilio). Free-form within the window: no Meta fee (subject to the 2026-10-01 question). https://www.twilio.com/en-us/whatsapp/pricing [verified]
- A clinician sending 20 voice notes a day and getting 20 replies: about 40 x $0.005 = $0.20 per day in Twilio fees, plus storage and Deepgram. Cheap. Cost is not the issue; policy is.

### 1.5 How clinicians actually use WhatsApp today

- **UK:** NHS England's 2022 guidance allows commercial messaging apps like WhatsApp where no practical alternative exists, for operational coordination; staff should use encrypted apps, hide lock-screen previews, and delete messages once added to the record. GMC position: the "sum of information" can identify a patient; patient-specific advice should go through governed tools (e-Referral Advice and Guidance, Consultant Connect, Cinapsis). https://www.iatrox.com/blog/can-uk-doctors-use-whatsapp-clinical-advice-2026 (2026-07-05) [secondary]; Sherwood Forest trust IM guidance https://www.sfh-tr.nhs.uk/media/qu0lptlk/ig-13-instant-messaging-guidance-version-2.pdf [secondary].
- **Usage is near-universal in practice:** a 2026 PMC study "When practice outpaces policy: WhatsApp use among nursing and medical staff" reports professional WhatsApp use by 100% of physicians and 97.4% of nurses surveyed. https://pmc.ncbi.nlm.nih.gov/articles/PMC13045068/ (search snippet; full text was captcha-blocked, so country and sample size not confirmed) [secondary].
- **India:** the "WhatsApp CME India Group" (started 2016, now seven groups). Of 581 respondents, 43% use WhatsApp academic groups for CME, 32% open the group more than four times a day, 77% join mainly to discuss challenging cases. https://pubmed.ncbi.nlm.nih.gov/39227936/ [secondary]. Clinics use WhatsApp for reminders and report delivery (vendor claims of 25 to 40% fewer no-shows). https://hyperleap.ai/blog/whatsapp-clinics-hospitals-india-patient-communication [secondary, vendor].
- **Brazil:** CFM Resolution 2.314/2022 regulates telemedicine; WhatsApp is accepted for "teleorientacao" and for case discussion in closed groups of registered physicians, but is not considered a safe platform for teleconsultation. A SciELO study found 62.5% of surveyed physicians used it mainly to answer patient questions and 62.5% considered it ethical, while 37.5% complained patients trivialize it. https://www.scielo.br/j/bioet/a/m7VRmh7JMs4SJQHZBrFJxvS/?lang=pt ; https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf ; https://www.sogesp.com.br/noticias/perguntas-e-respostas-uso-do-whatsapp-na-comunicacao-medico-paciente/ [secondary].
- **General pattern (all regions):** doctor to doctor case groups, doctor to patient voice notes and photos, clinic to patient reminders and report PDFs. Voice notes are the default input for busy clinicians who do not type. Record keeping is the known gap: https://pmc.ncbi.nlm.nih.gov/articles/PMC8708459/ ("WhatsApp in Clinical Practice: The Challenges of Record Keeping") [secondary].
- **Africa / LATAM patient side:** WhatsApp is the default channel for 100M+ users in Sub-Saharan Africa; examples below are patient-facing, not scribes.

### 1.6 WhatsApp-native medical assistants and scribes

| Product | What it is | Traction found |
|---|---|---|
| AISHA (Nigeria) | AI health triage on WhatsApp in Hausa, Yoruba, Igbo, Pidgin, English; "AISHA Pro" clinical decision support for pharmacists/PPMVs launching Q3 2026. https://www.aisha.ng/ | Not disclosed |
| AwaDoc (Nigeria) | AI health advice plus verified doctors on WhatsApp. https://www.awadoc.com/ | Not disclosed |
| QwamCare (Nigeria, Ghana) | AI triage, prescriptions, doctor in minutes on WhatsApp. https://www.qwamcare.com/ | Not disclosed |
| CellAssist (India) | Clinic assistant: AI voice agent plus WhatsApp, 20+ Indian languages (front desk, not scribe). https://www.cellassist.ai/best-ai-clinic-assistant-india | Not disclosed |
| Eka Care / EkaScribe (India) | Ambient scribe (Sept 2025, own Parrotlet model); WhatsApp is used for patient reminders and Rx delivery, capture is in-app. https://ekascribe.ai/ | Not disclosed |
| Dr. Assistente (Brazil) | App-based scribe; claims 10,000+ doctors and Rede D'Or. Not WhatsApp-native. https://doutorassistente.com.br/ | 10k+ doctors (self-reported) |
| Voa Health (Brazil) | Scribe that works alongside WhatsApp video teleconsults (screen share), not inside WhatsApp. https://voa.health/ | Not disclosed |

**Finding:** I found **no clinician-facing, WhatsApp-native "send a voice note, get a note" scribe with public traction** in 2026. The likely reasons are exactly the two blockers above: Meta's AI Providers clause and the health-information policy. This is both a gap and a warning.

---

## 2. SMS, MMS and RCS

### 2.1 Can a clinician MMS a voice memo to a Twilio number?

Yes, for short recordings.

- **Twilio accepts inbound audio** of these MIME types: audio/ogg, audio/mpeg, audio/mp4, audio/mp3, audio/3gpp, audio/3gpp2, audio/basic, audio/L24, audio/vnd.rn-realaudio, audio/vnd.wave, audio/ac3, audio/webm, audio/amr-nb, audio/amr. https://www.twilio.com/docs/messaging/guides/accepted-mime-types [verified]
- **Twilio outbound MMS cap:** 5 MB (message plus media). RCS 16 MB (falls back to MMS at 5 MB). WhatsApp 20 MB. Same page. [verified]
- **Inbound size:** Twilio support states there is no size limit on incoming MMS to Twilio numbers and no transcoding of inbound media. [secondary; the support article returned 403 to the fetcher, text came from search snippet]
- **Carrier caps decide what arrives:** AT&T about 1 MB, Verizon about 1.7 MB, T-Mobile about 3 MB. https://www.att.com/support/article/wireless/KM1041906/ ; https://support.bandwidth.com/hc/en-us/articles/360014235473-What-are-the-MMS-file-size-limits [secondary]
- **Rough capacity [unverified estimate, test on device]:** AAC voice memo at about 64 kbps is about 0.5 MB per minute, so AT&T fits about 2 minutes and T-Mobile about 5. AMR-NB at 12.2 kbps is about 90 KB per minute, so even AT&T fits about 10 minutes, but iOS decides the codec, not us. What the phone does when the file is too large (fail, compress, or silently send as a link) must be tested per carrier and per OS.
- **iMessage interception [unverified, test]:** if the Twilio number is not an iMessage handle, iPhone sends as SMS/MMS (green bubble) or RCS if the sender supports it. A shared file from Voice Memos goes via MMS; the in-thread microphone "audio message" also goes via MMS to non-iMessage numbers.
- **Pricing:** US MMS inbound $0.0165 to $0.02, outbound $0.022; SMS $0.0083 per segment plus carrier pass-through fees. https://www.twilio.com/en-us/sms/pricing/us [verified]

**Implication:** MMS is perfect for the **post-visit dictation** use case (60 to 120 seconds: "Mrs. K, follow-up for knee, here is what we did...") and for **patient pre-visit voice notes**. It is not the channel for a full ambient visit. For that, keep the phone call (already built) or hand off to an upload link.

### 2.2 Twilio BAA scope

From "HIPAA Eligible Services", last updated **2026-06-30** (PDF text extracted today): Studio, Functions, Assets, TwiML Bin, Sync; Programmable Voice (recordings, transcription, Media Streams, Conversation Relay, `<Transcription>`, speech recognition, Polly TTS); **Programmable SMS basics, Programmable MMS, Twilio phone numbers (long code, toll-free, short code), Messaging Features (Advanced Opt-out, sticky sender, scheduling, link shortening, Compliance Toolkit, Consent Management API)**; Conversations (classic) chat/SMS/MMS/group texting; Verify (SMS, voice, push); Lookup; Event Streams; Flex; Segment (partial). Change log: MMS added 2021-09-30; Conversation Relay 2025-03-17; Compliance Toolkit and Consent Management API 2026-06-30.

**Not listed: WhatsApp, RCS, SendGrid.** A BAA needs Security Edition or Enterprise Edition. https://www.twilio.com/en-us/hipaa ; https://twil.io/HIPAA-eligible-products-and-services [verified]

### 2.3 RCS Business Messaging (US, 2026)

- Twilio RCS GA 2025-08-26 through Programmable Messaging and Verify; all four major US networks live by 2025-10-17 (AT&T last). https://www.twilio.com/en-us/press/releases/rcs-general-availability ; https://www.twilio.com/en-us/blog/products/RCS-ATT-Integration [secondary]
- iPhone: RCS since iOS 18; RCS for Business reaches iPhone in "select markets, on supported carriers" and is still expanding; E2EE for person-to-person RCS started in iOS 26.5 beta (May 2026). https://messente.com/blog/state-of-rcs-business-messaging [secondary]
- Features: verified sender name, logo, checkmark, suggested-reply chips, buttons, carousels; media up to 100 MB per Twilio RCS docs (16 MB on the accepted-MIME page for outbound). https://www.twilio.com/docs/rcs [verified]
- Onboarding: create RCS sender, brand assets, compliance registration, carrier approval; "allow four to six weeks"; US adds verification-vendor fees and EIN etc. https://www.twilio.com/docs/rcs/onboarding [verified]
- **HIPAA: RCS is not on Twilio's eligible list.** So RCS may only ever carry PHI-free content, and inbound user media on an RCS sender is a leak risk.

### 2.4 What the rules mean for Chartside

- Our SMS today carries no PHI, so it is fine on any channel. Voice and MMS may carry PHI once a Twilio BAA is signed.
- If an RCS sender is added to the same Messaging Service as the Line number, replies (including voice memos) may arrive over RCS, which is outside the BAA. Keep the **Line number SMS/MMS-only** and, if RCS is used at all, put it on a separate outbound-only notification sender.

---

## 3. iMessage

| Route | Status | Healthcare verdict |
|---|---|---|
| **Apple Messages for Business** (official; needs an Apple-approved MSP; opaque per-business user ID; audio arrives as `.caf` / `audio/x-caf`) | Poke became the first AI agent approved (2026-06-04) after a months-long review; Apple required live human support and clear AI labeling. | **Closed to us.** Apple policy: "At this time, Apple is not onboarding businesses that primarily offer medical or health-related services or products," and "A business must not provide a limited or bot-only solution." No BAA from Apple. https://register.apple.com/resources/messages/messaging-documentation/policies [verified]; https://techcrunch.com/2026/06/04/apple-approves-poke-as-the-first-ai-agent-on-its-messages-for-business-platform/ [verified] |
| **Sendblue** (iMessage API on Apple hardware with real Apple IDs) | $100 per line per month "AI Agent" plan; free sandbox; media and voice memos supported; webhooks. | Sendblue says it signs a BAA, but **only on Enterprise**, and it characterizes Apple as a conduit because iMessage is E2E encrypted. OCR's cloud guidance says the conduit exception covers transmission only, not storage; Apple stores messages for offline delivery and in iCloud. This is a legal gray zone plus a platform-terms risk (automated personal Apple IDs). https://www.sendblue.com/pricing ; https://www.sendblue.com/blog/hipaa-compliant-texting-guide (2026-03-29) [verified]; conduit analysis https://www.hipaajournal.com/hipaa-conduit-exception-rule/ [secondary] |
| **Linq** (iMessage, RCS, SMS, voice in one API; SOC 2 Type II) | Live. | No public BAA claim found; its own comparison says HIPAA claims "vary by vendor ... ask each vendor." https://linqapp.com/blog/the-best-imessage-api-providers [secondary] |
| **Poke-style agent** | Poke got its lane because it is a consumer assistant, not a health business, and it was later acquired by Cognition (2026-07-23). | Not replicable for a scribe under current Apple policy. |

**Verdict:** iMessage stays out of scope. The one real benefit (blue bubble, no install) is mostly captured by a normal SMS/MMS number that an iPhone texts in green, which is inside the Twilio BAA.

---

## 4. Telegram, Signal, Slack, Teams, secure texting apps

| Channel | BAA | Tech for voice notes | Verdict |
|---|---|---|---|
| **Telegram** | None; no HIPAA program found. | Bot API `voice` object (OGG/Opus), `getFile` download limit 20 MB (lifted with a self-hosted Bot API server). https://core.telegram.org/bots/api [verified]; limits https://charliemorrison.dev/blog/telegram-bot-api-file-size-limits/ [secondary] | Only for non-HIPAA tenants (vets, some international). Easy to build, no AI-provider ban, but low clinician share outside Russia/Iran/parts of Asia. |
| **Signal** | None; no official bot API. | Unofficial `signal-cli` only. | Out. |
| **Slack** | BAA only on Enterprise Grid; Slack's BAA does not cover third-party apps, which need their own BAA. https://slack.com/resources/why-use-slack/hipaa-compliant-collaboration-with-slack ; https://www.paubox.com/blog/is-slack-hipaa-compliant [secondary] | Bot receives file uploads including audio clips. | Niche (digital health startups, some groups). Low priority. |
| **Microsoft Teams** | Microsoft's HIPAA BAA is in the Online Services DPA **by default** for covered entities; Microsoft Teams, Azure Communications Service and Microsoft Healthcare Bot Service are in scope. https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech (updated 2026-09-11) [verified] Third-party bots are outside Microsoft's BAA; Chartside needs its own BAA with the health system. | Bot Framework / Azure Bot Service; Adaptive Cards for "note ready / sign" cards; Epic and Oracle Health have Teams integrations. [secondary] | Real enterprise channel for hospital clinicians, but not Twilio and not a viral format. A good "phase 2" for inpatient. |
| **TigerConnect** | HIPAA secure messaging with a partner REST API ("pipes under the covers that carry PHI ... while allowing [partners] to own the users"). https://developer.tigertext.com/ [verified, partial] | Attachments and bots not confirmed in public docs. | Partnership play (hospital distribution), not a self-serve build. |
| **Doximity** | Doximity runs its own free Scribe, Ask and Dialer; 150 health systems bought the Clinical AI Suite (June 2026). No public third-party messaging API found. https://www.veroscribe.com/blog/doximity-scribe-review-2026 [secondary] | n/a | Competitor, not a channel. |

---

## 5. Voice-note-as-capture: where it works legally and technically

Pattern: record anywhere (Voice Memos, WhatsApp, the phone's recorder), forward to the scribe, get a note back.

### 5.1 Legal map

| Setting | Law | Can the audio travel over this channel? | Can the note come back inline? |
|---|---|---|---|
| US human care, MMS to Twilio (Security/Enterprise Edition + BAA) | HIPAA | Yes (MMS is eligible). | No as a default: SMS/MMS body is readable on lock screens and carrier-stored. Keep the PHI-free link reply (already Chartside rule 1). |
| US human care, WhatsApp / iMessage / Telegram | HIPAA | No (no BAA from Meta/Apple/Telegram). | No. |
| US patient asks for their own info by text | HIPAA right of access | Covered entities may send unencrypted if the patient is warned of the risk and still prefers it; the CE is then not liable for interception in transit. https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html [secondary] | Patient recap could be inline only with a recorded, informed preference. Keep link as default. |
| US veterinary | Not HIPAA; about 35 states have vet-record confidentiality statutes. https://www.paubox.com/blog/does-hipaa-apply-to-veterinarians ; https://co.vet/post/veterinary-medical-records-laws/ [secondary] | Yes on any channel, subject to state law and the vendor contract. | Yes, per clinic opt-in. |
| India | DPDP Act; full duties from 2027-05-13 | Legally possible with consent/notice; Meta AI Providers clause still bites. | Opt-in, with retention limits. |
| Brazil | LGPD (health = sensitive data); CFM 2.314/2022 | Possible with legal basis; Meta explicitly allows AI providers in Brazil (fee since 2026-03-11). | Opt-in. |
| UK / EU | UK GDPR / GDPR; NHS DSPT; GMC confidentiality | Consumer WhatsApp is tolerated for coordination, not for patient-identifiable clinical content; EU AI-provider window closed 2026-05-12. | No. |

### 5.2 Design pattern

- **Default everywhere: "receipt, not record."** The reply is a PHI-free receipt ("Got 1:42 of audio. Note ready in about 30 s: <link>"). The note lives behind the single-use, POST-to-redeem login link that already exists.
- **Inline note only when a tenant flag says HIPAA does not apply** (`org.jurisdiction = "vet_us" | "intl"`) **and** the clinician opted in. Even then, strip patient name and identifiers from the inline copy, keep the full note on the web.
- **Ingest then purge:** download media, encrypt with the existing AES-256-GCM audio store, then `DELETE` the provider's copy (Twilio Media resource, or Meta `DELETE /{MEDIA_ID}`). Log both in the audit trail.
- **Consent before keeping audio:** first voice memo from a number triggers a one-time reply asking the clinician to confirm patient consent was obtained (reply YES). Record in the consent ledger. This mirrors rule 3.
- **Identity:** caller ID is not a password (rule 9). A voice memo from a known number creates a draft in that clinician's unmatched queue; matching to a scheduled patient needs the web page or the phone PIN.

---

## 6. Patient-facing messaging loops (viral and compliant)

### 6.1 Rules

- **TCPA health care exemption** (47 CFR 64.1200(a)(9)(iv)): texts from a HIPAA covered entity or its BA with a health care message are exempt from prior express consent if they are sent only to the number the patient provided, name the provider and give contact info, contain no marketing, telemarketing, solicitation or billing, are concise (160 chars for text), are limited to one per day and three per week per series, and include an easy opt-out that is honored immediately. https://bassberry.com/news/tcpa-exemptions-for-healthcare-companies/ ; https://www.ajmc.com/view/what-the-updated-telephone-consumer-protection-act-rules-mean-for-health-care-messaging [secondary]
- **Consent revocation ("revoke all") rule:** delayed; not effective until 2027-01-31 under the Second Extension Order, and the FCC circulated a draft rewrite on 2026-09-09. Build opt-out handling that honors "any reasonable means" now. https://commlawgroup.com/2026/fcc-recasts-tcpa-consent-revocation-rules/ ; https://drips.com/blog/fcc-proposes-to-rewrite-the-tcpa-revoke-all-rule-and-what-it-could-mean-for-compliance-driven-outreach [secondary]
- **HIPAA marketing (45 CFR 164.501):** "a communication about a product or service that encourages recipients ... to purchase or use" it. Treatment communications are excepted; the face-to-face exception does not cover texts. https://www.hipaajournal.com/hipaa-marketing-rules/ [secondary] A "tell your other doctor about Chartside" prompt inside a PHI-bearing recap is arguably marketing of the vendor. Keep it off the PHI page's primary content and never in the text itself.
- **Patient-initiated texts** are not TCPA-regulated calls to the patient; the reply is a response.

### 6.2 Loops that stay clean

1. **Recap link text** (already planned): "Dr. Lee shared your visit summary: <link>. Reply STOP to opt out." Exempt health care message. Attribution ("Prepared with Chartside") lives only on the web page footer. This is the main organic impression.
2. **Pre-visit voice note** (new): the reminder text says "Want to tell Dr. Lee what's going on before your visit? Reply with a voice message." Patient-initiated MMS, covered by the Twilio BAA, becomes a pre-visit brief in the clinician's queue. This makes the clinic look modern and puts the Chartside number in the patient's thread. No marketing content anywhere.
3. **"Send this to another doctor"** on the recap page generates a patient-controlled share link (patient's right of access). The receiving clinician lands on a page that says "Shared by your patient via Chartside" with a clinician sign-up CTA. The CTA is on the web page seen by a clinician, not in a patient text, so it does not use PHI for marketing to the patient.
4. **Clinician-to-clinician forward** (strongest viral path, no patient involvement): the "your note is ready" SMS includes nothing but the link; the note page has "Forward the Line to a colleague" which sends a PHI-free invite text from the colleague-entered number.

---

## 7. Ranked bets (Twilio + Deepgram + Claude)

Scoring: legal fit (HIPAA/platform), clinician habit fit, build cost on current code, viral potential.

| Rank | Bet | Legal | Habit | Build | Viral |
|---|---|---|---|---|---|
| 1 | Text a voice memo to the Line (MMS) + upload-link overflow | Inside Twilio BAA | Dictation habit, any phone | Small: one route, one module | Medium |
| 2 | Patient pre-visit voice note + recap link loop | Inside BAA; TCPA exempt | Patients already text clinics | Medium | High (every patient sees it) |
| 3 | WhatsApp lane for HIPAA-exempt tenants (US vets, Brazil first) | No HIPAA issue for vets; AI Providers clause risk outside Brazil | Very high internationally | Small (same route) | High where WhatsApp is the internet |
| 4 | RCS verified sender for PHI-free notifications, outbound-only | PHI-free only; separate sender | Nicer receipts, tap chips | Small code, 4 to 6 weeks onboarding | Low to medium (trust) |

Not ranked: iMessage (Apple bars health businesses), Telegram/Signal (low share), Teams (strong enterprise channel, but not Twilio; recommend as phase 2 for inpatient).

### Bet 1: "Text a voice memo to the Line"

**Flow**

1. Clinician records in Voice Memos (or the Messages mic) and shares to the Line number.
2. Twilio POSTs to `POST /api/sms/incoming` (existing, signed) with `NumMedia=1`, `MediaUrl0`, `MediaContentType0`, `MessageSid`, `From`, `Body`.
3. Route validates `X-Twilio-Signature` (existing `validSignature`). If `NumMedia > 0` and any `MediaContentType{N}` starts with `audio/` (or `video/` for screen-recorded memos), call a new `inboundMedia()` instead of `inboundText()`.
4. Immediately return TwiML `<Message>`: "Got your recording. Your note link comes in a moment." (PHI-free). Do heavy work after the response (queue or `waitUntil`), because Twilio times out webhooks at about 15 s.
5. Worker:
   - `GET MediaUrl0` with Basic auth `TWILIO_API_KEY_SID:TWILIO_API_KEY_SECRET` (turn on "Enforce HTTP Auth on media URLs" in the console).
   - Reject over 25 MB or non-audio. Store encrypted via existing `saveChunk(encId, 0, 0, mime, data)` on a new encounter with `source: "mms"`, status `unmatched` unless the sender has a PIN session.
   - `DELETE https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages/{MessageSid}/Media/{MediaSid}.json` (list with `GET .../Messages/{MessageSid}/Media.json` to get `MediaSid`). Audit `mms.media_purged`.
   - `transcribeWithDeepgram(buffer, mime, lang)` (existing), then the existing note pipeline (Claude).
   - `sendText(from, "Your note (1 min 42 s) is ready: " + loginLink)` via existing `sendText`, which already refuses PHI via `looksLikePhi`.
6. Overflow: if a text-only message says `UPLOAD`, or if the carrier stripped the media (NumMedia 0 but body mentions audio), reply with `mintLoginLink(user.id, "/line/upload", 30)`; the page reuses the existing `/api/capture` chunk upload.
7. Unknown number: same try-first as calls: create a guest capture, reply with the claim link. Guest PHI rules (purge if unclaimed) apply.
8. First memo from a number: reply "Before we keep audio, confirm the patient agreed to recording. Reply YES." Hold the audio encrypted until YES; purge after 24 h without YES. Log to the consent ledger.

**PHI rules**
- Inbound audio may carry PHI (MMS is BAA-eligible). Account must be Security or Enterprise Edition with a signed Twilio BAA before real use.
- Outbound text never carries PHI (existing `looksLikePhi` guard).
- Provider copy deleted after ingest; our copy AES-256-GCM encrypted with existing retention.
- Status callbacks (`StatusCallback` to a new `POST /api/sms/status`) log delivery only, no body.

**Local e2e mock** (extends `tests/e2e/fake-twilio.mjs`)
- Start a tiny `http` server in the test (port 0) that serves `tests/e2e/fixtures/visit.wav` at `/2010-04-01/Accounts/AC.../Messages/MM.../Media/ME...` and requires Basic auth; it also records `DELETE` calls and the `GET .../Media.json` list.
- Point `TWILIO_BASE_URL` at it (already read by `notify.ts` and `telephony/admin.ts`), and `DEEPGRAM_BASE_URL` at the existing Deepgram mock.
- Build params `{ From: "+15550100000", To: line, MessageSid: "MM..", NumMedia: "1", MediaUrl0: `${fake}/.../Media/ME1`, MediaContentType0: "audio/wav", Body: "" }`, sign with `twilioSignature(token, url, params)`, POST form-encoded to `/api/sms/incoming`.
- Assert: 200 TwiML with a PHI-free `<Message>`; fake server saw an authenticated GET and then a DELETE; `simMessages("+15550100000")` gets a link within N seconds; `looksLikePhi(body) === false`; the link opens a note containing transcript terms from the fixture.
- Negative tests: bad signature 403; `MediaContentType0=image/jpeg` gets a "send audio or call" reply; oversize (fake returns 30 MB `content-length`) gets the upload link; unknown sender gets the guest claim link; no YES within window purges.

### Bet 2: Patient pre-visit voice note + recap loop

**Flow**
1. Existing reminder job sends (TCPA exempt format): "Reminder: visit with Dr. Lee tomorrow 2:30 PM. Reply with a voice message about what's going on, or STOP to opt out. <clinic phone>".
2. Patient replies with MMS audio or text to the **clinic's Line number** (a per-org number, or per-clinician with `To` routing).
3. `POST /api/sms/incoming` detects the sender is a patient on tomorrow's schedule (match `From` to `patients.phone` scoped to the org owning the `To` number). Because caller ID is not identity, the match is only a suggestion; the brief lands in the clinician's pre-visit queue marked "from the patient's phone".
4. Same ingest/purge/transcribe path as Bet 1; Claude produces a 5-line pre-visit brief (chief concern, duration, meds mentioned, questions). The patient gets "Thanks, Dr. Lee's office received your message." (no PHI echo).
5. After the visit, the signed note produces the recap; SMS: "Dr. Lee shared your visit summary: <single-use link>. Reply STOP to opt out." The recap page footer carries "Prepared with Chartside" and the patient-controlled "Share with another doctor" link.

**Endpoints/webhooks**: `POST /api/sms/incoming` (branch on sender type), outbound `POST /2010-04-01/Accounts/{Sid}/Messages.json` with `MessagingServiceSid` (for Advanced Opt-out, which is on the eligible list) and `StatusCallback=/api/sms/status`. Use Twilio Consent Management API (eligible since 2026-06-30) or our own prefs for opt-outs.

**PHI rules**: patient texts in are PHI under BAA; outbound patient texts carry only provider name, time, link; one reminder per day, three per week max; no marketing words in any text; STOP/START/HELP honored; attribution only on the web page.

**Local e2e mock**: seed a patient with phone `+15550100077` on tomorrow's schedule; POST signed MMS from that number to the org's Line number; assert brief appears in `/api/queue` for the clinician, patient's sim outbox gets the generic ack, and that no outbound patient text matches `looksLikePhi`; simulate STOP then confirm the recap send is suppressed; assert frequency cap by sending four reminders in a week and checking only three went out.

### Bet 3: WhatsApp lane for HIPAA-exempt tenants

**Who**: US veterinary clinics first (no HIPAA; vet scribe market is active: ScribbleVet acquired by Instinct Science in early 2026, VetRec already offers phone-call capture, adoption grew from 3.5% to 17.5% of vets between July 2024 and Sept 2025 per co.vet). Then Brazil (only market where Meta expressly allows AI providers). Hard-gate by `org.jurisdiction`; never enable for a US human-care org.

Sources: https://co.vet/post/best-ai-scribe-2026/ ; https://digitail.com/blog/the-ultimate-guide-to-the-best-ai-scribes-for-veterinary-clinics/ ; https://vetrec.io/ [secondary].

**Flow**
1. Register a WhatsApp sender in Twilio (Twilio is a BSP; Meta business verification and display name review).
2. Set the sender's inbound webhook to the same `POST /api/sms/incoming` (Twilio uses the same form fields; `From=whatsapp:+E164`, `WaId`, `ProfileName`). Branch on the `whatsapp:` prefix and on org jurisdiction; if the org is US human-care, reply "WhatsApp can't be used for patient audio. Call or text this number instead: ..." and delete the media without transcribing.
3. Voice note (`audio/ogg`, Opus) goes through the same ingest/purge/transcribe path.
4. Reply within the 24 h window as free-form: link by default; inline de-identified note if `org.inlineNotes = true` (vet default on).
5. Proactive nudges (brief, sign reminders) use a Content API template: `POST https://content.twilio.com/v1/Content` then `POST https://content.twilio.com/v1/Content/{ContentSid}/ApprovalRequests/whatsapp` with category UTILITY; send with `ContentSid` + `ContentVariables` on `POST .../Messages.json`. Template body PHI-free: "You have {{1}} notes ready to review: {{2}}".
6. Every thread must offer a human path (policy requirement): HELP returns support email and phone.

**Policy guardrails**: position the WhatsApp use as a documentation service for the business (the clinic is the WhatsApp Business, not Chartside) to argue AI is ancillary to the clinic's workflow; keep a fallback to SMS for the same clinicians because Meta can cut access ("determined by Meta in its sole discretion"). Budget for the Brazil AI-provider per-message fee.

**Local e2e mock**: same fake media server; convert the fixture to OGG/Opus in test setup (`ffmpeg -i visit.wav -c:a libopus -ac 1 visit.ogg`) or accept `audio/wav` in the mock; POST signed params with `From=whatsapp:+15550100001`, `WaId=15550100001`, `MediaContentType0=audio/ogg`. Assert: for a vet org, reply text contains the note summary (inline) and link; for a US human-care org, the reply is the refusal, the media DELETE happened and no transcript row exists. Add a template-send unit test that the outbound payload uses `ContentSid` and that variables pass `looksLikePhi`.

### Bet 4: RCS verified sender for PHI-free notifications

**Why**: branded "Chartside" sender with a checkmark increases trust in link texts (phishing concern is real for login links), and suggested-reply chips ("STATUS", "SCHEDULE", "Open note") remove typing.

**Flow**
1. Create an RCS sender (brand, logo, use case: account notifications), attach to a **separate** Messaging Service `MG_notify` with SMS fallback from a dedicated long code, not the Line number.
2. Outbound notifications (note ready, morning brief, nudge) go `POST .../Messages.json` with `MessagingServiceSid=MG_notify` and a `ContentSid` for a rich card with quick replies. Twilio falls back to SMS when the device lacks RCS.
3. Inbound on `MG_notify` goes to `POST /api/sms/incoming` too. Chip taps arrive as `ButtonPayload` and are mapped to existing commands. **Any media on this sender is deleted unread** with a reply "For recordings, call or text <Line number>."
4. Keep `looksLikePhi` enforcement on every RCS body and card field.

**PHI rules**: RCS is not on Twilio's HIPAA list, so this sender is PHI-free by construction. Residual risk: a clinician sends audio to the RCS sender anyway; mitigate with immediate delete, no transcription, and a sender description saying "notifications only."

**Local e2e mock**: POST signed params with `ButtonPayload=STATUS` and `ChannelMetadata` JSON to `/api/sms/incoming`, assert the STATUS reply; POST with `NumMedia=1` on the notify `To` number and assert refusal plus DELETE on the fake media server; unit-test that the card JSON built for the Content API contains only time, count and link.

---

## 8. Single strongest recommendation

Build **Bet 1, "Text a voice memo to the Line"**, now. It is the only messaging capture path that is inside a BAA Chartside can actually sign (Twilio MMS, eligible since 2021-09-30 and still listed 2026-06-30), it matches the dictation habit older clinicians already have, it reuses `validSignature`, `transcribeWithDeepgram`, `saveChunk`, `mintLoginLink` and `sendText` almost verbatim, and it closes the one gap in the phone-call product (clinicians who recorded on their own phone, or who want to dictate a 90 second recap after the room). Pair it with an upload-link overflow for anything bigger than the carrier MMS cap. Then do Bet 2 on the same route, because the patient loop is where the organic reach is.

Keep WhatsApp for a gated vet/Brazil pilot only, and keep iMessage out until Apple changes its "not onboarding medical businesses" policy.

## 9. Open items to verify on devices or with vendors

1. iPhone and Android: what codec and size a shared Voice Memo and an in-thread audio message produce over MMS to a non-iMessage number, per carrier; what happens above the cap.
2. Twilio: confirm with the account team that inbound MMS media on a Messaging Service with Advanced Opt-out is covered by the BAA in the current Security Edition contract.
3. Meta: whether service (non-template) replies start being billed on 2026-10-01 (EngageLab says yes after 1,000 per number per month; Meta page fetched today does not say so).
4. EU AI-provider status: Meta page says the window ended 2026-05-12; our earlier doc says reversed 2026-07-13. Resolve before any EU plan.
5. Sendblue Enterprise BAA terms and how they address Apple as a storing intermediary, if iMessage ever comes back.

## 10. Source list

- Meta Terms for WhatsApp Business Platform (modified 2026-09-23): https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform
- WhatsApp Business Messaging Policy (effective 2026-09-23): https://whatsappbusiness.com/policy/
- Meta WhatsApp pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- Meta AI provider pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers
- Meta media API: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- EngageLab pricing guide (2026-09-11): https://www.engagelab.com/blog/whatsapp-business-api-pricing
- respond.io AI chatbot ban: https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- ALM Corp on EU/Italy/Brazil carve-outs: https://almcorp.com/blog/meta-whatsapp-rival-ai-chatbots-eu/
- TechCrunch EU probe (2025-12-04): https://techcrunch.com/2025/12/04/eu-investigating-meta-over-policy-change-that-bans-rival-ai-chatbots-from-whatsapp/
- Twilio HIPAA: https://www.twilio.com/en-us/hipaa
- Twilio HIPAA Eligible Services PDF (2026-06-30): https://twil.io/HIPAA-eligible-products-and-services
- Twilio MMS HIPAA eligible (2021-09-30): https://www.twilio.com/en-us/changelog/twilio-mms-is-now-hipaa-eligible
- Twilio accepted MIME types and size limits: https://www.twilio.com/docs/messaging/guides/accepted-mime-types
- Twilio webhook request params: https://www.twilio.com/docs/messaging/guides/webhook-request
- Twilio Media resource: https://www.twilio.com/docs/messaging/api/media-resource
- Twilio security (media Basic auth): https://www.twilio.com/docs/usage/security
- Twilio WhatsApp pricing: https://www.twilio.com/en-us/whatsapp/pricing
- Twilio US SMS/MMS pricing: https://www.twilio.com/en-us/sms/pricing/us
- Twilio RCS docs: https://www.twilio.com/docs/rcs ; onboarding https://www.twilio.com/docs/rcs/onboarding
- Twilio RCS GA (2025-08-26): https://www.twilio.com/en-us/press/releases/rcs-general-availability ; AT&T: https://www.twilio.com/en-us/blog/products/RCS-ATT-Integration
- Twilio WhatsApp audio tutorial: https://www.twilio.com/en-us/blog/transcribe-audio-messages-with-twilio-whatsapp-and-openai-speech-to-text
- Carrier MMS limits: https://www.att.com/support/article/wireless/KM1041906/ ; https://support.bandwidth.com/hc/en-us/articles/360014235473-What-are-the-MMS-file-size-limits
- RCS state 2026: https://messente.com/blog/state-of-rcs-business-messaging
- Apple Messages for Business policies: https://register.apple.com/resources/messages/messaging-documentation/policies ; FAQ https://register.apple.com/resources/messages/messaging-documentation/faq
- TechCrunch Poke approval (2026-06-04): https://techcrunch.com/2026/06/04/apple-approves-poke-as-the-first-ai-agent-on-its-messages-for-business-platform/
- Sendblue pricing: https://www.sendblue.com/pricing ; HIPAA guide (2026-03-29): https://www.sendblue.com/blog/hipaa-compliant-texting-guide
- Linq comparison: https://linqapp.com/blog/the-best-imessage-api-providers
- HIPAA conduit exception: https://www.hipaajournal.com/hipaa-conduit-exception-rule/
- Telegram Bot API: https://core.telegram.org/bots/api ; limits https://charliemorrison.dev/blog/telegram-bot-api-file-size-limits/
- Slack HIPAA: https://slack.com/resources/why-use-slack/hipaa-compliant-collaboration-with-slack ; https://www.paubox.com/blog/is-slack-hipaa-compliant
- Microsoft HIPAA offering (updated 2026-09-11): https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech
- TigerConnect developer: https://developer.tigertext.com/
- Doximity Scribe review: https://www.veroscribe.com/blog/doximity-scribe-review-2026
- UK WhatsApp rules (2026-07-05): https://www.iatrox.com/blog/can-uk-doctors-use-whatsapp-clinical-advice-2026
- WhatsApp use among nursing and medical staff: https://pmc.ncbi.nlm.nih.gov/articles/PMC13045068/
- WhatsApp record keeping: https://pmc.ncbi.nlm.nih.gov/articles/PMC8708459/
- India CME WhatsApp groups: https://pubmed.ncbi.nlm.nih.gov/39227936/
- Brazil: https://www.scielo.br/j/bioet/a/m7VRmh7JMs4SJQHZBrFJxvS/?lang=pt ; https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf
- India DPDP: https://www.india-briefing.com/news/india-dpdp-compliance-timeline-enforcement-2026-27-44740.html/
- AISHA: https://www.aisha.ng/ ; AwaDoc: https://www.awadoc.com/ ; QwamCare: https://www.qwamcare.com/ ; CellAssist: https://www.cellassist.ai/best-ai-clinic-assistant-india ; EkaScribe: https://ekascribe.ai/ ; Dr. Assistente: https://doutorassistente.com.br/ ; Voa Health: https://voa.health/
- Vet scribes: https://co.vet/post/best-ai-scribe-2026/ ; https://vetrec.io/ ; https://www.scribblevet.com/
- Vet HIPAA: https://www.paubox.com/blog/does-hipaa-apply-to-veterinarians ; https://co.vet/post/veterinary-medical-records-laws/
- HHS right of access: https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/access/index.html
- TCPA health care exemption: https://bassberry.com/news/tcpa-exemptions-for-healthcare-companies/ ; https://www.ajmc.com/view/what-the-updated-telephone-consumer-protection-act-rules-mean-for-health-care-messaging
- TCPA revocation rule: https://commlawgroup.com/2026/fcc-recasts-tcpa-consent-revocation-rules/ ; https://drips.com/blog/fcc-proposes-to-rewrite-the-tcpa-revoke-all-rule-and-what-it-could-mean-for-compliance-driven-outreach
- HIPAA marketing: https://www.hipaajournal.com/hipaa-marketing-rules/
