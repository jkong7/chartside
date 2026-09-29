# Voice-first and conversational UX for clinicians (raw research)

Dated 2026-09-28. Purpose: inform the design of a "talk to your chart" agent and a "call your scribe" phone line for Chartside. Sources are linked inline and collected at the end. Where no public source existed, the text says so and marks the point as a design recommendation rather than a finding.

## 1. Existing clinician voice assistants and their commands

**Suki Assistant.** Suki is the most explicitly voice-first product in the category. Its wake word is "Suki." Engineering-wise it runs two ASR paths in parallel: a "semantic" processor that is always listening for the wake word and a "syntactic" processor that turns on when the clinician is dictating into a note section, which lets it switch between dictation and commands without the user flipping a mode ([Suki engineering blog](https://www.suki.ai/blog/engineering-an-invisible-and-assistive-voice-agent-for-clinicians/)). Published example commands: "Suki, show me the last labs," "Suki, what's her last A1c?", "Suki, add hypertension to the problem list," "Suki, order a lipid panel," "Order metformin 500mg," and navigation such as "Go to Physical Exam section" ([DeepCura review](https://www.deepcura.com/resources/suki-ai-review), [MedAI Directory](https://medaidirectory.com/blog/suki-ai-review-2026), [Suki blog](https://www.suki.ai/blog/engineering-an-invisible-and-assistive-voice-agent-for-clinicians/)). Orders are not placed; Suki's Ambient Order Staging "structures, codes, and stages prescription orders for clinician review/sign-off" ([MobiHealthNews](https://www.mobihealthnews.com/news/suki-introduces-ai-powered-prescription-order-staging-feature)). The product page lists pre-visit summaries, chart Q&A, voice pre-charting, order staging, ICD-10/HCC/CPT/E/M coding, patient instructions in 80 languages, and voice editing of notes ([Suki for clinicians](https://www.suki.ai/clinicians/)).

**Microsoft Dragon Copilot (Nuance).** Dragon Copilot merges Dragon Medical One dictation, DAX ambient capture, and natural-language requests in one surface ([Microsoft](https://www.microsoft.com/en-us/health-solutions/clinical-workflow/dragon-copilot)). The legacy command layer is large: "step-by-step commands" automate repeatable EHR navigation from a single phrase, and "AutoTexts" insert templates by voice. Microsoft reports 600K+ Dragon Medical users, 140 million AutoTexts and 300 million voice skills and commands used annually ([Microsoft Tech Community](https://techcommunity.microsoft.com/blog/healthcareandlifesciencesblog/a-deeper-look-at-microsoft-dragon-copilot-transforming-clinical-workflow-with-ai/4389496) via search summary). The newer natural-language layer answers questions "drawn from transcripts, notes, and trusted medical references with citations," and drafts referral letters, after-visit summaries, coding suggestions, and nurse notes. HIMSS 2026 additions include a Desktop Copilot that works in any app, proactive ICD-10 specificity prompts, and capture in 58 languages ([HealthTech Magazine](https://healthtechmagazine.net/article/2026/06/microsoft-dragon-copilot-healthcare-workflows)).

**Epic: Hey Epic and Art.** Hey Epic launched on the Haiku phone app around 2020. It could look up history, recent visits and tests, queue medication orders, create reminders and worklist tasks, and call another care team member; Epic added "more than 100 commands" including messaging other physicians and cueing follow-up tests and referrals ([Becker's](https://www.beckershospitalreview.com/ehrs/5-things-to-know-about-epic-s-new-ehr-voice-assistant.html), [Optimum HIT](https://optimumhit.com/insights/blog/global/hey-epic-epics-new-voice-assistant/)). Its canonical example was "show me my last patient note." In February 2026 Epic released native AI Charting under the "Art" brand (Art for clinicians, Penny for revenue cycle, Emmie for patients). AI Charting drafts notes, queues orders, and includes a voice agent that personalizes note format conversationally, e.g. "format the history of present illness as a bulleted list" ([Epic](https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/), [Healthcare Dive](https://www.healthcaredive.com/news/epic-rolls-out-ai-charting-art-notetaking-documentation-scribe/811462/)). The usage signal worth copying: Art's Insights chart summary runs over 16 million times a month, nearly 3x November 2025 ([Epic](https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/)). At Mercy, AI-drafted nursing end-of-shift notes dropped from 3.5 minutes to about 32 seconds.

**Nabla.** Nabla pairs ambient notes with at-cursor dictation that supports "custom voice commands" and dot-phrase triggering, compatible with PowerMic and SpeechMike hardware ([Nabla dictation](https://www.nabla.com/dictation)). In July 2026 it launched an on-device dictation app for macOS with Epic integration ([HIT Consultant](https://hitconsultant.net/2026/07/28/nabla-launches-on-device-mac-clinical-dictation-epic-integration/)).

**Heidi: Ask Heidi.** Ask Heidi is a chat bar inside a session that edits notes ("make this shorter," "convert to French"), generates documents (referral letters, discharge summaries, handover notes, care plans), applies billing codes, and in supported regions answers evidence questions mid-consult ([Heidi help](https://www.heidihealth.com/support/en/articles/8974408-what-is-ask-heidi), [Heidi feature dictionary](https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary)). Heidi splits Basic (edit/generate) from Advanced (evidence-grounded, agentic actions). A reviewer notes a key limitation: it is single-turn and cannot chain backend actions from one prompt ([Heidi product](https://www.heidihealth.com/product/ask-heidi) via search summary). Heidi also ships four dictation modes, including a system-wide hotkey dictate.

**Abridge.** Abridge is Epic's first "Pal" partner, pushing notes natively into Haiku and Hyperspace. It is moving into orders (pilot in Epic's Workshop program; "the medications I talked through are already surfaced in Epic"), with labs and imaging next ([Abridge press release, June 2025](https://www.abridge.com/press-release/abridge-inside-for-inpatient-and-outpatient-orders)), and real-time prior auth via Availity (January 2026) and Highmark ([Vero review](https://www.veroscribe.com/blog/abridge-review-2026)). Abridge's model is ambient-first, not command-first.

**Amazon/Alexa.** Amazon launched a HIPAA-eligible Alexa skills kit in April 2019 with six partners (Boston Children's, Livongo, Cigna, Atrium, Express Scripts, Swedish) for booking, discharge instructions and prescription status, then ended third-party HIPAA skill support on 9 December 2022, folding it into first-party Alexa Smart Properties for Healthcare ([Fierce Healthcare](https://www.fiercehealthcare.com/digital-health/amazon-shuts-down-support-alexa-hipaa-compliant-programs-hospitals-payers), [TechCrunch](https://techcrunch.com/2022/12/09/amazon-ends-support-for-third-party-hipaa-compliant-alexa-skills/)). Lesson: a general consumer voice platform with bolt-on healthcare skills did not stick; winning clinician voice lives inside the clinical workflow.

**Doximity.** Doximity Scribe is free for verified US clinicians and can auto-start on Dialer voice and video calls via a toggle on the dial pad ([Doximity help](https://support.doximity.com/hc/en-us/articles/44194102268691-Guide-to-Using-Scribe-in-Dialer-Voice-and-Video-Calls) via search summary). This is the closest existing thing to "scribe over the phone," but it scribes a phone visit rather than using the phone as a microphone for an in-room visit.

**What clinicians actually use most.** No vendor publishes a ranked command-frequency table. The best proxies:
1. Chart summary and lookup is the volume leader (Epic Insights at 16M/month; "show me last labs," "last A1c" are every vendor's lead example).
2. Templated text insertion (140M AutoTexts/year) and navigation macros (300M commands/year) dominate legacy Dragon.
3. Note editing and restyling ("make it shorter," "bullet the HPI") is the main use of Ask Heidi and Epic's voice agent.
4. Letters and patient instructions (referral letters, AVS) are the next most common generated artifacts.
5. Orders are always staged, never placed, and final signing stays a deliberate click in every product reviewed.

## 2. Phone-based documentation history

Before speech recognition, the standard hospital workflow was: dial the dictation line (in-house extension or toll-free number), key in a provider ID, choose a numeric "work type" (H&P, consult, op note, discharge summary), key in the MRN or encounter number, then dictate with keypad controls. Commonly documented controls: 2 to record or resume, 4 to pause, 5 to end or separate a report and get a job number, 6 to mark STAT, 8 to end one report and start the next ([Children's Minnesota card](https://www.childrensmn.org/departments/pdf/him/childrens-of-mn-dictation-instructions.pdf), [LCMC card](https://www.chnola.org/documents/Provider%20Onboarding/Physician-Dictation-Card.pdf), [eScription quick reference](https://www.hbmc.org/wp-content/uploads/2018/05/eScription-Quick-Reference-Guide.pdf) via search summary). A transcriptionist typed the report, and it returned to the chart for signature.

The SIU School of Medicine dictation guide is a good record of the failure modes that the verbal protocol evolved to catch: entering all 9s instead of the MRN; picking the wrong work type; the rule to "distinctly state your name," "state and spell the patient's name," say the report type out loud in case the wrong code was keyed, name the co-signing attending explicitly, and say numbers digit by digit because "50 often sounds like 15" ([SIU dictation guidelines](https://www.siumed.edu/sites/default/files/u801/dictation_guidelines.pdf)). Every one of those is a redundancy check that a modern voice agent can perform automatically by confirming identity against the schedule.

**Current dial-in vendors.** The model is alive: Scribe4you, idigital toll-free call-in, DictaSmart, Cloud Dictation, Chase Clinical Documentation, SpectraMedi EasyVoice, Arrendale Associates cloud-hosted dial-in, Sunrise Transcription (same-day return) and SmartMD ([Scribe4you](https://www.scribe4you.com/contactus.aspx), [TranscriptionGear](https://www.transcriptiongear.com/product/idigital-toll-free-call-in-dictation-service/), [DictaSmart](https://www.dictasmart.com/), [Cloud Dictation](https://www.clouddictation.com/), [Chase](https://www.chaseclinicaldocumentation.com/medical-transcriptions/medical-dictation), [Arrendale](https://aaita.com/dictation/cloud-hosted-dictation/), [Sunrise](https://sunrisetranscription.com/medical-dictation-services.html), [TechRadar](https://www.techradar.com/best/best-medical-transcription-services)). Apptec still sells 1 to 32 port on-prem call-in dictation hardware ([TVPS](https://www.tvps.com/apptec-digitel-remote-call-in-telephone-digital-dictation-transcription-system-1-to-32-ports/ap-dt-usb/)).

**Is there a familiarity advantage?** No survey measures it directly, so this is inference. The advantages are real but narrow: (a) zero install and zero login for a clinician who already knows "call the number, dictate, hang up"; (b) it works on any phone, including a flip phone or hospital landline, and for clinicians whose organizations block app installs; (c) the mental model of "a transcriptionist on the other end" maps cleanly onto "an AI scribe on the other end"; (d) Dragon's own longevity (users choosing Dragon alone over Copilot, per [Voice Automated](https://voiceautomated.com/blog/dragon-medical-one-vs-dax-copilot-why-some-doctors-still-choose-dragon-alone/)) shows that established voice habits are sticky. The design lesson is to keep the rituals (say who you are, which patient, what kind of note, done) but have the agent do the identity and number checks and never make anyone key in an MRN.

## 3. Voice-agent UX best practices in 2026

**Latency.** The shared 2026 benchmark: production p50 under 400 ms and p95 under 800 ms from end of user speech to start of agent audio; human conversational handoff is about 200 to 300 ms, and callers notice pauses above 800 ms ([AWS Builder Center](https://builder.aws.com/content/3JDFAfXBiuwPP5MPzgf4RUWSAIp/the-800ms-rule-budgeting-latency-for-a-real-time-voice-agent-on-aws), [Telnyx](https://telnyx.com/resources/voice-ai-agents-compared-latency), [Hamming](https://hamming.ai/resources/voice-ai-latency-whats-fast-whats-slow-how-to-fix-it)). For clinical, financial and legal agents, a slower 500 to 700 ms target is acceptable if the agent gives an audible "thinking" signal ([Future AGI](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/)).

**Turn-taking.** Energy-threshold VAD is being replaced by semantic turn detection models that classify backchannel vs. barge-in vs. continued silence. For clinical use, Future AGI recommends a "strict end-of-turn" policy with 800 to 1200 ms silence thresholds, because clinicians pause mid-thought while reading a chart, and cutting them off is worse than a slightly slower reply ([Future AGI](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/)).

**Barge-in.** Targets: over 96% barge-in success, under 2% false barge-in (above 5% "feels broken"), TTS flush under 60 ms, LLM cancel under 40 ms, total under 150 ms. On interrupt, stash the truncated utterance, let idempotent reads finish, and cancel in-flight mutations if the user contradicts the intent ([Future AGI](https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/), [SyncSoft](https://www.syncsoft.ai/en/blog/voice-agent-barge-in-vad-tuning-2026)). The clinical twist: during a visit the phone hears the patient too, so barge-in must be disabled while in silent-listen mode, and only a wake phrase from the enrolled clinician voice should interrupt.

**Confirmations.** Google's conversation design guidance: use implicit confirmation by default ("Pulling up Maria Lopez's labs") and reserve explicit yes/no confirmation for actions "difficult to undo" and for high-cost parameters such as names and messages sent on the user's behalf ([Google conversation design](https://developers.google.com/assistant/conversation-design/confirmations)). Mapped to a scribe: reads are implicit, drafts are implicit with undo, anything that leaves the building (signed note, sent message, submitted claim, staged order) is explicit.

**Read-back.** The Joint Commission requires the receiver of a verbal order or critical result to write it down and "read (not repeat) it back" before acting (PC.02.01.03 EP 20) ([ISMP](https://www.ismp.org/sites/default/files/attachments/2018-03/20170518.pdf), [Joint Commission Journal](https://www.jointcommissionjournal.com/article/S1549-3741(04)30053-5/fulltext), [Patient Safety Solutions](https://www.patientsafetysolutions.com/docs/January_2020_The_Joint_Commission_on_Closing_the_Loop.htm)). "Readback/hearback" is described as "the fundamental mechanism of closed loop communication," borrowed from aviation. Standard practice for verbal medication orders adds spelling look-alike drug names and stating doses digit by digit ("one-five milligrams"). The agent should play the receiver role: read back from the structured record it created, not from the transcript, so the clinician is verifying what will actually be saved.

**Structured summaries by voice.** SBAR (Situation, Background, Assessment, Recommendation) came from the military and was introduced to rapid response at Kaiser Permanente Colorado in 2002; the Situation should take no more than about 10 seconds ([Wikipedia: SBAR](https://en.wikipedia.org/wiki/SBAR)). I-PASS (Illness severity, Patient summary, Action list, Situation awareness and contingency, Synthesis by receiver) is the handoff standard; the I-PASS Institute cites a 70% reduction in patient harm ([I-PASS Institute](https://www.ipassinstitute.com/)); the 2014 NEJM multicenter study reported a 23% drop in medical errors and a 30% drop in preventable adverse events ([NEJM 2014](https://www.nejm.org/doi/full/10.1056/NEJMsa1405556), figures from prior knowledge, page blocked). For voice, the key idea is I-PASS's final step: the receiver synthesizes. A spoken summary should end by asking the clinician to confirm or correct, which closes the loop.

## 4. Healthcare phone AI companies: design choices and safety rails

| Company | Focus | Notable design choices and rails |
|---|---|---|
| [Hippocratic AI](https://www.hippocraticai.com/) | Patient-facing clinical calls (outreach, discharge follow-up, care management) | "Constellation" architecture where specialized support models check the primary model; no diagnosing or prescribing; escalation to human nurses (31K+ escalations); tested with 7.7K US licensed clinicians on 775K test calls; 0.5 to 1% of live calls sampled for safety review; contractual accountability |
| [Assort Health](https://www.assorthealth.com/) | Inbound patient calls for specialty practices | Specialty-specific triage and routing protocols, human handoff, deep Athena and 15+ EHR integrations; 89% hold time reduction at one customer |
| [Hello Patient](https://www.hellopatient.com/) | Front office: scheduling, insurance, recalls | Named persona "Mia," omnichannel (call, text, chat), "conversations, not phone trees," explicit SMS consent, HIPAA and SOC 2 |
| [Infinitus](https://www.infinitus.ai/) | Payer and patient calls (benefits verification, patient support) | Discloses AI and recording in the first sentence ("My name is Eva, and I am an AI agent on a recorded line"); enforces verbatim language where required; answers only from pre-approved knowledge bases; clinical team of doctors and nurses evaluates calls; warm handoffs; reports 0% under-triage |
| [Abridge](https://www.abridge.com/press-release/abridge-inside-for-inpatient-and-outpatient-orders) | Clinician-side ambient | Orders surfaced for clinician placement, never auto-placed; embedded inside Epic rather than a separate app |

Common pattern: every company constrains the action space, discloses it is AI early, escalates to a human on clinical risk, and runs clinician-staffed QA on a sample of live calls. None lets the agent take an irreversible clinical action alone. Chartside's clinician-facing line is lower risk than patient triage (the caller is a licensed clinician), but it should copy the disclosure, constrained actions, and sampled QA.

## 5. Consent

**Recording law.** Federal law is one-party consent. States requiring all-party consent: California, Connecticut (electronic), Florida, Hawaii (for devices in private places), Illinois, Maryland, Massachusetts, Montana (notice), New Hampshire, Oregon (in-person), Pennsylvania, Washington ([Wikipedia: telephone call recording laws](https://en.wikipedia.org/wiki/Telephone_call_recording_laws)). Nuances matter for a phone scribe: Oregon is one-party for electronic but all-party for in-person conversations; Connecticut is the reverse. A phone left on the exam room counter is recording an in-person conversation, so the in-person rule of the visit's state applies. Michigan and Nevada are listed as one-party but have litigation history. Design choice: ignore the state matrix in product logic and always get patient consent, which also matches medical-board guidance.

**Professional guidance.** The CMPA states: "prior to making any recording of a clinical encounter, you should obtain patient consent," explain purpose (drafting a note the physician reviews), the privacy risk of digital processing, and that "AI may produce inaccurate or biased chart entries," and document the discussion in the chart ([CMPA](https://www.cmpa-acpm.ca/en/advice-publications/browse-articles/2023/ai-scribes-answers-to-frequently-asked-questions)). UVA Health's DAX FAQ shows the patient-side framing: the provider "will let you know," the patient can decline at the start, the provider can stop recording at any time, and recordings are kept 1 year then deleted ([UVA Health](https://www.uvahealth.com/patients-and-visitors/support/ai-note-taking-faq)).

**Scripts.** No vendor publishes a verbatim script publicly in the sources reached (Abridge's and Freed's consent pages returned 404; Heidi's docs defer to local policy). The common elements across the guidance are: who is listening (an AI tool, not a person), why (to write the note), that the clinician reviews it, retention, and the right to decline or stop. A compliant composite:

> "Before we start, I use an AI assistant that listens to our conversation and drafts my note, so I can look at you instead of the computer. I review everything before it goes in your chart, and the recording is deleted after the note is done. Is that okay with you? You can say no, or ask me to stop it at any point."

Chartside should capture consent as a structured event: patient said yes, who asked, timestamp, and the audio snippet of the yes, then write "Patient verbally consented to AI-assisted documentation" into the note.

## 6. Recommended design

### 6a. "Call your scribe" phone flow

Principles: caller ID plus voice match replaces the PIN; the schedule replaces the MRN keypad; silence during the visit; explicit read-back before sign; a text link for anything visual.

**Setup (one time).** The clinician registers their mobile number in Chartside and records a 20-second voice enrollment. They save "Chartside Scribe" as a contact.

**1. Dial and greet (under 800 ms to first audio).**
> Scribe: "Hi Dr. Patel. This is your Chartside scribe on a recorded line. Your 2:40 is Maria Lopez, 58, follow-up for diabetes. Is that who you're seeing?"
> Dr. Patel: "Yes."
> (If unknown number: "I don't recognize this number. Say your name and your four-digit code." Keypad fallback: enter code, then press 1 for your next patient.)
> (If "No": "Who are you seeing? Say the name or the room.")

**2. Patient consent (on speaker, addressed to the patient).**
> Scribe: "I'll ask Maria for consent. Please put me on speaker."
> Scribe: "Hi Maria. I'm an AI assistant that helps Dr. Patel write her notes. I'll listen to your visit so she can focus on you. She reviews everything, and the recording is deleted after the note is done. Is it okay if I listen? You can say no."
> Maria: "Sure."
> Scribe: "Thank you. I'll be quiet now." (one soft tone)
> If the patient declines or hesitates: "No problem, I won't record. Dr. Patel, you can dictate after the visit by calling back." Then hang up. Never ask twice.

**3. Silent listening.** No speech output, barge-in disabled, a faint tone every 5 minutes optional (off by default). Only the wake phrase "Scribe, ..." from the enrolled voice wakes it. Supported quiet asides: "Scribe, pause" / "Scribe, resume" (patient requests sensitive discussion off the record), "Scribe, mark that" (flags a moment). Keypad: 4 pause, 2 resume, the same numbers old dictation cards used.

**4. End of visit.** Triggers: "Scribe, we're done," pressing 5, or the clinician taking the phone off speaker and saying "done." If the call simply drops, the scribe finalizes and sends a text.
> Scribe: "Got it. Twenty-two minutes captured. Drafting now." (Speak within 3 seconds; generation happens while it talks.)

**5. Read-back of assessment and plan (from the structured draft, not the transcript).**
> Scribe: "Here's the assessment and plan. One: type 2 diabetes, above goal, A1c eight point four. Increase metformin to one thousand milligrams, one-zero-zero-zero, twice daily. Recheck A1c in three months. Two: hypertension, controlled, continue lisinopril twenty milligrams. Three: diabetic eye exam referral to ophthalmology. Anything to change?"
> Dr. Patel: "Make the recheck ten weeks."
> Scribe: "Recheck A1c in ten weeks. Anything else?"
> Dr. Patel: "No."
Rules: doses and numbers read digit by digit; drug names that are on ISMP look-alike lists are spelled; staged orders are named as "staged, not placed."

**6. Sign.**
> Scribe: "Say 'sign it' to sign the note as Dr. Anjali Patel, or 'hold' to review it on your phone."
> Dr. Patel: "Sign it."
> Scribe: "Signed at 3:04. The metformin change and ophthalmology referral are staged in the chart for you to place."
"Sign it" is only accepted from the enrolled voice, only after a completed read-back, and only if no required section is flagged as low-confidence. Otherwise: "There's one thing I'm unsure about: the allergy list. I've texted you the note to check."

**7. Text link.**
> Scribe: "I've texted you a link to the note and patient instructions. Next up is James Chen at 3:10. Call back when you're ready. Bye."
The SMS contains no PHI beyond first initial and time ("Chartside: note for M.L. 2:40 signed. Review: [link]"), and the link requires app login or a passkey.

### 6b. Twenty-five intents with confirmation policies

Policy tiers: **Implicit** (do it and say what you did), **Undo** (do it, announce it, 10-second spoken undo window, reversible in UI), **Explicit** (yes/no before acting, with read-back of the key parameters), **Explicit plus identity** (explicit, enrolled voice or passkey, and never while in silent-listen with a patient present unless read-back completed).

| # | Intent | Example utterance | Back-office action | Policy |
|---|---|---|---|---|
| 1 | Chart summary | "Brief me on my next patient" | Pre-visit summary, SBAR shape | Implicit |
| 2 | Lab lookup | "Last A1c and creatinine" | Query results, read with dates | Implicit |
| 3 | Med list lookup | "What's she on?" | Read active meds | Implicit |
| 4 | Prior note lookup | "What did cardiology say last time?" | Retrieve and summarize note | Implicit |
| 5 | Start scribe session | "Start listening" | Open encounter, begin capture | Implicit (consent step required first) |
| 6 | Pause/resume capture | "Scribe, pause" | Stop and restart audio capture | Implicit |
| 7 | Log patient consent | Patient says yes | Write consent event and note line | Implicit, audio snippet stored |
| 8 | Dictate addendum | "Add to the exam: no pedal edema" | Append to note section | Undo |
| 9 | Restyle note | "Bullet the HPI" | Reformat section | Undo |
| 10 | Shorten or expand | "Make the plan shorter" | Regenerate section | Undo |
| 11 | Switch template | "Use my procedure template" | Re-render draft | Undo |
| 12 | Add problem | "Add hypertension to the problem list" | Update problem list | Explicit |
| 13 | Suggest codes | "What should I bill?" | Propose ICD-10 and E/M with rationale | Implicit (suggestion only) |
| 14 | Accept codes | "Use those codes" | Attach codes to encounter | Explicit, read back codes |
| 15 | Stage med order | "Increase metformin to 1000 twice a day" | Stage order, not placed | Explicit, digit-by-digit read-back |
| 16 | Stage lab/imaging order | "Order a lipid panel" | Stage order | Explicit |
| 17 | Draft referral letter | "Refer to ophthalmology for eye exam" | Draft letter and referral | Explicit before send; drafting is Implicit |
| 18 | Patient instructions | "Give her instructions in Spanish" | Generate AVS | Undo; Explicit before sending to patient |
| 19 | Draft portal reply | "Reply to her message about the rash" | Draft inbox message | Explicit plus identity to send |
| 20 | Create task | "Remind me to check her potassium Friday" | Worklist task | Implicit |
| 21 | Message care team | "Tell the nurse to draw labs" | Secure message | Explicit (read back recipient and text) |
| 22 | Prior auth packet | "Start prior auth for the MRI" | Assemble clinical justification | Explicit before submit |
| 23 | Read back A/P | "Read me the plan" | Read structured A/P | Implicit |
| 24 | Sign note | "Sign it" | Finalize and lock note | Explicit plus identity, read-back required |
| 25 | Delete or discard | "Scrap that recording" | Delete audio and draft | Explicit plus identity, stated consequence ("This can't be undone") |

Global rails: every write is logged with the utterance audio; mutations in flight are cancelled on barge-in; the agent never places orders, never sends to patients or payers without explicit confirmation, and escalates to "I've texted it to you to check" whenever confidence is low; a small sample of sessions is reviewed by a clinician QA reviewer, as Hippocratic AI and Infinitus do.

## Sources

- Suki engineering blog: https://www.suki.ai/blog/engineering-an-invisible-and-assistive-voice-agent-for-clinicians/
- Suki for clinicians: https://www.suki.ai/clinicians/
- DeepCura Suki review: https://www.deepcura.com/resources/suki-ai-review
- MedAI Directory Suki review: https://medaidirectory.com/blog/suki-ai-review-2026
- MobiHealthNews, Suki order staging: https://www.mobihealthnews.com/news/suki-introduces-ai-powered-prescription-order-staging-feature
- Microsoft Dragon Copilot: https://www.microsoft.com/en-us/health-solutions/clinical-workflow/dragon-copilot
- Microsoft Tech Community: https://techcommunity.microsoft.com/blog/healthcareandlifesciencesblog/a-deeper-look-at-microsoft-dragon-copilot-transforming-clinical-workflow-with-ai/4389496
- HealthTech Magazine: https://healthtechmagazine.net/article/2026/06/microsoft-dragon-copilot-healthcare-workflows
- Voice Automated: https://voiceautomated.com/blog/dragon-medical-one-vs-dax-copilot-why-some-doctors-still-choose-dragon-alone/
- Becker's, Hey Epic: https://www.beckershospitalreview.com/ehrs/5-things-to-know-about-epic-s-new-ehr-voice-assistant.html
- Optimum HIT, Hey Epic: https://optimumhit.com/insights/blog/global/hey-epic-epics-new-voice-assistant/
- Epic AI Charting post: https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/
- Healthcare Dive, Epic AI Charting: https://www.healthcaredive.com/news/epic-rolls-out-ai-charting-art-notetaking-documentation-scribe/811462/
- Nabla dictation: https://www.nabla.com/dictation
- HIT Consultant, Nabla Mac: https://hitconsultant.net/2026/07/28/nabla-launches-on-device-mac-clinical-dictation-epic-integration/
- Heidi, Ask Heidi: https://www.heidihealth.com/support/en/articles/8974408-what-is-ask-heidi
- Heidi feature dictionary: https://support.heidihealth.com/en/articles/8840280-heidi-s-feature-dictionary
- Abridge orders: https://www.abridge.com/press-release/abridge-inside-for-inpatient-and-outpatient-orders
- Vero, Abridge review: https://www.veroscribe.com/blog/abridge-review-2026
- Fierce Healthcare, Alexa HIPAA: https://www.fiercehealthcare.com/digital-health/amazon-shuts-down-support-alexa-hipaa-compliant-programs-hospitals-payers
- TechCrunch, Alexa HIPAA: https://techcrunch.com/2022/12/09/amazon-ends-support-for-third-party-hipaa-compliant-alexa-skills/
- Doximity Dialer Scribe: https://support.doximity.com/hc/en-us/articles/44194102268691-Guide-to-Using-Scribe-in-Dialer-Voice-and-Video-Calls
- SIU dictation guidelines: https://www.siumed.edu/sites/default/files/u801/dictation_guidelines.pdf
- Children's Minnesota dictation card: https://www.childrensmn.org/departments/pdf/him/childrens-of-mn-dictation-instructions.pdf
- LCMC dictation card: https://www.chnola.org/documents/Provider%20Onboarding/Physician-Dictation-Card.pdf
- eScription quick reference: https://www.hbmc.org/wp-content/uploads/2018/05/eScription-Quick-Reference-Guide.pdf
- Dial-in vendors: https://www.scribe4you.com/contactus.aspx, https://www.transcriptiongear.com/product/idigital-toll-free-call-in-dictation-service/, https://www.dictasmart.com/, https://www.clouddictation.com/, https://www.chaseclinicaldocumentation.com/medical-transcriptions/medical-dictation, https://aaita.com/dictation/cloud-hosted-dictation/, https://sunrisetranscription.com/medical-dictation-services.html, https://www.techradar.com/best/best-medical-transcription-services, https://www.tvps.com/apptec-digitel-remote-call-in-telephone-digital-dictation-transcription-system-1-to-32-ports/ap-dt-usb/
- AWS 800 ms rule: https://builder.aws.com/content/3JDFAfXBiuwPP5MPzgf4RUWSAIp/the-800ms-rule-budgeting-latency-for-a-real-time-voice-agent-on-aws
- Telnyx latency: https://telnyx.com/resources/voice-ai-agents-compared-latency
- Hamming latency: https://hamming.ai/resources/voice-ai-latency-whats-fast-whats-slow-how-to-fix-it
- Future AGI barge-in guide: https://futureagi.com/blog/voice-ai-barge-in-turn-taking-2026/
- SyncSoft barge-in: https://www.syncsoft.ai/en/blog/voice-agent-barge-in-vad-tuning-2026
- Google conversation design, confirmations: https://developers.google.com/assistant/conversation-design/confirmations
- ISMP verbal orders: https://www.ismp.org/sites/default/files/attachments/2018-03/20170518.pdf
- Joint Commission Journal, readback/hearback: https://www.jointcommissionjournal.com/article/S1549-3741(04)30053-5/fulltext
- Patient Safety Solutions: https://www.patientsafetysolutions.com/docs/January_2020_The_Joint_Commission_on_Closing_the_Loop.htm
- SBAR: https://en.wikipedia.org/wiki/SBAR
- I-PASS Institute: https://www.ipassinstitute.com/
- NEJM I-PASS study (2014): https://www.nejm.org/doi/full/10.1056/NEJMsa1405556
- Hippocratic AI: https://www.hippocraticai.com/
- Assort Health: https://www.assorthealth.com/
- Hello Patient: https://www.hellopatient.com/
- Infinitus: https://www.infinitus.ai/
- Recording laws: https://en.wikipedia.org/wiki/Telephone_call_recording_laws
- CMPA AI scribe FAQ: https://www.cmpa-acpm.ca/en/advice-publications/browse-articles/2023/ai-scribes-answers-to-frequently-asked-questions
- UVA Health DAX FAQ: https://www.uvahealth.com/patients-and-visitors/support/ai-note-taking-faq
