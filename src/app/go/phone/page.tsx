import Link from "next/link";
import PhoneSim from "@/components/ghost/PhoneSim";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Call your scribe · Chartside", description: "Call Chartside before a visit, set the phone down, and your note is waiting when you hang up." };

export default async function PhonePage() {
  const user = await currentUser().catch(() => null);
  const line = process.env.CHARTSIDE_LINE_DISPLAY || "Demo line";
  return (
    <main className="min-h-screen bg-[#f2efe8] px-4 py-8 sm:py-12">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-between">
        <section className="max-w-md pt-2 lg:pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Chartside Line</p>
          <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight text-ink sm:text-5xl">Your scribe is a phone number.</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">Call before a visit and set the phone down. Chartside listens quietly, writes the note, and texts you a link when you hang up. No app, no login, nothing to set up.</p>
          <p className="mt-4 text-sm text-ink-3">This phone runs the real line in your browser, with the same call, voice, consent and text-back. Use your microphone, or play a sample visit if no patient is handy.</p>
          <ul className="mt-6 space-y-2 text-sm text-ink-2">
            <li>• Asks the patient for consent first, and keeps nothing until they agree.</li>
            <li>• Texts never contain patient details, only a one-tap link.</li>
            <li>• You sign on a screen, never by voice.</li>
          </ul>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link href="/line" className="btn-outline">How it works</Link>
            {user ? <Link href="/go/stack" className="btn-ghost">Your stack</Link> : <Link href="/login?next=/go/phone" className="btn-ghost">Sign in</Link>}
          </div>
        </section>
        <PhoneSim lineNumber={line} signedInAs={user && !user.guestUntil ? user.name : null} />
      </div>
    </main>
  );
}
