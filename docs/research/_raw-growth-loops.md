# Growth Loops for Chartside's Ghost Interface (raw research)

Research date: 2026-09-28. Scope: virality and growth-loop mechanics we could build into a near-zero-UI front door (the `interface/ghost` branch) so Chartside spreads clinician to clinician and patient to clinician. Companion to `_raw-viral-formats.md` and `interface-feasibility.md`.

Confidence notes: numbers are as reported by the cited source; many PLG figures (Loom 30%, Calendly 25%, k-factor ranges) come from secondary growth blogs and should be treated as directional. Legal notes are research, not legal advice; anything touching payments to clinicians needs healthcare counsel before launch. The session web-search budget ran out before I could pull primary data on specific viral scribe videos and Reddit threads, so section 3 is thinner on hard numbers than the others and says so where it matters.

---

## 1. When the output is the ad: PLG case studies

**Hotmail.** Every outgoing email carried "PS: I love you. Get your free email at Hotmail." The line was a pattern interrupt that also told the recipient the product was free and open to anyone. Reported result: 1M users in six months, 12M in 18 months, then a roughly $400M sale to Microsoft. [Strategy Breakdowns; Rick Winfield] Lesson: the artifact travels on a channel the user already uses, and the footer does the pitch.

**Dropbox.** A two-sided storage bonus for referrals took Dropbox from about 100K to over 4M users in about 15 months (the "3900%" figure), with 2.8M invites sent in April 2010 alone. [Viral Loops; GrowSurf] Lesson: the reward was more of the product itself, so it cost little and fit the use case.

**Loom.** Recipients of a Loom often sign up to reply with a Loom of their own. Secondary sources say the free-tier watermark drove about 30% of organic signups. [Fungies; StartupSpells] Kyle Poyar's reporting stresses that the sharing, not the recording, is the viral act, and that Loom measured it with last-touch attribution and weekly virality reviews. [Growth Unhinged]

**Calendly.** Every scheduling link shows the product working for the recipient. One secondary source says 25% of new users signed up after seeing "Powered by Calendly," with the loop closing in about 24 hours. [Fungies] Lesson: the non-user receives value (a booked meeting) before they are asked for anything.

**Superhuman.** "Sent via Superhuman" signatures carried a tracked link, and signups from it gave both sides a free month. It also ran a waitlist of more than 275K people, where a referral moved you to the top. [StartupSpells; TechCrunch 2020] Lesson: the signature worked because it signaled status, not just because it was a link.

**Granola.** Shared notes open as a web page that non-users can read and query ("Chat with meeting transcript") without installing anything. Distribution runs through copy link, email, Slack, and Notion. Users often find Granola by seeing polished notes appear in Slack after a meeting. [Fishman AF; Goitein; VC Corner] The ceiling is plain: "the growth loop only works if the notes are good enough to share." [VC Corner] Granola raised at a $1.5B valuation in March 2026. [TechCrunch]

**Zoom.** Attendees experience the product free, and the 40-minute group cap is long enough to prove value but short enough to push hosts to upgrade. [SaaS Growth Daily] Lesson: the invitee gets full value, and the limit applies to the person who creates the artifact.

**Figma and Notion.** Figma links bring stakeholders into the file. One source says 70% of larger Figma enterprise deals began with one individual Professional user. Notion's template gallery turns power users into distribution, since importing a template requires signing up. Template and content loops reportedly reach k of about 0.4 to 0.7. [Flowjam; Fungies]

**ChatGPT share links.** Shared conversations render as a public page with a "try ChatGPT" call to action, which is the same pattern as Granola. I could not get primary conversion data within the search budget, so treat this as a pattern, not a benchmark.

### Healthcare comparables

**OpenEvidence.** This is the strongest clinician PLG case on record. It is free for NPI-verified clinicians with no usage caps, and NPI verification takes minutes. [Fast.io] Growth has come almost entirely through doctor-to-doctor word of mouth, with direct-to-physician distribution that skips hospital procurement. [Contrary Research] The numbers: 358K consultations a month in July 2024 became 8.5M a month by July 2025, over 2,000% year over year; 65K new verified clinician registrations a month; 40%+ of US physicians logging in daily across 10K+ hospitals (2025); 757K+ verified US physicians; 1M consultations in a single day on March 10, 2026. [PR Newswire; Fierce Healthcare; Yahoo Finance] Free CME credit launched in April 2025 and expanded to CE/MOC in July 2026, and it gives clinicians a reason to come back. [OpenEvidence; Business Wire] It makes money from pharma advertising, so the free tier pays for itself. OpenEvidence Visits (August 2025) now moves into documentation, which makes it a direct competitor. [Contrary]

**Doximity.** Doximity reached 50% of US physicians in just over three years and 70% (800K+) by 2017. It now reports 85% of US physicians and more than 3M registered members, and 9 in 10 fourth-year medical students are on it. [Doximity press; Wikipedia] The seed was the verified directory: your profile already exists, so you "claim" it. In July 2025 Doximity launched a free AI scribe for verified physicians, NPs, PAs, and medical students, with 10K+ beta users. [STAT; Fierce Healthcare] That puts the price of a basic scribe at zero, and Chartside's growth loops have to assume that.

**Freed.** Freed has 20K paying clinicians and $20M ARR (July 2025), and 26K+ clinicians across 1,000+ mostly small organizations by 2026. It grew on word of mouth among solo and small practices. [VentureBeat; Aragon] Its referral program gives the referee a free month and the referrer one month of credit per referral. Five paid referrals in your first 30 days gets you a free year. Only paying users can earn, and credit applies after the referee's first full paid month. [Freed Help Center]

**Heidi.** Heidi reports 2.8M patient visits a week across 190 countries (September 2026), ARR that grew from $1M to $50M in two years, and US$340M raised at $900M. [Heidi; Yahoo Finance] Its referral program pays cash: $25 per referral on the Evidence plan and $50 on the Clinician or Scribe plan, capped at 10 referrals and US$500 a month, paid by PayPal. Referees get up to 60 days free. The terms include anti-fraud language but no anti-kickback carve-outs, and they are governed by Victorian (Australian) law. [Heidi referral T&Cs]

---

## 2. Healthcare-specific loops

**Patient-facing artifacts.** Abridge generates plain-language patient visit summaries at an 8th-grade reading level, in real time, and the clinician reviews them before release. [Abridge] The need is well documented: patients forget 40 to 80% of what they hear in a visit. [Abridge] In a dermatology pilot, 90.6% of patients found AI after-visit summaries very easy to understand. [PMC10869927] The loop is the patient-to-clinician path: a patient who gets a clear text summary from Dr. A asks Dr. B, "Why don't you send me one of these?" That is Calendly's pattern (the non-user gets value first), except the non-user is a patient who can lobby a clinician. The rules for sending by text:
- Patients may ask for unencrypted SMS. The provider warns about the risk, honors the preference, and documents both, which puts the practice in a recognized safe harbor. [HIPAA Journal; Curogram]
- Healthcare treatment texts are exempt from TCPA prior consent if they use the patient-provided number, name the provider, carry no marketing, and offer an opt-out. [Curogram; Manatt]
- A "Get Chartside" pitch in a patient text would turn a treatment message into marketing. The footer must stay neutral ("Summary prepared with Chartside for Dr. X"), and any clinician call to action belongs on the web page behind the link, not in the SMS.

**Colleague handoffs.** Referral letters, consult notes, co-signs, and sign-outs all have a named clinician recipient. The page that recipient opens is where the Granola pattern applies: a clean letter, a "reply with your consult note" button, and a verified-clinician upsell. Unlike patient texts, clinician-to-clinician treatment communication has no marketing restriction on a modest attribution line.

**Residency programs as seed networks.** Doximity's 90% of fourth-year medical students shows how much trainee-first seeding pays. In a 2025 pilot at two family medicine residencies, 15 of 16 eligible residents took part, documentation time fell 3.09 minutes per patient, and burnout (Mini-ReZ) scores improved significantly. [STFM PRiMER] The authors note that AI scribes can help recruit residents, and a companion paper asks specialty societies for resident-specific guidance because of supervision concerns. [PubMed 41709948] The pre-existing context is that senior family medicine residents spend 3+ hours a day in the EHR after hours. Residents graduate every June and carry their tools to new jobs, which is a built-in annual spread event. Supervision matters too: an attending co-signs a resident's note, so a resident's Chartside note puts it in front of the attending.

**Specialty communities.** Freed and Heidi grew by specialty (behavioral health, family medicine, PT), and Reddit threads are grouped the same way (r/FamilyMedicine, r/PMHNP, r/physicianassistant, r/emergencymedicine). [DeepCura; Twofold] Specialty note templates are the shareable unit, the Notion template-gallery pattern for clinicians.

---

## 3. Social virality among clinicians

What the evidence supports:
- Reddit is where clinicians go for honest reviews. Roundups of 50+ threads across r/medicine, r/FamilyMedicine, r/healthIT, r/PMHNP, and others keep landing on the same picks: Heidi as the free-tier favorite, Freed as the low-cost solo pick, Abridge and DAX as the Epic enterprise defaults, and Twofold as the budget pick. [DeepCura; Twofold] Vendors now write "Reddit reviewed" SEO pages, which shows how much weight those threads carry.
- Freed's growth is tied to clinicians posting about it on TikTok and Instagram, and TikTok has discovery pages for "Freed AI medical scribe," "Plaud AI medical scribe," and "Modernizing Medicine AI scribe." [TikTok discover pages] "Pajama time" (after-hours charting) is the shared pain vendors keep naming. [Suki; Healthcare IT Today]
- A trust headwind: Rolling Stone reports that AI-generated fake "doctor" avatars are flooding TikTok and Instagram, and real physician creators resent it. [Rolling Stone] Content that proves a real, verified clinician is on camera will earn more trust than polished ads.

What I could not verify: I found no primary data on any single viral "note appears in 60 seconds" demo (view counts, attributed signups). The pattern seen across vendor marketing is a before/after split screen: talk to the patient, stop, a structured note appears, then a timestamp showing the chart closed before the patient leaves the room. The reasons it would work follow from sections 1 and 5: it shows time to first value directly, it is short, and it names a shared pain (pajama time). Treat this as a hypothesis to test, not a finding.

---

## 4. Referral incentives and the law

**Anti-Kickback Statute (AKS).** AKS bans offering anything of value to induce or reward referrals of items or services paid for by federal healthcare programs. "Remuneration" is broad and covers free or below-market services. [OIG; Phillips & Cohen] The key question is whether the vendor's product is federally reimbursable, directly or indirectly.
- **Favorable: OIG Advisory Opinion 23-15 (January 2024).** A consulting vendor gave practice customers a $25 gift card per recommendation and $50 more per successful one. OIG found no AKS problem because none of the vendor's services were paid for, directly or indirectly, by a federal program. [Mintz; AHLA]
- **Unfavorable: DOJ EHR settlements.** eClinicalWorks ($155M, 2017) paid customers up to $500 per referred provider who signed, about $144K in total, and DOJ called it a kickback. [Fierce Healthcare; Ropes & Gray] athenahealth ($18.25M, 2021) renamed its "Client Lead Generation" program "Introductions" without changing the substance and kept paying customers by the volume or value of referrals. It also ran luxury "concierge events" and paid competitors for "conversion deals." [DOJ; Healthcare IT News] Those EHRs were tied to federal Meaningful Use incentive payments, so they had a federal nexus. AHLA and Mintz both point out that DOJ's position is in tension with AO 23-15. [AHLA; Mintz]
- **Where Chartside sits.** A scribe is not itself billed to Medicare, but it shapes notes that support federally billed E/M levels, and our roadmap includes coding and revenue-cycle features (see `revenue-cycle-coding.md`). The more Chartside influences billing, the closer it gets to the EHR fact pattern. Conservative position: **no cash for referrals of any kind.** Rewards should be product credit (Freed and Dropbox style), paid equally to both sides, flat (not scaled to the referee's volume or value), capped, and never linked to patient referrals or to which services a clinician orders.

**Stark.** Stark covers physician referrals of *patients* for designated health services (lab, imaging, DME, home health, and so on) payable by Medicare or Medicaid to an entity the physician has a financial relationship with. [StatPearls; ASHA] Recommending software to a colleague is not a DHS referral, so Stark is mostly out of scope. The exception is if a hospital or health-system customer (a DHS entity) provides Chartside free to independent referring physicians. That is the EHR-donation fact pattern, which needs the Stark and AKS EHR and cybersecurity donation exceptions.

**Sunshine Act.** Open Payments reporting applies to manufacturers of drugs, devices, biologics, and supplies with covered products. [CMS; Orrick] A software-only scribe that is not a regulated device would generally not be an "applicable manufacturer," but this needs another look if we add FDA-regulated clinical decision support.

**Incentive types that feel right to clinicians:**
- Free months of product (Freed, Superhuman, Dropbox). This is the lowest-risk option.
- Free CME/CE credit (OpenEvidence). This is valuable and builds habit. Offering CME ourselves requires an ACCME-accredited provider partner, so this is a medium-term option.
- Charity donation per referral, for example to a free clinic. This avoids the transfer of value to the clinician, but it still counts as value that induces referrals if it is large or directed. Keep it small, flat, and to a fixed charity.
- Status and access: verified-clinician badges, early access, a "founding clinician" title (the Superhuman waitlist pattern).

**What feels icky:** cash per referral (Heidi does it, but US clinicians often react badly, and the EHR cases shadow it); paying on volume or value; paying health-system decision makers; luxury events; anything shown to patients as marketing; and anything that looks like a reward for which services a clinician orders.

---

## 5. Metrics

**Time to first value (TTFV).** For a scribe, first value is "a note I would sign, in my EMR, from a real encounter." Users who reach first value within 3 days retain far better than those who take two weeks. [Alexander Jarvis] Chartside's ghost target should be one encounter and under 60 seconds from stopping the recording to a finished note, with no template setup first. That is also the proof point for OpenEvidence-style instant access.

**Aha moment.** The classic magic numbers are Facebook's 7 friends in 10 days and Slack's 2,000 messages (93% retention past that). [June; Mode] Mixpanel warns these numbers are correlations, not causes, and should be confirmed by experiment. [Mixpanel] A reasonable Chartside hypothesis, to check against retention cohorts: **3 notes signed or copied in the first 7 days, with at least one edited by less than 10%.**

**Activation benchmarks.** In Lenny Rachitsky's survey of 500+ companies, average activation is 34% (median 25%). For SaaS alone, the average is 36% (median 30%). [Lenny's Newsletter] Prosumer tools with instant value should aim above that. A target of 40%+ of NPI-verified signups hitting the aha metric within 7 days is ambitious but reasonable for a free-first scribe.

**K-factor.** K = i × c: invites (or exposures) per user times the conversion rate of those invites. K > 1 is self-sustaining, which is rare and usually temporary. K of 0.3 to 0.7 is healthy and still compounds acquisition. [LaunchList; First Round] Cycle time matters as much as K: K = 1.2 with a 3-day cycle doubles every 18 days. [LaunchList] Content and template loops tend to land at 0.4 to 0.7. [Flowjam] A slow B2B comparable: EchoSign needed about 8 months on average for one paid customer to produce another. [Growth Unhinged] Measure K per loop (patient summary, referral letter, template, invite) and separately for patient-to-clinician, where c will be low but i (patients per clinician per week) is very high.

---

## 6. Twelve buildable growth mechanics for Chartside's ghost interface

Each mechanic reuses the existing audio-to-note pipeline (`interface-feasibility.md`). "E2E test" describes an automated test that runs on a laptop with synthetic audio and no real PHI.

**1. Instant NPI claim ("your account already exists").**
How: the recipient enters an NPI, and we pre-fill name, specialty, and location from the public NPPES registry, following the Doximity claim-your-profile and OpenEvidence NPI-gate patterns. The first recording starts without choosing a template, and specialty sets the default.
Effect: raises activation and cuts TTFV. Verification also creates a clean channel of clinicians only.
Compliance: NPPES data is public. Verify identity (email domain or SMS) before showing any PHI.
E2E test: seed a fixture NPPES response, run signup, assert the specialty template is selected and the first note is produced in under 60s from synthetic audio.

**2. Shared-note link for clinicians (the Granola page).**
How: every finished note has "Share with a colleague," which creates an expiring, access-controlled link. The recipient verifies with an NPI plus a one-time code, reads the note, and can ask questions of it. The footer says "Written with Chartside in 41 seconds. Try it on your next patient."
Effect: this is the core clinician-to-clinician loop, with i equal to shares per user per week.
Compliance: it is a disclosure of PHI for treatment, so it needs authentication, audit logs, expiry, and minimum-necessary content. Never make it a public link.
E2E test: create a note, share it, and assert that an unauthenticated GET returns 401, that a verified recipient sees the note, that access is logged, and that the link expires at TTL.

**3. Referral and consult letter generator with a reply slot.**
How: "Send to Dr. Y" turns the encounter into a referral letter and delivers it by Direct secure messaging, fax, or email link. The letter page has "Reply with your consult note," which runs the recipient's own first Chartside recording.
Effect: the recipient's first use happens in a real workflow, so TTFV is close to zero.
Compliance: treatment disclosure. Use secure channels only, and keep the footer attribution modest.
E2E test: generate a letter from a fixture transcript, follow the reply link as a new NPI, record synthetic audio, and assert the consult note is threaded back to the sender.

**4. Patient visit summary by text (patient-to-clinician loop).**
How: after sign-off, the patient gets an 8th-grade-level summary by SMS or email link. The patient page carries neutral attribution ("Prepared with Chartside for Dr. X") and a small "Is your doctor on Chartside?" link that leads to a page where the patient can send their other clinician a pre-written, non-PHI note.
Effect: very high exposure. Conversion per exposure is low, but patients act as advocates.
Compliance: no marketing in the SMS itself, to keep the TCPA treatment exemption. Record the patient's channel preference and the unencrypted-SMS warning. The clinician reviews the summary before sending. The patient-to-doctor forward must contain no PHI.
E2E test: sign a note and assert the SMS body matches the approved template with no promotional text (via a lint rule in CI), that the opt-out works, and that the forward email contains no PHI fields.

**5. Resident-to-attending co-sign route.**
How: a resident's note routes to the attending for co-sign in one tap, by text link or on a web page. The attending sees the note, its source quotes, and the time saved, and can claim a free seat to use for their own notes.
Effect: seeds attendings through trainees. The supervision workflow justifies the exposure.
Compliance: an internal treatment and operations workflow. Follow program policy on AI use by trainees.
E2E test: a resident fixture signs a note, the attending gets a link, co-signs, and the audit trail shows both signatures.

**6. Residency cohort seeding with a June carry-over.**
How: a program-wide free plan for residents, plus a "take Chartside with you" export at graduation that moves templates and settings to a personal account.
Effect: a spread event every year at graduation, and the Doximity 90% pattern.
Compliance: offering a free product to trainees at a teaching hospital is fine when it is unconditional and not tied to the institution's purchasing or referrals. Get counsel if the institution is also a paying customer negotiating a contract.
E2E test: create a cohort, simulate the graduation date, run the export, and assert templates are present in the new account.

**7. Two-sided free-month credits (no cash).**
How: the Freed model. The referee and the referrer each get one month of credit when the referee's first paid month clears. The reward is flat, capped at 12 months a year, and neither cash nor volume-scaled.
Effect: a steady referral rate. Freed's "5 in 30 days = free year" bonus is a good activation-period test.
Compliance: this fits the conservative AKS posture. The terms should say the credits are unrelated to patient referrals or ordering, and should exclude clinicians employed by paying enterprise customers from rewards on their own org's purchase.
E2E test: a referral link leads to signup, a simulated paid month clears, and both ledgers show exactly one credit. A self-referral attempt is rejected.

**8. Specialty template gallery with remix.**
How: clinicians publish their de-identified note templates ("Peds well-child, 4 min"). Others preview them and click "Use this," which requires signup. The author gets attribution and a use count.
Effect: the Notion loop (k of 0.4 to 0.7 per the sources) plus search engine traffic. It also builds specialty communities.
Compliance: templates contain no PHI. Scan published templates for PHI patterns.
E2E test: publish a template, and assert the PHI scanner blocks a template containing a fixture MRN or date of birth. Import as a new user and assert it applies to the next note.

**9. Pajama-time receipt (shareable, non-PHI).**
How: a weekly card showing "You closed 38 charts before leaving clinic. 4.2 hours of pajama time saved," with a share-to-LinkedIn, Instagram, or Doximity button and a verified-clinician mark.
Effect: social proof that uses the pain word clinicians already use. It also counters the fake-doctor trust problem by showing verification.
Compliance: aggregate only, with no patient data, no dates tied to specific encounters, and share only on the user's choice.
E2E test: seed 38 notes, generate the card, and assert the image contains only aggregate fields (snapshot test plus a PHI regex scan on the rendered text).

**10. 60-second demo recorder.**
How: a "Demo mode" that uses a scripted mock patient encounter (no real patient), records the screen as the note appears, and exports a vertical video with a timer overlay for TikTok or Reels.
Effect: lets creator clinicians make the before/after content hypothesized in section 3, without PHI risk.
Compliance: a synthetic encounter only. Watermark it "Simulated patient." FTC endorsement disclosure applies if we compensate creators.
E2E test: run demo mode headless (Playwright), assert the video file is produced, the watermark is present, and no real account data appears.

**11. Colleague invite at the moment of delight.**
How: right after the third signed note (the aha threshold), a single prompt appears: "Who else in your clinic is still charting at night?" Entering contacts sends a one-tap invite that the clinician drafts and sends themselves.
Effect: asks at peak satisfaction, and invites from inside a clinic convert far better than cold ones.
Compliance: the user sends the invite, not us, so there are no unsolicited marketing texts from Chartside. Email only unless the invitee opted in.
E2E test: simulate 3 signed notes, assert the prompt appears exactly once, and assert the invite link attributes the new signup to the inviter.

**12. Free CME for reflective use (medium term).**
How: partner with an accredited CME provider. Point-of-care learning credit for reviewing flagged gaps in one's own notes, the OpenEvidence retention pattern.
Effect: a habit and retention loop, plus a reason to talk about it in CME-hungry groups.
Compliance: an ACCME-accredited partner controls the content. Offer it to all verified users, not only to referrers, so it is not a referral reward.
E2E test: seed notes with a known gap, complete the reflection flow, and assert a credit record is generated with the partner's activity ID (mocked).

### Measuring all twelve

Tag every share link, invite, template import, and patient page with `loop_id` and `inviter_id`. Compute K per loop weekly as exposures per active user times conversion to verified signup. Track TTFV (signup to first finished note) and the 3-notes-in-7-days aha rate as the activation north star. As Loom did, run a weekly virality review. Also keep a CI lint that fails any build where patient-facing SMS templates contain promotional strings.

---

## Sources

- Strategy Breakdowns, Hotmail: https://strategybreakdowns.com/p/hotmails-viral-growth-loop
- Rick Winfield, "PS I Love You": https://medium.com/@rickwin/ps-i-love-you-modeling-viral-growth-part-1-5ae9f8f21425
- Viral Loops, Dropbox: https://viral-loops.com/blog/dropbox-grew-3900-simple-referral-program/
- GrowSurf, Dropbox: https://growsurf.com/blog/dropbox-referral-program/
- Fungies, SaaS viral loops: https://fungies.io/saas-viral-loops-guide/
- StartupSpells, Loom: https://startupspells.com/p/loom-product-led-growth-plg-playbook-b2b-viral-adoption
- Growth Unhinged, product virality: https://www.growthunhinged.com/p/your-guide-to-product-virality
- StartupSpells, Superhuman: https://startupspells.com/p/superhuman-growth-loop-tweet-for-1-free-month-referral-hack
- TechCrunch, Superhuman waitlist: https://techcrunch.com/2020/02/28/superhuman-ceo-rahul-vohra-on-waitlists-freemium-pricing-and-future-products/
- Fishman AF, How Granola grows: https://www.fishmanafnewsletter.com/p/how-granola-ai-grows
- Goitein, Granola: https://michaelgoitein.substack.com/p/granolas-revolutionary-ai-strategy
- VC Corner, Granola: https://www.thevccorner.com/p/granola-growth-playbook-unicorn-2026
- TechCrunch, Granola $1.5B: https://techcrunch.com/2026/03/25/granola-raises-125m-hits-1-5b-valuation-as-it-expands-from-meeting-notetaker-to-enterprise-ai-app/
- SaaS Growth Daily, Zoom: https://saasgrowthdaily.substack.com/p/how-zooms-40-minute-limit-turned
- Flowjam, viral loop examples: https://www.flowjam.com/blog/viral-loop-examples-saas-the-definitive-playbook-for-engineering-self-sustaining-growth
- OpenEvidence $210M round: https://www.prnewswire.com/news-releases/openevidence-the-fastest-growing-application-for-physicians-in-history-announces-dollar210-million-round-at-dollar35-billion-valuation-302505806.html
- OpenEvidence 1M consultations: https://www.prnewswire.com/news-releases/openevidence-achieves-historic-milestone-1-million-clinical-consultations-between-verified-doctors-and-an-artificial-intelligence-system-in-a-single-day-302712459.html
- Fierce Healthcare, OpenEvidence Series D: https://www.fiercehealthcare.com/ai-and-machine-learning/openevidence-clinches-250m-series-d-rapidly-growing-its-reach-doctors
- Fast.io, OpenEvidence review: https://fast.io/resources/open-evidence-ai-review-2026/
- Contrary Research, OpenEvidence: https://research.contrary.com/company/openevidence
- OpenEvidence CE/MOC: https://www.openevidence.com/announcements/openevidence-launches-new-education-platform-offering-continuing-education-ce-and-maintenance-of-certification-moc-credit
- Doximity 70%: https://press.doximity.com/articles/doximity-reaches-70-percent-of-all-us-doctors
- Doximity 50% in three years: https://www.doximity.com/press_releases/announcing_the_largest_physician_network_in_the_us
- Wikipedia, Doximity: https://en.wikipedia.org/wiki/Doximity
- STAT, Doximity free scribe: https://www.statnews.com/2025/07/24/doximity-enters-crowded-ai-scribe-market-with-free-offering/
- Fierce Healthcare, Doximity scribe: https://www.fiercehealthcare.com/ai-and-machine-learning/doximity-jumps-ai-scribe-market-offering-free-tool-doctors
- VentureBeat, Freed 20K clinicians: https://venturebeat.com/ai/freed-says-20000-clinicians-are-using-its-medical-ai-transcription-scribe-but-competition-is-rising-fast
- Aragon Research, Freed: https://aragonresearch.com/freed-commoditization-of-ai-medical-scribes/
- Freed referral program: https://help.getfreed.ai/en/articles/9247591-freed-referral-program
- Heidi referral program: https://www.heidihealth.com/support/en/articles/8849714-referral-program
- Heidi referral T&Cs: https://www.heidihealth.com/en-us/legal/referral-program-terms-and-conditions
- Heidi US$340M: https://finance.yahoo.com/healthcare/articles/heidi-secures-us-340m-scale-130000808.html
- Abridge patient visit summaries: https://www.abridge.com/blog/patient-visit-summaries--now-generated-in-real-time
- Dermatology AVS pilot: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10869927/
- HIPAA Journal, texting: https://www.hipaajournal.com/texting-violation-hipaa/
- Curogram, texting consent: https://curogram.com/blog/patient-texting-consent-hipaa-tcpa-rules
- Manatt, HIPAA and TCPA: https://www.manatt.com/insights/newsletters/health-highlights/healthcare-related%E2%80%9D-calls-ambiguity-at-the-inter
- STFM PRiMER resident pilot: https://journals.stfm.org/primer/2026/anderson-0063/
- AI scribes in residency guidance: https://pubmed.ncbi.nlm.nih.gov/41709948/
- DeepCura, Reddit roundup: https://www.deepcura.com/resources/best-ai-medical-scribe-reddit
- Twofold, Reddit family medicine: https://www.trytwofold.com/blog/reddit-family-medicine-scribe-review
- TikTok, Freed discover page: https://www.tiktok.com/discover/freed-ai-medical-scribe
- Suki, pajama time: https://www.suki.ai/blog/the-doctor-will-see-you-now-and-actually-be-present/
- Healthcare IT Today, Sunoh: https://www.healthcareittoday.com/2026/05/26/sunoh-ais-ambient-ai-scribe-helps-clinicians-spend-less-time-charting-at-night/
- Rolling Stone, AI doctor avatars: https://www.rollingstone.com/culture/culture-features/ai-doctor-videos-tiktok-avatars-internet-safety-1235294841/
- Mintz, OIG AO 23-15: https://www.mintz.com/insights-center/viewpoints/2146/2024-01-05-oig-issues-favorable-advisory-opinion-vendors-offer-gift
- AHLA, OIG vs DOJ: https://www.americanhealthlaw.org/content-library/health-law-weekly/article/081e6e8c-b643-4607-870b-90e2ced84bee/advisory-opinion-highlights-inconsistency-between
- DOJ, athenahealth: https://www.justice.gov/archives/opa/pr/electronic-health-records-technology-vendor-pay-1825-million-resolve-kickback-allegations
- Healthcare IT News, athenahealth: https://www.healthcareitnews.com/news/athenahealth-pay-1825m-alleged-false-claims-act-violations
- Fierce Healthcare, eClinicalWorks: https://www.fiercehealthcare.com/ehr/eclinicalworks-pays-155-million-to-settle-claims-it-falsified-ehr-certification
- Ropes & Gray, eClinicalWorks: https://www.ropesgray.com/en/insights/alerts/2017/06/doj-announces-novel-fca-settlement-with-leading-electronic-health-record-provider-eclinicalworks
- Phillips & Cohen, AKS and Stark: https://www.phillipsandcohen.com/kickbacks/
- OIG safe harbors: https://oig.hhs.gov/compliance/safe-harbor-regulations/
- StatPearls, Stark Law: https://www.ncbi.nlm.nih.gov/sites/books/NBK559074/
- Orrick, Sunshine Act: https://www.orrick.com/en/Insights/2024/12/The-Sunshine-Act-10-Things-to-Know
- Lenny's Newsletter, activation: https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate
- Lenny Rachitsky on X: https://x.com/lennysan/status/1584923800226832384
- Alexander Jarvis, activation: https://www.alexanderjarvis.com/what-is-user-activation-rate-in-saas/
- June, activation playbook: https://www.june.so/blog/activation-playbook
- Mode, Facebook aha: https://mode.com/blog/facebook-aha-moment-simpler-than-you-think/
- Mixpanel, magic numbers: https://mixpanel.com/blog/magic-numbers-are-an-illusion/
- LaunchList, k-factor: https://getlaunchlist.com/blog/viral-coefficient-k-factor-guide
- First Round, k-factor: https://review.firstround.com/glossary/k-factor-virality/
