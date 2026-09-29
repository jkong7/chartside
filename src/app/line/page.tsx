import { cookies } from "next/headers";
import Link from "next/link";
import { get } from "@/lib/db";
import { displayName, referrerFor } from "@/lib/server/growth";
import { trackLineVisit } from "@/lib/server/loops";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Chartside Line · Your scribe is a phone number",
  description: "Call before a visit, set the phone down, hang up. Your note is waiting. No app, no login, no setup.",
  openGraph: { title: "Your scribe is a phone number", description: "Call before a visit, set the phone down, hang up. Your note is waiting.", type: "website" },
  twitter: { card: "summary_large_image", title: "Your scribe is a phone number", description: "Call before a visit, set the phone down, hang up. Your note is waiting." },
};

function pretty(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

async function inviter(code: string | undefined) {
  const id = await referrerFor(code).catch(() => null);
  if (!id) return null;
  const u = await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id);
  return u ? displayName(u.name) : null;
}


const FAQ: [string, string][] = [
  ["Do I need to install anything?", "No. Call the number from any phone, even a clinic landline. If you'd rather tap than call, the same thing works in any browser at /go, beside your EHR in the Chrome side panel, or from Voice Memos with an iPhone Shortcut."],
  ["What if my patient says no?", "Say they declined or press 0. The line hangs up and keeps nothing. It only starts keeping audio after you say they agreed, press 2, or the patient answers yes when Chartside asks them itself."],
  ["Can someone call my line pretending to be me?", "Caller ID can be faked, so it never unlocks your chart. Your schedule and chart questions need your phone PIN. A call without a PIN can only record a new visit, which shows up on your stack marked as caller ID only, with a delete button."],
  ["What does the text message say?", "Only the time of the call and a one-time link. Never a patient's name or anything about the visit. The note itself sits behind your sign-in."],
  ["Is it HIPAA ready?", "The audio is encrypted at rest, every step is audit-logged, consent is recorded with the moment it was given, and the speech, AI and phone vendors all offer BAAs. The demo line runs on synthetic visits. A practice signs a BAA before using it with real patients."],
  ["Does it speak Spanish?", "Press 9 and Chartside asks your patient for consent in Spanish. The visit can move between English and Spanish, and the note comes back in English."],
  ["Where does the note go?", "To your stack, where you review it with every sentence linked to the moment it was said, then sign. From there it can go to your EHR through the Chrome side panel or a SMART on FHIR connection, and your patient can get a plain-language summary."],
  ["Can I sign by voice?", "No. You can mark a note ready on the call, but signing, orders and claims always happen on a screen where you can read them."],
];

const CALL = [
  ["Chartside", "Hi Dr. Patel, this is your scribe, on a recorded line. When your patient agrees, press 2."],
  ["You", "She agreed."],
  ["Chartside", "Thanks. I'm listening, and I'll stay quiet."],
  ["", "… the visit happens. Phone face down on the counter …"],
  ["You", "Chartside, end visit."],
  ["Chartside", "Here's your note. Diabetes, improving on metformin. Plan: increase to 1,000 mg with dinner, eye exam, A1c in 3 months. Coding suggests a level 4 visit."],
  ["You", "Make the plan shorter."],
  ["Chartside", "Done, it's on your stack to approve. Texting you the link now."],
] as const;

export default async function LinePage({ searchParams }: { searchParams: Promise<{ ref?: string; src?: string }> }) {
  const sp = await searchParams;
  const number = process.env.CHARTSIDE_LINE_NUMBER || "";
  const from = await inviter(sp.ref);
  await trackLineVisit({ src: sp.src, ref: sp.ref, visitor: (await cookies()).get("cs_vid")?.value }).catch(() => {});
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link href="/line" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">C</span>
          Chartside
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login?next=/go/stack" className="btn-ghost">Sign in</Link>
          <Link href="/go/phone" className="btn-primary">Try it now</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
        <div>
          {from && (
            <p className="mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm text-brand" data-testid="line-invited">
              {from} invited you. You both get a free month.
            </p>
          )}
          {sp.src === "recap" && !from && (
            <p className="mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm text-brand" data-testid="line-recap">
              A patient of yours sent you this.
            </p>
          )}
          <h1 className="font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Your scribe is
            <br />a phone number.
          </h1>
          <p className="mt-5 max-w-xl text-xl leading-relaxed text-ink-2">Call before a visit and set the phone down. Hang up when you're done. Your note is waiting behind one tap.</p>
          <p className="mt-2 text-ink-3">No app. No login. No laptop in the room. Works from any phone, even the clinic landline.</p>

          <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            {number ? (
              <>
                <p className="label">Call your scribe</p>
                <a href={`tel:${number}`} className="block font-mono text-4xl font-medium tracking-tight text-ink hover:text-brand sm:text-5xl" data-testid="line-number">
                  {pretty(number)}
                </a>
              </>
            ) : (
              <>
                <p className="label">Try the line</p>
                <p className="text-lg text-ink">Call it right here in your browser. It's the same line, the same voice, and the same text-back.</p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/go/phone" className="btn-primary px-5 py-3 text-base" data-testid="line-try">
                Call from this browser
              </Link>
              <Link href="/go/phone?autopilot=1" className="btn-outline px-5 py-3 text-base" data-testid="line-watch">
                Watch a call play itself
              </Link>
              <a href="/line/contact.vcf" className="btn-outline px-5 py-3 text-base" data-testid="line-contact">
                Save to contacts
              </a>
            </div>
            <p className="mt-3 text-sm text-ink-3">Your first note is free. No account until you want to keep it.</p>
          </div>
        </div>

        <figure className="mx-auto w-full max-w-[340px]" data-testid="line-video">
          <div className="overflow-hidden rounded-[40px] border-[8px] border-[#11161f] bg-[#0b0f16] shadow-2xl">
            <video className="block h-auto w-full" src="/demo/line-call.mp4" poster="/demo/line-call-poster.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="A real call to Chartside, sped up six times: consent, a two-minute visit, the note read back, then the text that opens it" />
          </div>
          <figcaption className="mt-3 text-center text-sm text-ink-3">A real call, sped up 6×. Consent, a two-minute visit, the note read back, then the text that opens it.</figcaption>
        </figure>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 md:grid-cols-3">
          {[
            ["1. Call", "Dial before the visit. Your patient hears a short consent question, and nothing is kept until they agree."],
            ["2. Put the phone down", "Chartside listens quietly. Say “Chartside, pause” or press 4 any time. The keypad works just like old dictation lines."],
            ["3. Hang up, tap the text", "Your note, codes and patient summary are ready, with every sentence linked to the moment it was said. Swipe to sign."],
          ].map(([t, d]) => (
            <div key={t}>
              <h2 className="font-serif text-2xl font-semibold text-ink">{t}</h2>
              <p className="mt-2 leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="mb-6 text-center font-serif text-3xl font-semibold text-ink">What you hear on the line</h2>
        <figure className="mx-auto max-w-2xl rounded-3xl bg-[#0b0f16] p-5 text-white shadow-xl" aria-label="What a call sounds like">
          <figcaption className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-white/65">
            <span>A real call, start to finish</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#ff5a4f]" /> 12:48
            </span>
          </figcaption>
          <ol className="space-y-2.5">
            {CALL.map(([who, text], i) =>
              who ? (
                <li key={i} className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${who === "You" ? "ml-auto rounded-br-sm bg-[#2fbf61] text-black" : "rounded-bl-sm bg-white/10"}`}>
                  <span className="sr-only">{who}: </span>
                  {text}
                </li>
              ) : (
                <li key={i} className="py-1 text-center text-xs italic text-white/65">
                  {text}
                </li>
              ),
            )}
          </ol>
          <div className="mt-4 rounded-2xl bg-white/10 p-3 text-[14px]">
            <p className="text-[11px] uppercase tracking-widest text-white/65">Text message</p>
            <p className="mt-1">Chartside: your note from the 3:42 PM call is ready. Review and sign: chartside…/m/…</p>
          </div>
        </figure>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-serif text-3xl font-semibold text-ink">Built so you can trust a phone call with a chart</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Consent first", "The line asks before it keeps a second of audio, and logs when and how the patient agreed."],
            ["Texts carry no patient details", "Only a time and a one-tap link. The note lives behind your sign-in."],
            ["You sign on a screen", "Voice can mark a note ready, but signing, orders and claims always happen where you can read them."],
            ["Caller ID isn't a password", "Your schedule and chart questions unlock only after your phone PIN."],
          ].map(([t, d]) => (
            <div key={t} className="card p-4">
              <h3 className="font-semibold text-ink">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/go" className="card block p-5 hover:border-brand">
            <p className="label">Rather tap?</p>
            <p className="font-semibold text-ink">One button in your browser</p>
            <p className="mt-1 text-sm text-ink-2">Record from any laptop or phone, with a floating recorder that stays on top of your EHR.</p>
          </Link>
          <Link href="/go/shortcut" className="card block p-5 hover:border-brand">
            <p className="label">iPhone</p>
            <p className="font-semibold text-ink">Voice Memos + the Action button</p>
            <p className="mt-1 text-sm text-ink-2">Records with the screen locked. One Shortcut sends it to Chartside.</p>
          </Link>
          <Link href="/today" className="card block p-5 hover:border-brand">
            <p className="label">The back office</p>
            <p className="font-semibold text-ink">The full Chartside app</p>
            <p className="mt-1 text-sm text-ink-2">Coding, claims, inpatient boards, quality and your EHR connection, when you need the depth.</p>
          </Link>
        </div>
        <section className="mx-auto mt-14 max-w-3xl" data-testid="line-faq">
          <h2 className="font-serif text-3xl font-semibold text-ink">Questions clinicians ask first</h2>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-medium text-ink marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {q}
                    <span className="text-ink-3 transition group-open:rotate-45" aria-hidden>+</span>
                  </span>
                </summary>
                <p className="mt-2 leading-relaxed text-ink-2">{a}</p>
              </details>
            ))}
          </div>
        </section>
        <p className="mt-10 text-center text-sm text-ink-3">For physicians, NPs, PAs, therapists, PT, OT and speech, chiropractors and vets. Demo line runs on synthetic data only until your practice signs a BAA.</p>
      </section>
    </main>
  );
}
