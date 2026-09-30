import Recap, { RecapFooter } from "@/components/visit/Recap";
import { familyView } from "@/lib/server/patientVisit";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit notes · Chartside", robots: { index: false }, referrer: "no-referrer" as const };

export default async function FamilyPage({ params }: { params: Promise<{ token: string }> }) {
  const d = await familyView((await params).token);
  const date = d ? new Date(d.recordedAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
  return (
    <main className="min-h-screen bg-paper">
      <header className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4 font-semibold text-ink">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">C</span>
        Chartside
      </header>
      <div className="mx-auto max-w-2xl px-4 pb-16">
        {!d ? (
          <div className="card mt-10 p-6 text-center" data-testid="family-gone">
            <p className="font-serif text-2xl">This link isn&apos;t working</p>
            <p className="mt-2 text-ink-2">It expired, or the person who shared it turned it off.</p>
          </div>
        ) : (
          <div data-testid="family-view">
            <p className="text-sm text-ink-3">{d.patientName ? `${d.patientName}'s visit` : "A family member's visit"} · {date}{d.visitTime ? ` at ${d.visitTime}` : ""}{d.clinicianName ? ` · ${d.clinicianName}` : ""}</p>
            <p className="mt-1 text-xs text-ink-4">Shared with you, read only. This link stops working on {new Date(d.expiresAt!).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.</p>
            {d.recap ? <div className="mt-3"><Recap recap={d.recap} /></div> : null}
            {d.notes.trim() && (
              <section className="card mt-4 p-5" data-testid="family-notes">
                <h2 className="font-semibold text-ink">{d.recap ? "Their own notes" : "Their notes"}</h2>
                <p className="mt-2 whitespace-pre-wrap text-ink-2">{d.notes}</p>
              </section>
            )}
            <RecapFooter recorded={!!d.recap} />
          </div>
        )}
      </div>
    </main>
  );
}
