import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { receiptByToken, receiptOwner, referralCode } from "@/lib/server/growth";
import { trackLoop, VISITOR_COOKIE, visitorKey } from "@/lib/server/loops";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await receiptByToken((await params).token);
  if (!r) return { title: "Chartside", robots: { index: false } };
  const title = `${r.clinician} closed ${r.notesSigned} charts this week`;
  const description = `${r.hoursBack} hours back. Call your scribe: ${r.line}`;
  return { title, description, robots: { index: false }, openGraph: { title, description, type: "website" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const r = await receiptByToken((await params).token);
  if (!r) notFound();
  const owner = await receiptOwner((await params).token);
  const code = owner ? await referralCode({ id: owner }) : null;
  if (owner) await trackLoop({ loop: "receipt", kind: "exposure", inviterId: owner, visitor: visitorKey((await cookies()).get(VISITOR_COOKIE)?.value ?? null) });
  const stat = (value: string | number, label: string, testid: string) => (
    <div className="rounded-xl bg-surface p-4 text-center">
      <p className="font-serif text-4xl text-brand" data-testid={testid}>{value}</p>
      <p className="mt-1 text-sm text-ink-3">{label}</p>
    </div>
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <article className="w-full max-w-md rounded-2xl border border-line bg-sunken p-6 shadow-sm" data-testid="receipt">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-3">Chartside receipt · week of {new Date(`${r.weekOf}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
        <h1 className="mt-2 font-serif text-3xl leading-tight">{r.clinician}</h1>
        {r.specialty && <p className="text-sm text-ink-3">{r.specialty}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {stat(r.notesSigned, "charts closed", "receipt-notes")}
          {stat(r.hoursBack, "hours back", "receipt-hours")}
          {stat(r.closedSameDay, "closed before leaving clinic", "receipt-sameday")}
          {stat(r.medianMinutesToSign === null ? "–" : `${r.medianMinutesToSign}m`, "median visit to signature", "receipt-median")}
        </div>
        {r.afterHours === 0 && r.notesSigned > 0 && <p className="mt-4 rounded-lg bg-ok-50 px-3 py-2 text-center text-sm font-medium text-ok">Zero pajama-time charting.</p>}
        <p className="mt-6 text-center text-sm text-ink-2">Call your scribe: <a className="font-medium text-brand" href={code ? `/r/${code}?src=receipt` : "/line"} data-testid="receipt-cta">{r.line}</a></p>
        <p className="mt-1 text-center text-xs text-ink-4">Hours back is an estimate at 12 minutes per note. No patient information is on this page.</p>
      </article>
    </main>
  );
}
