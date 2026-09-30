import Link from "next/link";
import VisitStart from "@/components/visit/VisitStart";
import { ALL_PARTY_STATES, STATE_NAMES } from "@/lib/engine/lexicon";

export const metadata = {
  title: "Record your doctor visit · Chartside",
  description: "Record your visit on your own phone, with your doctor's OK. Get a plain-English recap of what was said, what changed and what to do next. Free, no app.",
  openGraph: { title: "Remember everything your doctor said", description: "Record your visit with your doctor's OK and get a plain-English recap. Free, no app.", type: "website" },
  twitter: { card: "summary_large_image", title: "Remember everything your doctor said", description: "Record your visit with your doctor's OK and get a plain-English recap. Free, no app." },
};

const FAQ: [string, string][] = [
  ["Is it legal to record my visit?", "In most states you can record a conversation you're part of. About a dozen states, like California, Florida and Illinois, need everyone in the room to agree. Chartside always asks your clinician on your screen before it keeps any sound, and it asks about others in the room where the law needs it. If they say no, nothing is recorded."],
  ["Why does my clinician tap my phone?", "So everyone agrees out loud and on the record. It takes five seconds. Your clinician can also leave a phone number or email if they'd like a free draft of their own visit note."],
  ["Who can see my recording?", "Only people with your private link. We don't sell it, we don't show you ads, and there are no tracking pixels. If your clinician accepts the draft note, they get their own copy for their records after confirming who they are. Your recap stays yours."],
  ["How do I delete it?", "Tap \"Delete everything\" on your recap page. The audio, the written conversation and the recap are erased right away. If you don't save your recap, it's deleted on its own after 7 days."],
  ["Is this my medical record?", "No. It's your own notes, written by a computer from what it heard. It can make mistakes. Ask your clinician if anything looks wrong."],
  ["Do I need an account or an app?", "No. It works in your phone's browser. If you want to keep your recap longer, enter your phone number or email and we'll send you the link."],
];

const STEPS: [string, string][] = [
  ["Tap record", "Open this page on your phone in the waiting room."],
  ["Hand your phone over", "Your clinician taps Agree. Nothing is kept until they do."],
  ["Talk like normal", "Put your phone on the table. Pause any time."],
  ["Read your recap", "What was said, medicine changes and next steps, in plain English."],
];

export default function VisitLanding() {
  const states = Object.entries(STATE_NAMES).map(([code, name]) => ({ code, name, allParty: ALL_PARTY_STATES.has(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Link href="/visit" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">C</span>
          Chartside
        </Link>
        <a href="#faq" className="btn-ghost text-sm">Questions</a>
      </header>
      <section className="mx-auto grid max-w-5xl gap-10 px-4 pb-12 pt-4 md:grid-cols-[1.1fr_1fr] md:pt-12">
        <div>
          <h1 className="font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">Remember everything your doctor said.</h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-2">Record your visit on your own phone, with your clinician&apos;s OK. Afterward you get a plain-English recap: what you talked about, any medicine changes, what to do next, and questions to ask next time.</p>
          <p className="mt-3 text-sm text-ink-3">Free. No app. No account. Share it with family if you like.</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand">{i + 1}</span>
                <span><span className="block font-medium text-ink">{t}</span><span className="text-sm text-ink-3">{d}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <VisitStart states={states} />
      </section>
      <section id="faq" className="mx-auto max-w-3xl px-4 pb-16">
        <h2 className="font-serif text-2xl font-semibold text-ink">Questions people ask</h2>
        <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-4 py-3" data-testid="visit-faq">
              <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">{q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <footer className="mx-auto max-w-5xl border-t border-line px-4 py-6 text-xs text-ink-3">
        <p>Chartside writes your recap with a computer. It can make mistakes and is not medical advice. In an emergency, call 911.</p>
        <p className="mt-2">Are you a clinician? <Link className="font-medium text-brand" href="/line?src=patient_visit">Chartside writes your notes too, free to try.</Link></p>
      </footer>
    </main>
  );
}
