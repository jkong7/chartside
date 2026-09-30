import Link from "next/link";

export const metadata = {
  title: "Barn Line · Your vet scribe is a phone number",
  description: "For ambulatory, equine and farm vets. Call from the truck, keep your gloves on, and every animal on the farm call gets its own record.",
  openGraph: { title: "Your vet scribe is a phone number", description: "Call from the truck. Every animal on the farm call gets its own record, and the owner can get their care instructions by text.", type: "website" },
  twitter: { card: "summary_large_image", title: "Your vet scribe is a phone number", description: "Call from the truck. Every animal on the farm call gets its own record." },
};

const SIGNUP = "/register?specialty=Veterinary%3A%20Equine&next=%2Fgo";

function pretty(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const CALL = [
  ["Chartside", "Hi Dr. Lee, this is your scribe, on a recorded line. When everyone agrees to be recorded, say they agreed, or press 2."],
  ["You", "Jane agreed."],
  ["Chartside", "Thanks. I'm listening."],
  ["", "… phone on the tailgate, gloves on …"],
  ["You", "Farm call at Miller's. First horse is Biscuit, 12-year-old Quarter Horse gelding. Grade 2 of 5 lame left fore, hoof testers positive at the toe. Pared out an abscess, 2 grams bute. Stall rest 3 days."],
  ["You", "Next horse, Duchess. Temp 100.1, heart rate 36. Rabies and West Nile given."],
  ["You", "Moving on to cow 214. Palpated 90 days pregnant. Recheck at 150."],
  ["", "… hang up and climb back in the truck …"],
] as const;

const FAQ: [string, string][] = [
  ["What if I have no signal in the barn?", "A call streams as you talk, so a weak signal makes the call choppy rather than losing a long file at the end. If there's no signal at all, record a voice memo and text it to the same number when you're back in range."],
  ["How does it split a farm call into animals?", "Say the animal as you move on: \"next horse, Duchess\", \"moving on to cow 214\", \"first one is Biscuit\". Each animal gets its own record under its own name or tag, with the farm and owner filled in once."],
  ["Does it know horse and cattle drugs?", "Yes. Xylazine, detomidine, Banamine, bute, Excede, Draxxin, ivermectin and the rest are spelled right, and animal words are never turned into human diagnoses or billing codes."],
  ["What about withdrawal times?", "The record says exactly what you said. Chartside never makes up a withdrawal time. If you don't say one, the record doesn't have one."],
  ["What does the owner get?", "If you turn on owner texts in Admin and confirm the owner's phone on the record, the owner gets a short text after you sign with the care instructions in plain words, like stall rest and medicine times, with a small \"Prepared with Chartside\" line. It is off until you turn it on. Only transactional texts, never marketing, and STOP always works."],
  ["Is this covered by HIPAA?", "Vets aren't covered by HIPAA, so your texts and WhatsApp replies can carry the record itself. We still encrypt the audio, record the owner's consent, and log every step."],
  ["Can I use WhatsApp?", "Yes, for veterinary practices. Send a voice note to the Line on WhatsApp and the record comes back in the chat, with a link to edit and sign."],
  ["Does it work with my practice software?", "Copy each record from Chartside into your practice software. Direct connections come later."],
];

export default function BarnPage() {
  const number = process.env.CHARTSIDE_LINE_NUMBER || "";
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-5">
        <Link href="/barn" className="flex items-center gap-2 font-semibold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">C</span>
          Barn Line
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/login?next=/go/stack" className="btn-ghost">Sign in</Link>
          <Link href={SIGNUP} className="btn-primary" data-testid="barn-signup-top">Start free</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-12">
        <div>
          <p className="mb-4 inline-flex rounded-full bg-brand-50 px-3 py-1 text-sm text-brand">For ambulatory, equine and farm vets</p>
          <h1 className="font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
            Your vet scribe is
            <br />a phone number.
          </h1>
          <p className="mt-5 max-w-xl text-xl leading-relaxed text-ink-2">Call from the truck. Keep your gloves on. Talk through the farm call, and every animal gets its own record before you're back on the road.</p>
          <p className="mt-2 text-ink-3">No app, no laptop in the barn, no typing at 9 PM. Works from any phone, even the barn landline.</p>
          <div className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            {number ? (
              <>
                <p className="label">Call the Barn Line</p>
                <a href={`tel:${number}`} className="block font-mono text-4xl font-medium tracking-tight text-ink hover:text-brand" data-testid="barn-number">{pretty(number)}</a>
              </>
            ) : (
              <>
                <p className="label">Try it</p>
                <p className="text-lg text-ink">Call from your browser now, or sign up and call from your truck.</p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={SIGNUP} className="btn-primary px-5 py-3 text-base" data-testid="barn-signup">Start free as a vet</Link>
              <Link href="/go/phone" className="btn-outline px-5 py-3 text-base">Call from this browser</Link>
            </div>
            <p className="mt-3 text-sm text-ink-3">Or text a voice memo to the same number. Your first 20 records are free.</p>
          </div>
        </div>

        <figure className="mx-auto w-full max-w-md rounded-3xl bg-[#0b0f16] p-5 text-white shadow-xl" aria-label="A sample farm call" data-testid="barn-call">
          <figcaption className="mb-3 flex items-center justify-between text-xs uppercase tracking-widest text-white/65">
            <span>A farm call, three animals</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ff5a4f]" /> 6:12</span>
          </figcaption>
          <ol className="space-y-2.5">
            {CALL.map(([who, text], i) =>
              who ? (
                <li key={i} className={`max-w-[90%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${who === "You" ? "ml-auto rounded-br-sm bg-[#2fbf61] text-black" : "rounded-bl-sm bg-white/10"}`}>
                  <span className="sr-only">{who}: </span>
                  {text}
                </li>
              ) : (
                <li key={i} className="py-1 text-center text-xs italic text-white/65">{text}</li>
              ),
            )}
          </ol>
          <div className="mt-4 rounded-2xl bg-white/10 p-3 text-[14px]">
            <p className="text-[11px] uppercase tracking-widest text-white/65">Text message</p>
            <p className="mt-1">Biscuit. 12-year-old Quarter Horse gelding. Lameness grade 2/5, left fore…</p>
            <p className="mt-1 text-white/65">Duchess… Cow 214…</p>
            <p className="mt-1">Edit and sign: chartside…/m/…</p>
          </div>
        </figure>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-serif text-3xl font-semibold text-ink">One call, one record per animal</h2>
          <div className="mt-6 grid gap-8 md:grid-cols-3">
            {[
              ["1. Say who's next", "\"First horse is Biscuit.\" \"Next horse, Duchess.\" \"Moving on to cow 214.\" Names, ear tags and breeds all work."],
              ["2. Hang up", "Chartside splits the call at each animal, fills in the farm and owner once, and picks the right form: lameness exam with AAEP grade, herd visit, repro exam, or a general exam."],
              ["3. Two texts", "You get the records with a link to edit and sign. If you turn on owner texts and confirm the phone, the owner gets plain care instructions after you sign."],
            ].map(([t, d]) => (
              <div key={t}>
                <h3 className="font-serif text-2xl font-semibold text-ink">{t}</h3>
                <p className="mt-2 leading-relaxed text-ink-2">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2">
        <div className="card p-5" data-testid="barn-record">
          <p className="label">What you get for Biscuit</p>
          <div className="mt-2 space-y-2 text-sm text-ink">
            <p><b>Signalment.</b> Biscuit, 12-year-old Quarter Horse gelding. Owner Jane Miller, Miller&apos;s Barn.</p>
            <p><b>Lameness exam.</b> AAEP grade 2/5, left fore. Positive hoof testers at the toe.</p>
            <p><b>Assessment.</b> Sole abscess.</p>
            <p><b>Treatments.</b> Abscess pared out. Bute 2 g by mouth.</p>
            <p><b>Owner instructions.</b> Stall rest for 3 days. Soak the foot twice a day.</p>
          </div>
        </div>
        <div className="card p-5" data-testid="barn-owner-text">
          <p className="label">What the owner can get after you sign</p>
          <div className="mt-2 max-w-sm rounded-2xl rounded-bl-sm bg-paper p-3 text-sm text-ink">
            Care instructions for Biscuit from Dr. Lee:
            <br />- Stall rest for 3 days.
            <br />- Soak the foot twice a day.
            <br />
            <br />Questions? Call your vet.
            <br />
            <span className="text-ink-3">Prepared with Chartside. Reply STOP to opt out.</span>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="card flex flex-col items-start justify-between gap-4 p-6 md:flex-row md:items-center" data-testid="barn-pricing">
          <div>
            <p className="label">Pricing</p>
            <p className="font-serif text-2xl font-semibold text-ink">One flat monthly price per vet</p>
            <p className="mt-1 text-sm text-ink-2">Unlimited calls, memos and records. Your first 20 records are free, no card needed. Final price is set before launch.</p>
          </div>
          <Link href={SIGNUP} className="btn-primary px-5 py-3 text-base">Start free</Link>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14" data-testid="barn-faq">
        <h2 className="font-serif text-3xl font-semibold text-ink">Questions vets ask first</h2>
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
        <p className="mt-10 text-center text-sm text-ink-3">Barn Line is Chartside for veterinary practices. For human medicine, see <Link href="/line" className="underline">the Chartside Line</Link>.</p>
      </section>
    </main>
  );
}
