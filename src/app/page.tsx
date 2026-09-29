import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/icons";
import { currentUser } from "@/lib/server/auth";

const AREAS = [
  { title: "Clinic", items: ["Ambient notes, dictation, and voice commands", "Visit agenda, ask-the-chart, and outside records", "Orders, order sets, letters, and PDF forms", "Inbox drafts, tasks, and patient messaging"] },
  { title: "Hospital and ED", items: ["Daily progress notes that show what changed", "Discharge summary, I-PASS, and nursing flowsheets", "ED track board, timed course, and disposition", "Pre-bill CDI queries and POA indicators"] },
  { title: "Specialties", items: ["Behavioral health, group therapy, and add-on codes", "Oncology staging, CTCAE grading, and lines of therapy", "Prenatal, well-child, AWV, and HFrEF GDMT", "Office procedures and PT/OT 8-minute rule"] },
  { title: "Revenue", items: ["E/M, HCC, and ICD-10 on official code sets", "Claims, edits, denials, appeals, and ERA posting", "TCM, CCM, AWV, and SDOH capture", "Quality measures and risk adjustment"] },
  { title: "Enterprise", items: ["SSO, SCIM, two-step verification, and idle sign-out", "Roles, co-signature, break-the-glass, and access reports", "Consent ledger and compliance center", "Public API, webhooks, and audit export"] },
  { title: "Works where you work", items: ["Epic launch and write-back with SMART on FHIR", "HL7 v2 document interface for any EHR", "Chrome extension for web EHRs", "Phone recording paired by QR, and an installable app"] },
];

const FEATURES = [
  { title: "Every sentence has a source", body: "Click any line of the note to hear where it came from. Sentences without support are flagged before you sign, not after an audit." },
  { title: "What did I miss?", body: "A second pass compares the conversation with the note and surfaces dropped medications, orders, negatives, and follow-ups as one-click fixes." },
  { title: "Live visit coverage", body: "While you talk, Chartside tracks HPI elements, red-flag questions, and closing steps, and nudges you before the patient leaves." },
  { title: "Consent you can prove", body: "State-aware consent is captured before the mic arms, hashed, and stamped by the system. The model never writes an attestation." },
  { title: "Codes that survive review", body: "ICD-10, E/M from MDM elements, HCC with MEAT, and CDI nudges, each tied to the exact words that justify it." },
  { title: "Orders with guardrails", body: "Medications, labs, and referrals said aloud are staged for approval with allergy, renal, duplication, and pediatric dosing checks." },
  { title: "Learns how you write", body: "Chartside learns from your edits at signing: what you delete, what you always add, how long you like each section. Every learned rule is visible and reversible." },
  { title: "Patients can check it", body: "Plain-language summaries in the patient's language, with a secure link where they can flag anything that doesn't match what they said." },
];

export default async function Home() {
  if (await currentUser()) redirect("/today");
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl">Chartside</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link className="btn-ghost" href="/login">Sign in</Link>
          <Link className="btn-primary" href="/register">Try it free</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Link href="/line" className="inline-flex flex-wrap items-center gap-2 rounded-full border border-brand/30 bg-surface px-3 py-1 text-sm text-ink hover:border-brand" data-testid="home-line">
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">New</span>
            Your scribe is a phone number. Call it, hang up, tap the text →
          </Link>
          <h1 className="mt-5 font-serif text-5xl leading-[1.05] tracking-tight">Talk to your patient. <span className="text-brand">Sign a note you can trust.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Chartside listens to the visit and drafts a specialty-ready note, codes, orders, and a patient summary. Every sentence links back to the moment it came from.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary px-5 py-2.5 text-base" href="/register">Start a demo clinic day</Link>
            <Link className="btn-outline px-5 py-2.5 text-base" href="/login">Sign in</Link>
          </div>
          <p className="mt-4 text-sm text-ink-3">Runs fully offline with the built-in clinical engine, or with Claude when an API key is configured.</p>
        </div>
        <div className="card overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b border-line bg-sunken px-4 py-2.5 text-xs text-ink-3">
            <span className="font-medium text-ink-2">Maria Gonzalez · 58F · Follow-up</span>
            <span className="pill bg-brand-50 text-brand">96% linked to visit</span>
          </div>
          <div className="grid grid-cols-[1.3fr_1fr] text-[13px]">
            <div className="space-y-3 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Assessment &amp; Plan</p>
              <p className="font-medium">1. Type 2 diabetes mellitus with hyperglycemia (E11.65), not at goal.</p>
              <p className="ml-3 rounded bg-evidence px-1">– Change metformin to extended-release 1000 mg daily with dinner.</p>
              <p className="ml-3">– Start empagliflozin 10 mg daily.</p>
              <p className="font-medium">2. Essential hypertension (I10), not at goal.</p>
              <p className="ml-3">– Increase lisinopril to 20 mg daily.</p>
              <div className="rounded-lg border border-warn/30 bg-warn-50 px-3 py-2 text-xs text-warn">Possible omission: sulfa allergy stated during the visit.</div>
            </div>
            <div className="space-y-2 border-l border-line bg-paper p-4 text-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Transcript</p>
              <p><span className="font-semibold text-brand">Dr.</span> For the diabetes, the sugars are not at goal…</p>
              <p className="rounded bg-evidence-strong px-1"><span className="font-semibold text-brand">Dr.</span> Let&apos;s switch you to metformin extended release 1000 milligrams once daily with dinner…</p>
              <p><span className="font-semibold text-ink-2">Pt.</span> Will the new medicine make me pee more?</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-serif text-3xl">Borrowed from the best, plus the parts nobody has shipped.</h2>
          <p className="mt-2 max-w-3xl text-ink-2">
            Chartside combines what clinicians like most about today&apos;s leading scribes: linked evidence, coding-aware notes, template libraries, style learning, staged orders, and patient instructions. It adds a trust layer on top.
          </p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-line p-5">
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="font-serif text-3xl">Built for the whole care team.</h2>
          <p className="mt-2 max-w-3xl text-ink-2">One assistant for the visit, the hospital stay, the specialty workflow, and the claim, with the controls an enterprise needs.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="landing-areas">
            {AREAS.map((a) => (
              <div key={a.title} className="rounded-xl border border-line bg-surface p-5">
                <h3 className="font-semibold">{a.title}</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-2">{a.items.map((i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-ink-3">Chartside is a demonstration product. Do not use it with real patient data without a HIPAA business associate agreement and your organization&apos;s approval.</footer>
    </main>
  );
}
