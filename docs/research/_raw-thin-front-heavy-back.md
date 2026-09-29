# Thin front, heavy back: a ghost interface for Chartside

Research dated 2026-09-28. Raw notes for the `interface/ghost` direction. The question: how does large, deep software get a near-zero-UI front door without losing its depth? For Chartside, that means capture plus one-tap decisions plus a conversational agent as the main channel, with the web app becoming the back office.

A note on sourcing: claims link to what was checked. A few product descriptions (Uber, Apple Pay) come from general product knowledge and are marked as such. The KevinMD dollar figure on CMS recoupments is one author's claim and is not treated as established.

---

## 1. Heavy apps with thin fronts

### Finance: the clearest prior art

**Ramp.** After an in-person card swipe, Ramp texts the cardholder that a receipt is needed. The cardholder replies with a photo, and any text in the reply becomes the memo. Matching takes seconds, and Ramp texts back whether it worked ([Ramp support](https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-Receipts-Memos-via-SMS-or-Email)). The matcher reads merchant, amount and date, adds card-network data, and claims 90%+ accuracy. Ramp also pulls receipts on its own from Gmail, Outlook, Amazon Business, Uber and Lyft. It describes the pipeline as collect, then match, then code, "so finance teams focus on verification rather than manual data entry," and says customers have saved 1 million hours ([Ramp blog](https://ramp.com/blog/ramp-receipt-automation)). **Lesson:** the best capture step is the one the user never takes. The second best is a reply to a text that already knows the context.

**Brex.** Brex offers the same SMS or WhatsApp photo reply, plus memo-by-text ([Brex receipts](https://www.brex.com/support/receipts-for-expenses)).

- For big vendors, Brex rebuilds receipts from card-network data. For other vendors, it generates them at transaction time or 1 to 3 days later.
- A receipt counts as verified when 2 of 3 fields (merchant, amount, date) match. That is an explicit, explainable auto-approval rule.
- Managers approve flagged expenses in Slack or by text ([Brex expense management](https://www.brex.com/product/expense-management)).
- Users choose the channel for each notification type: email, push, SMS, WhatsApp, Slack, or the task inbox ([Brex notifications](https://www.brex.com/support/manage-alerts-and-notifications)).

**Lesson:** the rule for auto-verification is simple enough to show to the user, and only the flagged items reach a human.

**Expensify SmartScan.** Snap a receipt and OCR pulls merchant, date, total and currency in under five seconds. The expense is then filed and categorized from policy and past behavior ([Expensify](https://use.expensify.com/receipt-scanning-app)). Expensify's own troubleshooting page admits that handwritten or faded receipts fail ([help](https://help.expensify.com/articles/expensify-classic/expenses/Troubleshoot-SmartScan-Issues)). **Lesson:** capture and extraction are the front door. Exception handling for failed reads lives in the back office.

**Slack approval bots.** The standard pattern ([Slack docs](https://docs.slack.dev/tools/deno-slack-sdk/guides/creating-an-interactive-message/)):

- A message arrives with Approve and Deny buttons.
- The handler updates the original message in place, so the thread becomes the audit trail.
- Sequential approvals stack context notes on that message.
- Good implementations add an optional confirmation modal for high-stakes approvals, and expire stale approvals (for example, after 24 hours) so an old button cannot publish something outdated ([Block Kit cookbook](https://www.resumelens.org/blog/slack/slack-block-kit-cookbook)).

**Lesson:** decision cards need expiry and in-place state, not just buttons.

**Stripe.** Stripe treats the API as the product and the Dashboard as "an extension of the system," not decoration. Every Dashboard action appears in the request logs as the API call behind it, and Workbench exposes API and event history in the browser ([Stripe Workbench](https://docs.stripe.com/workbench/overview), [Stripe blog](https://stripe.com/blog/workbench-a-new-way-to-debug-monitor-and-grow-your-stripe-integration)). **Lesson for Chartside:** each surface (card, agent, web) should call the same typed operations, so every action gets one audit trail no matter where it came from.

### Consumer one-button products

These are general product knowledge, not separately sourced.

- **Uber's** original promise was one button: your location is already known, and payment is already on file. Depth such as pricing, dispatch and routing is invisible until something goes wrong.
- **Apple Pay** reduces payment to a biometric plus a double-click, because identity and card details were set up once, ahead of time.

The shared move: **do the setup once, then make each repeat action a single confirmation.**

**Robinhood** is the cautionary tale of simplicity. In January 2024 it paid a $7.5M fine to Massachusetts and agreed to stop "celebratory imagery tied to the frequency of trading." The consent order cited confetti, scratch-off rewards and push notifications ([Boston Globe](https://www.bostonglobe.com/2024/01/18/business/robinhood-agrees-pay-75-million-settle-complaints-over-its-sales-practices/), [Vinson & Elkins](https://www.velaw.com/insights/game-over-robinhood-pays-7-5-million-to-resolve-gamification-securities-violations/)). **Lesson:** a frictionless surface that rewards the number of actions, not their quality, becomes a legal problem. Chartside must never celebrate how many notes were signed.

### Developer tools

**Superhuman.** Every interaction aims for under 100ms. It has 100+ shortcuts with Cmd+K as the universal entry, and a split inbox that pre-sorts mail into focus lanes. An email can be processed in 2 to 3 keystrokes ([Superhuman blog](https://blog.superhuman.com/how-to-split-your-inbox-in-superhuman/), [Superhuman vs Gmail](https://blog.superhuman.com/gmail-vs-superhuman/)). **Lesson:** triage speed comes from pre-sorting plus a single command palette, not from fewer features.

**Linear and GitHub agents.** In Linear you can assign an issue to GitHub Copilot. It works in the background, opens a draft PR, notifies you when it needs input, and can be redirected mid-task through a comment ([GitHub changelog](https://github.blog/changelog/2025-10-28-github-copilot-for-linear-available-in-public-preview/), [GitHub docs](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/integrate-cloud-agent-with-linear)). Linear's [Agent Interaction Guidelines](https://linear.app/developers/aig) set six rules:

1. Disclose that it is an agent.
2. Use native platform actions.
3. Acknowledge requests immediately.
4. Show its internal state (thinking, waiting, executing, done).
5. Stop at once when told to.
6. "An agent can carry out tasks, but the final responsibility should always remain with a human."

**Lesson:** this is close to a ready-made charter for Chartside's agent.

### Clinical

**Epic mobile** ([MUSC guide](https://musc.libguides.com/clinicians/mobileapps), [Geisinger](https://www.geisinger.org/patient-care/for-professionals/epic-haiku-and-canto-mobile-apps)):

| App | Device | What it does |
|---|---|---|
| Haiku | Phone | Schedule, patient lists, results, dictation, In Basket |
| Canto | iPad | Dashboard-style chart access |
| Limerick | Apple Watch | Limited chart access and functions |
| Rover | iPhone (nursing) | Flowsheet documentation, wound photos, day planning |

Epic already splits one huge EHR into device-sized slices, each with a narrow job.

**Epic Art.** At UGM 2025, Epic introduced Art (clinicians), Emmie (patients) and Penny (revenue cycle) ([CNBC](https://www.cnbc.com/2025/08/20/epic-ugm-2025-epic-touts-new-ai-tools.html), [Fierce](https://www.fiercehealthcare.com/ai-and-machine-learning/epic-rolls-out-ai-charting-and-more-built-automation-clinicians-and)). Art pulls up trends, updates history, places orders and drafts notes. Its ambient charting shipped in February 2026 and drafts notes plus recommended orders from the conversation. Clinicians can change note format through natural-language requests, and diagnosis-aware notes were planned for March 2026. Epic says AI usage grew 40x in 2025, and Insights reached 16M monthly uses ([Healthcare IT Today](https://www.healthcareittoday.com/2026/02/05/epic-ambient-ai-charting-released-and-more-updates-on-epics-ai-solutions/)). **Lesson:** the incumbent is moving to agent plus draft orders inside the EHR. Chartside's front door must be faster than opening Epic, not a copy of it.

**Microsoft Dragon Copilot.** Dragon Copilot combines Dragon Medical One dictation with DAX ambient capture. Inside supported mobile EHR apps it offers ambient recording plus Note, Orders, Memos and Transcript screens ([Microsoft Support](https://support.microsoft.com/en-us/dragon-copilot/physicians/dragon-copilot-in-mobile-ehr-apps)). Microsoft also ships an Ambient SDK so partners can embed capture in their own mobile apps ([Microsoft Learn](https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/sdk/ambient/)). **Lesson:** capture is becoming an embeddable primitive.

**Abridge Inside.** Recording starts in Haiku and the note lands in Hyperdrive, "without ever leaving Epic" ([BusinessWire](https://www.businesswire.com/news/home/20240213503774/en/Abridge-Announces-%E2%80%9CAbridge-Inside%E2%80%9D-with-Epic-Integration-from-Haiku-to-Hyperdrive)). Abridge later added inpatient care, emergency medicine and orders ([Fierce](https://www.fiercehealthcare.com/health-tech/abridge-launches-gen-ai-tool-inpatient-clinicians-adds-outpatient-orders-feature), [Abridge orders](https://www.abridge.com/press-release/abridge-inside-for-inpatient-and-outpatient-orders)). This is the purest ghost interface in clinical AI: Abridge has almost no UI of its own.

**Phone agents.**

- **Hippocratic AI** runs a "constellation" of 25+ task-specific models. A primary conversational agent is checked by specialist support agents, for example on medication and labs. The company claims 99.89% correct clinical guidance and validation by 7,500+ US-licensed clinicians ([Hippocratic safety](https://hippocraticai.com/safety/), [arXiv](https://arxiv.org/abs/2403.13313), [NVIDIA](https://www.nvidia.com/en-us/case-studies/hippocratic-ai/)).
- **Assort Health** runs specialty-specific voice agents for scheduling, intake, referrals, refills, eligibility and payments. It raised $102M within four months in 2025 ([SiliconANGLE](https://siliconangle.com/2025/10/01/assort-health-raises-76m-deliver-ai-agents-healthcare/), [Fierce](https://www.fiercehealthcare.com/ai-and-machine-learning/assort-health-brings-total-funding-102m-four-months)).

**Lesson:** voice agents in healthcare succeed when the scope is narrow and each specialty has its own scripts, with a separate checker on top.

---

## 2. Design patterns

**Decision cards and the approval inbox.** A card is one decision, with enough context to make it and a default action. The Slack and Brex patterns above show what a card needs:

- a clear subject
- the proposed action
- the reason it was flagged
- two or three buttons
- in-place state after acting
- expiry
- a link to the full record

Superhuman adds the queue discipline: pre-sorted lanes and keyboard (or swipe) processing.

**Progressive disclosure.** Nielsen Norman Group's rule is to put up front everything users often need, so they only reach the secondary view on rare occasions. Go no deeper than 2 levels, because "designs that go beyond 2 disclosure levels typically have low usability" ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)). For Chartside the layers are:

1. The card.
2. The card expanded, with evidence and diff.
3. The full web workspace.

The web workspace is not a third disclosure level. It is a different app, the back office.

**Management by exception.** Brex's 2-of-3 rule and Ramp's collect, match, code pipeline both route only the exceptions to people. The design work is deciding what counts as an exception. Every card that did not need a human trains the user to tap without reading.

**Confidence-based auto-approval.** Only use it when three things are true:

- the action is reversible
- the rule is explainable (Brex's 2-of-3)
- the downside is small

Clinical signature fails the first test for anything that has left the building (a sent claim, a transmitted order), so in Chartside confidence changes the *priority and presentation* of clinical cards, never whether they need a signature.

**Undo windows.** Aza Raskin's rule is "Never use a warning when you mean undo," because people get used to confirmation dialogs and click through them ([A List Apart](https://alistapart.com/article/neveruseawarning/)). Gmail's Undo Send holds the message on the server for 5 to 30 seconds before it goes out ([NPR](https://www.npr.org/sections/thetwo-way/2015/06/24/417117823/gmail-now-features-a-way-to-ease-senders-remorse), [David Boike](https://www.davidboike.dev/2015/06/how-to-build-gmails-undo-send-feature/)). For Chartside, any external side effect should go through a hold queue: claim submission, a message to a patient, an order sent to the EHR.

**Notification design for busy professionals.** Clinical alert fatigue is well documented. Clinicians override "the vast majority of CPOE warnings, even 'critical' alerts." One VA study counted 100+ alerts per clinician per day, and ICU monitors produced about 187 warnings per patient per day ([AHRQ PSNet](https://psnet.ahrq.gov/primer/alert-fatigue)). AHRQ's mitigations translate directly into notification rules:

- make alerts more specific
- tailor them to the patient
- tier them by severity
- interrupt only for severe issues

**iOS one-tap actions.** Notification actions can be marked:

- `.authenticationRequired`: runs only on an unlocked device
- `.destructive`: styled as destructive
- `.foreground`: opens the app

([Apple docs](https://developer.apple.com/documentation/usernotifications/unnotificationactionoptions)). Since iOS 17, Live Activities can hold interactive buttons backed by App Intents (`LiveActivityIntent`) ([Apple](https://developer.apple.com/documentation/appintents/liveactivityintent), [Frearson](https://bfrearson.github.io/blog/ios-live-activties/)). A Live Activity suits a recording in progress: elapsed time, pause and stop, and a consent-captured indicator. For Chartside:

- Any action that changes PHI or signs something needs `.authenticationRequired`.
- Signing opens a foreground view. It is never a lock-screen button.

---

## 3. Conversational agents over large APIs

**How many tools.** Tool definitions are expensive.

- Anthropic reports a five-server setup using about 55K tokens before the conversation starts. GitHub alone is 35 tools and about 26K tokens, and Anthropic has seen 134K tokens of definitions in the wild.
- With tool search, where tools are deferred and discovered on demand, Opus 4 accuracy on large tool sets rose from 49% to 74%, and Opus 4.5 from 79.5% to 88.1%, with about 85% fewer tokens.
- Adding examples to tool definitions raised complex-parameter accuracy from 72% to 90%.

([Anthropic engineering](https://www.anthropic.com/engineering/advanced-tool-use), [Claude docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)). An independent test with 4,000 tools saw about 60% retrieval success ([Arcade](https://blog.arcade.dev/anthropic-tool-search-4000-tools-test)). Accuracy falls sharply past 20 to 30 tools ([Arcade](https://blog.arcade.dev/anthropic-tool-search-claude-mcp-runtime)).

**Design implications:**

- Keep an always-loaded core of about 12 to 20 high-frequency tools.
- Put the long tail behind search or a router by domain (documentation, orders, billing, inbox, census).
- Include worked examples in each tool definition.
- 88% tool selection is not good enough for a write action on a medical record. Every write needs structured confirmation, whatever the model's confidence.

**Grounding and confirmation.** The MCP spec says there "SHOULD always be a human in the loop with the ability to deny tool invocations." It also says clients should show tool inputs before calling, prompt for confirmation on sensitive operations, and log tool usage for audit ([MCP spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)). Tool annotations such as destructive or read-only hints are untrusted unless the server is trusted. Chartside controls both sides, so it can enforce them. The pattern for Chartside:

1. The agent resolves the patient and encounter and states them back.
2. It proposes a typed action.
3. The UI renders that proposal as a card.
4. The human confirms the card, not the chat text.

**Latency for voice.** People take turns in conversation with a median gap of about 200ms. A gap starts to feel noticeable around 500ms, and people start talking over the agent at about 1s. A typical pipeline budget:

| Stage | Time |
|---|---|
| Endpointing (voice activity detection) | 150 to 300ms |
| Speech recognition, final transcript | 100 to 200ms |
| LLM time to first token | 300 to 600ms |
| Text-to-speech, first byte | 100 to 250ms |
| Network | 50 to 150ms |
| **Total** | **about 0.8 to 1.5s** |

Above 1.5s, conversations feel broken ([AWS Builder](https://builder.aws.com/content/3JDFAfXBiuwPP5MPzgf4RUWSAIp/the-800ms-rule-budgeting-latency-for-a-real-time-voice-agent-on-aws), [Hamming](https://hamming.ai/resources/voice-ai-latency-whats-fast-whats-slow-how-to-fix-it)). **Implication:** voice should answer read queries quickly (for example, "what was her last A1c") and hand anything that writes to a card on screen. Do not make the clinician wait through a spoken confirmation loop.

**Failures.**

- **Google Duplex.** In 2019 Google confirmed that about 25% of Duplex calls started with a human in a call center, and 15% needed a human to step in. In the New York Times' own tests, humans completed 3 of 4 successful bookings ([TechCrunch](https://techcrunch.com/2019/05/22/googles-duplex-calls-still-frequently-require-human-intervention/), [Engadget](https://www.engadget.com/2019-05-22-google-duplex-is-made-of-people.html)).
- **Alexa for Business.** The Alexa Business Skill API was retired in March 2023, with developers pointed to Smart Property APIs ([Amazon deprecated features](https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html)). Amazon's devices unit was losing billions and moving toward generative AI ([Retail Dive](https://www.retaildive.com/news/amazon-layoffs-alexa-unit/700211/)). The workplace voice assistant never found a workflow people depended on.

**Lessons:** voice alone, open-ended scope, and hidden human fallbacks do not scale. A voice front door has to sit on a real system of record, and it has to fail over to a visible screen.

---

## 4. Trust and safety for hands-off clinical AI

**Automation complacency is the central risk.**

- Errors appear in 4.8% to 71% of signed notes from ambient tools, depending on the study. On average, 58% of scribe output is accepted without edits.
- In a simulation, clinicians editing AI drafts often failed to catch clinically relevant errors ([npj Digital Medicine / PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13172454/), [Nature](https://www.nature.com/articles/s41746-026-02554-0)).
- A 2026 preprint studies how clinicians change hedging language in AI drafts, a subtle way a note's meaning can drift ([arXiv](https://arxiv.org/pdf/2606.00018)).

A thin front makes this worse by design: it is built to be fast to approve.

**How vendors handle review burden.**

- Abridge keeps the note inside the EHR's normal signing workflow, and its product marketing highlights evidence links from each sentence back to the transcript.
- Microsoft keeps the transcript one tap away on mobile ([Microsoft Support](https://support.microsoft.com/en-us/dragon-copilot/physicians/dragon-copilot-in-mobile-ehr-apps)).
- Hippocratic narrows scope and adds checker models ([Hippocratic](https://hippocraticai.com/safety/)).

The common thread: make verifying cheap rather than making signing cheap.

**Regulation, as of September 2026.**

- **CMS.** CMS's signature guidance now reads: "If you use a scribe, including artificial intelligence technology, sign the entry to authenticate the documents and the care you provided or ordered. You don't need to document who or what transcribed the entry" (MLN905364, verified from the PDF, [CMS](https://www.cms.gov/files/document/mln905364-complying-medicare-signature-requirements.pdf)). An AI scribe is treated like a human scribe, and the signer owns the note. A KevinMD commentary argues that notes signed within seconds of an encounter closing attract audit suspicion ([KevinMD](https://kevinmd.com/2026/08/why-ambient-ai-scribe-notes-fail-the-2026-cms-audit.html)). That is one author's view, but it is a reasonable risk to design against. The CY2026 fee schedule is final ([CMS fact sheet](https://www.cms.gov/newsroom/fact-sheets/calendar-year-cy-2026-medicare-physician-fee-schedule-final-rule-cms-1832-f)). No AI-specific documentation rule has been finalized.
- **ONC HTI-1.** HTI-1 created the decision support interventions (DSI) criterion, with source-attribute "model card" transparency for predictive DSIs ([Mintz](https://www.mintz.com/insights-center/viewpoints/2146/2024-01-08-hhs-onc-hti-1-final-rule-introduces-new-transparency)). **HTI-5**, proposed in December 2025, would remove the model-card and risk-management elements. ONC's reasons: no evidence the requirements improved care, and clinicians rarely opened the information ([Federal Register](https://www.federalregister.gov/documents/2025/12/29/2025-23896/health-data-technology-and-interoperability-astponc-deregulatory-actions-to-unleash-prosperity), [Covington](https://www.covingtondigitalhealth.com/2026/01/hhs-proposes-changes-to-the-health-it-certification-program-and-information-blocking-regulations-in-hti-5-proposed-rule/)). Comments closed on February 27, 2026, and no final rule was found as of this writing ([Drummond](https://www.drummondgroup.com/blog/how-the-hti-5-proposed-rule-affects-certification/)). HTI-2's DSI provisions were not verified in this pass. **Takeaway:** federal transparency is shrinking, but ONC's own finding (clinicians never open model cards) argues for putting transparency *in the card itself*, not on a separate page.
- **California AB 3030** (effective January 1, 2025). Generative AI communications to patients about clinical information need a disclaimer plus instructions for reaching a human. The disclaimer is spoken at the start and end of audio, and shown throughout chat and video. Messages "read and reviewed" by a licensed provider are exempt ([ArentFox Schiff](https://www.afslaw.com/perspectives/alerts/california-requires-disclaimers-health-care-providers-ai-generated-patient), [leginfo](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB3030)). A one-tap "send to patient" therefore has to either be a real review or carry the disclaimer.
- **Texas SB 1188** (signed June 20, 2025, effective September 1, 2025). Practitioners must review AI-generated records under Texas Medical Board standards and tell patients when AI is used in diagnosis or treatment ([Hall Render](https://hallrender.com/2025/08/19/new-texas-law-on-ehr-data-localization-and-ai/), [TMA](https://www.texmed.org/Template.aspx?id=66759), [Holland & Knight on HB 149](https://www.hklaw.com/en/insights/publications/2025/06/texas-enacts-comprehensive-ai-governance-laws)).
- **Illinois HB 1806** (signed August 4, 2025). AI may not make independent therapeutic decisions, talk with clients therapeutically, or produce treatment plans without a licensed professional's review. AI for notes, scheduling and billing is allowed. Penalties run up to $10,000 per violation ([IDFPR](https://idfpr.illinois.gov/news/2025/gov-pritzker-signs-state-leg-prohibiting-ai-therapy-in-il.html), [Baker Donelson](https://www.bakerdonelson.com/illinois-passes-extensive-law-regulating-ai-in-behavioral-health)). This matters directly for Chartside's behavioral health module.

**What "human in the loop" must mean for signing.** Pulling together CMS, Texas, AB 3030's "read and reviewed," and Linear's accountability rule, it must mean all of the following:

1. The signer is authenticated as the licensed author, with a biometric at minimum.
2. The signer was shown the content being signed, including a diff of what changed since they last saw it.
3. Signing is a deliberate act that cannot be done blind or in bulk.
4. The system records evidence that review happened: time on content, sections expanded, edits.
5. High-risk content (new diagnoses, controlled substances, laterality, anything the model marked low-confidence) was individually acknowledged.

---

## 5. Design spec for Chartside

### Surfaces

- **Capture:** a phone PWA or app with a Live Activity during recording, the watch, the browser extension, and phone dictation.
- **Cards:** a decision inbox on phone and web, plus iOS notification actions for non-signing decisions.
- **Agent:** chat plus voice, with read queries answered by voice and write actions delivered as cards.
- **Back office:** the existing web app.

### Workflows that become cards (one-tap, with expand)

| Card | Primary action | Secondary | Notes |
|---|---|---|---|
| Consent confirm (at record start) | Confirm consent given | Decline and stop | Live Activity; timestamp tied to audio |
| Patient match | Accept suggested patient | Pick another | Recording can start with no patient chosen |
| Note ready for review | Open review (foreground) | Snooze | Never signed from the lock screen |
| Addendum or small edit proposed by agent | Accept diff | Reject, edit | Shows exact diff |
| Suggested orders (draft) | Queue selected orders | Edit in web | Each order its own checkbox; nothing sent without sign |
| Co-signature request (resident or APP) | Open for co-sign | Return with comment | Shows supervisee's edits vs AI draft |
| Coding suggestion, low variance | Accept codes | Edit | Confidence and E/M rationale on the card |
| Claim scrub exception | Fix suggested | Send to biller | Only exceptions reach clinicians |
| Inbox: result or refill | Acknowledge, draft reply | Route | Patient-facing replies follow AB 3030 rules |
| Quality measure gap at point of care | Add to plan | Dismiss with reason | Tiered; not an interrupting alert |
| ED or inpatient board change (critical) | Acknowledge | Open board | Interrupting only for high severity |

### Workflows that become agent tools

Always loaded (about 15 tools):

- `find_patient`
- `get_encounter`
- `start_capture` and `stop_capture`
- `summarize_patient`
- `get_results`
- `get_meds`
- `draft_addendum`
- `propose_orders`
- `propose_codes`
- `list_my_queue`
- `snooze_card`
- `route_to_staff`
- `explain_flag`
- `open_in_web`

Behind search or a domain router:

- claim status
- denial explanation and appeal draft
- quality measure lookup
- census queries
- templates
- note-style preferences
- admin reports

**Rule:** agent write tools only *propose*. They return a card id, never a committed change.

### Back-office only

- Full note editing and template authoring
- Charge master and fee schedules
- Payer rules and claim batches
- Denial worklists
- Audit logs and review-evidence reports
- Model and quality dashboards
- User and role admin, MFA and SCIM
- BH-specific treatment plans (Illinois)
- Bulk operations of any kind
- API and integration settings

### Safety rules

1. No signing, co-signing, order transmission or claim submission from a notification, a Live Activity, voice alone, or in bulk.
2. Every write action is a typed, previewed card. The agent's prose is never the thing confirmed.
3. External side effects go through a hold queue with an undo window: 30 seconds for messages and claims, and until encounter close for draft orders.
4. The system records sign-time review evidence and flags suspiciously fast signs (for example, under 20 seconds for a note over 300 words) to the clinician and the QA dashboard, never as punishment on the card.
5. High-risk spans need individual acknowledgment: new diagnoses, controlled substances, laterality, dosing, and low-confidence spans.
6. Patient-facing text is either reviewed by a clinician or carries the AB 3030 disclaimer and a route to a human. AI use is disclosed per Texas SB 1188.
7. In behavioral health, the agent may draft notes and admin work, but never therapeutic recommendations without a licensed professional's approval.
8. The agent identifies itself, shows its state, stops immediately when told to, and the human remains accountable (Linear's guidelines).
9. Card expiry: stale cards cannot act on changed data. The card refreshes or expires.
10. PHI actions from notifications require an unlocked device (`.authenticationRequired`), and previews show minimal PHI on the lock screen.

### 10 UX principles

1. **Capture is the product.** Starting a recording takes one tap from anywhere, and everything else can wait.
2. **Exceptions only.** A card exists only if a human decision changes the outcome. Measure how many cards are shown per encounter and keep that number falling.
3. **One decision per card, two levels deep.** Card, then expanded evidence, then the web app for everything else ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)).
4. **Undo over warn**, except for signatures, which stay deliberate ([Raskin](https://alistapart.com/article/neveruseawarning/)).
5. **Make verification cheap, not signing cheap.** Every claim in a note links to the transcript moment. Diffs replace re-reading.
6. **Confidence shapes attention, not authority.** Low-confidence spans are highlighted, and high confidence never skips review.
7. **Under 100ms for taps, under 1s for voice.** Voice reads, and the screen writes ([Superhuman](https://blog.superhuman.com/gmail-vs-superhuman/), [AWS](https://builder.aws.com/content/3JDFAfXBiuwPP5MPzgf4RUWSAIp/the-800ms-rule-budgeting-latency-for-a-real-time-voice-agent-on-aws)).
8. **Tier every interruption.** Only critical items buzz, everything else batches, and clinicians control their own channels ([AHRQ](https://psnet.ahrq.gov/primer/alert-fatigue), [Brex](https://www.brex.com/support/manage-alerts-and-notifications)).
9. **One engine, many doors.** Cards, agent and web call the same typed operations, with one audit trail ([Stripe](https://stripe.com/blog/workbench-a-new-way-to-debug-monitor-and-grow-your-stripe-integration)).
10. **No gamification of throughput.** No streaks, confetti or "notes signed" counters. The satisfying end state is a quiet inbox ([Robinhood consent order](https://www.velaw.com/insights/game-over-robinhood-pays-7-5-million-to-resolve-gamification-securities-violations/)).

---

## Open items not verified in this pass

- HTI-2's final DSI provisions.
- Whether HTI-5 has been finalized since February 2026.
- Primary sources for Uber and Apple Pay design.
- Abridge's current evidence-linking feature page (returned 404).
- The full text of the scribe randomized trial (the PMC page was captcha-blocked).
