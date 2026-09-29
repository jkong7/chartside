import QRCode from "qrcode";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pocket card · Chartside Line", description: "The Chartside Line keypad on one card, for the exam room wall or your badge." };

function pretty(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const GROUPS: { title: string; keys: [string, string][] }[] = [
  { title: "Start", keys: [["2", "Patient agreed, start recording"], ["3", "Chartside asks the patient"], ["9", "Ask in Spanish"], ["0", "Patient declined"]] },
  { title: "During", keys: [["4", "Pause (2 to resume)"]] },
  { title: "End", keys: [["5", "End visit, write the note"], ["1", "Looks good, ready to sign"], ["8", "Next patient, same call"], ["7", "Text the patient after I sign"]] },
  { title: "First call", keys: [["6", "Set my phone PIN"]] },
];

export default async function PocketCard() {
  const number = process.env.CHARTSIDE_LINE_NUMBER || "";
  const origin = (process.env.CHARTSIDE_PUBLIC_URL || "http://localhost:3100").replace(/\/$/, "");
  const target = number ? `tel:${number}` : `${origin}/line?src=card`;
  const qr = await QRCode.toString(target, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#16202e", light: "#ffffff" } });
  return (
    <main className="min-h-screen bg-paper px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-md print:max-w-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <p className="text-sm text-ink-3">Print it for the exam room, or keep it on your badge.</p>
          <PrintButton />
        </div>
        <article className="rounded-2xl border-2 border-ink bg-surface p-6 print:rounded-none" data-testid="pocket-card">
          <header className="flex flex-col-reverse items-start gap-4 sm:flex-row sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Chartside Line</p>
              <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight text-ink">Call before the visit. Hang up when you&apos;re done.</h1>
              {number ? (
                <p className="mt-2 font-mono text-2xl text-ink" data-testid="pocket-number">{pretty(number)}</p>
              ) : (
                <p className="mt-2 text-sm text-ink-3" data-testid="pocket-number">Your line&apos;s number prints here once your practice connects it. Until then, scan the code to try it in your browser.</p>
              )}
            </div>
            <div className="h-24 w-24 shrink-0 [&>svg]:h-full [&>svg]:w-full" aria-label={number ? "QR code that dials the line" : "QR code for the line page"} role="img" dangerouslySetInnerHTML={{ __html: qr }} data-testid="pocket-qr" />
          </header>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {GROUPS.map((g) => (
              <section key={g.title}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{g.title}</h2>
                <dl className="mt-1.5 space-y-1.5 text-sm">
                  {g.keys.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-3">
                      <dt className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-sm font-semibold text-white">{k}</dt>
                      <dd className="text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
            Or just say it: “they agreed”, “Chartside, pause”, “Chartside, end visit”, “next patient”. Enter your PIN, then “Chartside, what&apos;s left today?”. Texts never include patient details. You sign on screen.
          </p>
        </article>
      </div>
    </main>
  );
}
