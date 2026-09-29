import QRCode from "qrcode";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pocket card · Chartside Line", description: "The Chartside Line keypad on one card, for the exam room wall or your badge." };

function pretty(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

const KEYS: [string, string][] = [
  ["2", "Patient agreed, start recording"],
  ["3", "Chartside asks the patient"],
  ["9", "Ask in Spanish"],
  ["0", "Patient declined"],
  ["4", "Pause"],
  ["5", "End visit, write the note"],
  ["1", "Ready, put it on my stack"],
  ["8", "Next patient, same call"],
  ["7", "Text the patient after I sign"],
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
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Chartside Line</p>
              <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight text-ink">Call before the visit. Hang up when you&apos;re done.</h1>
              <p className="mt-2 font-mono text-xl text-ink" data-testid="pocket-number">{number ? pretty(number) : `${origin.replace(/^https?:\/\//, "")}/line`}</p>
            </div>
            <div className="h-24 w-24 shrink-0 [&>svg]:h-full [&>svg]:w-full" aria-label={number ? "QR code that dials the line" : "QR code for the line page"} role="img" dangerouslySetInnerHTML={{ __html: qr }} data-testid="pocket-qr" />
          </header>
          <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {KEYS.map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-3">
                <dt className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-sm font-semibold text-white">{k}</dt>
                <dd className="text-ink-2">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-line pt-3 text-xs text-ink-3">
            Or just say it: “they agreed”, “Chartside, pause”, “Chartside, end visit”, “next patient”. Enter your PIN, then “Chartside, what&apos;s left today?”. Texts never include patient details. You sign on screen.
          </p>
        </article>
      </div>
    </main>
  );
}
