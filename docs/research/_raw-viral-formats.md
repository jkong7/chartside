# Viral AI Interface Formats, 2025 to 2026 (raw research)

Research date: 2026-09-28. Scope: the *interface format* (channel, device, onboarding, output shape) that let AI products spread to laypeople, not model quality. Purpose: inform a new primary interface channel for Chartside, an AI medical scribe.

Confidence notes: numbers are as reported by the cited outlet. Several figures come from secondary blogs or trackers (Sensor Tower, Apptopia, analyst newsletters) and should be treated as directional. Where sources disagree, both are noted.

---

## 1. Meta Muse (launched 2026-09-08)

**What it is.** Muse is Meta's consumer "personal AI agent," powered by the Muse Spark model (Spark 1.3 per TechCrunch). Meta's pitch: "It doesn't just answer questions, it actually does the work." It books appointments and restaurants, shops, sends email, fills forms, manages calendars, and turns long-term goals into action plans. Meta explicitly frames it as "built to work for billions of people worldwide, so there's no learning curve. Anyone can use it out of the box, no technical experience required." [Meta newsroom]

**Interface format.**
- A chat thread that "works just like messaging another person," available in the Muse app (iOS, Android), on muse.ai, and directly inside WhatsApp; glasses support announced. [Meta newsroom]
- Behind the chat, every user gets a dedicated cloud computer (the "Muse Secure VM") with its own browser. The agent works on websites by driving that browser, not by requiring API connectors for each service. Users can open the browser from the chat and "take control" to log in themselves. [ego, eesel]
- Passwords go into a vault the model never sees; purchases use one-time virtual card numbers; a separate guard agent ("Sentinel") must approve anything leaving the VM. Approval prompts appear in the app UI, not inside the chat, so the agent cannot talk the user into consent. [eesel, Fortune]
- Long-running tasks continue after the app is closed; Muse pings only when it needs approval or input. A feed surfaces proactive suggestions. [eesel, MindStudio]
- Video chat with a Muse avatar and Mac computer use were announced at Meta Connect. [TechCrunch]

**Zero to value.** Download, sign in with a Meta identity (or email plus age verification via card, Instagram, or Facebook), read a short "A few things to know" screen, tap Get started, then type a task. Reviewers report Facebook and Instagram were already connected by default, and Muse used that access to build an initial profile (location, interests, hobbies) *before* asking for anything else, then suggested what it could do. [MindStudio, UPGPTs, eesel] This is the "does everything without setup" effect: the account you already have is the connector, and the cloud browser removes the need for per-service integrations.

**Why it spread.**
- Task-first marketing: "Muse's marketing leads entirely with tasks it can complete, not conversations." [Dolphin Research]
- Distribution: Meta ran house ads across Facebook and Instagram and made a Connect keynote push. [TechCrunch]
- Visible, story-shaped outcomes (for example, a user posting that Muse solved a travel refund they would never have bothered with). [eesel]
- Trust architecture was a talking point in itself (isolated VM, vault, virtual cards). [eesel]

**Numbers.** #1 free app on the US App Store on Sept 18 and #1 on Google Play Sept 19, unseating ChatGPT; 3.4M downloads (Sensor Tower) or 4.3M (Apptopia) by about Sept 24; about 55% average day-over-day download growth in the first two weeks. [TechCrunch, Fox Business] One analyst estimate: about 250K iOS DAU early, roughly 3% paid conversion. [Dolphin Research]

**Problems.** Amazon blocked Muse from browsing and checkout ("unauthorized AI agent"); Meta answered with a Shopify partnership. [Fortune] Slate's reviewer saw a 30-minute flight booking fail and a calendar event created in the past. [Slate] 404 Media reported that some "AI" outbound phone calls were routed to human call-center workers without clear disclosure; Meta rolled that back. [404 Media, Cybernews] Muse's architect acknowledged heavy inspiration from OpenClaw. [BigGo]

**Lesson for Chartside.** The winning move was not a new UI; it was (a) reuse an identity the user already has so the product knows them on first open, (b) do the integration work server-side so the user never configures connectors, and (c) keep consent outside the conversational surface.

---

## 2. Instinct (Spear Street Technology; launched August 2026)

No healthcare product called "Instinct AI" matched the description. The only healthcare "Instinct" is Instinct EMR, a veterinary PIMS with its own vet-specific AI scribe (relevant as a competitor note, not a viral format). [instinct.vet] The viral product is **Instinct**, a consumer personal agent founded by former Sierra research scientist Noah Shinn. [CellCog, SiliconANGLE]

**Interface format.** No app. You text it or call it: SMS, iMessage, WhatsApp, and voice calls. It has its own phone number and its own cloud computer, and it "is trained to use a phone and a computer" the way a human does, so it can act in services with no API. [CellCog, Vellum, TechCrunch] New features: a "concierge" that makes phone calls for you and a "trusted person network" for agent-to-agent coordination. [TechCrunch 9/28]

**Proactive by design.** It follows up on dropped threads, texts or calls you first, and "finishes jobs" rather than stopping to confirm each step (one user reported it reset a password on its own to complete a purchase). [Vellum]

**Zero to value.** Waitlist or invite from an existing member, connect accounts (email, messaging, calendar, and optionally screen, audio, location), then start texting. Early users "simply started texting requests rather than following structured setup steps"; the design keeps "almost no visible machinery." [usecarly, CellCog]

**Why it spread.** Invite scarcity plus publicly posted receipts of completed work. Investor Sheel Mohnot reported 677 messages in five days and 15 completed jobs; anecdotes "end with a completed real-world task, not with instructions for the user to go do it themselves." [Vellum, CellCog] A backlash wave (security researchers documenting prompt injection, emails sent without approval, data retained after disconnect, a perpetual content license in the ToS) amplified attention further. [TechCrunch 8/24]

**Numbers.** Passed 100,000 users by Sept 15 (per CellCog; TechCrunch says the company has not shared user numbers). Raised $350M at $2.5B in August, then $1B Series C at $10B on Sept 28 (Sequoia, Benchmark, Coatue). [TechCrunch, SiliconANGLE]

**Lesson.** A phone number is the entire interface. The value proposition "texts you back with a finished job" is inherently screenshot-able. The security backlash is the warning: proactive action without an approval layer is a liability, and in healthcare it would be disqualifying.

---

## 3. Poke (The Interaction Company of California)

**What it is.** A proactive assistant you text, over iMessage, SMS, Telegram, and some WhatsApp markets. It reads email, calendar, and the web, and texts you first (reminders, email alerts, smart home, fitness). [Dealroom, TFN]

**Onboarding as viral content.** The famous "Bouncer Mode": Poke demands email access ("No permissions, no entry"), mocks you if you hesitate, then roasts you using facts from your own inbox, and finally *negotiates its own subscription price* with you (one user talked it from $292 to $29 per month; others saw $1,024 opening offers). [LinkedIn/Or Arbel, X/Alex Kaplan, Substack] "Screenshots travel faster than ads." Getting past the bouncer felt like entering a club, and every step was a postable screenshot.

**Milestones.** Launched Sept 2025 with $15M seed (General Catalyst), later $25M total at a $300M valuation (Spark Capital). [TFN, Dealroom] About 100M messages handled. On June 4, 2026 Apple approved Poke as the **first AI agent on Apple Messages for Business**, a native iMessage lane with no app install; Apple required a human-support path, clear AI labeling, and product changes. Apple issues an opaque ID so the agent never receives the user's phone number or email. [TechCrunch 6/4, Startup Fortune] Cognition acquired Poke on July 23, 2026. [Startup Fortune]

**Lesson.** The messaging thread is the habit loop users already have; the onboarding itself can be the marketing. Apple Messages for Business is now a sanctioned, privacy-preserving channel for an agent.

---

## 4. 1-800-ChatGPT and ChatGPT on WhatsApp (Dec 2024 to Jan 2026)

**Format.** Call 1-800-242-8478 from any US or Canadian phone, including landlines and flip phones, for 15 free minutes per month with **no account required**; or add the same number on WhatsApp worldwide to text. [OpenAI Help Center]

**Result.** More than 50 million people used ChatGPT on WhatsApp. [OpenAI, 9to5Mac, Forbes] It ended on Jan 15, 2026 when Meta banned general-purpose chatbots from the WhatsApp Business API (task bots for support, bookings, and notifications remain allowed; the ban was reversed for the EU/EEA on July 13, 2026 after antitrust pressure). [TechCrunch, respond.io]

**Lesson.** "No app, no account" reached tens of millions of people, heavily in markets where WhatsApp is the internet. But riding someone else's messaging platform is a platform-risk bet: Meta turned it off, then launched its own agent (Muse) inside WhatsApp. A scribe that lives on a third-party channel must be a "task bot," not a general chatbot, and needs a fallback channel.

---

## 5. Sesame (Maya and Miles voice)

**Format.** A web page with a button: click and start talking to "Maya" or "Miles." No sign-up for the research demo. Full-duplex voice (interruptible, reacts to tone, natural disfluencies). [Contrary, vantaige]

**Why it spread.** The format was "try it in 10 seconds and be startled." Over a million people used it within weeks of the Feb 2025 demo, generating 5M+ minutes of conversation; The Verge called it "the first voice assistant I've ever wanted to talk to more than once." [Contrary, Sequoia] People shared screen recordings of their conversations. Funding followed: $47.5M Series A (a16z), $250M in Oct 2025 (Sequoia). iOS app launched May 28, 2026 in 39 countries with four personas, search cards, notes, and a texting mode. [TechCrunch]

**Lesson.** Presence and latency are a feature laypeople can feel instantly; a no-login demo converts curiosity into a shareable moment.

---

## 6. Granola (meeting notes with no bot)

**Format.** A desktop (later iPhone) notepad. It captures system audio on your device, so **no bot joins the call**. You type sparse notes during the meeting; afterward Granola merges them with the transcript into enhanced notes (your words stay visible, AI additions are visually distinct). Early versions that wrote AI text live during the call were distracting, so they moved "most of the AI work to the end of the meeting" and cut about half the features. [okara, Fast Company]

**Zero to value.** Download, sign in with Google, grant calendar and mic access, and the next calendar meeting shows up ready to click. No meeting-platform integration and no bot admission.

**Why it spread.** Bot-free means no social cost ("an app on someone's computer" is more tolerable than a visible recorder). [TechCrunch] The **output is the virality loop**: polished notes shared via link or Slack reached coworkers, founders, and investors who saw the artifact before ever visiting the site. VCs used it on founder calls, founders adopted it, then pushed it into their teams. [okara, costainvest]

**Numbers.** Oct 2024: about 5,000 WAU, 70% first-week return, 50% ten-week retention. [okara] March 2026: $125M Series C at $1.5B, 400%+ YoY growth, 50M meetings a year, 15,000+ enterprise customers, weekly retention over 70%; added Spaces, APIs, and an MCP server. [TechCrunch]

**Lesson for a scribe (most directly transferable).** Keep the human's own notes as the skeleton, do AI work at the end, never make capture visible to the other party in an awkward way, and make the finished note a shareable link that markets the product.

---

## 7. Plaud NotePin (and Note, Note Pro)

**Format.** A thumb-sized recorder you clip, pin, wear as a necklace, or strap to a wrist. **One press starts recording, another stops.** Sync to the app over Bluetooth, tap Generate, choose a template, get a speaker-labeled transcript and summary. Setup about five minutes; 300 free minutes a month. [Plaud] The NotePin S (CES 2026) added a highlight button to mark important moments. [WebProNews]

**Why it spread.** It is physical, giftable, and sold in Costco, Amazon, and European big-box retail, so it reaches non-technical professionals; hardware-plus-Pro bundles convert. It explicitly targets "doctors, lawyers, sales reps." [Sacra] It works for in-person, phone, and video conversations with the same one button, and requires no permission from any platform.

**Numbers.** 2M+ devices shipped in 170+ countries; $100M software ARR (June 2026) and about $250M annualized revenue (Sept 2025); nearly 50% of buyers upgrade to paid; targeting $500M in 2026 sales; reportedly profitable without venture money until a later round at about $2B. [Sacra, Yahoo/TechCrunch, Bloomberg, 36Kr]

**Lesson.** A single physical button is the most legible possible "start" for laypeople, and clinicians already buy this device for charting. It is a proven, unregulated competitor to scribe apps.

---

## 8. Limitless, Bee, and Friend (ambient pendants)

- **Limitless Pendant** (conversation recorder plus searchable memory). Meta acquired Limitless on Dec 5, 2025 and immediately stopped new Pendant sales; existing users were moved to a free unlimited plan through 2026. [CNBC] Signal: the always-on memory format is valuable enough for Big Tech to absorb, and customers were "spooked" by the acquisitions. [SF Standard]
- **Bee** ($49.99 wristband or clip, always listening, produces daily recaps, to-dos, and proactive actions; no stored audio). Amazon acquired it in July 2025 and relaunched at CES 2026, to be linked to Alexa+. [TechCrunch, Storyboard18] Signal: low price plus a "daily recap" output with no active use required.
- **Friend** (always-listening necklace that texts you as a companion). A $1M NYC subway campaign (11,000 ads) invited vandalism as marketing; Wired's review was titled "I Hate My Friend." About 3,000 units sold (1,000 shipped, under $400K). [Fast Company, Fortune] Signal: attention is not adoption; a companion with no job to do and a surveillance vibe fails.

**Lesson.** Ambient capture wins when the output is a concrete artifact (recap, to-do list, note). It fails when the value is vague or emotional and the social cost of recording is high.

---

## 9. Rabbit R1 and Humane AI Pin (failures)

- **Humane AI Pin**: raised about $230M, shipped fewer than 10,000 units, sold to HP for $116M in Feb 2025, devices bricked. [digitalapplied, Medium/Bossa] It asked people to replace the phone and required a separate phone number and subscription, a laser display, and new gestures.
- **Rabbit R1**: about 100,000 units sold, but only about 5,000 DAU by Sept 2024; its "large action model" failed at real tasks. [digitalapplied] By Sept 2026 Rabbit was pushing a desktop agent that does not need the R1. [progressiverobot]

**Lessons.** "The bar for standalone AI hardware is not 'better than nothing' but 'better than a smartphone.'" New hardware plus new gestures plus new subscription is three adoption hurdles. Unreliable actions destroy trust permanently. Complement the phone; do not replace it.

---

## 10. Ray-Ban Meta glasses

**Format.** Normal-looking Ray-Ban or Oakley frames with camera, open-ear speakers, and mics; "Hey Meta" voice; photos and videos flow straight to Meta's social apps. The $800 Meta Ray-Ban Display adds a heads-up display and neural wristband. [Daily Beast, TechRadar]

**Numbers.** About 2M sold from Oct 2023 to Feb 2025, then more than 7M in 2025 alone (more than triple 2024); capacity target of 10M a year by end of 2026, reportedly raised toward 20 to 30M. Display's international launch was postponed due to US demand. [UploadVR, CNBC, Road to VR]

**Why it worked where Humane failed.** It is first an object people already buy (sunglasses), with AI as a bonus; the POV camera output is intrinsically shareable; it pairs with the phone rather than replacing it. Counterweight: privacy critiques (EFF, 2026) about bystander recording. [EFF]

---

## 11. Apple Action button, iOS Shortcuts, and Perplexity's phone assistant

- **Action button and Controls.** On iPhone 15 Pro and later, users map a long-press to "Open ChatGPT Voice" (Settings, Action Button, Controls). The result is a one-press, no-unlock path into a voice session, and it has become a standard how-to across tech media. [MacRumors, TUAW] Perplexity ships the same pattern on iOS (lock screen, home screen, and Action button shortcuts) because Apple does not allow third-party default assistants. [Perplexity Help Center]
- **Perplexity Assistant on Android** (Jan 2025): replace the default assistant; long-press the power button; it sees the screen and camera and takes multi-app actions (book dinner, hail a ride, set reminders). Samsung offers it as an option. [TechCrunch, Samsung]
- **Lesson.** The OS-level entry point (a hardware button, a lock-screen control) is the closest thing to "zero steps" for an installed app. On iOS it requires a one-time user setup, which most laypeople will only do if they are told exactly how.

---

## 12. Arc Search "Call Arc" (May 2024)

**Format.** Open the app and raise the phone to your ear as if making a call; ask your question; hold music plays briefly; a smiley face mouths the spoken answer. [TechCrunch, MacRumors, 9to5Mac] It was buggy on complex requests, and Arc Search itself was later deprioritized by The Browser Company.

**Lesson.** Borrowing an existing physical gesture (phone to ear) needs no teaching. The metaphor "call a friend" is instantly understood. Novelty earned press but not durable usage because the underlying app was not the user's daily habit.

---

## 13. Cluely (overlay or ghost UI)

**Format.** A translucent desktop overlay that sees your screen and hears audio and feeds real-time suggestions, rendered through low-level GPU hooks so it is invisible to Zoom, Meet, and Teams screen shares. [tldv, aiwiki]

**Why it spread.** Pure provocation: founder Roy Lee's Columbia suspension turned into the "cheat on everything" campaign; TikTok and X exploded. $5.3M seed, then $15M from a16z (June 2025). Claimed $7M ARR in July 2025, then admitted in March 2026 the real figure was about $5.2M. [Postbeam, TechCrunch]

**Lesson.** The overlay itself is a legitimately strong format for "help me in the moment inside whatever app I am already using," but deception-based positioning is untenable for regulated domains. A clinical overlay must be the opposite: visibly disclosed.

---

## 14. Other 2025 to 2026 formats worth noting

- **OpenClaw** (Nov 2025, viral Jan to Mar 2026): self-hosted open-source agent you *text* over WhatsApp, Telegram, Signal, or Discord; it acts on your own computer. Fastest-growing GitHub project ever (about 180K stars within weeks); a16z called it "potentially the moment consumers discovered AI could act." Also 2026's first major agent security crisis (RCE, prompt injection, credential storage). Muse and Instinct both productized its pattern. [Wikipedia, a16z, Hive Security]
- **Nano Banana (Gemini image editing, Aug 2025)**: the "3D figurine of yourself" trend started with a Thai influencer, spread across Southeast Asia, added 23M new Gemini users and 500M+ edits, and put Gemini at #1 on the App Store, shifting its demographics toward younger and female users. The output (a picture of *you*) is the ad. [eMarketer, Yahoo]
- **Sora app (Sept 2025 to April 2026)**: 1M downloads in under 5 days via invite scarcity plus "cameos" (scan your face into videos), then decay from 3.33M monthly downloads (Nov 2025) to 1.13M (Feb 2026) and shutdown. Novelty-shareable output without a recurring job does not retain. [TechCrunch, FORKOFF]
- **Free scribes inside clinician networks**: Doximity Scribe is free to verified US clinicians, and over 85% of US physicians are already Doximity members, so the "account you already have" pattern (like Muse on Meta) is already live in the scribe market. [Doximity blog] Heidi's free tier offers ongoing access instead of a 7-day trial. [Commure/Vero]

---

## 15. Cross-cutting patterns

**Zero setup (identity reuse plus server-side integration).** Muse (Meta identity pre-connected, cloud browser instead of connectors), 1-800-ChatGPT (no account at all), Sesame (no sign-up demo), Doximity (existing clinician identity). The pattern: the first valuable output appears before the user configures anything.

**Messaging-native agents.** Poke, Instinct, OpenClaw, ChatGPT on WhatsApp, Muse in WhatsApp. The thread is an existing habit, it works on every phone, and async works naturally (the agent texts back when done). Risk: platform owners can revoke access (WhatsApp ban) or demand approval (Apple Messages for Business requires human escalation and AI labeling).

**Call a number.** 1-800-ChatGPT, Instinct's calls, Call Arc's gesture, Muse's outbound calls. Voice by phone reaches people who never install anything, including older users and landlines. Honesty matters: Muse's hidden human callers became a scandal.

**Hardware and ambient capture.** Plaud (one button, concrete output: winner), Ray-Ban Meta (familiar object: winner), Bee and Limitless (acquired), Friend, Humane, Rabbit (failures). Winners attach to an existing object or behavior and produce a document.

**Overlay and ghost UI.** Cluely and Granola both live *alongside* the app you are already in rather than asking you to switch. Granola's variant (quiet, after-the-fact, bot-free) retained; Cluely's (covert, real-time) generated hype and credibility problems.

**One tap.** Action button, power-button long-press, Plaud's physical button, Call Arc's raise-to-ear. The start gesture is a single physical action.

**Built-in virality loops (output as the ad).**
- Granola: the shared note link exposes recipients to the product.
- Nano Banana: the image of you is the post.
- Poke: the onboarding roast and price haggle are screenshots.
- Instinct and Muse: "it finished a real task" receipts posted to X.
- Ray-Ban Meta: POV video shared to Instagram.
- Sesame: screen recordings of an uncannily human call.

**Where "no app" beat "install an app".** For casual, infrequent, or global and low-end-device users (50M on ChatGPT WhatsApp; 1-800 for landlines) and for agents whose value is async ("text me when it's done": Poke, Instinct). **Where the app won.** When the product needs rich output review, trust UI, or OS permissions: Granola needs system audio and an editable document; Muse needs an approval UI outside chat and a vault; Plaud needs an app for templates; Meta moved its agent into a dedicated app even though it owns WhatsApp. Hybrid is the 2026 default: Muse runs in both an app and WhatsApp, and Sesame added a texting mode to its voice app.

---

## 16. Ten design principles for a "layman-viral" interface (applied to an AI scribe)

1. **First value before any configuration.** Reuse an identity the user already has (Meta account, Doximity login, a phone number) and produce a real output on the first session. For Chartside: a clinician should get a finished note from their first recorded visit before connecting an EHR.
2. **Start with one physical, borrowed gesture.** One press (Plaud), raise to ear (Call Arc), long-press the Action button. Never make the start of capture a menu. For Chartside: an Action button or lock-screen control that starts capture, and a one-tap "stop and draft."
3. **Meet users in a channel they already check.** Text thread, phone call, or iMessage (now possible via Apple Messages for Business with an opaque ID). A scribe that texts back "your note is ready, reply 'sign' or tap to edit" fits the existing habit loop.
4. **Do the integration work server-side, not in settings.** Muse's cloud browser and Instinct's own computer replaced user-configured connectors. For Chartside: EHR push should be something the service handles, not a setup wizard.
5. **Keep consent outside the conversation, and make it unmistakable.** Muse's approvals live in app UI, not chat; Instinct's lack of confirmation became a scandal. Clinical sign-off, patient-consent capture, and "send to chart" must be a distinct, deliberate UI act.
6. **Be socially invisible but honestly disclosed.** Granola's bot-free capture won because it removed awkwardness, not because it hid. Cluely's covertness and Muse's undisclosed human callers backfired. For Chartside: no visible "bot" in telehealth, but an explicit patient-facing disclosure.
7. **Preserve the human's own words as the skeleton; do AI work at the end.** Granola removed live AI text because it distracted. Show the clinician's jotted cues and render the full note after the visit.
8. **Make the output the advertisement.** Design a shareable artifact: a patient visit summary link, a referral letter, or a colleague-facing note that carries subtle attribution. Every Granola note and every Nano Banana image recruited new users.
9. **Complement the phone and existing tools; do not replace them.** Humane and Rabbit failed by demanding new hardware, gestures, and subscriptions. Ray-Ban Meta, Plaud, and Granola attach to objects and workflows people already use.
10. **Engineer delight and scarcity into onboarding, but never at the cost of trust.** Poke's bouncer, Instinct's invites, and Sesame's 10-second demo converted curiosity into posts. In healthcare, the delight can be speed ("note in 20 seconds") and a no-login demo on a sample visit, while the trust layer (PHI handling, BAA, approvals) stays conspicuous, because every agent in this report that skipped the trust layer got a backlash cycle.

---

## Sources

- Meta, "Introducing Muse": https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/
- TechCrunch, "Meta is putting its muscle behind Muse": https://techcrunch.com/2026/09/25/meta-is-putting-its-muscle-behind-muse-as-the-ai-app-takes-off/
- Fortune, "Meta's Muse AI is exploding in popularity": https://fortune.com/2026/09/22/metas-muse-ai-is-exploding-in-popularity-and-drawing-heated-backlash/
- Fox Business, Muse tops App Store: https://www.foxbusiness.com/technology/metas-muse-becomes-app-stores-hottest-download
- Slate, Muse review: https://slate.com/technology/2026/09/meta-muse-ai-app-review.html
- Dolphin Research, "Muse went viral": https://dolphinresearch.substack.com/p/muse-went-viral-is-meta-at-a-real
- eesel, "What is Meta Muse?": https://www.eesel.ai/blog/meta-muse-agent
- MindStudio, Meta Muse explained: https://www.mindstudio.ai/blog/meta-muse-ai-agent
- UPGPTs, Muse tutorial: https://upgpts.com/en/tutorials/muse/how-to-use-muse-ai
- ego, Muse browser automation: https://lite.ego.app/article/meta-muse-browser-automation
- 404 Media, Muse calls routed to humans: https://www.404media.co/meta-tests-muse-ai-agent-calls-that-are-actually-made-by-humans-in-a-call-center/
- BigGo Finance, Muse and OpenClaw: https://finance.biggo.com/news/1a439e4d-9c9b-42b7-a084-a64aac002a22
- TechCrunch, Instinct $1B Series C: https://techcrunch.com/2026/09/28/viral-ai-agent-instinct-raises-1b-series-c-at-a-10b-valuation/
- TechCrunch, Instinct privacy concerns: https://techcrunch.com/2026/08/24/instincts-powerful-ai-assistant-is-raising-privacy-and-security-concerns/
- TechCrunch, Instinct $350M: https://techcrunch.com/2026/08/26/viral-ai-startup-instinct-has-raised-350-million-at-a-2-5-billion-valuation/
- SiliconANGLE, Instinct: https://siliconangle.com/2026/09/28/everyday-personal-ai-assistant-startup-instinct-raises-1b-at-10b-valuation/
- CellCog, What is Instinct AI: https://cellcog.ai/blog/what-is-instinct-ai/
- Vellum, Instinct breakdown: https://www.vellum.ai/blog/official-instinct-breakdown
- Carly, Instinct early users: https://www.usecarly.com/blog/what-is-instinct-ai/
- Instinct EMR (veterinary): https://instinct.vet/
- TechCrunch, Apple approves Poke: https://techcrunch.com/2026/06/04/apple-approves-poke-as-the-first-ai-agent-on-its-messages-for-business-platform/
- Startup Fortune, Cognition buys Poke: https://startupfortune.com/cognition-buys-poke-to-plant-its-ai-agent-inside-your-text-messages/
- Dealroom, Poke $25M: https://app.dealroom.co/news/feed/poke-raises-25m-to-deliver-ai-automation-via-text-on-imessage-sms-and-telegram
- TFN, Poke seed: https://techfundingnews.com/poke-launches-15m-seed-imessage-ai-assistant/
- Or Arbel on Poke onboarding: https://www.linkedin.com/posts/orarbel_most-ai-apps-use-a-boring-waitlist-this-activity-7373328490529628160-WPD7
- Alex Kaplan on Poke price negotiation: https://x.com/alexkaplan0/status/1965158155002020019
- Tanisha Srivatsa on Poke: https://tanishasrivatsa.substack.com/p/i-spent-30-minutes-arguing-with-a
- OpenAI Help Center, 1-800-ChatGPT: https://help.openai.com/en/articles/10193193-1-800-chatgpt-calling-and-messaging-chatgpt-with-your-phone
- OpenAI, ChatGPT WhatsApp transition: https://openai.com/index/chatgpt-whatsapp-transition/
- 9to5Mac, 50M WhatsApp users: https://9to5mac.com/2025/10/22/meta-kicking-chatgpt-out-of-whatsapp-for-50m-users/
- TechCrunch, WhatsApp bars general-purpose chatbots: https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform
- respond.io, WhatsApp 2026 AI policy: https://respond.io/blog/whatsapp-general-purpose-chatbots-ban
- Contrary Research, Sesame: https://research.contrary.com/company/sesame-ai
- Sequoia, Partnering with Sesame: https://sequoiacap.com/article/partnering-with-sesame-a-new-era-for-voice
- TechCrunch, Sesame $250M: https://techcrunch.com/2025/10/21/sesame-the-conversational-ai-startup-from-oculus-founders-raises-250m-and-launches-beta/
- TechCrunch, Sesame iOS app: https://techcrunch.com/2026/05/28/sesame-the-conversational-ai-startup-from-oculus-founders-launches-its-ios-app/
- TechCrunch, Granola $125M: https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/
- Okara, How Granola grew: https://okara.ai/blog/how-granola-grew
- Fast Company, Chris Pedregal interview: https://www.fastcompany.com/91497900/granola-chris-pedregal-interview
- Costa Invest, Granola: https://www.costainvest.blog/en/post/how-granola-became-a-1-5-billion-ai-startup-in-a-saturated-market
- Sacra, Plaud: https://sacra.com/c/plaud/
- Yahoo/TechCrunch, Plaud $100M ARR: https://finance.yahoo.com/technology/ai/articles/plaud-says-software-business-topped-150000729.html
- Bloomberg, Plaud $500M target: https://www.bloomberg.com/news/articles/2026-06-16/plaud-plans-new-wearable-as-ai-note-taking-startup-eyes-500-million-in-sales
- Plaud, How to use NotePin: https://www.plaud.ai/blogs/news/how-to-use-plaud-notepin
- WebProNews, NotePin S at CES 2026: https://www.webpronews.com/plaud-ai-unveils-notepin-s-at-ces-2026-wearable-with-highlight-button-for-pros/
- CNBC, Meta acquires Limitless: https://www.cnbc.com/2025/12/05/meta-limitless-ai-wearable.html
- SF Standard, wearable acquisitions: https://sfstandard.com/2025/12/14/big-tech-scooping-ai-wearable-startups-customers-spooked/
- TechCrunch, Why Amazon bought Bee: https://techcrunch.com/2026/01/12/why-amazon-bought-bee-an-ai-wearable/
- Storyboard18, Bee at CES 2026: https://www.storyboard18.com/digital/amazon-unveils-bee-a-wearable-ai-companion-at-ces-2026-87525.htm
- Fast Company, Friend ad campaign: https://www.fastcompany.com/91413814/friend-ai-ad-campaign-founder-qa
- Fortune, Friend review: https://fortune.com/2025/10/03/friend-ai-necklace-review-avi-schiffmann/
- Digital Applied, AI product failures (Humane, Rabbit, Sora): https://www.digitalapplied.com/blog/ai-product-failures-2026-sora-humane-rabbit-lessons
- Bossa Research, Humane post-mortem: https://medium.com/@bossaresearch/anatomy-of-a-failure-the-humane-ai-pin-and-the-misfit-future-of-wearable-ai-04feedd82903
- Progressive Robot, Rabbit desktop agent: https://www.progressiverobot.com/2026/09/23/desktop-ai-agent-rabbit-os3-no-r1-needed/
- UploadVR, 7M smart glasses in 2025: https://www.uploadvr.com/meta-essilorluxottica-sold-7-million-smart-glasses-in-2025/
- CNBC, EssilorLuxottica tripled Meta glasses sales: https://www.cnbc.com/2026/02/11/ray-ban-maker-essilorluxottica-triples-sales-of-meta-ai-glasses.html
- Road to VR, production plans: https://roadtovr.com/meta-aims-to-double-possibly-even-triple-smart-glasses-production-this-year/
- EFF, Meta Ray-Bans: https://www.eff.org/deeplinks/2026/03/think-twice-buying-or-using-metas-ray-bans
- MacRumors, ChatGPT on Action button: https://www.macrumors.com/how-to/chatgpt-iphone-action-button-assistant/
- TUAW, ChatGPT Action button: https://www.tuaw.com/2025/11/30/chatgpt-becomes-a-handy-shortcut-with-iphones-action-button
- Perplexity Help Center, iOS voice assistant: https://www.perplexity.ai/help-center/en/articles/11132456-how-to-use-the-perplexity-voice-assistant-for-ios
- TechCrunch, Perplexity Android assistant: https://techcrunch.com/2025/01/23/perplexity-launches-an-assistant-for-android
- TechCrunch, Call Arc: https://techcrunch.com/2024/05/23/arc-searchs-new-call-arc-feature-lets-you-ask-questions-by-making-a-phone-call/
- MacRumors, Call Arc: https://www.macrumors.com/2024/05/23/arc-search-call-feature/
- tl;dv, Cluely review: https://tldv.io/blog/cluely-review/
- Postbeam, How Cluely grows: https://www.postbeam.ai/blog/how-cluely-grows
- TechCrunch, Roy Lee at Disrupt: https://techcrunch.com/2025/11/05/cluelys-roy-lee-hints-that-viral-hype-is-not-enough
- Wikipedia, OpenClaw: https://en.wikipedia.org/wiki/OpenClaw
- Hive Security, OpenClaw security crisis: https://hivesecurity.gitlab.io/blog/openclaw-ai-agent-security-crisis-2026/
- a16z, Top 100 Gen AI Consumer Apps (March 2026): https://www.a16z.news/p/top-100-gen-ai-consumer-apps-march
- eMarketer, Nano Banana: https://www.emarketer.com/content/nano-banana-propels-gemini-top-of-ios-app-store-downloads
- Yahoo, Gemini demographic shift: https://tech.yahoo.com/ai/gemini/articles/google-gemini-exec-says-nano-111112810.html
- TechCrunch, Sora shutting down: https://techcrunch.com/2026/03/24/openais-sora-was-the-creepiest-app-on-your-phone-now-its-shutting-down/
- FORKOFF, Sora launch and shutdown: https://forkoff.xyz/blog/viral-launch/sora-2-viral-launch-and-shutdown-2026
- Doximity, Best AI scribes 2026: https://blog.doximity.com/articles/Best-AI-Medical-Scribe-Tools-in-2026-Software-for-Clinical-Notes-and-Medical-Charting
- Vero, Heidi Health review: https://www.veroscribe.com/blog/heidi-health-review-2026
