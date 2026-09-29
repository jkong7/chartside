# Novel AI-Native Interface Paradigms for an Ambient Scribe

Research date: 2026-09-28. Raw notes for chartside. Sources are linked inline and listed at the end.

## 1. Why look past the chat box and the web app

The ambient scribe category has commoditized. Epic announced AI Charting at UGM in August 2025 and broadened availability on February 4, 2026, with ambient listening, note drafting, order queuing and voice-driven note formatting inside the EHR ([STAT](https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/), [Veroscribe](https://www.veroscribe.com/blog/epic-ai-scribe)). Epic's CMO framed the goal plainly: "It's a scribe, but that's passive. We really want this to be active." OpenAI shipped a read-only SMART on FHIR chart reasoning layer for Epic on September 1, 2026 ([Galen Growth](https://www.galengrowth.com/openai-epic-integration-clinical-reasoning-layer-2026/)). Meanwhile the evidence on time savings is modest: a five-center study found 16 fewer documentation minutes per eight hours of care, and a three-arm NEJM AI RCT showed only a 9.5% time-in-note drop for Nabla and no significant effect for DAX; heavy users get two to three times the benefit ([BERI summary](https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot)).

The lesson for a small TypeScript team: note quality is table stakes, and the adoption bottleneck is the interface. Only about a third of eligible visits actually use the scribe. Whoever makes it effortless to invoke, review and sign wins the heavy-user tail. That is an interface problem, not a model problem.

## 2. Generative UI: interfaces built per task

**Google.** With Gemini 3 (November 18, 2025) Google shipped "dynamic view" and "visual layout," where the model designs and codes a custom interactive interface for each prompt ([9to5Google](https://9to5google.com/2025/11/18/gemini-3-launch/), [PPC Land](https://ppc.land/google-launches-gemini-3-with-generative-ui-for-dynamic-search-experiences/)). Google Research's evaluation ranked human expert sites first, generative UI a close second, and plain markdown far behind, while admitting generation "can sometimes take a minute or more" and has "occasional inaccuracies" ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/)). 9to5Google called it the future of "there's an app for that" ([9to5Google](https://9to5google.com/2025/11/25/gemini-generative-uis-apps/)).

**Vercel AI SDK.** The more production-safe pattern: the model emits a typed tool call, your trusted code fetches authoritative data, and a pre-built React component renders it (`streamUI`, tool-to-component mapping) ([Vercel AI SDK 3.0](https://vercel.com/blog/ai-sdk-3-generative-ui), [Vercel Academy](https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui)). The model chooses and parameterizes the UI; it does not write arbitrary code. For clinical software this is the right side of the line.

**Standards.** The MCP Apps extension (SEP-1865, announced November 2025, generally described January 2026) lets a tool return a `ui://` resource that the host renders in a sandboxed iframe with JSON-RPC over `postMessage`; it is supported in Claude, ChatGPT, Goose and VS Code Insiders ([MCP blog](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/), [MCP blog Jan 2026](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/)). Google's A2UI is a declarative, cross-platform alternative that can render natively on web, mobile and desktop, and the two are being bridged ([Google Developers](https://developers.googleblog.com/a2ui-and-mcp-apps/), [The New Stack](https://thenewstack.io/agent-ui-standards-multiply-mcp-apps-and-googles-a2ui/)).

**Claude artifacts.** Since June 25, 2025, artifacts can call Claude themselves, with usage billed to the viewer's account; over half a billion artifacts have been created, and MCP plus persistent storage arrived in October 2025 ([Anthropic](https://claude.com/blog/claude-powered-artifacts), [Simon Willison](https://simonwillison.net/2025/Jun/25/ai-powered-apps-with-claude/)).

**Disposable software.** a16z's Anish Acharya: "Building small, throwaway apps is starting to feel like doodling in a notebook," and software is now "constrained only by imagination" ([a16z](https://a16z.com/disposable-software/)). Charity Majors split code into disposable and durable ([Algeria Tech summary](https://algeriatech.news/disposable-software-throwaway-code-ai-2026/)); Andreas Kirsch pushes back that ephemeral software fails where state and trust matter ([blackhc.net](https://www.blackhc.net/essays/future_of_software/)). The App Store saw iOS releases up 80% YoY in Q1 2026, plausibly from AI coding tools ([TechCrunch](https://techcrunch.com/2026/04/18/the-app-store-is-booming-again-and-ai-may-be-why/)).

**Implication.** The durable layer (the note, codes, audit log, EHR write-back) stays in the heavy web app. The per-encounter surface can be disposable: a UI generated from a fixed component kit for exactly what this visit needs.

## 3. Agents that live where you already are

**"Cc the AI."** Howie gives the assistant its own email address and phone number; you cc it and it runs the thread with humans, and it raised $6M with 1,000+ paying customers ([GeekWire](https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/), [Howie](https://howie.com/)). Blockit is cc'd on email or Slack and, when both sides run Blockit, negotiates agent-to-agent with no booking link ([usecarly comparison](https://www.usecarly.com/blog/blockit-vs-howie/)). The pattern works because there is no app to install and the recipient sees normal email.

**Calendar as the trigger.** ChatGPT Pulse (September 25, 2025) wrote 5 to 10 proactive morning cards from memory, Gmail and Calendar ([TechCrunch](https://techcrunch.com/2025/09/25/openai-launches-chatgpt-pulse-to-proactively-write-you-morning-briefs)). It was sunset June 17, 2026, as "proactive updates move into scheduled tasks" ([McKelvey](https://justinmckelvey.com/blog/chatgpt-pulse)). The takeaway: a generic feed of proactive content did not stick; proactivity tied to concrete, scheduled jobs did.

**The agent app wins the chart.** Meta Muse, an agentic assistant that acts across email, calendar, payments, health and smart home and keeps working in the background on a virtual machine, hit number one free on the US App Store in September 2026, above ChatGPT ([Fox Business](https://www.foxbusiness.com/technology/metas-muse-becomes-app-stores-hottest-download)). Earlier, the Muse Spark model (April 8, 2026) lifted the Meta AI app from No. 57 to No. 5 in a day ([TechCrunch](https://techcrunch.com/2026/04/09/meta-ai-app-climbs-to-no-5-on-the-app-store-after-muse-spark-launch/), [Meta](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/)). Consumers now reward "does things for me" over "talks to me."

## 4. Proactive, context-triggered AI

The best proactive moments in 2025 to 2026 hang off an event boundary: a calendar block ends, an app is closed, a location is left. Apple's App Clip Suggestions already use on-device ML to put the right clip on the lock screen by context, and App Clips launch from NFC, QR, Maps, Messages and Safari at up to 15 MB ([Asolytics](https://asolytics.pro/blog/post/what-are-apple-app-clips/), [Medium iOS 26 guide](https://medium.com/@bhumibhuva18/ios-26-app-clips-practical-guide-build-lightweight-on-demand-experiences-028db63f33f7)). For a clinic, natural triggers are: the scheduled visit slot ends, the audio session stops, the clinician walks out of the exam room (BLE beacon or Wi-Fi AP change), the end of the clinic session, and the night before charts become delinquent.

The hardware signal matters too. Ambient capture wearables consolidated: Amazon bought Bee in July 2025, Meta bought Limitless on December 5, 2025, Rewind turned off desktop capture, and Plaud remains the independent leader ([UMEVO](https://www.umevo.ai/blogs/ume-all-posts/wearable-ai-wars-2026-limitless-pendant-vs-bee-pioneer-vs-plaud-notepin), [Layer3Labs](https://www.layer3labs.io/guides/best-ai-wearable-pendants-2026)). Big Tech is betting that capture is a peripheral, not an app.

## 5. Computer-use agents and invisible integration

OpenAI folded Operator into ChatGPT agent on July 17, 2025: a virtual computer with a browser, terminal and connectors ([TechCrunch](https://techcrunch.com/2025/07/17/openai-launches-a-general-purpose-agent-in-chatgpt/), [OpenAI](https://openai.com/index/introducing-chatgpt-agent/)). Healthcare is the obvious target, and the honest benchmark is sobering: HealthAdminBench (135 tasks across a simulated EHR, two payer portals and fax) found the best agent, Claude Opus 4.6 CUA, at only 36.3% end-to-end success, while GPT-5.4 CUA hit 82.8% on subtasks ([arXiv 2604.09937](https://arxiv.org/abs/2604.09937)). Individual clicks are fine; long chains are not.

Epic is also closing the door from the inside: Art, Penny and Emmie are used by 85%+ of customers, Penny is live at 330+ systems, and the no-code Agent Factory targets GA in 2027 ([HIT Consultant](https://hitconsultant.net/2026/03/10/epic-ai-himss-2026-agent-factory-curiosity-foundation-models/), [Healthcare IT Today](https://www.healthcareittoday.com/2026/09/03/inside-epics-push-to-help-customers-build-their-own-ai-agents-using-agent-factory/)). For a startup, computer use is best framed as "the last mile for the long tail of EHRs without good APIs," with a human watching and a short, verifiable action chain (paste note, attach codes, stop before sign).

## 6. Viral consumer formats and why they worked

| Product | Peak | Why it spread |
|---|---|---|
| Gemini + Nano Banana | No. 1 iOS from Sept 13, 2025; 23M new users, 500M+ edits | One-tap selfie-to-figurine output that is inherently shareable, no prompting skill needed, fast enough to feel like play ([Tom's Guide](https://www.tomsguide.com/ai/ai-image-video/gemini-just-passed-chatgpt-in-the-app-store-heres-why-google-says-this-is-just-the-beginning), [Business Standard](https://www.business-standard.com/technology/tech-news/nano-banana-trends-push-gemini-to-lead-position-on-apple-google-app-stores-125091700899_1.html)) |
| Sora app | No. 1 US by Oct 3, 2025, 164K installs in 2 days while invite-only | Cameos put you and your friends in every video; a feed plus remix made it a platform, not a tool; invite scarcity ([TechCrunch](https://techcrunch.com/2025/10/03/openais-sora-soars-to-no-1-on-the-u-s-app-store), [AI Insider](https://theaiinsider.tech/2025/10/27/openai-previews-major-feature-updates-for-sora-as-viral-video-app-maintains-%E2%84%961-ranking/)) |
| Meta AI Vibes | DAU from ~775K to 2.7M after Sept 25, 2025 | A zero-effort feed of remixable AI video, seeded by paid creators ([CNBC](https://www.cnbc.com/2025/10/28/meta-ai-vibes-on-wall-street-radar-in-q3-earnings-trails-openai-sora.html), [TechCrunch](https://techcrunch.com/2025/10/20/meta-ais-app-downloads-and-daily-users-spiked-after-launch-of-vibes-ai-video-feed)) |
| Meta Muse | No. 1 free iOS, Sept 2026 | Agent that finishes errands in the background across your apps ([Fox Business](https://www.foxbusiness.com/technology/metas-muse-becomes-app-stores-hottest-download)) |
| ChatGPT | Most downloaded iOS app of 2025 (217M) | Default verb for AI ([Guru](https://www.getguru.com/reference/best-ai-apps)) |

Common threads: the output is about you (your face, your errands), the first result arrives in seconds with no setup, the artifact is made to be shared, and a small amount of scarcity or social proof accelerates it. Streaks and public profiles (Duolingo-style) are the retention half of that loop; they are not documented above but are well understood patterns. In a clinical product the shareable object cannot be PHI, so the virality has to come from de-identified outcomes (minutes saved, charts closed) and from colleague-to-colleague handoffs.

## 7. Zero UI, calm technology, ambient computing

Mark Weiser's rules: "the purpose of a computer is to help you do something else," "the best computer is a quiet, invisible servant," and technology "should create calm"; Weiser and Brown's 1995 "Designing Calm Technology" introduced the center versus periphery model ([calmtech.com](https://calmtech.com/papers/coming-age-calm-technology), [Wikipedia](https://en.wikipedia.org/wiki/Calm_technology)). Amber Case's eight principles: require the smallest possible amount of attention; inform and create calm; make use of the periphery; amplify the best of technology and humanity; communicate without speaking; still work when it fails; the minimum tech needed; respect social norms ([Calm Tech Institute](https://www.calmtech.institute/calm-tech-principles)). She launched Calm Tech Certified with an 81-point rubric, first shown at CES 2025 ([Slashdot](https://tech.slashdot.org/story/25/01/22/056208/calm-tech-certification-rewards-less-distracting-tech)). "Zero UI" writing in 2025 to 2026 repeats the thesis that voice, gesture and context replace screens; Microsoft Advertising cites an IDC prediction that 60% of interactions will be invisible and AI-driven by 2027 ([Microsoft Ads](https://about.ads.microsoft.com/en/blog/post/june-2025/zero-ui-the-invisible-interface-revolution), [Algoworks](https://www.algoworks.com/blog/zero-ui-designing-screenless-interfaces-in-2025/)).

For a scribe, these principles translate directly. In the exam room the patient is the center and the scribe belongs in the periphery. "Communicate without speaking" means status by light, haptic or a glanceable chip, not a modal. "Still work when it fails" means offline recording and a note that degrades to a transcript, never to nothing. "Respect social norms" means visible consent and a clear recording indicator the patient can see.

## 8. Ten novel interface concepts for chartside

Constraint: the back office stays the heavy Next.js app (queues, coding, audit, admin). These are front doors. Novelty is scored 1 to 10 against what Abridge, Epic Art, Dragon Copilot, Freed and Heidi ship today.

### 1. The Hallway Card (proactive, event-triggered)
- **Pitch:** You never open the app. When a visit slot ends or your phone leaves the exam room, a lock-screen card appears with the drafted note summary, two flagged items and one "Sign" button.
- **Aha under 60s:** Walk out of the room, feel a buzz, glance at the Live Activity: "Note ready. 1 med dose unclear." Tap, fix, done before reaching the next door.
- **Why viral:** It feels like magic in front of colleagues; doctors show each other their lock screen.
- **Tech:** Calendar/FHIR Schedule pull for slot ends, stop-recording event, optional BLE beacon per room; Expo or Capacitor wrapper for push and Live Activities; server renders a compact card JSON from the same note model.
- **Risks:** PHI on lock screens (show initials and a count only until Face ID); notification fatigue; beacon hardware friction.
- **Novelty:** 8

### 2. Generative Review Surface (per-encounter UI)
- **Pitch:** Instead of the same SOAP editor every time, the review screen is assembled per visit: a med reconciliation table for a polypharmacy visit, a wound measurement strip for derm, a PHQ-9 trend for psych.
- **Aha:** Open two notes back to back and they look different, each showing exactly the three things you need to verify.
- **Why viral:** Screenshot-worthy; demos well to department chairs.
- **Tech:** Vercel AI SDK tool-to-component mapping over a fixed, audited component kit (never model-written code); the model picks components and props, Zod validates, and the canonical note stays one schema.
- **Risks:** Inconsistency can slow experts; must keep a "classic view" toggle; component props need grounding in transcript spans.
- **Novelty:** 7

### 3. Cc the Scribe (email and message native)
- **Pitch:** chartside has an address. Forward a patient portal message, an outside consult letter or a fax PDF to scribe@yourclinic and it replies with a drafted response, a chart addendum and suggested orders.
- **Aha:** Forward a messy referral email; 30 seconds later a reply lands with a clean summary and "Reply to patient" draft.
- **Why viral:** Zero install; front-desk staff and MAs adopt it first and pull the doctor in.
- **Tech:** Inbound email via Postmark/SES inbound webhook into the existing pipeline; DKIM/domain allowlist; replies contain a signed deep link into the web app rather than PHI when the domain is not trusted.
- **Risks:** Email is not a secure channel for PHI; BAA with the provider; spoofing. Restrict to verified clinic domains.
- **Novelty:** 7

### 4. The Ghost Hand (computer use into the EHR, human watching)
- **Pitch:** For EHRs without write APIs, chartside drives the browser: opens the encounter, pastes sections into the right fields, attaches ICD-10 and CPT codes, and stops at Sign.
- **Aha:** Click "Place in chart" and watch a translucent cursor fill the EHR tabs in 20 seconds, then hand you the pen.
- **Why viral:** The video clip of it working sells itself; solves the most hated copy-paste step.
- **Tech:** Extend the existing Chrome extension; prefer DOM-level scripted fills per EHR with a computer-use model fallback for unknown screens; each step logged with a screenshot to the audit trail.
- **Risks:** HealthAdminBench shows long-chain reliability near 36%; keep chains short, verify each field, never sign; EHR vendor terms.
- **Novelty:** 6

### 5. Exam Room Glance Light (calm hardware periphery)
- **Pitch:** A tiny QR-plus-LED puck on the wall. Scan to start; it glows soft green while recording and amber if the scribe needs a clarification before you leave.
- **Aha:** The patient sees the light and asks about it; the doctor says "that's my scribe," and never touches a screen.
- **Why viral:** Physical, visible, and patient-facing; it markets itself in every room.
- **Tech:** Start with a printed QR and an App Clip / PWA URL per room; phase two is an off-the-shelf BLE LED driven by the phone. Room ID binds audio to the scheduled patient.
- **Risks:** Hardware logistics; infection control on surfaces; must not imply recording when consent is absent.
- **Novelty:** 8

### 6. Patient Recap Link (the shareable artifact)
- **Pitch:** Every visit ends with an optional plain-language recap page the patient opens by QR on the checkout screen: what we found, what to do, when to come back, in their language, with a 30-second audio summary in a neutral synthetic voice.
- **Aha:** The patient scans before leaving the room and reads their plan in Spanish while still sitting there.
- **Why viral:** Patients forward it to family; the footer says "Visit summary by chartside," the Sora-cameo equivalent for healthcare.
- **Tech:** Short-lived signed URL, one-time code, no login; generated from the signed note with a reading-level pass; expires in 30 days.
- **Risks:** PHI in a link (OTP plus expiry mandatory), information blocking and after-visit summary rules, liability for simplification errors; clinician approves before release.
- **Novelty:** 6

### 7. Chart Streaks and the Friday Wrapped (social, de-identified)
- **Pitch:** A weekly "Wrapped" card: charts closed same day, pajama-time minutes avoided, streak of zero delinquent notes. Shareable because it contains no PHI.
- **Aha:** Friday at 5pm: "You closed 94% of notes before leaving clinic. 3 hours of evening charting avoided."
- **Why viral:** Physician burnout is a shared identity; a brag-safe stat invites the "what are you using?" reply. Team leaderboards drive practice-level adoption.
- **Tech:** Aggregates already exist in the back office; render an OG image with Satori/`@vercel/og`; opt-in public profile page.
- **Risks:** Gamifying clinical work can feel cheap or push speed over accuracy; weight quality (edit rate, flags resolved) not just volume.
- **Novelty:** 5

### 8. Whisper Mode (zero UI in the room, voice commands to the scribe)
- **Pitch:** The doctor talks to the scribe the way they would to a human scribe: "Scribe, add that as a problem," "Scribe, queue a CBC," "Scribe, don't include that." No screen.
- **Aha:** Say "Scribe, strike the last minute, that was personal" and see it greyed out in the transcript afterward.
- **Why viral:** It is the clearest demonstration of control, which answers the top privacy objection.
- **Tech:** Wake-phrase detection on the live transcript stream; intent parsing into typed commands applied to the draft; every command shown as a chip in review.
- **Risks:** False triggers; patient confusion; commands need confirmation for orders. Epic already does voice formatting, so differentiate on redaction and privacy commands.
- **Novelty:** 5

### 9. End-of-Clinic Inbox Zero (one-link batch sign)
- **Pitch:** At the end of the session a single link (SMS or push) opens a swipeable stack: each note is a card, swipe right to sign, left to open in the full editor. Built like a dating app, not an EHR.
- **Aha:** Sign 14 notes on the train in four minutes, each card showing only what changed since the template and the model's two low-confidence spots.
- **Why viral:** "I cleared clinic from my phone" is a story doctors tell.
- **Tech:** PWA route in the existing Next.js app; confidence scores per section; passkey re-auth before signing batch; server side e-signature records.
- **Risks:** Rubber-stamping; enforce dwell time and required taps on flagged items; regulatory weight of signature on mobile.
- **Novelty:** 7

### 10. The Chart as Conversation Partner in the EHR sidebar (invisible integration via MCP Apps)
- **Pitch:** chartside ships as an MCP server with MCP Apps UI, so the same review widget renders inside Claude, ChatGPT, or an EHR sidebar that supports SMART on FHIR. The scribe goes wherever the clinician's AI already is.
- **Aha:** In their existing assistant, a doctor types "show me today's unsigned notes" and the chartside review card appears inline, interactive, and signable.
- **Why viral:** Distribution through host platforms rather than a new app; the MCP Apps ecosystem is new and under-supplied with clinical tools.
- **Tech:** `ui://` resource bundling a React review component, JSON-RPC over `postMessage`, tools for list, open, edit and sign; SMART on FHIR launch for the EHR sidebar variant.
- **Risks:** Consumer AI hosts are not covered by your BAA, so this must target enterprise hosts or self-hosted clients; OpenAI's Epic integration shows the read path is crowded, so lead with write-back.
- **Novelty:** 8

## 9. Recommendation

Build 1, 9 and 5 together as one bet: "you never open chartside during clinic." The room light starts it, the hallway card confirms it, and the end-of-clinic stack closes it, while the heavy web app remains the back office for coders and admins. Add 6 and 7 as the growth loop. Hold 4 and 10 as enterprise distribution plays that depend on partners and on computer-use reliability improving beyond today's benchmarks.

## Sources

- https://ppc.land/google-launches-gemini-3-with-generative-ui-for-dynamic-search-experiences/
- https://9to5google.com/2025/11/18/gemini-3-launch/
- https://9to5google.com/2025/11/25/gemini-generative-uis-apps/
- https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/
- https://vercel.com/blog/ai-sdk-3-generative-ui
- https://vercel.com/academy/ai-sdk/multi-step-and-generative-ui
- https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/
- https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- https://developers.googleblog.com/a2ui-and-mcp-apps/
- https://thenewstack.io/agent-ui-standards-multiply-mcp-apps-and-googles-a2ui/
- https://claude.com/blog/claude-powered-artifacts
- https://simonwillison.net/2025/Jun/25/ai-powered-apps-with-claude/
- https://a16z.com/disposable-software/
- https://algeriatech.news/disposable-software-throwaway-code-ai-2026/
- https://www.blackhc.net/essays/future_of_software/
- https://techcrunch.com/2026/04/18/the-app-store-is-booming-again-and-ai-may-be-why/
- https://www.geekwire.com/2025/ai-scheduling-assistant-howie-raises-6m-launches-publicly-with-1000-paying-customers/
- https://howie.com/
- https://www.usecarly.com/blog/blockit-vs-howie/
- https://techcrunch.com/2025/09/25/openai-launches-chatgpt-pulse-to-proactively-write-you-morning-briefs
- https://justinmckelvey.com/blog/chatgpt-pulse
- https://www.foxbusiness.com/technology/metas-muse-becomes-app-stores-hottest-download
- https://techcrunch.com/2026/04/09/meta-ai-app-climbs-to-no-5-on-the-app-store-after-muse-spark-launch/
- https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/
- https://asolytics.pro/blog/post/what-are-apple-app-clips/
- https://medium.com/@bhumibhuva18/ios-26-app-clips-practical-guide-build-lightweight-on-demand-experiences-028db63f33f7
- https://www.umevo.ai/blogs/ume-all-posts/wearable-ai-wars-2026-limitless-pendant-vs-bee-pioneer-vs-plaud-notepin
- https://www.layer3labs.io/guides/best-ai-wearable-pendants-2026
- https://techcrunch.com/2025/07/17/openai-launches-a-general-purpose-agent-in-chatgpt/
- https://openai.com/index/introducing-chatgpt-agent/
- https://arxiv.org/abs/2604.09937
- https://hitconsultant.net/2026/03/10/epic-ai-himss-2026-agent-factory-curiosity-foundation-models/
- https://www.healthcareittoday.com/2026/09/03/inside-epics-push-to-help-customers-build-their-own-ai-agents-using-agent-factory/
- https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/
- https://www.veroscribe.com/blog/epic-ai-scribe
- https://www.galengrowth.com/openai-epic-integration-clinical-reasoning-layer-2026/
- https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot
- https://www.tomsguide.com/ai/ai-image-video/gemini-just-passed-chatgpt-in-the-app-store-heres-why-google-says-this-is-just-the-beginning
- https://www.business-standard.com/technology/tech-news/nano-banana-trends-push-gemini-to-lead-position-on-apple-google-app-stores-125091700899_1.html
- https://techcrunch.com/2025/10/03/openais-sora-soars-to-no-1-on-the-u-s-app-store
- https://theaiinsider.tech/2025/10/27/openai-previews-major-feature-updates-for-sora-as-viral-video-app-maintains-%E2%84%961-ranking/
- https://www.cnbc.com/2025/10/28/meta-ai-vibes-on-wall-street-radar-in-q3-earnings-trails-openai-sora.html
- https://techcrunch.com/2025/10/20/meta-ais-app-downloads-and-daily-users-spiked-after-launch-of-vibes-ai-video-feed
- https://www.getguru.com/reference/best-ai-apps
- https://calmtech.com/papers/coming-age-calm-technology
- https://en.wikipedia.org/wiki/Calm_technology
- https://www.calmtech.institute/calm-tech-principles
- https://tech.slashdot.org/story/25/01/22/056208/calm-tech-certification-rewards-less-distracting-tech
- https://about.ads.microsoft.com/en/blog/post/june-2025/zero-ui-the-invisible-interface-revolution
- https://www.algoworks.com/blog/zero-ui-designing-screenless-interfaces-in-2025/
