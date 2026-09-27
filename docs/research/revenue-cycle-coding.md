# Coding and the revenue cycle across the top ten ambient scribes

Research date: 2026-09-27. The sources are public: vendor pages, press releases, support docs, and trade press. Every number below is the vendor's own claim, and none has been independently audited.

## What each vendor ships

| Vendor | ICD-10 / specificity | HCC (V28 / MEAT) | E/M | CPT / HCPCS | Modifiers / G2211 | Charge capture | Pre-bill edits / denials | Prior auth | Evidence link |
|---|---|---|---|---|---|---|---|---|---|
| Abridge | Yes / yes | V28 with MEAT | Yes | Not found | Not found | Not found | Inpatient DRG/POA pre-bill review (Sept 2026) | Real time with Highmark and Availity | Linked Evidence to transcript and audio |
| Dragon Copilot | Yes / proactive prompts | Model version not stated | Prompted, with explanation | Prompted | Not found | Through partners | Through partners | Through partners | Explanations only |
| Epic Art + Penny | Yes | Risk-adjustment assistant | Level of service | Penny | Not found | Native charge review | Penny (Epic claims 20% fewer coding denials) | Yes | Evidence highlights for coders |
| Ambience | Yes / inpatient CDI | HCC compliance validator | Yes (90 to 99% claimed) | Includes HCPCS add-on codes | Modifier 25 advisor / G2211 not found | Analytics | Continuous AAPC-rule audit | Not found | Rationale plus references |
| Commure | Yes | MEAT stated | Yes | Yes | Yes / G2211 not found | Documented-vs-billed reconciliation | NCCI/MUE engines, payer-policy scraping, denial prediction | Yes | Links to the note |
| Suki | Yes | Mapped | athenaOne only | Yes | Not found | Not found | Not found | Not found | E/M explanations |
| Nabla | Yes | Unverified | Yes | Unverified | Not found | Not found | Not found | Not found | Not found |
| Heidi | Yes | Unclear | Unclear | US CPT | Not found | Not found | Not found | Not found | Note span that triggered the code |
| DeepScribe | Yes / yes | MEAT per HCC, suspect list | Yes | Not found | Not found | Not found | Not found | Not found | MEAT view |
| Freed | Yes | Not found | "Highest possible" level (compliance risk) | Yes | Not found | Not found | Documentation "strengthening" | Not found | Clarifying questions |

## Best in class, combined

1. **Evidence on every code.** Each code and each MEAT element links to the note span, the transcript line, and the audio timestamp.
2. **The full professional code set at the point of care**, with explicit code-set versions:
   - ICD-10-CM with specificity prompts
   - CMS-HCC V28
   - E/M by MDM or by time, with a rationale
   - CPT/HCPCS, add-on codes, and modifier advisors
3. **Writeback:** diagnoses go to the problem list, orders go to diagnosis pointers, and the level of service goes to the charge.
4. **Downstream closure:**
   - reconciliation of what was documented against what was billed
   - NCCI, MUE, and payer edits
   - denial prediction
   - a coder review queue
5. **Payer requirements during the conversation**, including prior authorization.
6. **Continuous compliance auditing and analytics by clinician.**

## Gaps no vendor fills

- **Independent accuracy validation.** Every figure is self-reported, with no auditor, sample size, or false-positive rate.
- **Code-set provenance.** No vendor publicly names its CPT license or content source. Only Commure states an update cadence.
- **G2211.** No vendor claims support for it.
- **LCD/NCD medical necessity at the point of order**, with diagnosis-linked orders.
- **Balanced audits.** Vendors publicize lift but never report downcoding alongside upcoding.
- **Coder queues.** Only Epic Penny and Commure reach the coder desk.

## What buyers need to trust it

- **CFO:**
  - net revenue per encounter against a control
  - first-pass yield
  - denial rate
  - charge lag
- **Compliance:**
  - clinician attestation of every code
  - guideline citations
  - E/M distribution against benchmarks
  - no leading documentation prompts
  - evidence retention
- **Coders:**
  - clickable evidence
  - confidence routing
  - a version stamp on the code set
  - payer-specific edits
  - AHIMA/ACDIS-compliant queries

## Sources

- Abridge
  - https://www.abridge.com/platform/revenue-cycle
  - https://www.abridge.com/blog/series-e
  - https://hitconsultant.net/2026/09/14/abridge-launches-pre-bill-review-cdi-coding-teams-inpatient-claims-drg-integrity/
  - https://support.abridge.com/hc/en-us/articles/30235128433811-Verify-a-Note-With-Linked-Evidence
  - https://www.highmarkhealth.org/hmk/newsroom/pr/2025/2025-08-12-Highmark-Health-Abridge-announce-unique-collaboration-to-scale-and-deploy-AI-technologies.shtml
- Microsoft Dragon Copilot
  - https://learn.microsoft.com/en-us/industry/healthcare/dragon-copilot/whats-new/3-4
  - https://support.microsoft.com/en-us/dragon-copilot/physicians/use-ai-prompts-for-coding
  - https://techcommunity.microsoft.com/blog/HealthcareAndLifeSciencesBlog/dragon-copilot-brings-ai-into-revenue-cycle-workflows/4499454
- Epic
  - https://www.epic.com/software/art/
  - https://www.epic.com/software/penny/
  - https://www.epic.com/epic/post/epic-ai-charting-rolls-out-alongside-an-expanding-set-of-built-in-ai-capabilities/
- Ambience
  - https://www.ambiencehealthcare.com/business
  - https://www.ambiencehealthcare.com/blog/ambience-healthcare-s-ai-platform-surpasses-clinician-performance-by-27-in-medical-coding-powered-by-new-openai-breakthrough
- Commure
  - https://www.commure.com/blog/how-autonomous-coding-reduces-clinician-burden-and-increases-revenue-integrity
  - https://www.commure.com/blog/fixing-denials-before-they-happen-commures-ai-approach-to-rcm
  - https://www.commure.com/customer-story/new-york-city-based-health-system-boosts-revenue-cycle-performance
- Suki
  - https://www.suki.ai/press-releases/smarter-codes-speedier-reimbursements-suki-supercharges-revenue-cycle-with-next-gen-ai/
- Heidi
  - https://support.heidihealth.com/en/articles/11142087-medical-coding
- DeepScribe
  - https://www.deepscribe.ai/solutions/ai-coding/hcc
- Freed
  - https://www.getfreed.ai/press/freed-launches-coding-assistant-for-independent-practices
