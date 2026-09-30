import Link from "next/link";
import { CASES, ageLabel } from "@/lib/engine/practice/cases";
import { historyFor } from "@/lib/server/practice";
import { practiceActor } from "@/lib/server/practiceHttp";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chartside Practice · Talk to a patient, write the note, get graded",
  description: "Free OSCE practice. Interview an AI standardized patient by voice or text, write your SOAP note, and get a scorecard you can share.",
  openGraph: { title: "Practice the encounter. Get graded on the note.", description: "Free OSCE and Step 2 CS style practice with an AI patient. Share your scorecard.", type: "website" as const },
  twitter: { card: "summary_large_image" as const, title: "Practice the encounter. Get graded on the note.", description: "Free OSCE practice with an AI patient and a shareable scorecard." },
};

const STEPS = [
  { n: "1", title: "Talk to the patient", body: "Type or speak your questions. The patient answers only what you ask, like a real standardized patient." },
  { n: "2", title: "Examine and write the note", body: "Tap an exam to see the finding, then write your SOAP note. You can dictate it too." },
  { n: "3", title: "Get graded, then share", body: "History, exam, communication and note scores, 3 timestamped fixes, and how Chartside would chart it." },
];

export default async function PracticeHome() {
  const actor = await practiceActor();
  const recent = (await historyFor(actor)).filter((s) => s.score !== null).slice(0, 5);
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-0">
      <section className="pb-10 pt-6 sm:pt-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Free for students and residents</p>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl leading-tight sm:text-5xl">Practice the encounter. Get graded on the note.</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">Interview a standardized patient, write your note, and get a scorecard in seconds. No account needed. Present to an AI attending when you&apos;re done.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/practice/${CASES[0].id}`} className="btn-primary px-5 py-2.5 text-base" data-testid="practice-quickstart">Start with chest pain</Link>
          <a href="#cases" className="btn-outline px-5 py-2.5 text-base">Pick a case</a>
        </div>
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-surface p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand">{s.n}</span>
              <h2 className="mt-3 font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {recent.length > 0 && (
        <section className="mb-10" data-testid="practice-recent">
          <h2 className="font-serif text-2xl">Your recent scores</h2>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {recent.map((s) => (
              <li key={s.id}>
                <Link href={`/practice/s/${s.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-sunken">
                  <span>{CASES.find((c) => c.id === s.caseId)?.title}</span>
                  <span className="font-semibold text-brand">{s.score}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="cases" className="scroll-mt-4 pb-10">
        <h2 className="font-serif text-3xl">Cases</h2>
        <p className="mt-1 text-ink-2">Each one takes about 12 minutes. Every patient is fictional.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="practice-cases">
          {CASES.map((c) => (
            <Link key={c.id} href={`/practice/${c.id}`} className="group flex flex-col rounded-xl border border-line bg-surface p-4 transition hover:border-brand hover:shadow-sm" data-testid="practice-case">
              <span className="text-xs font-medium text-ink-3">{c.specialty}</span>
              <span className="mt-1 font-semibold group-hover:text-brand">{c.title}</span>
              <span className="mt-2 flex-1 text-sm text-ink-2">{c.blurb}</span>
              <span className="mt-3 text-xs text-ink-3">{c.patient.name}, {ageLabel(c)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4 pb-6 sm:grid-cols-2">
        <form action="/practice/c" className="rounded-xl border border-line bg-surface p-5" data-testid="practice-class-form">
          <h2 className="font-semibold">Practicing with your class?</h2>
          <p className="mt-1 text-sm text-ink-2">Pick a class code, enter it before each case, and see a first-name leaderboard for your group.</p>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="class-code">Class code</label>
            <input id="class-code" name="code" className="input uppercase" placeholder="e.g. NU-M3" maxLength={24} required />
            <button className="btn-outline" type="submit">See leaderboard</button>
          </div>
        </form>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Hands-free on a walk?</h2>
          <p className="mt-1 text-sm text-ink-2">Call the Chartside line and press 7 at the greeting. Pick a case by number and take the history by phone. We text you the scorecard link.</p>
          <Link href="/go/phone" className="btn-ghost mt-3 px-0 text-brand">Try the line in your browser</Link>
        </div>
      </section>
    </div>
  );
}
