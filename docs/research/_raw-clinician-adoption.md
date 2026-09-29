# Clinician Adoption of AI Scribes: Bottom-Up Channels and Interface Friction

Research date: 2026-09-28. Scope: how individual clinicians adopt AI scribes without IT, which interface formats reduce friction, and what a new primary interface channel for Chartside must remove.

Method note: about 50 web searches and page fetches. Reddit blocks direct crawling from this environment, so Reddit quotes below come from pages that reproduce them (mostly vendor comparison blogs such as Twofold and AI Tool Discovery, which have a commercial interest). Student Doctor Network, App Store and news quotes were fetched directly. Treat vendor-reported numbers as claims.

---

## 1. SOAP Note Buddy (soapnotebuddy.com)

**What it is.** A browser extension (Chrome, Safari, Brave, Edge) plus iOS/Android "Voice Scribe" app, built by a solo clinician-developer (App Store developer name: Terry Keyes). Target users are rehab and home health clinicians: PT, PTA, OT, SLP, nursing, home health, travel therapists. Every testimonial on the homepage is from a PT, OT, SLP or PTA. [soapnotebuddy.com](https://soapnotebuddy.com)

**Exact flow (extension, the flagship).** [How it works](https://soapnotebuddy.com/how-it-works/)
1. Install the extension ("30 seconds"). No IT approval, no EHR integration.
2. Enter a brief patient summary or treatment plan once (stored locally on the device; PDF import of the evaluation extracts diagnoses and baseline measures).
3. Open the documentation page in any web-based EHR.
4. The extension detects every field on the page: textareas, dropdowns, checkboxes, repeating rows.
5. One click on "Smart Auto Fill" generates content and populates all fields; the clinician reviews and hits the EHR's own save.

The Chrome Web Store copy says: "no recording, no transcription, no copy-pasting." The extension works from short typed observations rather than audio. Audio lives in the separate mobile Voice Scribe, whose output is still copied into the EHR by hand. [Chrome Web Store](https://chromewebstore.google.com/detail/soap-note-buddy-ai-scribe/ejedinkdbbimibapobjeodkocaeokepj)

**How it inserts into the EHR.** DOM field detection and autofill inside the clinician's own logged-in browser session. This is the same technique as Freed's "EHR Push" (see section 5). PHI handling: names, DOB and identifiers are said to be scrubbed locally before anything goes to the server, and a BAA is "optional" or "available."

**Pricing (inconsistent across its own pages).**
| Source | Price |
|---|---|
| Pricing page | AI Notes $29/mo annual ($34 monthly); Voice Scribe $49 ($59); EHR Fill $79 ($99). [Pricing](https://soapnotebuddy.com/pricing/) |
| How-it-works page | Fill $29, Scribe $79 |
| Chrome Web Store | "$49/month, less than $2 a day" |
| iOS app | Free download, Pro $49.99 |

All plans have a 7-day free trial with no card required. There is also a **free no-login generator** (3 notes per day, no account) that acts as a top-of-funnel lead magnet. [Free generator](https://soapnotebuddy.com/free-soap-note-generator/)

**User base.** Small. Chrome Web Store: **99 users, 1 rating (5.0)**, version 4.0.10, updated 2026-09-27. iOS: 5 ratings. The site claims "thousands of clinicians" but the store data does not support that. [Chrome Web Store](https://chromewebstore.google.com/detail/soap-note-buddy-ai-scribe/ejedinkdbbimibapobjeodkocaeokepj), [App Store](https://apps.apple.com/us/app/soap-note-buddy/id6758865488)

**Takeaway.** SOAP Note Buddy shows the product thesis clearly (fill the EHR the clinician already uses, no IT, rehab niche) but not traction. The interesting part is the input model: therapists with repetitive daily notes don't need ambient audio. A few typed or spoken observations plus the plan of care is enough. App Store quote: "This app has allowed me to effectively perform my actual job as a PT vs a 'skilled data entry person.'"

---

## 2. "Instinct AI"

There is no human-medicine AI scribe called Instinct. Two different things use the name:

**a) Instinct Science (veterinary).** A cloud veterinary EMR/PIMS founded in 2017 by ER vet Dr. Caleb Frankel. It serves "over 360,000 veterinary professionals" and **acquired ScribbleVet on 2026-01-16**. [Acquisition](https://instinct.vet/news/instinct-science-scribblevet-acquisition-2026/) The ScribbleVet interface: record on a phone, tablet or computer (app or website), tap "Scribble," and get a note in about a minute. A 1-click transfer exists for some PIMS; otherwise the vet copies and pastes by section ("30 seconds to go from appointment to a completed record"). Techs and support staff are free, and only DVMs pay (about $150/DVM/mo). Claims: **"84% of practices adopted ScribbleVet within 7 days,"** and 78+ minutes saved per shift. [ScribbleVet by Instinct](https://instinct.vet/products/scribblevet/)

**b) Instinct by Spear Street Technology (general personal agent).** This is the viral 2026 one. Founded April 2026 by Noah Shinn (ex-Sierra, first author of Reflexion). **The interface is you text it or call it** over iMessage, WhatsApp, SMS or a phone call. It runs on a persistent cloud phone and computer and acts in your apps with your stored credentials. It is invite-only, free in beta, raised $250M at $2.5B in August 2026, and SiliconANGLE reports **$1B at $10B on 2026-09-28**. [Vellum breakdown](https://www.vellum.ai/blog/official-instinct-breakdown), [SiliconANGLE](https://siliconangle.com/2026/09/28/everyday-personal-ai-assistant-startup-instinct-raises-1b-at-10b-valuation/) TechCrunch documented privacy problems: a "perpetual and irrevocable" training license, an unauthorized email send, plaintext retention after disconnect, and prompt injection via email. One security expert said: "From a #cyberhealth perspective, Instinct is a hard no." [TechCrunch](https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/) It has no healthcare features or HIPAA posture.

**Takeaway for Chartside.** Instinct proves that "no app, just text or call it" is a distribution format consumers love right now. It also shows the exact trust failure a clinical version cannot afford: broad credentials, unreviewed actions and data retention. A clinician-facing text/call channel must be the opposite of Instinct on consent, retention and "never acts without approval."

---

## 3. How the scribes grew

| Product | Motion | Free tier / price | Adoption numbers | Primary interface |
|---|---|---|---|---|
| **OpenEvidence** | Pure bottom-up, ad-funded, NPI-verified | Free (incl. Visits scribe since Aug 2025) | 860k verified US clinicians (May 2026); 1M consults in one day (Mar 10, 2026); "95% of new users hear about the product from another physician" | Web + mobile; voice mode (May 2026) |
| **Doximity Scribe / GPT** | Bottom-up via existing network (85%+ of US physicians are members) | Free for verified MDs/DOs, NPs, PAs, students | Scribe users grew 10x Jul 2025 to Jul 2026; ~half of active workflow prescribers use its AI tools | Mobile + desktop, embedded in Dialer calls |
| **Freed** | Product-led, long tail, referrals | ~$99/mo (App Store lists $139); referral: 5 referrals = free year | 0 to 4,000 paying "primarily by word of mouth"; $10M ARR year one; 20k paying / $20M ARR; now "26,000+ clinicians" | Phone app + web + Chrome extension with EHR Push |
| **Heidi Health** | Freemium, global, bottom-up then enterprise | Free: unlimited basic consults + 10 "Pro Actions"/mo; free Clinician tier for trainees | ARR $1M to $50M in 24 months (Apr 2026); 2.8M visits/week, 190 countries; raised $340M (Sep 2026) | Mobile, desktop, web, Chrome extension (35+ EHRs), floating widget |
| **Twofold** | Bootstrapped, cheap, Reddit favorite | 1-week trial, $19 first month, flat price | 20k+ clinicians, 20M+ notes, 3x YoY, 4.8 stars over 3,079 reviews (Jul 2026) | Web/mobile, in-person + telehealth |
| **Nabla** | Self-serve free tier + enterprise | Free up to 30 consults/mo; residents unlimited | 85k+ clinicians, 150+ orgs (third-party figure) | Web app + Chrome extension |
| **Abridge** | Enterprise top-down (CMIO/CIO) | None | 150+ health systems; 50M conversations/yr (Jul 2025); Best in KLAS 2025 and 2026 | Phone/tablet app, inside Epic ("Abridge Inside") |
| **Suki** | Enterprise + EHR partner SDK | None public | Large enterprise rollouts (e.g., Rush) | iOS, Android, web, Chrome extension; voice commands |
| **DeepScribe** | Enterprise, specialty (oncology) | None | "90% of US community oncology orgs," 5M oncology visits/yr | Phone app |
| **Commure Ambient** | Free for providers at major health systems; enterprise (HCA) | Free with work email at partner systems | HCA pilot 1,400+ physicians, 50+ hospitals | Phone app (ScribeMobile) |
| **Sunoh.ai** | Bundled into eClinicalWorks (distribution via EHR vendor) | Low-cost add-on | Case studies: 54 to 109 provider groups, FQHCs | Inside eCW |
| **Tali AI** | Government-funded free licenses (Canada Health Infoway: up to 10,000 funded licenses for one year) | Free for eligible primary care; free for students/residents | Canadian primary care | Integrates with Canadian EMRs |

Sources: [OpenEvidence via PYMNTS](https://www.pymnts.com/healthcare/2026/openevidence-brings-hands-free-medical-ai-to-860000-clinicians/), [Newswise 1M consults](https://www.newswise.com/articles/openevidence-achieves-historic-milestone-1-million-clinical-consultations-between-verified-doctors-and-an-artificial-intelligence-system-in-a-single-day), [Sacra OE vs Doximity](https://sacra.com/research/openevidence-vs-doximity/), [Contrary on OpenEvidence](https://research.contrary.com/company/openevidence), [Meet Doximity Scribe](https://blog.doximity.com/articles/meet-doximity-scribe), [Veroscribe Doximity](https://www.veroscribe.com/blog/doximity-scribe-review-2026), [Druk on LinkedIn](https://www.linkedin.com/posts/drukerez_freed-has-grown-from-0-to-4000-paying-clinicians-activity-7154194348673257472-FM2Z), [Aragon on Freed](https://aragonresearch.com/freed-commoditization-of-ai-medical-scribes/), [CNBC Freed](https://www.cnbc.com/2025/03/05/freed-raises-30-million-led-by-sequoia-to-tackle-clinician-burnout.html), [Freed referral](https://help.getfreed.ai/en/articles/9247591-freed-referral-program), [HLTH on Heidi](https://hlth.com/insights/news/heidi-raises-340m-to-expand-clinical-ai-into-supervised-agentic-workflows), [Heidi pricing](https://www.heidihealth.com/support/en/articles/8885030-heidi-s-pricing-plans-cost-features), [Twofold 20k](https://www.trytwofold.com/blog/20000-clinicians-20-million-notes), [Nabla review](https://www.trytwofold.com/compare/nabla-copilot-review), [Contrary on Abridge](https://research.contrary.com/company/abridge), [DeepScribe oncology](https://www.deepscribe.ai/resources/deepscribe-solidifies-ambient-ai-leadership-in-oncology), [Commure HCA](https://www.commure.com/blog/how-health-systems-are-evaluating-ambient-ai-lessons-from-hca-healthcare-and-nathan-littauer), [Commure Ambient](https://ambient.commure.com/), [Sunoh cases](https://www.eclinicalworks.com/eclinicalworks-and-sunoh-ai-assist-54-provider-primary-care-and-urgent-care-practice-to-enhance-productivity-and-access-to-care/), [Tali Infoway](https://tali.ai/infoway).

### Patterns

1. **Free plus verified identity wins distribution.** OpenEvidence and Doximity reached the majority of US physicians by gating free access on NPI verification. That gating doubles as trust ("only doctors are in here") and as the thing that makes ads monetizable. Their scribes piggyback on apps doctors already open daily. Aragon calls this the commoditization threat to Freed's $99 model.
2. **Paid bottom-up still works in the long tail.** Freed (20k+ paying) and Twofold (20k+, no VC) both target solo and small practices with limited IT. Their pitch is speed to value, templates, and price. Freed's growth was "primarily by word of mouth" with a referral loop (5 referrals = free year).
3. **Free for trainees is a deliberate seeding tactic.** Heidi, Nabla and Tali give residents and students free unlimited access, and Doximity includes students. Residents carry the tool into attendings' jobs.
4. **Enterprise players grow top-down and do not compete for individuals.** Abridge, DAX, Commure (HCA) and DeepScribe sell to CMIOs. Individual clinicians inside those systems who lack access become shadow-AI users (below).
5. **Influencers.** I found no documented evidence of sponsored doctor TikTok or Instagram campaigns driving scribe adoption. Searches returned mostly deepfake-doctor supplement scams ([Rolling Stone](https://www.rollingstone.com/culture/culture-features/ai-doctor-videos-tiktok-avatars-internet-safety-1235294841/)). Word of mouth is peer-to-peer: hospital floors (OpenEvidence), Facebook groups, Reddit comparison threads, and SDN forums. Treat creator marketing as unproven. Reddit threads plus SEO "Reddit review" roundup pages (which Twofold publishes heavily) are the observable channel.
6. **Shadow AI is the demand signal.** In a Wolters Kluwer survey (Jan 2026, 500+ respondents), 40%+ knew colleagues using unapproved AI and about 20% had used one themselves. Providers cited speed (45%) and lack of approved tools (27%). [Healthcare Dive](https://www.healthcaredive.com/news/shadow-unauthorized-ai-/810191/) Doximity's 2026 report: 63% of physicians use AI daily, 29% name ambient scribes as a top use case, and **47% say institutional AI policies are confusing or still evolving**. [HIT Consultant](https://hitconsultant.net/2026/03/18/doximity-2026-ai-medicine-report-physician-adoption-pajama-time/) KFF: "a third of providers have access" to an ambient scribe. [KFF Health News](https://kffhealthnews.org/news/article/ambient-ai-scribes-doctor-appointments-note-taking-ehr-epic/)

---

## 4. Clinician complaints and wishes (quotes)

### Getting the note into the EHR (copy-paste)
- "Then my scribe copies and pastes the outputs into the relevant sections." (callmeanesthesia, SDN, using Insight)
- "if you have to go back and pick and choose pasting of the output...seems to defeat some of the purpose" (22yis, SDN)
- "easy to copy/paste into note with ModMed EMR." (runfastnow, SDN, Heidi)
- Freed built EHR Push because manual transfer takes about 2 minutes per patient, which is 3+ hours a week at 20 patients a day. Freed quotes the "highest-paid clerical worker in the hospital" line. [Freed EHR Push](https://www.getfreed.ai/blog/introducing-ehr-push)
- Sources: [SDN "AI scribe?"](https://forums.studentdoctor.net/threads/ai-scribe.1510114/)

### Device, battery, laptop in the room
- "I use a separate iPad that I keep plugged in to avoid draining the battery on my phone." ... "Then I also have the site logged in on the exam room computer." (callmeanesthesia, SDN)
- "It also absolutely annihilated battery on my phone." (22yis, SDN, Insight free version)
- Freed App Store review: "I can barely make it through one HALF of clinic with 50% remaining." Another: "sometimes you lose your documentation," with support described as "a bot that directs you to form articles that do not help." (Freed iOS, 4.8 stars over 514 ratings, $139/mo) [App Store](https://apps.apple.com/us/app/-/id6449428266)
- A budget workaround on SDN: "$180 device + $7/month" (a dedicated recorder) with end-of-day charting, because "some of the costs are OUTRAGEOUS." (GreenGreen) [SDN $7 scribe](https://forums.studentdoctor.net/threads/7-a-month-ai-scribe.1506756/)
- JAMA Network Open physician study: 81% of comments on accessibility were negative, including lack of device access. [JAMA Netw Open](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2831866)

### Phone placement and presence (praise)
- "I say hello, I put [my phone] down, and I forget about it... Then, I walk out of the room, hit a little button and I have a note." (DeepScribe user) [DeepScribe](https://www.deepscribe.ai/solutions/ai-medical-scribe)
- "If they consent, I put my phone right between us and explain they're not getting recorded on my phone but through the app." (Dartmouth Health clinician) [Dartmouth Health](https://www.dartmouth-health.org/articles/will-ai-scribe-improve-your-doctor-visit)
- "I can be more face-to-face with them and have more eye contact." / "I don't know if it saved time, but it saved anxiety." (JAMA Netw Open)

### Narrating the exam
- "Now, when I'm doing a physical exam, I have to say what I'm doing and what I'm finding out loud." (Dr. Dina Capalongo, KFF)
- "I find myself narrating my thought process out loud, which changes the dynamic of the therapeutic encounter." (P14, Singapore qualitative study) [medRxiv](https://www.medrxiv.org/content/10.64898/2026.03.17.26348627v1.full.pdf)

### Note quality and editing
- "Every note feels like it's been written for a medical drama script. Way too long, overly formal, and full of stuff I didn't need." (r/medicalscribe) [Substack](https://uzzieltamon.substack.com/p/when-ai-scribes-sound-like-medical)
- "taking me longer now because I'm doing more editing." (JAMA Netw Open)
- "I don't want 'chest pain' in a chart for a patient who has an obvious URI." (skougess, SDN) [SDN](https://forums.studentdoctor.net/threads/virtual-ai-scribes.1483009/)
- Freed iOS review: the A/P has "a massive list of problems that the patient mentioned, and other conditions that were barely referenced."

### Consent
- 8 to 15% of informed patients decline, and above 20% in behavioral health and adolescent medicine. Consent fell from **81.6% with basic information to 55.3%** when patients were told specifics (what the AI does, storage, vendor). [Twofold wiki](https://www.trytwofold.com/ai-scribe-wiki/handle-ai-scribe-when-patients-decline-recording), [patient survey PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12699246/)
- "Some of my patients with early dementia may not fully understand what they are consenting to." (geriatrician, Singapore study)
- "I have a clause in the patient consent form that allows for computer and/or electronic devices to be utilized." (GreenGreen, SDN)

### Price and "free" gravity
- "I like Twofold and Freed better, but Nabla is free, so I've been using that more." (r/medicine thread OP)
- "Deepscribe – horribly overpriced." (u/grey-doc) / "My colleagues really like DAX… but it's expensive." (r/FamilyMedicine)
- "Twofold was less than half the price of Freed and lets you build your own note templates." (r/therapists)
- Source: [Twofold Reddit FM roundup](https://www.trytwofold.com/blog/reddit-family-medicine-scribe-review), [Twofold Reddit therapist roundup](https://www.trytwofold.com/blog/reddit-therapist-scribe-review)

### Therapists specifically
- "the moment you record a therapy session without a BAA you are playing with your license." (r/therapists) [AI Tool Discovery](https://www.aitooldiscovery.com/guides/ai-for-therapists-reddit)
- "you do need to get in the habit of recording sessions for upload." (Mentalyc user, r/therapists)
- "With 2–3 sentences and a diagnosis, Autonotes does the rest." (r/therapists; the no-recording, short-input model)
- "Recording isn't stored, anonymized transcripts limit subpoenas." (LMFT, r/therapists)

### What they wish for (synthesized)
Less verbose notes in their own voice; no narrating the exam; the note placed in the right EHR fields without copy-paste; nothing to charge or babysit; working when the phone is face down or in a pocket; low or zero cost; a BAA they can point to; and audio not retained.

---

## 5. Formats in use and how they are received

| Format | Examples | Reception |
|---|---|---|
| **Phone app, phone on the table** | Freed, Abridge, DeepScribe, Commure ScribeMobile, Doximity, Heidi | Default and praised for presence ("put it down and forget about it"). Pain points: battery drain, lost recordings after updates, a separate login, and then getting text to a desktop EHR. |
| **Chrome extension over the EHR** | Freed EHR Push, Heidi (35+ EHRs), Nabla, Suki, SOAP Note Buddy | The most-cited fix for copy-paste. Field mapping (HPI, A/P into the right boxes) with "no IT setup." Limitation: browser-based EHRs only, and it breaks on Citrix and thick clients. |
| **Desktop widget or overlay** | Heidi Widget floats across EHR tabs | Praised for staying open across navigation. Mostly partner-embedded. |
| **Inside the EHR (native)** | Abridge Inside Epic, DAX in Epic, Sunoh in eCW | Least friction once IT deploys it, but requires IT. Not a bottom-up channel. |
| **Wearable recorder** | Plaud NotePin (20h battery, BAA, clips to a lapel), SDN "$180 device" | Solves "phone can't record through the physical exam" and battery. Output still has to reach the EHR. [Plaud](https://www.plaud.ai/pages/healthcare-solution) |
| **Watch app** | Notable (2018, Apple Watch; records with the "wrist down at his or her side"), OrthoScribe (Apple Watch), Medical Scribe app (start on the watch, edit on phone/web) | Early and niche. I could not confirm a Suki watch app. Suki is voice-first on iOS, Android, web and Chrome. [MacRumors Notable](https://www.macrumors.com/2018/05/07/health-startup-notable-apple-watch/), [Hypepotamus OrthoScribe](https://hypepotamus.com/startup-news/atlanta-based-orthoscribe-apple-watch-launch/) |
| **Smart speaker / room device** | Nuance DAX purpose-built room device; Alexa HIPAA skills (2019) | Enterprise-installed. Not bottom-up. Faded in favor of phones. |
| **Dictate by phone call** | Legacy dial-in dictation (call a number, enter an ID, a transcriptionist types); Doximity Scribe inside Dialer calls | No modern "call a number, get a note" AI scribe found. This is an open gap. Dial-in is a decades-old habit that still exists. |
| **Text/call an agent** | Instinct (consumer, iMessage/WhatsApp/phone) | Consumers love it. No clinical equivalent. Privacy is the blocker. |
| **Typed-summary generator** | SOAP Note Buddy, Autonotes | Liked by therapists and rehab clinicians for repetitive notes. No recording, so no consent friction. |

---

## 6. HIPAA and consent constraints that shape channel choice

**SMS / iMessage.** Carriers will not sign BAAs, and standard SMS is unencrypted. Apple will not sign a BAA for iMessage, and iMessage falls back to SMS for non-Apple recipients. So **PHI over SMS or iMessage to the clinician is not a compliant default**. Exceptions: (a) patient-initiated messages or the patient's stated preference after a risk warning (OCR guidance) apply to patients, not to clinician-to-vendor workflows; (b) a BAA-covered platform with access controls, audit logs and encryption. [HIPAA Journal](https://www.hipaajournal.com/texting-violation-hipaa/), [Paubox](https://www.paubox.com/blog/unpacking-the-hipaa-rules-on-text-messaging)
*Design implication:* SMS/iMessage can carry **PHI-free signals** (a "note ready" ping plus an authenticated deep link, or a one-time code). The note body must live behind auth.

**Twilio.** It signs a BAA only on **Security or Enterprise Edition**. HIPAA-eligible services: Programmable Messaging (SMS/MMS), Programmable Voice, SIP/Elastic SIP Trunking, Video, Conversations, Flex (case by case). **SendGrid is excluded.** A BAA with Twilio does not make SMS end-to-end encrypted to the handset, so it covers Twilio's handling, not the carrier leg. [Twilio HIPAA](https://www.twilio.com/en-us/hipaa), [Twilio changelog](https://www.twilio.com/en-us/changelog/programmable-voice--sip--and-sms-are-now-hipaa-eligible)
*Design implication:* **Call-in voice capture over Twilio Programmable Voice under a BAA is viable.** Recorded audio sits on Twilio until it is deleted, so configure recording deletion.

**Deepgram.** Provides a BAA "to eligible healthcare customers upon request." Plan eligibility is not published, so assume a sales conversation. It has `redact=phi` for streaming and batch and zero-retention options. [AccountableHQ](https://www.accountablehq.com/post/is-deepgram-hipaa-compliant-baas-phi-and-security-explained), [Deepgram](https://deepgram.com/learn/standard-compliance-speech-to-text)

**Anthropic.** A BAA is available for the first-party API and Claude Enterprise. The Primary Owner enables HIPAA in org settings and signs. **Covered models require 30-day retention and are not available with ZDR enabled** (HIPAA readiness is now decoupled from ZDR). Excluded: Batch API, Files API, Skills API, Code Execution, Computer Use, Web Fetch, MCP/connectors, beta features, and the Console. The BAA covers only the org that accepted it. [Anthropic BAA](https://privacy.claude.com/en/articles/8114513-business-associate-agreements-baa-for-commercial-customers), [Covered models](https://support.claude.com/en/articles/15455031-covered-models-under-a-business-associate-agreement-baa)
*Design implication:* Keep note generation on plain Messages API calls. Do not route PHI through Batch or Files. A browser-agent approach (Computer Use) to fill EHRs is **not** BAA-covered, which favors a deterministic DOM-fill extension.

**Recording consent by state.** All-party consent states commonly cited: **CA, CT, DE, FL, IL, MD, MA, MT, NH, PA, WA**. NV and OR have nuanced rules (in-person vs phone). For telehealth across state lines, apply the stricter all-party standard. Verbal consent logged with a timestamp per encounter is generally sufficient. [Thyra](https://thyrahealth.com/blog/2026/09/ai-scribe-recording-patient-consent-guide/)

**AI disclosure laws.** Texas SB 1188 (effective 2025-09-01) requires disclosure of AI use and review of AI-created records. California AB 3030 requires a disclaimer on unreviewed genAI patient communications. California AB 489 (2026-01-01) bars AI implying it is a licensed clinician. [TMA](https://www.texmed.org/AIHIPPAReqs/), [Fenwick](https://www.fenwick.com/insights/publications/the-new-regulatory-reality-for-ai-in-healthcare-how-certain-states-are-reshaping-compliance)
*Design implication:* Consent capture must be a first-class, one-tap or one-utterance step. A dial-in channel can speak the disclosure aloud and record "patient agreed" as structured data.

---

## 7. Non-physician segments: who adopts fastest with the least IT

| Segment | Evidence | IT burden | Speed |
|---|---|---|---|
| **Private-practice therapists (LPC, LCSW, LMFT, psychologists)** | APA 2025 Pulse: monthly AI use rose from 11% (2024) to 29%; 52% of AI users use it for admin work; only 44% never used AI; 67% worry about breaches. 400%+ rise in r/therapists AI posts 2023 to 2024. Twofold, Mentalyc, Upheal, SimplePractice AI Note Taker. | Near zero: solo, web EHRs (SimplePractice, TherapyNotes), much of it telehealth | **Fastest**, but the most consent-sensitive (20%+ decline) and BAA-obsessed. Prefer "audio not stored." [APA](https://www.apa.org/pubs/reports/practitioner/2025/ai-practice-management) |
| **Outpatient / travel / home health PT, OT, SLP** | Only 20.5% of rehab therapists use AI tools, while 68.8% of clinics think AI would help. Repetitive daily notes; WebPT has 170k users and sells AI at $3/visit. SOAP Note Buddy targets them. | Low for travel and PRN clinicians, who bring their own tools; clinic-owned EHRs vary | Fast-rising, under-served. Short-input autofill fits better than ambient. |
| **Veterinarians** | 39.2% of vet pros using AI (2024 AAHA/Digitail); ScribbleVet "84% of practices adopted within 7 days"; Scribenote free plan (mid-2025). No HIPAA. | Very low: independent practices, no HIPAA | **Very fast.** Consent and BAA friction are absent. [co.vet guide](https://co.vet/post/veterinary-ai-scribe/) |
| **Dentists** | Bola AI: 10,000+ dentists and hygienists, 3M+ charts; voice perio charting (hands in the mouth). | Low to moderate (Dentrix and Eaglesoft are often desktop thick clients, so extensions don't reach them) | Fast. Voice while gloved is the killer use case. [DeepCura dental](https://www.deepcura.com/resources/best-ai-scribe-for-dentists) |
| **Chiropractors** | Jane App AI Scribe add-on; Freed popular with solos | Very low (Jane, ChiroTouch web) | Moderate to fast. Short, repetitive visits. |
| **Home health nurses (agency)** | 30 to 45 min charting per visit; 2 to 3 hours each evening. Agency EHRs (Homecare Homebase, Axxess) with OASIS. | High: the agency controls the EHR, and devices are often agency tablets | Slow bottom-up, but pain is extreme. Offline/poor connectivity in homes. [WorldView](https://worldviewltd.com/blog/ai-documentation-home-health-hospice) |
| **School-based SLP/OT/PT/counselors** | Session notes, IEP minutes, Medicaid billing (CPT, minutes); tools such as SLP Now and mySchoolTherapy | Moderate: district-controlled, FERPA plus HIPAA for Medicaid | Individual therapists adopt personal tools. Districts gate purchases. |
| **Hospital nurses** | 74% of nurse managers say physician-style ambient tools won't solve nursing burden; 7 systems have union AI contract language | High: enterprise only | Not bottom-up. [Nurse.org](https://nurse.org/news/nursing-ai-watch/) |

**Ranking for least-IT adoption:** vets > private-practice therapists > chiropractors and solo PT/OT/SLP > dentists > solo and small-group physicians/NPs/PAs > school-based > home health agency > hospital employees.

---

## 8. The 8 friction points a new interface must remove

1. **The second screen and the copy-paste hop.** Notes generated on a phone must reach the EHR without manual clipboard work. Clinicians call picking and pasting output something that "defeat[s] some of the purpose," and Freed measured about 2 minutes per patient. Field-mapped push into the EHR the clinician already has open, with no IT, is table stakes.
2. **App install, account creation and login at the point of care.** Every competitor requires an app plus a login, and often a second login on the exam-room PC. The winning pattern is identity once (NPI-verified, like OpenEvidence and Doximity), then zero-login capture: call a number, tap a widget, press a watch button.
3. **Battery drain and device babysitting.** "Absolutely annihilated battery on my phone." "Barely make it through one HALF of clinic." Clinicians keep plugged-in iPads or buy a $180 recorder. Capture should offload audio (phone call, wearable, server-side streaming) rather than run long on-device sessions.
4. **Lost or failed recordings.** "Sometimes you lose your documentation." Capture must be resilient to app updates, backgrounding, weak Wi-Fi and dead zones in homes. That means local buffering plus a server-side audio path, and an obvious confirmation that the recording landed.
5. **Consent friction and legal ambiguity.** 8 to 15% decline (20%+ in behavioral health), and consent drops to 55% with detailed disclosure. Eleven-plus all-party states and Texas/California AI disclosure laws apply. The interface must make disclosure one tap or one utterance, log it as structured, timestamped data, offer a no-record mode (typed or dictated summary after the visit), and make "audio not stored" true and visible.
6. **Narrating the exam and verbose, un-personal notes.** "Every note feels like it's been written for a medical drama script." "I have to say what I'm doing and what I'm finding out loud." Support a post-visit dictation or short-input path (2 to 3 sentences plus the plan, as with Autonotes and SOAP Note Buddy), and learn the clinician's own style and length.
7. **Cost and procurement.** Free options (Doximity, OpenEvidence, Nabla, Heidi Free) pull clinicians away from $99 to $139 tools ("Nabla is free, so I've been using that more"). Individuals won't expense or procure. The channel needs a genuinely usable free tier, card-free trials, free for trainees, and a referral loop.
8. **Compliance anxiety about "shadow" tools.** "The moment you record a therapy session without a BAA you are playing with your license." 47% of physicians find institutional AI policy confusing. The channel must ship a self-serve BAA at signup, use only BAA-covered sub-processors (Twilio Security Edition, Deepgram BAA, Anthropic API under BAA, no Batch/Files/Computer Use for PHI), keep PHI out of SMS/iMessage bodies, and offer a one-page policy PDF clinicians can show a practice manager.

### Implications for Chartside's new channel (brief)
- The gap nobody fills: **"call a number (or tap a watch or home-screen widget), talk, and the note appears in the EHR tab you already have open."** It combines legacy dial-in dictation habits, Instinct-style no-app access, Twilio Voice under a BAA, and Freed-style field-mapped extension push.
- Start with the segments where bottom-up adoption is fastest and IT is absent: private-practice therapists (telehealth, web EHRs), solo and travel PT/OT/SLP, and chiropractors. Vets move fastest if HIPAA-free expansion is acceptable.
- Use texting only for PHI-free notifications and auth links.
