# Ambient AI scribes: the market in late 2026, and what Chartside takes from it

This is the synthesis. The full sourced research lives in [`docs/research/`](research/):
- [market overview](research/market-overview.md)
- [Abridge, Dragon Copilot, Ambience](research/abridge-dragon-ambience.md)
- [Suki, Nabla, DeepScribe](research/suki-nabla-deepscribe.md)
- [Heidi, Freed, Commure, Sunoh](research/heidi-freed-commure-sunoh.md)
- [hands-on UI teardown](research/ui-teardown.md)

Figures marked "est." are third-party estimates.

## The market in one paragraph

Ambient scribes are healthcare AI's first breakout category. Vendor revenue was about $600M in 2025, up 2.4× (Menlo). Microsoft (33%) and Abridge (30%) hold two-thirds of that revenue, and 40+ funded competitors split the rest. 2026 changed the shape of the market in three ways:
- **EHR platforms entered.** Epic made AI Charting generally available on Feb 4 and had 74 organizations live by August. athenahealth made its scribe free. Oracle's agent is at 300+ organizations.
- **Prices collapsed.** Enterprise scribes cost about $200–600 per clinician per month (est.), self-serve tools $39–149, and native tools $0.
- **Every vendor started repositioning as an "agentic platform"** covering coding/CDI, orders, prior auth, nursing, inpatient, and revenue cycle.

The evidence on outcomes is real but modest: about 16 minutes saved per 8 clinical hours, and no change in after-hours charting (JAMA, Apr 2026). Legal exposure is rising: wiretap class actions over consent, including AI-inserted consent attestations, and payer pushback on coding intensity.

## The top 10

| # | Vendor | Position | Signature capability | Weakness clinicians cite |
|---|---|---|---|---|
| 1 | **Abridge** | Enterprise share leader; Best in KLAS 2025 & 2026; $5.3B | **Linked Evidence**: every note sentence maps to transcript + audio. Deep Epic integration, 28+ languages, patient summaries, prior auth (Availity), pre-bill review | Named in consent lawsuits; notes can run long |
| 2 | **Microsoft Dragon Copilot** | Largest revenue share; supplies Epic's ambient tech | One assistant for dictation + ambient + chat, partner-agent storefront, nursing flowsheets | Lowest KLAS of the leaders (91.6); unstable pricing |
| 3 | **Epic AI Charting (Art)** | Native platform threat; 0→74 orgs in 6 months | Longitudinal chart context, order drafting inside Epic | Only works inside Epic; generic specialty fit |
| 4 | **Ambience** | Top KLAS satisfaction (97.7); $1.25B | **Coding-aware documentation**: ICD-10/CPT/HCC with rationale, AutoCDI, chart awareness, inpatient suite | Enterprise-only, opaque pricing |
| 5 | **Commure (Augmedix)** | HCA exclusive; EHR-agnostic; $7B | Human-in-the-loop tiers, ED re-evaluations, citation highlight + compare view | Wordy notes |
| 6 | **Suki** | Mid-market & non-Epic leader | **Voice-first assistant** ("Suki, …"), pre-visit summary, inline ICD-10 chips on each problem, order staging | Learning curve, generic A&P |
| 7 | **Nabla** | Only vendor with an RCT win (UCLA, NEJM AI) | Notes in <20 s, **templated normal exam shown visibly distinct with accept/reject**, patient instructions, Chrome extension | Moved to enterprise-only; leadership change |
| 8 | **Heidi** | Largest by visit volume worldwide; free tier; $900M | **Template library + community**, Context/Transcript/Note/Letter tabs, separate input vs output language, Evidence Q&A, clip-on mic | Hallucinations in multi-problem visits, repricing |
| 9 | **DeepScribe** | Highest KLAS (98.8); oncology depth | Specialty-specific notes, HCC and E/M tabs, SmartPrep pre-visit, "Learn" from edits | No Android app, annual contracts |
| 10 | **Freed** | Self-serve leader for small practices | **Learns your style from edits**, per-section 👍/👎 + copy, one-tap capture, transparent pricing | Style drift; EHR push via DOM automation |

Next tier: Oracle Clinical AI Agent, Doximity Scribe (free), athenaAmbient (free), Sunoh.ai (eClinicalWorks), Knowtex.

## How they compete

The core loop is the same everywhere: schedule → tap patient → record → sectioned note with codes → edit → push to EHR. Vendors now compete on the layers around that loop:
- **Trust:** Abridge's evidence links, Commure's citations.
- **Revenue:** Ambience and DeepScribe coding, Abridge pre-bill review.
- **Distribution:** Microsoft's and Epic's installed bases, Heidi's and Freed's free tiers.
- **Personalization:** Freed's learned templates, Heidi's template language.
- **Surface area:** Suki's voice layer, Dragon's agent storefront.

Lock-in is low: 67% of outpatient providers expect to switch vendors.

## Unsolved problems (from the research)

1. **Omissions, not hallucinations,** are 76% of errors, especially medications, exam findings, and verbalized reasoning.
2. **Verification is the editing burden.** Only ~15% of notes are signed unedited, and few tools show sentence-level provenance.
3. **Consent is unprovable,** and some tools let the model write the attestation.
4. **Coding intensity backlash** means billing needs evidence trails that survive payer audits.
5. **Patients can't see or correct what was written.**
6. **Low sustained use:** only ~32% of adopters use the scribe in most visits.
7. **Silent failures:** a muted mic or recording loss is discovered only after the visit.
8. **Specialty and pediatric fit:** historian-aware HPI and weight-based dosing.

## What Chartside took, and what it adds

| Capability | Inspired by | Chartside implementation |
|---|---|---|
| Sentence → transcript provenance | Abridge Linked Evidence, Commure citations | Every sentence stores utterance IDs. Click it to highlight and scroll the transcript. Support is scored as strong, partial, or none |
| Coding-aware notes | Ambience, DeepScribe, Suki | ICD-10 per problem, E/M from the three MDM elements with evidence, HCC with MEAT, CDI nudges |
| Order staging | Suki, Sunoh, Epic | Meds, labs, imaging, referrals, vaccines, follow-up staged for accept/reject |
| Visibly distinct template normals | Nabla | Unexamined systems show as lavender "Not examined · template" lines that need explicit accept |
| Template library + editor | Heidi, Dragon | 8 system templates, duplicate/edit, per-section instructions, live preview |
| Learns your style | Freed, DeepScribe "Learn" | Diffs the draft against the signed note, proposes rules, activates on second occurrence, all visible and reversible |
| Pre-visit brief | Suki, DeepScribe SmartPrep, Heidi Context | Problems, meds, allergies, recent labs, last visit's plan |
| Patient instructions / AVS | Nabla, Abridge, Freed | Plain-language summary with reading grade; Spanish offline, any language with Claude |
| Referral letters | Heidi, Nabla | Drafted automatically per referral |
| Assistant / command bar | Suki, Dragon Copilot Chat, Ask Heidi | "Ask Chartside": answers with transcript citations, or edits the note ("add … to plan", "make HPI shorter") |
| Per-section feedback & copy | Freed, Commure | 👍/👎, copy, edit on each section card |
| **Omission detector** | *gap* | A second deterministic pass compares facts in the conversation with the note and offers one-click inserts |
| **Unsupported-claim flagging** | *gap* | Numbers not present in the transcript or chart are flagged; sentences without evidence block signing |
| **Consent ledger** | *gap (lawsuits)* | State-aware, all-party enforcement, SHA-256 digest; the system (never the model) writes the attestation |
| **Live coverage nudges** | *gap* | HPI elements, complaint-specific red flags (incl. suicide screen), and closing steps tracked while you talk |
| **Order safety checks** | *gap* | Allergy block, renal dosing by eGFR, therapeutic duplication, ACE+ARB, pediatric weight-based dosing, recent-result notice, and a "said it but didn't review it" check at sign time |
| **Audit defensibility meter** | *gap (payer backlash)* | Score and over/under-coding direction, with every MDM element tied to quotes |
| **Patient correction loop** | *gap* | Private link with summary + transcript; patients flag items and the flags return to the clinician |
| **Utilization coach & honest metrics** | *gap* | Median time-to-sign, unedited-sign rate, after-hours signing, capture rate by visit type |
| **Recording health** | *gap (silent mic)* | Live mic level meter and a "no audio for Ns" alarm |
| **Offline engine** | *gap (privacy, cost)* | Deterministic on-device clinical NLP; Claude is optional |
