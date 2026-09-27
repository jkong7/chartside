# AI Ambient Clinical Documentation: Market Overview (late September 2026)

Research date: 2026-09-27. Sources are listed inline and in the index at the end. Figures marked "(est.)" come from third-party estimates (Sacra, Menlo, market-research firms, review sites) rather than company disclosures. Where sources disagree, both numbers are given.

---

## 1. Executive summary

- **Ambient scribes are healthcare AI's first breakout category.** Menlo Ventures puts 2025 category revenue at about **$600M, up 2.4x year over year**. About $4.8B of venture money has gone into scribes since 2019, $1.6B of it in 2025. Adoption is now roughly **30-40% of US clinicians overall and 90% at leading systems**. Nearly two-thirds of Epic hospitals had adopted some ambient tool by June 2025.
- **The market is concentrated at the top and crowded underneath.** In 2025, Microsoft/Nuance (33%) and Abridge (30%) held about two-thirds of revenue, followed by Ambience (13%), Suki (10%) and Freed (4%). PitchBook counts 40+ funded competitors, and other estimates run past 100.
- **2026 is the year the EHR platforms entered.** Epic made AI Charting ("Art") generally available on Feb 4, 2026, and it was live at **74 organizations by UGM in August 2026**. athenahealth made athenaAmbient **free** to every athenaOne customer. Oracle's Clinical AI Agent is at more than 300 organizations. Doximity and OpenEvidence give scribes to clinicians for free. The standalone note is turning into a commodity.
- **Prices are falling.** Enterprise list prices ran about $200-600 per clinician per month (Dragon Copilot about $444-600 est., Abridge about $208 est., Ambience about $250-417 est.). Self-serve tools cost $39-149, and EHR-native or ad-supported scribes cost $0. Abridge's April 2026 extension came at a **flat $5.3B valuation**, a sign that growth-stage pricing is cooling.
- **Every serious vendor is repositioning as an "agentic platform".** The new work includes coding and CDI (Abridge pre-bill DRG review in Sept 2026, Ambience AutoCDI, Nabla coding agent, Oracle pro-fee coding), orders (Epic, Oracle, athena), prior auth, nursing flowsheets (Microsoft, Ambience, Suki, Epic), inpatient and ED documentation, and pre-visit synthesis (DeepScribe SmartPrep, Heidi).
- **The evidence is real but modest.** In the largest real-world study (JAMA, April 2026, 8,581 clinicians at 5 academic medical centers), scribes saved about **16 minutes of documentation per 8 clinical hours**, with **no change in after-hours "pajama time"**. The one RCT (NEJM AI, UCLA) found about a 7% improvement in burnout. Only 32% of adopters use the tool in at least half of visits.
- **Liability is growing.** CIPA/ECPA class actions were filed against Sharp (Nov 2025), Sutter and MemorialCare (Apr 2026), all naming Abridge as well. They allege recording without all-party consent and **AI-inserted false consent attestations**. Payers (AHIP) are pushing back on scribe-driven **coding intensity**, and PwC names AI documentation as a driver of a 2027 cost trend of up to 9%. States keep adding disclosure and opt-out laws (RI, ME, IL, CO; AZ effective 2027).

---

## 2. Market size and growth

| Source | Scope | 2025 value | Forecast |
|---|---|---|---|
| Menlo Ventures (Oct 2025) | Ambient scribe vendor revenue (US) | **$600M** (2.4x YoY) | n/a |
| Growth Market Reports | Ambient AI scribe (global) | $1.75B | $13.8B by 2034, 23.9% CAGR |
| Astute Analytica | AI clinical documentation / ambient scribe | $1.2B | 28.8% CAGR 2026-2035 |
| MarketIntelo | Ambient clinical documentation | $3.8B | 19.3% CAGR to 2034 |
| Research and Markets | AI-powered clinical documentation (broad) | $4.01B | $5.16B in 2026 (28.7%) |
| SNS Insider (cited by Fortune) | Ambient clinical intelligence (broadest) | $7.24B | $56.6B by 2035, 22.85% CAGR |

**How to read these numbers.** The Menlo figure of about $600M in 2025 vendor revenue is the most defensible bottom-up number. It roughly matches Abridge at about $100-117M ARR, Microsoft at about 33%, Ambience at $30M+ ARR (mid-2025), Commure/Augmedix, Freed at $20M+, and Heidi reaching $50M ARR by April 2026. A reasonable 2026 run-rate estimate is **$1.0-1.5B** in US+global scribe revenue. Headroom is limited: about 1M US physicians plus about 350k NP/PAs, at $100-250/month blended, gives a US TAM of about $2-4B/yr for outpatient notes. The bigger "agentic" TAM (coding, CDI, RCM, prior auth) is what justifies the valuations. Phycap/Menlo size documentation+RCM IT spend at about $38B and workflow-agent revenue potential at about $155B.

Adoption signals:
- 30-40% of clinicians nationally have access, and about 90% at leading hospitals ([Phycap](https://phycapfund.substack.com/p/the-ai-scribe-market-has-48-billion)).
- Nearly two-thirds of US Epic hospitals had adopted ambient AI by June 2025 (Jan 2026 study cited by [Becker's](https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/health-systems-explore-epics-ai-scribe/)).
- Epic says 85% of its customers are live with some generative AI across Art, Emmie and Penny ([Healthcare Dive](https://www.healthcaredive.com/news/epic-rolls-out-ai-charting-art-notetaking-documentation-scribe/811462/)).
- Switching intent is high. Large systems told Menlo they are about as likely to switch scribe vendors as stay within 3 years, and **67% of outpatient providers expect to switch** ([Menlo via search summary](https://menlovc.com/perspective/2025-the-state-of-ai-in-healthcare/)). **Low lock-in is the defining structural feature of this market.**

---

## 3. Top 10 vendors (final ranking) with justification

I ranked on a blend of five things: revenue/market share, installed clinicians or organizations, KLAS standing, capital and durability, and strategic position against the EHR threat. Relative to the brief I made two changes. **Epic AI Charting moves into the top 10** because of how fast it went from zero to 74 organizations. **Sunoh moves to the "EHR-native tier"** alongside Oracle, athena and Doximity.

| # | Vendor | Why it is here | Key numbers |
|---|---|---|---|
| 1 | **Abridge** | Enterprise share leader among independents. Best in KLAS Ambient AI 2025 **and** 2026. Deepest Epic partnership ("Abridge Inside"). Now moving into revenue cycle. | 300+ US health systems; 100M+ conversations in 2026; ARR ~$100-117M (Sacra est.); $5.3B valuation; ~$800M+ raised incl. $316M Series E extension Apr 2026 (flat valuation). Customers: Kaiser (24,600 physicians), Mayo, Johns Hopkins, Duke, UPMC, Yale, Northwestern, Emory. VA enterprise IDIQ prime awardee (Sept 2026). KLAS 95.1-95.3. |
| 2 | **Microsoft Dragon Copilot** (Nuance DAX + DMO) | Largest revenue share (33% in 2025) thanks to the Dragon installed base. Supplies transcription to Epic's native tool. Positioned as an agentic assistant plus a marketplace. | 100k+ clinicians; 58 languages; nursing flowsheets (Mercy); radiology via PowerScribe; partner apps (Optum, Humata, Regard, Canary). Lowest KLAS score of the six rated (91.6). Price ~$444-600/mo (est.). Lost ground at the VA and to Abridge. |
| 3 | **Epic AI Charting ("Art")** | The platform threat. It is native, has longitudinal chart context, drafts orders, and costs little extra on top of Epic. It has the fastest ramp in the category. | GA Feb 4 2026; live at 74 orgs by Aug 2026 (other reports say 60+); nurses live at 10-11 systems; ED first at FMOL Health; 70 specialties. Epic has 42% of acute hospitals and 55% of beds. Uses Microsoft ambient tech and multiple Azure models. |
| 4 | **Ambience Healthcare** | Top KLAS satisfaction (97.7) and #1 in KLAS Emerging Solutions for clinician experience. Coding-aware documentation (AutoCDI) is its core differentiator. Strong inpatient push. | $1.25B valuation (Jul 2025 Series C, $243M, a16z + Oak HC/FT); ~$349-373M raised; ARR $30M (May 2025, est.); 13% share. Cleveland Clinic, UCSF, John Muir, Memorial Hermann; 200+ specialties; inpatient chart-aware (May 2026); Nursing Suite (Jun 2026). |
| 5 | **Commure (incl. Augmedix)** | Biggest enterprise footprint outside the top two, bundled with RCM. The HCA exclusive is the largest single ambient deployment. EHR-agnostic (60+ EHRs). | $7B valuation (May 2026, $70M from General Catalyst); ~$823M raised; 2024 revenue $104M (whole company). HCA, Tenet, Jefferson, Providence; 40M+ annualized appointments. Acquired Augmedix for $139M. Self-serve scribe from $59-89/mo. |
| 6 | **Suki** | Leader in the mid-market and non-Epic EHRs. athenahealth Preferred Partner (Jan 2026). Early in nursing. | 10% share (2025); ~$168M raised, ~$500M valuation (Oct 2024 Series D); 450+ athena practices and ~500k notes/mo on athena; Suki for Nurses consortium; Epic, Oracle, MEDITECH, athena. KLAS 92.9. |
| 7 | **Nabla** | The only vendor with a statistically significant documentation-time win in an RCT (UCLA, NEJM AI). Low-cost enterprise option, strong on Oracle Cerner, pushing agentic coding. | $70M Series C (Jun 2025), $120M total; 130+ orgs, 85k clinicians, 20M encounters/yr; M Health Fairview, LCMC, Aultman, UToledo; on-device Mac dictation (Jul 2026). KLAS 90.7. |
| 8 | **Heidi Health** | Largest by encounter volume worldwide, with product-led growth (free tier). Now entering the US enterprise market. | $340M (Sept 22 2026: $100M Series C at $900M + $240M General Catalyst CVF); 2.8M visits/week, 190 countries, 110 languages; ARR $1M to $50M in 24 months; Beth Israel Lahey; US CAB. |
| 9 | **DeepScribe** | Highest KLAS score in the category (98.8). The clearest example of specialty-depth defensibility (oncology). | Claims presence at 90% of US community oncology orgs (US Oncology Network, Texas Oncology, FCS, NYCBS); Flatiron partnership; SmartPrep pre-visit (Apr 2026); ~$60M raised; ~$350-500+/mo (est.). |
| 10 | **Freed** | Bottom-up self-serve leader for small practices, and the only major vendor with transparent pricing. | 26k+ clinicians, 1,000+ orgs; $20M+ ARR (Apr 2025); $30M Series A (Sequoia); $39/$79/$119 per month. 4% share. |

**Next tier / watch list:**
- **Oracle Health Clinical AI Agent.** Deployed at 300+ organizations globally and credited with 200k+ hours saved. Adds ambient order drafting (Feb 2026), pro-fee coding (Aug 2026) and the NHS/UK. It is the native default for Oracle's 23% of hospitals ([Oracle](https://www.oracle.com/news/announcement/oracle-health-adds-order-creation-capabilities-to-clinical-ai-agent-2026-02-02/), [HealthSystemCIO](https://healthsystemcio.com/2026/08/20/oracle-health-coding-ai-agent/)).
- **Doximity Scribe.** Free to clinicians. Scribe users grew 10x by July 2026, 150 health systems bought the Clinical AI Suite, and Doximity claims to be top-3 by clinician usage ([Motley Fool transcript](https://www.fool.com/earnings/call-transcripts/2026/08/13/doximity-docs-q1-2027-earnings-call-transcript/)). OpenEvidence Visits is also free to NPI holders.
- **athenaAmbient.** Free for all athenaOne customers from Feb 2026. Drafts orders ([SOAPNoteAI](https://www.soapnoteai.com/soap-note-guides-and-example/athenahealth-ambient-ai-2026/)).
- **Sunoh.ai (eClinicalWorks).** Native to eCW. List price $149-199/mo ([Sunoh](https://sunoh.ai/pricing/)).
- **Knowtex.** VA prime awardee alongside Abridge. Deployed at 79 VA medical centers and 310+ facilities. Cash-flow positive, with 10x revenue growth in 2026 ([GlobeNewswire](https://www.globenewswire.com/news-release/2026/09/25/3369134/0/en/knowtex-the-first-frontier-ai-lab-for-healthcare-named-prime-awardee-on-va-s-nine-figure-ambient-scribe-enterprise-contract.html)).
- **IKS Health.** Best in KLAS 2026 for Virtual Scribing Services, scoring 91.9 (hybrid human+AI).
- **Tali, Playback, Sully and similar.** These are smaller point players (Tali: voice assistant and dictation; Sully: agent "team" for small practices; Playback: early stage). None has disclosed scale that is material to the top 10.
- **Specialty entrants:** Regard (hospitalist/CDI), Corti (ED, EU), plus coding players (CodaMetrix, SmarterDx, Iodine) that scribes now compete with in mid-revenue cycle.

### KLAS summary

| KLAS item | Result |
|---|---|
| Best in KLAS Ambient AI/Speech 2025 & 2026 | **Abridge** ([Abridge PR](https://www.abridge.com/press-release/best-in-klas-2026-press), [KLAS](https://klasresearch.com/best-in-klas-ranking/ambient-speech/2026/487)) |
| Ambient speech scores (validated vendors) | DeepScribe 98.8, Ambience 97.7, Abridge 95.1 (95.3 in 2026 materials), Suki 92.9, Microsoft 91.6, Nabla 90.7 ([TechTarget](https://www.techtarget.com/searchhealthit/news/366627894/Ambient-speech-improves-EHR-satisfaction-KLAS-report-says)) |
| Outcomes reported to KLAS | 10/11 orgs improved EHR experience; 9/11 improved efficiency; 9/12 reduced burnout |
| Emerging Solutions Top 20 | Ambience #1 for clinician experience |
| Virtual scribing 2026 | IKS Health (91.9) |

---

## 4. Funding and valuations (selected, most recent first)

| Company | Round / date | Amount | Valuation | Lead / notable |
|---|---|---|---|---|
| Heidi | Series C + growth, Sept 22 2026 | $100M equity + $240M CVF | $900M (Forbes AU also cites ~$1.26B in AUD terms) | Blackbird; General Catalyst CVF; Point72, Headline |
| Commure | Growth, May 2026 | $70M | $7B | General Catalyst, Sequoia |
| Abridge | Series E extension, Apr 2026 | $316M (reported) | $5.3B (flat) | a16z, Khosla, NVentures, Lightspeed, Bessemer; Eli Lilly strategic |
| Ambience | Series C, Jul 2025 | $243M | $1.25B | Oak HC/FT, a16z; OpenAI Startup Fund, Optum Ventures |
| Abridge | Series E, Jun 2025 | $300M | $5.3B | a16z, Khosla |
| Nabla | Series C, Jun 2025 | $70M | n/d | HV Capital, Highland Europe, DST |
| Freed | Series A, 2025 | $30M | n/d | Sequoia |
| Suki | Series D, Oct 2024 | $70M | ~$500M | Hedosophia |
| Commure / Augmedix | M&A, 2024 | $139M | n/a | |
| Microsoft / Nuance | M&A, 2022 | $19.7B | n/a | |

Category totals: about $4.8B raised since 2019, $1.6B in 2025, and 8 healthcare-AI unicorns in 2025 ([Phycap](https://phycapfund.substack.com/p/the-ai-scribe-market-has-48-billion)). Abridge's CEO expects consolidation within 12-18 months ([Fortune](https://fortune.com/2026/06/11/abridge-operating-system-medicine-nvidia-eli-lilly-artsight/)).

---

## 5. The Epic native-ambient threat and EHR platform dynamics

**Epic's timeline:**
- **August 2025:** AI Charting announced at UGM.
- **February 4, 2026:** General availability.
- **August 2026 (UGM):** Live at 74 organizations, with nurses live at 10-11 systems.
- **Roadmap:** Diagnoses, orders, patient look-alikes, suggested tests, and UpToDate grounding. Also new at UGM: "Agent Factory" (a no-code agent builder), "Ergo" (healthcare intelligence), and real-time prior-auth checks.
- Sources: [STAT](https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/), [Epic](https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/), [Fierce](https://www.fiercehealthcare.com/health-tech/epic-unveils-major-ai-features-ai-charting-microsoft-cosmos-ai-risk-prediction-and-rcm), [Healthcare IT Today UGM](https://www.healthcareittoday.com/2026/08/19/epic-ugm-2026-judy-faulkner-keynote-and-cool-stuff-ahead/), [Advisory Board](https://www.advisory.com/daily-briefing/2026/08/26/epic-ugm-ab-oi-ec).

**Why native wins some deals:**
- No separate contract, security review, or login.
- It can read the whole longitudinal chart and write orders and diagnoses directly.
- Documentation is only one feature of a platform the CIO already pays for.
- CIOs called the launch "a watershed moment" ([Becker's](https://www.beckershospitalreview.com/healthcare-information-technology/ai/a-watershed-moment-cios-react-to-epics-ai-scribe-launch/)). Epic has also ended its startup co-development program.

**Why independents survive (for now):**
- Epic's Showroom still lists about 36 ambient products, and information-blocking rules limit exclusivity ([Health API Guy](https://healthapiguy.substack.com/p/the-scribe-that-launched-a-thousand)).
- Epic still partners with Abridge, for example on its "DAXbient/Abridge Inside" embedded experience.
- Independents differentiate on specialty depth (DeepScribe for oncology), multilingual support (Heidi's 110 languages), change management, KLAS-level clinician satisfaction, and cross-EHR coverage for multi-EHR enterprises and the VA.
- Pricing for Epic AI Charting is still undisclosed. No public case exists of a system ripping out Abridge for Epic with disclosed savings. Systems are running side-by-side pilots ([MedCity](https://medcitynews.com/2026/02/ambient-scribe-ai-startups-epic/)).

**Other platforms:**
- **Oracle:** Clinical AI Agent at 300+ organizations, adding orders and coding.
- **athenahealth:** Made ambient free in 2026 and also partners with Suki.
- **eClinicalWorks:** Sunoh.
- **Microsoft:** Plays both sides. It sells Dragon Copilot and powers Epic's ambient layer.
- **OpenAI:** On Sept 1 2026, ChatGPT for Healthcare gained a **read-only Epic integration** (UCSF, HCA, Cedars-Sinai, MSK, AdventHealth, Stanford Children's). A general-purpose LLM is now next to the chart for pre-visit review and synthesis, which squeezes the "clinical reasoning" layer that scribes want to move into ([TechCrunch](https://techcrunch.com/2026/09/01/chatgpt-health-adds-epic-integration-for-clinicians-to-import-patient-data/), [OpenAI](https://openai.com/index/chatgpt-connects-health-records-and-healthcare-sources/)).

**Strategic read.** For Epic shops, the plain outpatient note is becoming a default EHR feature. Independents are therefore racing to (a) own revenue-bearing workflows such as CDI, coding and pre-bill review, (b) own settings Epic serves less well, such as specialty, multilingual, the VA, and multi-EHR enterprises, and (c) build data moats, such as Abridge's NVIDIA clinical-conversation foundation model and Lilly trial matching.

---

## 6. Pricing compression ($ per clinician per month)

| Tier | Examples | 2024-25 typical | 2026 observed |
|---|---|---|---|
| Legacy enterprise | Dragon Copilot/DAX | $600+ | ~$444-600 (est.) ([Haverin](https://haverin.substack.com/p/microsoft-dragon-copilot-nuance-healthcare-ai)) |
| Enterprise independents | Abridge, Ambience, DeepScribe | $250-500 | Abridge ~$208 (~$2,500/yr est.); Ambience $233-417 ($2.8-5k/yr est.); DeepScribe $350-500+ ([Sacra](https://sacra.com/c/abridge/), [Commure pricing roundup](https://www.commure.com/blog-scribe/scribe-pricing), [Vero](https://www.veroscribe.com/blog/deepscribe-review-2026)) |
| Mid-market | Sunoh, Suki, Nabla | $150-300 | $120-300; Sunoh $149 promo |
| Self-serve | Freed, Commure Scribe, Heidi | $99-149 | Freed $39/$79/$119; Commure $59-89; Heidi freemium ([BERI](https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot)) |
| Free | athenaAmbient, Doximity, OpenEvidence, Heidi free tier | n/a | **$0** |
| EHR-native | Epic AI Charting, Oracle | n/a | Undisclosed; bundled |

**Drivers of the compression:**
- Commodity speech-to-text and LLM costs.
- EHR bundling.
- Ad- or pharma-subsidized free tools (Doximity, OpenEvidence).
- A crowded field of 40-100+ vendors.
- Low switching costs.

**Counter-driver: ROI.** Health systems justify spend on revenue uplift, not just time saved. Riverside Health saw an 11% rise in RVUs on Abridge ("more than pays for" the tool). A UCSF study estimated +$3,044 per physician per year, with no increase in denials ([Healthcare Brew](https://www.healthcare-brew.com/stories/the-benefits-and-hidden-costs-of-ai-scribes)). Pricing power is moving toward whoever can show revenue integrity (coding/CDI) outcomes.

---

## 7. From scribe to "agentic" platform

| Capability | Who has shipped / announced (2025-26) |
|---|---|
| Real-time coding, HCC/ICD-10, E/M | Ambience AutoCDI and coding-aware notes; Nabla proactive coding agent; DeepScribe ICD-10; Oracle pro-fee coding (Aug 2026) |
| Pre-bill CDI / DRG integrity | **Abridge pre-bill review (Sept 14 2026)**, which audits inpatient DRGs and POA against bedside conversation; Reid Health first ([HIT Consultant](https://hitconsultant.net/2026/09/14/abridge-launches-pre-bill-review-cdi-coding-teams-inpatient-claims-drg-integrity/)) |
| Orders from conversation | Epic AI Charting; Oracle Clinical AI Agent (Rx, labs, imaging, referrals, follow-ups); athenaAmbient; Abridge outpatient orders; Heidi order-set prepopulation |
| Prior authorization | Abridge real-time payer prior auth; Epic real-time PA checks; Microsoft marketplace partners (Humata, Optum) |
| Pre-visit chart synthesis | DeepScribe SmartPrep; Ambience AutoPrep; Heidi pre-encounter synthesis; ChatGPT-Epic read-only |
| Patient summaries / AVS / referral letters | Ambience AutoAVS and AutoRefer; Heidi referrals |
| Nursing ambient | Microsoft (flowsheets, LDAs; Mercy); Epic (10-11 systems); Ambience Nursing Suite; Suki for Nurses; Abridge nursing pilots (Mayo) |
| Inpatient / ED | Abridge Inside for Inpatient + ED; Ambience inpatient chart-aware (admission to discharge); Commure/HCA ED + hospitalist; Epic ED (FMOL); Oracle ED/inpatient |
| Clinical decision support | Abridge + NEJM/JAMA evidence; Epic Art + UpToDate; Microsoft Work IQ |
| Radiology | Dragon Copilot + PowerScribe (preview) |
| Clinical trials / life sciences | Abridge + Eli Lilly trial eligibility; NVIDIA foundation model |

Heidi frames its version as "supervised agentic execution" and is excluding the UK/EU at first because of regulation ([HIT Consultant](https://hitconsultant.net/2026/09/22/heidi-secures-340m-series-c-general-catalyst-ai-care-partner-clinical-agents/)). Microsoft repositioned Dragon Copilot as an agentic assistant with an app marketplace at HIMSS 2026 ([HIT Consultant](https://hitconsultant.net/2026/03/05/microsoft-dragon-copilot-himss-2026-agentic-clinical-ai-nurses-radiologists/)).

---

## 8. Evidence on outcomes

| Study | Design | Key findings |
|---|---|---|
| **JAMA, Apr 1 2026 (ACDC: MGB, Emory, UCSF, Yale, UC Davis)** | Real-world, 8,581 ambulatory clinicians (about 1,800 adopters), Jun 2023-Aug 2025; Abridge, DAX, Ambience on Epic | **-16.0 min documentation and -13.4 min total EHR per 8 hrs of patient care**; **no change in after-hours EHR time**; +0.49 visits/week; primary care and female clinicians benefited most; **only 32% used it in at least 50% of visits** ([STAT](https://www.statnews.com/2026/04/01/ai-ambient-scribes-modest-time-savings-clinical-documentation/), [HIT Consultant](https://hitconsultant.net/2026/04/01/jama-ai-scribe-study-ehr-time-savings-burnout-reality-check/), [Telehealth.org](https://telehealth.org/news/large-jama-study-finds-ai-scribes-cut-documentation-time-for-ambulatory-clinicians/)) |
| **NEJM AI RCT (UCLA)** | 238 physicians, 14 specialties, randomized 1:1:1 to DAX / Nabla / control, Nov 2024-Jan 2025 | Nabla cut time per note by 9.5% more than control (significant); DAX not significant; **about 7% improvement in burnout** for both; usage 29.5% (Nabla) and 33.5% (DAX) of visits ([NEJM AI](https://ai.nejm.org/doi/full/10.1056/AIoa2501000), [UCLA](https://www.uclahealth.org/news/release/ucla-study-finds-ai-scribes-may-reduce-documentation-time)) |
| **NEJM Catalyst, Kaiser Permanente** | 7,260 physicians, 2.5M+ encounters, 14 months | About 15,791 hours saved; patients reported more face time; notes rated 4.35/5 on modified PDQI ([NEJM Catalyst](https://catalyst.nejm.org/doi/full/10.1056/CAT.25.0040)) |
| Mass General Brigham | Pre/post | 21.2% lower burnout prevalence after 84 days ([AHA](https://www.aha.org/aha-center-health-innovation-market-scan/2026-04-14-6-health-systems-enhancing-care-delivery-ambient-ai-scribes)) |
| Oracle / Southwest General | Customer report | -18.6% EHR time per patient; -14.15% after-hours; 81,800 notes across 18 specialties ([Oracle](https://www.oracle.com/news/announcement/southwest-general-uses-oracle-health-clinical-ai-agent-to-reduce-documentation-time-2026-04-07/)) |
| Mayo Clin Proc Digital Health | 5 platforms on 14 simulated encounters | **76% of errors were omissions**; medication errors most common; hallucinated test results and adherence commentary; failure to synthesize the verbalized assessment ([Mayo Clin Proc DH](https://www.mcpdigitalhealth.org/article/S2949-7612(25)00099-9/fulltext)) |
| JMIR Med Inform 2026 | Simulated interpreted Spanish/English encounters, 2 vendors | Scribes **propagated interpreter errors** (e.g., q6h documented instead of q4h; an omitted "black stools" question documented as a negative) ([JMIR](https://doi.org/10.2196/88734)) |
| Frontiers Digital Health 2026 | Spanish outpatient, 2.3M uses | Real-world non-English evaluation ([Frontiers](https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1874919/full)) |
| KLAS outcomes | Customer-reported | 9/12 lower burnout; 10/11 better EHR experience |
| Financial | UCSF (Jan 2026); Riverside | +$3,044 per physician per year; +11% RVUs ([Healthcare Brew](https://www.healthcare-brew.com/stories/the-benefits-and-hidden-costs-of-ai-scribes)) |

**Overall read:**
- Burnout and cognitive-load gains are consistent and larger than the time savings.
- Time saved is about 16 minutes per day, not the "hour a day" in marketing.
- Pajama time does not move.
- Benefits concentrate in heavy users, so low sustained utilization is the main lever.
- Some pre/post studies report burnout rising again over time ([PubMed 42285173](https://pubmed.ncbi.nlm.nih.gov/42285173/)).

---

## 9. Common clinician complaints and unsolved gaps

1. **Omissions more than hallucinations.** Most errors are dropped content (76%), especially medications, exam findings and the clinician's verbalized reasoning. Hallucinations are rarer but high-severity: fabricated results and **fabricated consent attestations** (Sharp complaint).
2. **Editing burden.** In one pilot, median word changes were 9% per note and **only 14.9% of notes were signed unedited**. Error rates across four commercial platforms were 16.7-23.3% ([BERI](https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot)). Edit-rationale studies cite speaker misattribution, incomplete exam capture, and over-templated language ([PubMed 42044151](https://pubmed.ncbi.nlm.nih.gov/42044151/)). Clinicians also rewrite hedging language and consumer-to-clinical phrasing ([arXiv 2606.00018](https://arxiv.org/pdf/2606.00018), [arXiv 2603.18327](https://arxiv.org/pdf/2603.18327)).
3. **Verbosity and note bloat.** Longer notes that downstream readers skim. The same completeness also drives coding intensity.
4. **Specialty fit.** Tools are primary-care-centric. Oncology, cardiology, behavioral health, surgery, procedural and ED workflows need specialty templates and longitudinal context (DeepScribe's thesis). athenaAmbient and similar native tools are weaker here.
5. **Trust and verification cost.** The clinician must still read the whole note. Few tools show sentence-level provenance (Abridge's "Linked Evidence" is the exception).
6. **Low sustained use.** Only about 30% of clinicians use scribes in most visits. Habit, visit type (procedures, phone), and workflow fit all matter.
7. **Multilingual and interpreted visits.** Error propagation through interpreters, code-switching (Spanish-English, Mandarin-English per [medRxiv](https://www.medrxiv.org/content/10.64898/2026.05.19.26353603v2.full)), and low-resource languages ([arXiv India](https://arxiv.org/pdf/2609.17355)).
8. **Consent friction.** No standard, provable consent workflow exists, which creates legal exposure (section 10).
9. **Privacy and data use.** Audio sent to vendor servers, human review of recordings, retention periods, and secondary use for model training (the Sharp allegations).
10. **Cost.** $200-600/month is hard to justify for every clinician, which explains the tiered "power-user only" licensing and the pull toward free native tools.
11. **Payer backlash on coding intensity.** AHIP says it adds "billions" in waste. Two 2026 studies project up to $2.3B in added cost industry-wide and about $22M in extra maternity spend. Six-system data show upward E/M shifts of 12-20 points, and up to 80% at one system ([TechTarget](https://www.techtarget.com/revcyclemanagement/feature/How-AI-scribes-are-shifting-coding-intensity-reimbursement), [npj policy brief](https://www.nature.com/articles/s41746-025-02272-z)). Payers answer with downcoding. The AHA disputes the upcoding framing ([AHA](https://www.aha.org/fact-sheets/2026-07-31-fact-sheet-artificial-intelligence-and-coding-intensity)).
12. **Patient-facing gap.** Patients rarely see the transcript or a plain-language, verified summary. There is no easy correction loop for patients, and nothing that addresses the trust the consent lawsuits damaged.
13. **Team-based and non-visit care.** Phone and portal work (Doximity/OpenEvidence dialers only partly cover this), group visits, multi-clinician rounds, and nursing handoffs are still mostly unsolved.

---

## 10. Regulatory and privacy considerations

- **HIPAA.** Vendors act as business associates under BAAs. **A BAA does not satisfy state wiretap law.** HIPAA does not preempt stricter state all-party consent statutes ([BasilAI summary](https://basilai.app/articles/2026-06-05-ambient-ai-scribes-abridge-sutter-memorialcare-sharp-lawsuits-cipa-false-consent.html), [ABA Health Law](https://www.americanbar.org/groups/health_law/news/2026/ambient-ai-scribes-privacy-cybersecurity/)).
- **All-party consent states** (about 11-13 states, including CA, IL, FL, PA, MD, WA, MA). Recording requires every party's consent. Telehealth creates exposure in each state where a patient sits. CIPA carries **$5,000 per violation**.
- **Litigation:**
  - *Saucedo v. Sharp HealthCare* (Nov 2025, San Diego): 100k+ encounters allegedly recorded without consent since Apr 2025; alleges Abridge auto-inserted false consent statements; CIPA/CMIA ([MobiHealthNews](https://www.mobihealthnews.com/news/patient-files-lawsuit-against-sharp-healthcare-ambient-ai-use), [KPBS](https://www.kpbs.org/news/health/2025/12/11/lawsuit-claims-sharp-healthcare-secretly-recorded-exam-room-conversations-without-patient-consent), [Medscape](https://www.medscape.com/viewarticle/health-system-sued-over-ai-scribe-technology-patient-consent-2026a10001k7)).
  - *Sutter Health + Abridge* and *MemorialCare + Abridge* (Apr 2026, N.D. Cal.): CIPA/ECPA/CMIA; seeking a nationwide class.
  - An Illinois suit has also been reported ([Fisher Phillips](https://www.fisherphillips.com/en/news-insights/new-class-action-targets-healthcare-ai-recordings.html)).
- **2026 state laws:**
  - **Rhode Island** (June 2026): ambient AI disclosure plus patient opt-out.
  - **Maine HB 2082**: consent for ambient listening in mental health; no AI for therapeutic communications.
  - **Illinois**: strictest limits on AI in therapy.
  - **Colorado AI Act**: covers AI scribe requirements.
  - **Arizona**: behavioral health informed consent, effective Jan 1 2027.
  - **Louisiana**: disclosure requirement (watered down from consent).
  - **Florida**: SB 482 died, but Florida is already an all-party state.
  - Sources: [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/05/states-continue-efforts-to-regulate-ai-in-healthcare), [Encrypted Chart](https://encryptedchart.com/four-states-ai-scribe-opt-out), [Thyra](https://thyrahealth.com/blog/2026/09/ai-scribe-recording-patient-consent-guide/).
- **Emerging consent best practice.** Name the vendor, the retention period, and who can access recordings. Offer a clear opt-out. Capture **verifiable** consent, not an LLM-generated attestation.
- **FDA/SaMD.** Pure documentation is generally not a device. Agentic features that suggest diagnoses or orders push toward CDS/SaMD territory. Heidi is deferring agentic features in the UK/EU for regulatory reasons, and Heidi and others are preparing regulatory submissions.
- **Payer and program integrity.** Scrutiny of coding intensity (AHIP, MedPAC, risk-adjustment recalibration) will require audit trails that link each billed element to evidence in the conversation.
- **Cybersecurity.** Audio and transcripts are a new PHI class with large blast radius. Epic joined Anthropic's Project Glasswing cybersecurity initiative (UGM 2026).

---

## 11. Gaps / whitespace no vendor has nailed yet

These are concrete feature ideas, each tied to a documented pain point above.

1. **Provable consent ledger.** Capture patient consent as a signed, timestamped artifact before the mic arms: a spoken consent clip plus a patient tap on their own phone or kiosk. Make it state-aware (all-party states, behavioral-health rules, telehealth patient location). Never let the LLM write the consent line. Offer per-segment "pause/redact" for sensitive topics. *(Answers the Sharp/Sutter/MemorialCare suits and RI/ME/IL/CO laws.)*
2. **Omission detector / "what did I miss" diff.** 76% of errors are omissions. Run a second pass that checks the transcript for every medication, dose change, symptom negative, and verbalized assessment, and flags anything absent from the note. The clinician then reviews 3 flags instead of 400 words.
3. **Sentence-level provenance by default, with a confidence heatmap.** Every note sentence links to its audio or chart source. Uncited content (a likely hallucination) is visually marked, and unsupported "boilerplate" text is blocked. This cuts verification time, and verification is the real editing burden.
4. **Personal style learning that measurably reduces edits.** Learn from each clinician's edit diffs (length, hedging, section order, phrasing). Show a "your unedited-sign rate" metric that should rise from about 15% toward 50%+. Include a length and verbosity dial with a "concise note" mode to fight note bloat.
5. **Coding-defensibility layer (payer-proof audit trail).** For each E/M level, HCC or DRG, show the exact conversation evidence and MDM elements. Include an "undercode/overcode risk" meter and a payer-audit export packet. This turns the coding-intensity backlash into a feature for both providers and payers.
6. **Interpreter-aware, code-switching scribe.** Detect the three-party interpreted visit, transcribe both languages, and flag discrepancies between source and interpreted speech (the q4h vs q6h case). Generate the patient summary in the patient's language.
7. **Patient-facing verified summary and correction loop.** After the visit, the patient gets a plain-language summary in their language, plus the option to view the transcript and flag "that's not what I said". Corrections route back to the clinician's inbox. This builds trust after the lawsuits and doubles as a patient-reported accuracy signal.
8. **Utilization coach.** Only 32% of adopters are heavy users, and they capture 2-3x the benefit. Add in-product nudges, visit-type suggestions (it works for your follow-ups but you skip it for new patients), and per-clinician ROI dashboards. Adoption, not model quality, is now the bottleneck.
9. **Pajama-time killer: inbox and phone/portal ambient.** Scribes have not moved after-hours time. Extend drafting to patient portal messages, phone calls, results notes, and refill requests, using the same provenance model.
10. **Specialty packs built with specialty societies.** Deep templates, longitudinal context, and scoring for undeserved areas: behavioral health (with consent and minimum-necessary defaults), surgery and procedures (op notes from dictation plus the device log), pediatrics (parent/child speakers), OB, dermatology (photo + audio).
11. **Team and multi-speaker settings.** Inpatient rounds with 4-6 speakers, nursing handoff (SBAR auto-drafted from shift audio plus flowsheets), and group visits. Speaker diarization with role attribution is a documented failure point.
12. **EHR-agnostic "bring your own scribe" for small multi-EHR groups.** Native tools lock you in (athenaAmbient only works on athena). Offer a universal write-back layer (FHIR plus browser automation) for practices on long-tail EHRs.
13. **On-device / zero-retention mode.** Local transcription (Nabla's on-device Mac dictation points this way), with audio never leaving the device and a published retention of 0 days. This is a privacy selling point in two-party-consent states and for behavioral health.
14. **Quality benchmark transparency.** No vendor publishes independent, reproducible accuracy numbers by specialty and language. A public scorecard (omission rate, hallucination rate, med-error rate) would differentiate, much as KLAS scores do today but for quality.
15. **Closed-loop orders with safety checks.** Epic, Oracle and athena draft orders. Add verification against allergies, renal dosing, and duplicate orders, plus a "you said it but didn't order it" reconciliation at sign time.
16. **Cost model innovation.** Per-encounter or outcome-based pricing (tied to documented RVU uplift or denials avoided) instead of $200-600 per seat. That fits the low sustained-utilization reality and competes with $0 native tools.

---

## Source index

Market and landscape
- Menlo Ventures, 2025 State of AI in Healthcare: https://menlovc.com/perspective/2025-the-state-of-ai-in-healthcare/
- Phycap, "The AI Scribe Market Has $4.8B in Funding": https://phycapfund.substack.com/p/the-ai-scribe-market-has-48-billion
- Haverin, Dragon Copilot vs Nuance share: https://haverin.substack.com/p/microsoft-dragon-copilot-nuance-healthcare-ai
- Becker's, ambient AI scribes by market share: https://www.beckershospitalreview.com/healthcare-information-technology/ai/ambient-ai-scribes-by-market-share/
- Growth Market Reports: https://growthmarketreports.com/report/ambient-ai-scribe-market
- Astute Analytica: https://www.astuteanalytica.com/industry-report/ai-clinical-documentation-ambient-scribe-market
- Research and Markets: https://www.researchandmarkets.com/reports/6226000/ai-powered-clinical-documentation-market-report
- SNS Insider: https://www.snsinsider.com/reports/ambient-clinical-intelligence-market-9747
- MarketIntelo: https://marketintelo.com/report/ambient-clinical-documentation-market
- PitchBook Q4 2025 AI scribes note: https://files.pitchbook.com/website/files/pdf/Q4_2025_PitchBook_Analyst_Note_Healthtech_AI_Scribes_20233.pdf
- MedCity News, startups after Epic: https://medcitynews.com/2026/02/ambient-scribe-ai-startups-epic/
- BERI, "Save 16 minutes a day, not an hour": https://www.beri.net/article/best-ambient-ai-scribes-health-systems-abridge-epic-ai-charting-dragon-copilot

KLAS
- KLAS 2026 Best in KLAS Ambient Speech: https://klasresearch.com/best-in-klas-ranking/ambient-speech/2026/487
- Becker's Best in KLAS 2026: https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/best-in-klas-2026-whos-winning-in-ambient-ai-ehrs-revenue-cycle-and-more/
- TechTarget KLAS ambient speech: https://www.techtarget.com/searchhealthit/news/366627894/Ambient-speech-improves-EHR-satisfaction-KLAS-report-says
- Abridge Best in KLAS 2026 PR: https://www.abridge.com/press-release/best-in-klas-2026-press
- Ambience KLAS Emerging Solutions: https://www.ambiencehealthcare.com/blog/klas-emerging-solutions-report-ambience-healthcare-ranked-1-in-improving-clinician-experience-top-3-in-both-improving-patient-experience-and-improving-outcomes

Vendors and funding
- Abridge Series E: https://www.abridge.com/blog/series-e
- Abridge Sacra: https://sacra.com/c/abridge/
- Abridge extension report: https://techjacksolutions.com/ai-brief/abridge-closes-reported-316m-series-e-extension-at-53b-valua/
- Fortune on Abridge (Jun 2026): https://fortune.com/2026/06/11/abridge-operating-system-medicine-nvidia-eli-lilly-artsight/
- Abridge pre-bill review (Sept 2026): https://hitconsultant.net/2026/09/14/abridge-launches-pre-bill-review-cdi-coding-teams-inpatient-claims-drg-integrity/
- VA enterprise contract (Nextgov): https://www.nextgov.com/artificial-intelligence/2026/09/va-selects-abridge-ambient-scribe-under-new-enterprise-contract/416140/
- Knowtex VA award: https://www.globenewswire.com/news-release/2026/09/25/3369134/0/en/knowtex-the-first-frontier-ai-lab-for-healthcare-named-prime-awardee-on-va-s-nine-figure-ambient-scribe-enterprise-contract.html
- Ambience Series C (Fierce): https://www.fiercehealthcare.com/health-tech/ambience-banks-243m-series-c-investors-continue-bet-big-ambient-ai
- Ambience Sacra: https://sacra.com/c/ambience/
- Ambience inpatient (May 2026): https://www.bio-itworld.com/news/2026/06/01/ambience-healthcare-expands-chart-aware-intelligence-to-full-inpatient-workflow
- Ambience roadmap (Apr 2026): https://www.businesswire.com/news/home/20260416069427/en/Ambience-Healthcare-Unveils-Platform-Roadmap-to-Rebuild-Healthcare-with-AI
- Microsoft Dragon Copilot HIMSS 2026: https://hitconsultant.net/2026/03/05/microsoft-dragon-copilot-himss-2026-agentic-clinical-ai-nurses-radiologists/
- Microsoft blog HIMSS 2026: https://www.microsoft.com/en-us/microsoft-cloud/blog/healthcare/2026/03/05/unify-simplify-scale-microsoft-dragon-copilot-meets-the-moment-at-himss-2026/
- Commure Sacra: https://sacra.com/c/commure/
- Commure/HCA: https://www.commure.com/press-releases/hca-and-commure-announce-largest-ai-deployment-in-healthcare
- Augmedix acquisition: https://www.healthcareitnews.com/news/augmedix-acquired-commure-139m
- Suki athenahealth partner: https://www.businesswire.com/news/home/20260126365722/en/Suki-Selected-by-athenahealth-as-Preferred-Solution-Partner-for-Ambient-Intelligence
- Suki Sacra: https://sacra.com/c/suki/
- Nabla Series C: https://www.prnewswire.com/news-releases/nabla-raises-70m-series-c-to-deliver-agentic-ai-to-the-heart-of-clinical-workflows-bringing-total-funding-to-120m-302483646.html
- Nabla press (2026 deals): https://www.nabla.com/press
- Heidi $340M (HIT Consultant): https://hitconsultant.net/2026/09/22/heidi-secures-340m-series-c-general-catalyst-ai-care-partner-clinical-agents/
- Heidi (Forbes AU): https://www.forbes.com.au/news/entrepreneurs/heidi-hits-1-2-billion-valuation-with-470-million-in-fresh-funding/
- Heidi US CAB: https://www.businesswire.com/news/home/20260729378382/en/Heidi-Launches-U.S.-Customer-Advisory-Board-to-Put-Frontline-Clinicians-at-the-Center-of-AI-Development
- DeepScribe SmartPrep: https://www.prnewswire.com/news-releases/deepscribe-introduces-smartprep-comprehensive-pre-visit-intelligence-for-oncology-302753452.html
- Freed (VentureBeat): https://venturebeat.com/ai/freed-says-20000-clinicians-are-using-its-medical-ai-transcription-scribe-but-competition-is-rising-fast
- Freed Sacra: https://sacra.com/c/freed/
- Sunoh pricing: https://sunoh.ai/pricing/
- Doximity Q1 FY27 call: https://www.fool.com/earnings/call-transcripts/2026/08/13/doximity-docs-q1-2027-earnings-call-transcript/
- Doximity free scribe (STAT): https://www.statnews.com/2025/07/24/doximity-enters-crowded-ai-scribe-market-with-free-offering/
- Oracle order creation: https://www.oracle.com/news/announcement/oracle-health-adds-order-creation-capabilities-to-clinical-ai-agent-2026-02-02/
- Oracle coding agent: https://healthsystemcio.com/2026/08/20/oracle-health-coding-ai-agent/
- Oracle Southwest General: https://www.oracle.com/news/announcement/southwest-general-uses-oracle-health-clinical-ai-agent-to-reduce-documentation-time-2026-04-07/
- athenaAmbient: https://www.soapnoteai.com/soap-note-guides-and-example/athenahealth-ambient-ai-2026/ ; https://www.athenahealth.com/solutions/ambient-notes

Epic and platforms
- STAT on Epic AI Charting: https://www.statnews.com/2026/02/04/epic-ai-charting-ambient-scribe-abridge-microsoft/
- Epic post: https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/
- Fierce, Epic AI Charting with Microsoft: https://www.fiercehealthcare.com/health-tech/epic-unveils-major-ai-features-ai-charting-microsoft-cosmos-ai-risk-prediction-and-rcm
- Healthcare Dive: https://www.healthcaredive.com/news/epic-rolls-out-ai-charting-art-notetaking-documentation-scribe/811462/
- Health API Guy: https://healthapiguy.substack.com/p/the-scribe-that-launched-a-thousand
- HIT Consultant platform squeeze: https://hitconsultant.net/2026/02/05/epic-releases-ai-charting-ambient-ai-market-implications/
- Healthcare IT Today UGM 2026: https://www.healthcareittoday.com/2026/08/19/epic-ugm-2026-judy-faulkner-keynote-and-cool-stuff-ahead/
- Advisory Board UGM 2026: https://www.advisory.com/daily-briefing/2026/08/26/epic-ugm-ab-oi-ec
- Becker's CIO reactions: https://www.beckershospitalreview.com/healthcare-information-technology/ai/a-watershed-moment-cios-react-to-epics-ai-scribe-launch/
- Becker's health systems explore Epic scribe: https://www.beckershospitalreview.com/healthcare-information-technology/ehrs/health-systems-explore-epics-ai-scribe/
- OpenAI ChatGPT + Epic (TechCrunch): https://techcrunch.com/2026/09/01/chatgpt-health-adds-epic-integration-for-clinicians-to-import-patient-data/
- OpenAI announcement: https://openai.com/index/chatgpt-connects-health-records-and-healthcare-sources/

Pricing
- Commure pricing roundup: https://www.commure.com/blog-scribe/scribe-pricing
- Freed cost guide: https://www.getfreed.ai/resources/cost-of-ai-scribes
- DeepScribe review (Vero): https://www.veroscribe.com/blog/deepscribe-review-2026

Outcomes evidence
- JAMA ACDC study coverage (STAT): https://www.statnews.com/2026/04/01/ai-ambient-scribes-modest-time-savings-clinical-documentation/
- HIT Consultant JAMA: https://hitconsultant.net/2026/04/01/jama-ai-scribe-study-ehr-time-savings-burnout-reality-check/
- Telehealth.org JAMA: https://telehealth.org/news/large-jama-study-finds-ai-scribes-cut-documentation-time-for-ambulatory-clinicians/
- NEJM AI RCT: https://ai.nejm.org/doi/full/10.1056/AIoa2501000
- UCLA release: https://www.uclahealth.org/news/release/ucla-study-finds-ai-scribes-may-reduce-documentation-time
- NEJM Catalyst Kaiser: https://catalyst.nejm.org/doi/full/10.1056/CAT.25.0040
- AHA market scan: https://www.aha.org/aha-center-health-innovation-market-scan/2026-04-14-6-health-systems-enhancing-care-delivery-ambient-ai-scribes
- Mayo Clin Proc DH simulated eval: https://www.mcpdigitalhealth.org/article/S2949-7612(25)00099-9/fulltext
- JMIR interpreter errors: https://doi.org/10.2196/88734
- Mixed-language medRxiv: https://www.medrxiv.org/content/10.64898/2026.05.19.26353603v2.full
- Spanish 2.3M uses (Frontiers): https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2026.1874919/full
- Edit rationale study: https://pubmed.ncbi.nlm.nih.gov/42044151/
- Burnout trend study: https://pubmed.ncbi.nlm.nih.gov/42285173/
- Hedging edits (arXiv): https://arxiv.org/pdf/2606.00018
- India multilingual (arXiv): https://arxiv.org/pdf/2609.17355
- npj barriers to scaling: https://www.nature.com/articles/s41746-026-02554-0

Coding intensity
- Healthcare Brew: https://www.healthcare-brew.com/stories/the-benefits-and-hidden-costs-of-ai-scribes
- AHA fact sheet: https://www.aha.org/fact-sheets/2026-07-31-fact-sheet-artificial-intelligence-and-coding-intensity
- TechTarget: https://www.techtarget.com/revcyclemanagement/feature/How-AI-scribes-are-shifting-coding-intensity-reimbursement
- npj policy brief: https://www.nature.com/articles/s41746-025-02272-z

Regulation and legal
- MobiHealthNews Sharp suit: https://www.mobihealthnews.com/news/patient-files-lawsuit-against-sharp-healthcare-ambient-ai-use
- KPBS Sharp: https://www.kpbs.org/news/health/2025/12/11/lawsuit-claims-sharp-healthcare-secretly-recorded-exam-room-conversations-without-patient-consent
- Medscape: https://www.medscape.com/viewarticle/health-system-sued-over-ai-scribe-technology-patient-consent-2026a10001k7
- Fisher Phillips: https://www.fisherphillips.com/en/news-insights/new-class-action-targets-healthcare-ai-recordings.html
- Lawsuit wave summary (Sharp/Sutter/MemorialCare): https://basilai.app/articles/2026-06-05-ambient-ai-scribes-abridge-sutter-memorialcare-sharp-lawsuits-cipa-false-consent.html
- ABA Health Law: https://www.americanbar.org/groups/health_law/news/2026/ambient-ai-scribes-privacy-cybersecurity/
- Holland & Knight 2026 state laws: https://www.hklaw.com/en/insights/publications/2026/05/states-continue-efforts-to-regulate-ai-in-healthcare
- Four states opt-out: https://encryptedchart.com/four-states-ai-scribe-opt-out
- Thyra consent guide: https://thyrahealth.com/blog/2026/09/ai-scribe-recording-patient-consent-guide/

### Caveats
- STAT, Becker's, NEJM AI, PMC and ABA pages were paywalled or blocked for direct fetch. Their facts here come from search-result summaries and secondary coverage.
- Private-company revenue and pricing figures (Sacra, review sites) are estimates.
- The Abridge April 2026 extension is "reported" via secondary sources, not a primary company announcement.
- Heidi's valuation is reported as $900M USD. Forbes AU's ~$1.26B figure appears to be in AUD.
- Epic AI Charting adoption counts differ by source (60+ vs 74 organizations).
