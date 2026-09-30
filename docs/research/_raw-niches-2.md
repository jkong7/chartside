# Underserved niches for Chartside: where a small, fast team can win

Research date: 2026-09-30. Branch context: `interface/ghost`. All web sources were accessed on 2026-09-30 unless a different date is given. Vendor pages and vendor comparison blogs (Twofold, DeepCura, SPRY, Lime, PawfectNotes, CoVet, HappyDoc) have a commercial interest, so their numbers are treated as claims.

Scope note. This report does not re-propose anything Chartside already has: the full-stack scribe (Deepgram, Claude or offline engine, coding, claims, revenue cycle, SMART on FHIR, orgs and SSO), the specialty packs (behavioral health, psychiatry, oncology, ED, inpatient, nursing), Chartside Line and its SMS commands, `/go`, the iPhone Shortcut, Android share target, Chrome side panel, the swipe-to-sign stack, Ask your chart, NPI instant claim, and the growth footers and referral credits. It also does not re-propose school-based therapy documentation, because Jonathan already built that as a separate product (`~/dev/sessionside`, see `~/dev/reports/Underserved AI niche opportunities.md`, 2026-09-28).

---

## 1. The one idea that shapes the whole ranking

The earlier niche report (2026-09-28) concluded that "every allied-health scribe market the research examined was taken or given away within about 18 months." This pass confirms it. Vet, dental, PT, chiro, home health, EMS and SNF all have funded AI-native scribes **and** a system-of-record vendor that now ships a scribe for free or bundled:

| Niche | Incumbent system that now gives AI notes away | Source |
|---|---|---|
| Vet | Covetrus Pulse scribe free; ezyVet AI notes free in beta; Instinct bought ScribbleVet (2026-01-16) | [Owner Exchange](https://ownerexchange.com/best-veterinary-ai-scribes/), [Instinct](https://instinct.vet/news/instinct-science-scribblevet-acquisition-2026/) |
| Chiro | ChiroTouch Rheo "included at no additional cost" | [DeepCura chiro](https://www.deepcura.com/resources/best-ai-scribe-for-chiropractors) |
| PT | SPRY includes AI scribe in every plan; WebPT sells Keet as add-on | [SPRY pricing](https://www.sprypt.com/blog/2026-pt-emr-pricing-spry-vs-webpt-vs-prompt-vs-raintree) |
| EMS | ESO Auto-Generated Narrative free to all ESO customers; ImageTrend AI Assist free, 2,300+ agencies live | [EMS1](https://www.ems1.com/ems-products/ePCR-Electronic-Patient-Care-Reporting/ai-powered-narratives-return-hours-to-understaffed-crews), [ImageTrend](https://www.imagetrend.com/blog/ai-assist-adoption-ems-documentation/) |
| Home health / hospice | WellSky Scribe (late 2025), HCHB Curate: Scribe (March 2026) | [Lime hospice](https://getlimeai.com/blog/best-ai-documentation-tools-hospice/) |
| SNF | PointClickCare native Ambient Scribe plus MDS Advisor | [IntuitionLabs](https://intuitionlabs.ai/articles/ai-documentation-skilled-nursing-facilities) |
| Primary care generally | Doximity Scribe free for US MDs, NPs, PAs, CRNAs **and students** | [STAT, 2025-07-24](https://www.statnews.com/2025/07/24/doximity-enters-crowded-ai-scribe-market-with-free-offering/), [Doximity support](https://support.doximity.com/hc/en-us/articles/55385851431187-Getting-Started-with-Doximity-Scribe) |

So "a scribe for niche X" is not a wedge any more. What is still open is **format plus niche**: places where the clinician's physical situation makes the app-and-laptop scribe awkward, and where Chartside Line (call a number, set the phone down) is the natural fit. Those places share traits: hands are busy or dirty, the clinician moves between sites or EHRs, signal is poor, or the output is a long formal report instead of a SOAP note.

A second, practical idea: **niches outside HIPAA let the Line launch tonight.** The interface-market report lists "a real Twilio number and BAA" as the gating item. Veterinary medicine, simulated-patient education and most non-US markets do not need a HIPAA BAA, so a real Twilio number can go live without waiting on one, and the text-back can carry actual content instead of a PHI-free link.

---

## 2. Niche-by-niche evaluation

Scoring legend (1 to 5): **Pain**, **WTP** (willingness to pay), **Open** (lack of strong competition for the format we would bring), **Reg** (5 = least regulatory friction), **Viral** (word of mouth), **Transfer** (how much of our stack carries over).

### 2.1 Veterinary (general companion practice)

- **Pain: high.** Relief vets report 2 to 4 hours per shift on medical records (66.2% of 151 respondents, June to August 2025). About 50% of vets report burnout ([dvm360 relief vet study](https://www.dvm360.com/view/burnout-among-relief-veterinarians-grew-by-25-is-the-system-keeping-up-), [Digitail stats](https://digitail.com/blog/10-veterinary-stats-and-findings-2026/)). 133,475 US vets in 2025 ([AVMA](https://www.avma.org/resources-tools/reports-statistics/market-research-statistics-us-veterinarians)).
- **Who pays, how much.** Practice owner or the DVM. ScribbleVet $150/vet/mo annual ($200 monthly); VetRec $99 to $150; Talkatoo $116 to $126; Scribenote free tier, Pro $79 to $99; HappyDoc flat $119 to $149 per clinic; CoVet free support tier, $45.83 to $99; PawfectNotes $59 to $69 with a 50-session free tier ([PawfectNotes comparison](https://pawfectnotes.com/veterinary-ai-scribe-pricing-comparison/), [CoVet pricing](https://co.vet/pricing/), [Scribenote](https://www.scribenote.com/pricing)).
- **Competitors.** Very crowded: ScribbleVet (Instinct), Scribenote ($8.2M seed, a16z, [Axios 2024-09-23](https://www.axios.com/pro/health-tech-deals/2024/09/23/scribenote-8m-ai-scribe-veterinarians)), VetRec (Ethos 140+ hospitals, Bond Vet 55+), CoVet (550% user growth in 2025), Talkatoo, HappyDoc, VetGeni, Covetrus and ezyVet native. Client discharge instructions are now standard ([VetGeni](https://www.vetgeni.com/guides/veterinary-ai-scribe-buyers-guide-2026)).
- **Regulatory friction: lowest of any clinical niche.** No HIPAA. State practice acts still require record retention and client confidentiality, but no BAA and no FDA angle.
- **Viral.** High. ScribbleVet claims 84% of practices adopted within 7 days ([Instinct](https://instinct.vet/products/scribblevet/)). 39.2% of vet professionals already use AI and 91% of users name records as the top use ([Digitail/AAHA survey](https://digitail.com/ai-in-veterinary-medicine-survey/)).
- **Transfer.** High. Note engine, templates, Line, SMS, `/go`, stack, patient-recap footer all carry over. Species and PIMS integrations are new.
- **Scores:** Pain 4, WTP 4, Open 1 (general clinic), Reg 5, Viral 4, Transfer 4.

### 2.2 Veterinary, ambulatory sub-niche (equine, food animal, mixed, mobile house-call)

This is the gap inside the crowded vet market.

- **Pain: very high.** About 8,100 US vets work in food or mixed animal practice (2023), down 15% in a decade while companion vets grew 22%; USDA called the large-animal shortage a national crisis in 2025 ([Horse Illustrated](https://www.horseillustrated.com/the-equine-vet-shortage/), [AVMA rural gap](https://www.avma.org/news/filling-rural-veterinarian-gap)). About 50% of AAEP members run 1 or 2 doctor practices, and 50% of new equine vets leave within five years ([AAEP](https://aaep.org/guidelines-resources/veterinarian-resources/sustainability/aaep-equine-veterinary-sustainability-initiative/)). They work from a truck, in barns, with gloves on, often with weak data signal, and do herd visits where one call covers many animals.
- **Who pays.** The owner-vet directly, same $59 to $150 per month band. Solo, credit-card buyers.
- **Competitors.** CoVet markets offline recording plus equine, large animal and multi-patient templates; Talkatoo pitches dictation for ambulatory work; VetRec has a mobile and relief guide; StableTrack and Equine Practice Company sell equine PIMS ([CoVet via Owner Exchange](https://co.vet/post/veterinary-ai-scribe/), [VetRec mobile](https://vetrec.io/blog/ai-scribes-for-mobile-relief-veterinarians)). "Scribephone" (Scribenote) and "Direct Dial" (ScribbleVet) record **outbound calls to clients**, not a dial-in scribe line ([Scribenote](https://scribenote.com/), [ScribbleVet](https://www.scribblevet.com/)). No one found offers "call a number from the barn, hang up, get the record."
- **Regulatory friction:** minimal (no HIPAA, no BAA, can text real content).
- **Viral.** Tight communities (AAEP, AABP, state VMAs, ambulatory Facebook groups). Every visit ends with a text to the horse owner or barn manager, which is a built-in ad.
- **Transfer.** Very high. The Line, SMS commands, group splitting (`src/lib/engine/group.ts` already splits one recording into per-member notes), templates, recap footers.
- **Scores:** Pain 5, WTP 4, Open 4, Reg 5, Viral 4, Transfer 5.

### 2.3 Dental and orthodontics

- **Pain: medium-high.** Estimated 10 hours/week on documentation, perio charting needs a second person ([Denti.AI](https://www.denti.ai/dental-ai), vendor claim). 43.3% of dentists use AI for at least one task ([ADA HPI](https://www.ada.org/resources/research/health-policy-institute/dental-practice-research/dentists-ai-usage-and-attitudes)).
- **Who pays.** Practice owner or DSO. Denti.AI Scribe $129/user/mo, Voice Perio $199/location, bundle $399; Overjet Voice (acquired DentalBee) custom quote; typical band $99 to $399 ([Denti.AI pricing](https://www.denti.ai/pricing), [Overjet](https://www.overjet.com/blog/overjet-vs-denti-ai), [Twofold dental](https://www.trytwofold.com/blog/best-ai-for-dental-clinical-notes-and-charting-2026)).
- **Competitors.** Bola AI claims 10,000+ dental users, Denti.AI, Overjet, Avora, plus PMS vendors. Writing perio and tooth charts back into Dentrix, Eaglesoft or Open Dental is the moat, and it is not in our stack.
- **Reg:** HIPAA. **Viral:** medium (study clubs). **Transfer:** medium (notes yes, tooth charting and PMS write-back no).
- **Scores:** Pain 4, WTP 4, Open 1, Reg 3, Viral 3, Transfer 2. **Skip.**

### 2.4 EMS and paramedics

- **Pain: high.** ESO customers saved "about 20 minutes per report" with auto-narratives ([EMS1](https://www.ems1.com/ems-products/ePCR-Electronic-Patient-Care-Reporting/ai-powered-narratives-return-hours-to-understaffed-crews)).
- **Who pays.** Agencies, and they already get AI for free in ESO and ImageTrend (1,900+ agencies used AI Assist; 71,000+ transcriptions, 2.2M fields filled) ([ImageTrend](https://www.imagetrend.com/blog/ai-assist-adoption-ems-documentation/)). Individual medic tools are cheap: SmartPCR $0 to $30/mo, Twofold $19, EMS SOAP free trial ([SmartPCR](https://www.smartpcr.app/), [EMS SOAP](https://www.emssoap.com/faq)).
- **Reg:** HIPAA plus NEMSIS data standards, state reporting. Narrative must live in the ePCR for billing and QA.
- **Viral:** high inside crews, but WTP near zero.
- **Transfer:** medium (Line would work in the rig, but the ePCR owns the record).
- **Possible sub-niche:** event medicine, ski patrol, wilderness and expedition medicine, which often run on paper and have no ePCR. Small and hard to monetize.
- **Scores:** Pain 4, WTP 1, Open 1, Reg 3, Viral 4, Transfer 3. **Skip.**

### 2.5 Home health and hospice (field clinicians)

- **Pain: very high and personal.** Per-visit pay is common ($45 to $75 per routine RN visit, $90 to $150 for a start-of-care OASIS). One worked example: 28 visits, 23 hours in homes, 10 driving, 7 charting and calls; the charting hours are effectively unpaid ([Zigbuddy](https://zigbuddy.com/home-health-101/pay-and-productivity/)). OASIS-E2 took effect 2026-04-01; hospice has HOPE.
- **Who pays.** Agencies buy enterprise tools; individual per-visit and PRN clinicians pay out of pocket for helpers like SOAP Note Buddy ($29 to $79, [pricing](https://soapnotebuddy.com/pricing/)).
- **Competitors.** Agency level: Enzo Health ($26M total, Series A 2026-05-04, 40x revenue growth, [Axios](https://www.axios.com/pro/health-tech-deals/2026/05/04/enzo-health-20m-home-health-post-acute-ai)), Lime Health AI (integrates WellSky, MatrixCare, HCHB, Axxess), Olli, WellSky Scribe, HCHB Curate: Scribe ([Lime](https://getlimeai.com/ai-scribes-compared/)). Individual level: SOAP Note Buddy (99 Chrome users per the prior report), Marvix.
- **Reg:** HIPAA; agencies may forbid unapproved tools, so a bottom-up tool is shadow IT. The mitigation is that nothing is written into the agency EMR except what the clinician pastes.
- **Viral:** high in home health and travel therapy Facebook groups and subreddits.
- **Transfer:** high. The Line from the car is the obvious capture. Nursing and PT/OT templates exist (`pt_daily`, `ot_daily`, nursing pack). OASIS item logic is new.
- **Scores:** Pain 5, WTP 3, Open 3 (for individual clinicians), Reg 3, Viral 4, Transfer 4.

### 2.6 PT, OT, SLP (outpatient)

- **Pain:** high (daily notes, Medicare 8-minute rule, plan of care).
- **Who pays:** clinic owner. WebPT about $99/provider, SPRY from $79 with scribe included, Prompt about $289, Raintree $150 to $300 ([SPRY](https://www.sprypt.com/blog/2026-pt-emr-pricing-spry-vs-webpt-vs-prompt-vs-raintree)).
- **Competitors:** "baseline expectation" per the prior report. SOAP Note Buddy, Heidi, Twofold, SPRY, WebPT Keet, Prompt Sidekick.
- **Scores:** Pain 4, WTP 3, Open 1, Reg 3, Viral 3, Transfer 5. **Skip as a wedge** (already covered by our pt/ot templates for general use).

### 2.7 Chiropractic

- **Pain:** compliance is the real pain. 83% of chiro claims historically failed at least one documentation requirement; 2025 improper payment rate just over 30%, 53% of that from insufficient documentation ([OIG](https://oig.hhs.gov/oei/reports/oei-01-14-00200.pdf), [ACA](https://www.acatoday.org/news-publications/aca-focus-on-education-leads-to-lower-medicare-documentation-error-rates-2/)).
- **Who pays:** DC owner. ChiroTouch $139 to $529 with Rheo free; ChiroHD $299; ChiroScribe, Freed, Heidi ([Capterra](https://www.capterra.com/p/48210/ChiroTouch/pricing/)).
- **Viral:** very high (seminar culture, coaching groups).
- **Transfer:** high (MSK exam extraction exists in `exam.ts`).
- **Angle if pursued:** a Medicare PART/AT modifier checker, not a scribe. But 3 to 5 minute visits make ambient capture awkward, and Rheo is free.
- **Scores:** Pain 3, WTP 3, Open 2, Reg 3, Viral 5, Transfer 4.

### 2.8 School-based therapy

Already built as Sessionside. Not re-proposed. One note: the Chartside Line could become Sessionside's capture channel for itinerant therapists who drive between schools.

### 2.9 Nursing homes, SNF, ALF (MDS) and post-acute rounding clinicians

- **Facility side:** PointClickCare holds about 60% share and ships Ambient Scribe and MDS Advisor ([IntuitionLabs](https://intuitionlabs.ai/articles/pointclickcare-ehr-long-term-care)). Enterprise sale. **Skip.**
- **Rounding clinician side (open):** NP-led rounding groups are growing; clinicians see many residents across several buildings and EHRs, "where deep integration may not be realistic" ([Twofold SNF](https://www.trytwofold.com/blog/best-ai-tool-for-skilled-nursing-facilities-notes-and-charting), [ChartPath](https://chartpath.com/blog/ehr-nurse-practitioners-snf-rounding)). The Line fits (call between rooms), and our inpatient and coding stack fits (99307 to 99310).
- **Scores (rounding side):** Pain 4, WTP 4, Open 3, Reg 3, Viral 3, Transfer 5.

### 2.10 Pharmacists

- **Pain:** medium. Test-and-treat is active in 20+ states, but the pharmacy benefit has "no mechanism" to pay for clinical services and medical billing needs payer credentialing ([JUCM](https://www.jucm.com/the-test-and-treat-shift-2026/), [APhA](https://www.pharmacist.com/Blogs/Voices-of-APhA/Article/are-you-ready-billing-under-the-medical-benefit-for-pharmacists-services-is-coming-if-not-already-here)).
- **Who pays:** chains (enterprise) or independents with thin margins. Scribeberry and MedMe sell pharmacy templates ([Scribeberry](https://scribeberry.com/specialties/pharmacy), [MedMe](https://medmehealth.com/assisted-documentation)).
- **Scores:** Pain 3, WTP 2, Open 3, Reg 3, Viral 2, Transfer 3. **Skip.**

### 2.11 Medical students and residents

- **Pain:** high emotional pain around oral case presentations and OSCEs; real notes for residents are covered by Doximity (free, includes students).
- **Who pays:** students personally, cheaply. Geeky Medics Everything bundle $69.99/yr with 900+ AI virtual patients ([Geeky Medics](https://app.geekymedics.com/purchase/bundles/)); MLAbuddy (UK), Neural Consult, CPX-MATE, MedSimAI, Dartmouth AI Patient Actor ([remnote roundup](https://www.remnote.com/blog/best-ai-tools-for-medical-students), [Cornell 2025-03](https://news.cornell.edu/stories/2025/03/medical-students-use-ai-practice-communication-skills)). Evidence: AI OSCE training raised median scores 11.4 vs 10.7, p = 0.02 ([2 Minute Medicine](https://www.2minutemedicine.com/artificial-intelligence-ai-based-clinical-exam-training-significantly-improved-medical-students-standardized-clinical-exam-performance/)).
- **Gap:** every tool above simulates the **patient**. None found simulates the **attending listening to your presentation** over a phone call and grading it against a validated tool like the Patient Presentation Rating tool ([MedEdPORTAL](https://www.mededportal.org/doi/10.15766/mep_2374-8265.9659)).
- **Reg:** none if cases are simulated; FERPA only if sold to schools.
- **Viral:** extremely high (class group chats, 4 years later these are the buyers; residents bring attendings along via co-sign).
- **Transfer:** very high (Line, Claude, Ask agent, stack, share cards).
- **Scores:** Pain 3, WTP 2, Open 4, Reg 5, Viral 5, Transfer 5.

### 2.12 International markets where HIPAA does not apply

| Market | Key facts | Competitors and price | Friction | Verdict |
|---|---|---|---|---|
| **UK NHS** | NHS England AVT supplier registry since 2026-01-16; 19 then 23 suppliers; guidance v3 2026-07-29. MHRA (2026-07-29) says pure transcription and summarising is not a medical device, but registry criteria cite Class I device accreditation plus DTAC | Heidi, Accurx, Tortus, Lyrebird, Dragon, Tandem, Anathem ([HTN 2026-01-19](https://htn.co.uk/2026/01/19/nhs-england-lists-19-suppliers-meeting-criteria-for-ambient-voice-registry/), [HTN 2026-07-29](https://htn.co.uk/2026/07/29/mhra-clarifies-regulatory-medical-devices-status-of-ambient-voice-technologies/), [Digital Health 2026-04](https://www.digitalhealth.net/2026/04/nhse-publishes-fresh-guidance-on-safe-use-of-ambient-scribes/)) | High (DTAC, DCB0129 clinical safety officer, UK GDPR, EMIS/SystmOne integration) | Skip for now |
| **India** | Very high volume, 3 minutes per patient | EkaScribe (own LLM, ABDM), Augnito ₹1,599 to ₹3,999/mo; small clinics need under ₹2,000/mo (about $24) ([Eka](https://www.digitalhealthnews.com/eka-care-launches-india-s-first-ai-medical-scribe-powered-by-its-own-purpose-built-llm-parrotlet-), [Patient Square](https://patientsquare.com/in/blog/augnito-price-vs-ai-scribe-india/)) | DPDP Act; Hinglish and regional languages | WTP too low for us |
| **Brazil** | Voa Health: 20,000 doctors and 600 paying (2025-03), later 60,000+ doctors and 1M consults; freemium 10 uses/mo; CFM Resolution 2.454/2026 governs medical AI | Voa, Prime Care AI, Lya Health, Noa Notes ([Brazil Journal](https://braziljournal.com/a-proxima-consulta-sera-diferente-a-startup-que-leva-a-ai-para-os-medicos/), [Medicina S/A](https://medicinasa.com.br/voa-health-ia/)) | LGPD, CFM rules, Portuguese | B2C proven, but a local leader exists |
| **Mexico, Colombia, Chile (Spanish LatAm)** | 70%+ of Mexican doctors attend patients over WhatsApp (2026-02-27) | Doctoralia Noa Notes €25 to €30/mo, 12,000+ users in EU and LatAm; Luna Salud bundles AI free; Medicynia ([Expansión](https://expansion.mx/tecnologia/2026/02/27/el-70-de-medicos-en-mexico-atiende-por-whatsapp-a-expensas-de-su-descanso), [Noa pricing](https://noa.ai/es-es/precio), [Luna](https://www.lunasalud.mx/blog/mejores-software-para-consultorios-medicos-mexico-2026)) | LFPDPPP (Mexico), NOM-004 clinical record structure; WhatsApp Business allows task bots but Meta banned general chatbots in Jan 2026 | Plausible, our Spanish mode transfers |
| **Southeast Asia** | Medow Health launched in Singapore (Mandarin, Cantonese, Malay, Bahasa); Heidi claims 116 countries ([Computer Weekly](https://www.computerweekly.com/news/366627058/Medow-Health-AI-debuts-AI-scribe-tool-in-Singapore)) | Fragmented languages | Skip |

**Scores (Spanish LatAm):** Pain 4, WTP 2, Open 3, Reg 4, Viral 4, Transfer 4.

### 2.13 Direct primary care (DPC)

- 2,700+ practices (DPC Frontier, Nov 2025) to 3,600+ (Hint, Q1 2025), growing 19%/yr ([Atlas.md blog](https://blog.atlas.md/2025/12/there-are-now-over-2700-dpc-practices-as-the-market-heads-toward-90-billion/)). Tight community (DPC Alliance, Hint Summit).
- Pain is lower (long visits, small panels). Their distinctive documentation is **phone and text encounters** with members. General scribes (Freed $39 to $119, Heidi free) already cover visits.
- **Scores:** Pain 2, WTP 3, Open 2, Reg 3, Viral 5, Transfer 5. A good later channel, not a wedge.

### 2.14 Aesthetics and med spas

- 10,488 med spas (2023) forecast to 11,553 in 2025; average revenue about $1.4M ([AmSpa](https://www.americanmedspa.org/med-spa-statistics/)).
- Charting is structured (product, lot, units per injection site, face map, photos, medical director sign-off). Aesthetic Record ChartSmart AI add-on $30 to $75/mo; Moxie, Prospyr, Zenoti, Boulevard ([Software Finder](https://softwarefinder.com/emr-software/aesthetic-record), [Pabau](https://pabau.com/blog/best-emr-software/)).
- **Viral:** very high (injectors are social media native). **Pain:** medium. **Transfer:** low to medium (photos and face maps are the core, not notes).
- **Scores:** Pain 2, WTP 3, Open 2, Reg 3, Viral 5, Transfer 2.

### 2.15 Occupational health and workers' comp (treating side)

- Every visit needs a state form: CA PR-2 and DWC 5021, TX DWC-073, federal CA-17 and CA-20, CT DAS-208 ([TDI DWC-073](https://www.tdi.texas.gov/forms/dwc/dwc073wkstat.pdf), [DOL CA-20](https://www.reginfo.gov/public/do/DownloadDocument?objectID=108131901)). Causation language determines whether the claim is paid.
- Concentra alone runs 625+ centers and treats 1 in 4 US workplace injuries (Jan 2026) on its own systems ([Concentra](https://www.concentra.com/about-us/)). Independent occ med and urgent care clinics remain. Scribing.io markets causation-gated notes and PR-2 auto-fill ([Scribing.io](https://www.scribing.io/ai-scribe-laws/workers-comp-causation-logic)).
- **Transfer: very high.** `src/lib/engine/documents.ts` already has `work_note` and `return_to_play` with `restrictionsFrom()` and `returnDate()`; `exam.ts` has MSK extraction; `forms.ts` has auto-mapping of fields.
- **Scores:** Pain 4, WTP 4, Open 3, Reg 3, Viral 2, Transfer 5.

### 2.16 Independent medical exams (IME), QME and med-legal reports

- **Money is the story.** Average IME charge $2,890; about 6.5 hours per IME across record review, exam and report; examiners earn about $441/hour; complex cases pass $10,000 ([SEAK](https://seak.com/blog/uncategorized/how-much-does-an-ime-independent-medical-examination-cost/), [Sermo](https://www.sermo.com/resources/independent-medical-examinations/)).
- **Competitors** focus on the **record review** half, mostly sold to insurers and IME vendors: Wisedocs, DigitalOwl, EZ-Medical AI (built by a retired ortho surgeon, sold to solo examiners), MOS, Lezdotech ([Wisedocs](https://www.wisedocs.ai/use-cases/independent-medical-evaluations), [EZ-Medical AI](https://ezmedical.ai/)). No one found turns the **exam conversation plus the record pile** into a report in the examiner's own section structure (history, records reviewed, exam, diagnoses, causation, MMI, impairment rating, apportionment, restrictions, answers to the referral questions).
- **Reg:** HIPAA applies in many IME setups; some states let the examinee record the IME, and some examiners forbid recording, so consent flows matter. Defensibility matters: every sentence must trace to the transcript or a record page.
- **Viral:** low to medium (SEAK conferences, IME listservs), but each user is worth a lot.
- **Transfer:** high (records ingestion in `records.ts` with PDF and C-CDA parsing, MSK exam, letter engine, Claude long-context).
- **Scores:** Pain 4, WTP 5, Open 4, Reg 3, Viral 2, Transfer 4.

### 2.17 Legal and forensic medicine (SANE, child abuse, death investigation)

- Early academic interest only ([PubMed review](https://pubmed.ncbi.nlm.nih.gov/42537563/), [PMC pilot](https://pmc.ncbi.nlm.nih.gov/articles/PMC13499736/)). Recording survivors raises trauma and chain-of-custody problems; outputs are court evidence.
- **Scores:** Pain 4, WTP 2, Open 5, Reg 1, Viral 1, Transfer 2. **Avoid** for a small team.

### 2.18 Others worth noting

- **Locum tenens physicians.** They move between EHRs every few weeks and cannot install tools on each hospital's machine. A Line needs nothing installed. No specific locum-targeted scribe turned up in searches. Good secondary audience for the Line, reached through locum agencies.
- **Street medicine.** Programs in 140+ cities; EHRs are rarely used in the field and teams improvise with REDCap ([SMI](https://www.streetmedicine.org/), [JMIR REDCap](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10806445/)). Mission-driven and very word of mouth, but tiny budgets. A free program would be good PR.
- **Athletic trainers and team physicians.** Sideline evaluations, concussion protocols, return-to-play. We already have `return_to_play` in `documents.ts`. Small but underserved.
- **Optometry.** Newly served by generic tools; exam data is device-heavy. Skip.

---

## 3. Summary table

| Niche | Pain | WTP | Open | Reg | Viral | Transfer | Total /30 |
|---|---|---|---|---|---|---|---|
| **Ambulatory vets (equine, farm, mobile)** | 5 | 4 | 4 | 5 | 4 | 5 | **27** |
| **Med students and residents (presentation practice)** | 3 | 2 | 4 | 5 | 5 | 5 | **24** |
| **Home health and hospice field clinicians (individual)** | 5 | 3 | 3 | 3 | 4 | 4 | **22** |
| **IME, QME and med-legal reports** | 4 | 5 | 4 | 3 | 2 | 4 | **22** |
| Occupational health and workers' comp (treating) | 4 | 4 | 3 | 3 | 2 | 5 | 21 |
| Spanish LatAm (Mexico, Colombia) | 4 | 2 | 3 | 4 | 4 | 4 | 21 |
| SNF and ALF rounding NPs and physicians | 4 | 4 | 3 | 3 | 3 | 5 | 22 |
| Vet, general companion | 4 | 4 | 1 | 5 | 4 | 4 | 22 |
| Chiropractic | 3 | 3 | 2 | 3 | 5 | 4 | 20 |
| DPC | 2 | 3 | 2 | 3 | 5 | 5 | 20 |
| Med spa | 2 | 3 | 2 | 3 | 5 | 2 | 17 |
| Pharmacists | 3 | 2 | 3 | 3 | 2 | 3 | 16 |
| Dental | 4 | 4 | 1 | 3 | 3 | 2 | 17 |
| EMS | 4 | 1 | 1 | 3 | 4 | 3 | 16 |
| Forensic / SANE | 4 | 2 | 5 | 1 | 1 | 2 | 15 |
| UK NHS | 4 | 3 | 1 | 1 | 3 | 4 | 16 |
| India | 4 | 1 | 2 | 3 | 4 | 3 | 17 |

Tie-breaks for the top 5: the ranking below prefers wedges that (a) make the Line uniquely better rather than just another scribe, and (b) can launch without a BAA or enterprise sale. That is why the rounding clinicians and general vet ties drop below, and why IME and occupational health are merged into one "work injury report" wedge.

---

## 4. Top 5 wedges and one-night MVPs

### #1. "Barn Line": the Line for ambulatory, equine and farm vets

**Why it wins.** It is the only niche where every Line advantage is at full strength at once: gloved and dirty hands, a truck instead of an exam room, weak data, one visit covering many animals, and no HIPAA. With no BAA needed, a real Twilio number can go live now, and the text-back can contain the actual record and the owner's instructions instead of a PHI-free link. The general vet market is crowded, but the dial-in format is unclaimed: competitors' "phone" features only record outbound client calls.

**Hypothesis to verify.** A live call streams audio as it goes, so a weak signal degrades the call instead of losing a 20-minute file at upload time; barns and clinics also have landlines. Test on a real rural drive before claiming it publicly.

**One-night MVP.**
1. **Vet mode on the Line.** A `/barn` landing page and a second Twilio number (or an IVR option "press 7 for vet") that sets the org type to veterinary. Consent prompt changes to "This visit for [owner] is being recorded to write the medical record."
2. **Species-aware templates.** Add to `src/lib/engine/templates.ts`: `vet_equine_soap`, `vet_lameness` (grade, limb, flexion, blocks), `vet_herd_visit` (group record plus per-animal lines), `vet_repro` (palpation or ultrasound findings per mare or cow), `vet_dental_float`. Offline engine extracts species, animal ID and name, weight, TPR, drugs with withdrawal times.
3. **Herd split.** Reuse `group.ts`: the vet says "next, cow 214" or "next horse, Biscuit" and the note splits into one record per animal plus a herd summary.
4. **Two texts at hang-up.** To the vet: the full record in the SMS body plus a link to edit. To the owner or barn manager (number spoken or saved): plain-language instructions, meds with times, withdrawal dates, recheck date, "Prepared by Dr. Lee with Chartside." That text is the ad.
5. **Invoice lines.** Reuse the billing engine to list billable items said aloud ("two tubes of Banamine, farm call, sedation") for pasting into the PIMS invoice. Missed charges are a known ambulatory pain.
6. **SMS commands.** `LAST` returns the last record, `HORSE Biscuit` returns that horse's history, `SEND owner` re-sends instructions.

**Magic in the first 60 seconds.** The vet saves "Barn Line" to contacts from a QR at a state VMA booth, calls it, says "Farm call at Miller's, three horses, first one Biscuit, 12-year-old gelding, grade 2 of 5 lameness left fore...", hangs up, and before they are back in the truck the phone buzzes twice: their own finished record, and a confirmation that Mrs. Miller got her instructions.

### #2. "Rounds Line": presentation practice for med students and residents

**Why it wins.** Free, no PHI, no BAA, maximal virality, and it seeds the future buyer base. Every competitor simulates the patient; none plays the attending who listens to your presentation. Doximity already owns free real-patient scribing for students, so we should not fight there.

**One-night MVP.**
1. **A second number, "the attending."** Call, pick a case (IVR: "1 for chest pain, 2 for fever in a toddler, 3 for your own case"), hear a 20-second chart summary, then present for up to 3 minutes. Cases are synthetic so there is no PHI.
2. **Grading.** Claude scores against a published oral presentation rubric (MedEdPORTAL Patient Presentation Rating tool): chief complaint in the first sentence, pertinent positives and negatives, assessment that commits to a leading diagnosis, plan by problem, total time.
3. **The feedback text.** A card link: score out of 10, three timestamped fixes ("0:48, you still had not said why she came in"), and a 30-second model version read back in the attending's voice (TTS) on a callback.
4. **Pimp mode.** After the presentation, the attending asks two follow-up questions by voice and grades the answers, reusing the Ask agent.
5. **Share card.** "I presented to the Chartside attending: 8.5/10" with an image, the invite link, and a class leaderboard per school email domain.
6. **Bridge to paid.** When they reach residency, the same number becomes their real Line (NPI instant claim already exists).

**Magic in the first 60 seconds.** A third-year texted a number by a classmate calls it on the walk to the hospital, presents a case, hangs up, and 20 seconds later gets "7/10. Your assessment was great. You buried the chief complaint. Hear how an attending would say it: tap to get a call back."

### #3. "Car Line": for per-visit home health and hospice clinicians

**Why it wins.** Unpaid charting is the sharpest personal pain in this whole survey, the car between visits is exactly where the Line shines, and enterprise vendors (Enzo, Lime, WellSky, HCHB) sell to agencies, not to the per-visit PT or RN who pays with their own evening. The Chrome side panel already solves pasting into web EMRs like Axxess and WellSky.

**Risks.** Agency policy on unapproved tools; must offer an individual BAA and keep the texts PHI-free as today. Build OASIS assistance only as "suggested item responses with evidence quotes," never auto-scored.

**One-night MVP.**
1. **Visit-type IVR.** "1 routine visit, 2 start of care, 3 recert, 4 discharge, 5 hospice routine, 6 PT or OT visit."
2. **Templates.** `hh_skilled_nursing_visit` (vitals, homebound status statement, skilled need, teaching, response), `hh_pt_visit`, `hospice_routine` (symptom burden, decline indicators for recert support), plus an OASIS-E2 helper that lists GG and M items the dictation touched with the quoted evidence.
3. **Homebound and skilled-need check.** A pre-sign check that flags the two phrases Medicare reviewers look for (homebound reason, skilled need). Mirrors `prebill.ts`.
4. **End-of-day stack.** The swipe-to-sign stack groups the day's visits in route order; the side panel pastes each into the agency EMR fields.
5. **Mileage and time log.** Call timestamps produce a per-visit time log the clinician can use to check their own pay.

**Magic in the first 60 seconds.** Parked outside the patient's house, the nurse calls, talks for 90 seconds, drives off; at the next stop the PHI-free text says "Visit note 2 of 6 ready." At 5 pm the stack shows six finished notes, and the side panel fills the agency EMR while they sit in the driveway.

### #4. "Report Line": IME, QME and workers' comp reports

**Why it wins.** The highest value per user by far ($2,890 average IME, about 6.5 hours of physician time). Competitors attack record review and sell to insurers; the examiner's own report, drafted from the exam conversation plus the record pile, is open. The treating side (PR-2, DWC-073, CA-17 work status forms) reuses the same engine and our existing `work_note`, `restrictionsFrom()` and MSK exam code, so one wedge covers both.

**One-night MVP.**
1. **Upload the file first.** Drag a PDF stack into a new "Case" screen; `records.ts` extracts dated findings into a chronology table with page citations.
2. **Record the exam.** `/go` or the Line, with an IVR consent script that says who requested the exam and that no treatment relationship is formed.
3. **IME report template.** Sections: referral questions, history, records reviewed (auto chronology), exam (MSK extraction), diagnoses, causation, MMI, impairment (placeholder for AMA Guides edition and table, filled by the physician, never guessed), apportionment, work restrictions, answers to each referral question. Every sentence links to its transcript timestamp or record page.
4. **Work-comp forms.** Map the same data into a CA PR-2 PDF and a TX DWC-073 with `forms.ts` auto-mapping and `pdf.ts`.
5. **Defensibility view.** A side-by-side "claims and sources" screen, useful at deposition.

**Magic in the first 60 seconds.** The examiner drops in a 400-page records PDF and sees a clean dated chronology with page numbers before they have finished reading the referral letter.

### #5. "Línea": Spanish-first Line for Mexico and Colombia (and US bilingual clinics)

**Why it wins.** No HIPAA, doctors already practice over their phones (70%+ use WhatsApp with patients), and the Line already has a Spanish mode. The local competition (Noa Notes at €25 to €30, Luna bundled free) is app and extension based, not a phone number. The same build serves US bilingual clinics, which the interface report already flagged.

**Risks.** Low price ceiling (price around US$10 to $15/mo), Meta's January 2026 chatbot policy, LFPDPPP privacy notices, and Mexico's NOM-004 record structure. Payments in pesos. Start with SMS and voice, not WhatsApp.

**One-night MVP.**
1. **A Mexican Twilio number** and a Spanish-only IVR and consent script (aviso de privacidad read aloud, consent logged).
2. **NOM-004 templates.** `nota_evolucion`, `historia_clinica`, `nota_urgencias`, plus a receta (prescription) block with generic name, dose, route, frequency and duration, which Mexican patients need on paper.
3. **Patient summary in plain Spanish** sent as a text or link the doctor can forward to the patient's WhatsApp themselves, with the "Preparado con Chartside" footer.
4. **Pricing page in MXN** with a free tier of 20 notes a month.

**Magic in the first 60 seconds.** A Guadalajara GP calls a local number, sets the phone on the desk, runs a normal consult in Spanish, and has the nota de evolución and a printable receta before the patient reaches the door.

---

## 5. Single strongest recommendation

**Ship Barn Line (#1) first.** It is the only wedge where:
- the Line is clearly better than every existing competitor, not just different;
- the BAA blocker disappears, so a real Twilio number can go live this week;
- the text-back can carry real content, including an owner-facing message that advertises the product at every visit;
- buyers are solo owner-vets who pay $59 to $150 by card and talk to each other at AAEP, AABP and state VMA meetings.

Pair it with Rounds Line (#2) as the free top-of-funnel growth engine, because it needs no BAA either and costs almost nothing to run. Keep Report Line (#4) as the revenue follow-on once the Line has real usage data.

---

## 6. Open questions and gaps

- Test on a real rural drive whether a live call beats record-then-upload apps in weak signal.
- Confirm state veterinary record rules on sending records by SMS (a handful of states have client confidentiality clauses).
- Whether CoVet or Talkatoo add a dial-in number quickly; CoVet is the closest competitor in ambulatory work.
- The count of US physicians doing IMEs and QMEs; SEAK and state QME rosters would have it.
- Whether the Patient Presentation Rating tool's rubric can be used commercially (license check).
- Payment rails and LFPDPPP obligations for a Mexican launch.
