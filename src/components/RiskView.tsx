import Link from "next/link";
import type { riskWorklist } from "@/lib/server/riskAdjust";
import { Kpi } from "./ui";

type Rows = Awaited<ReturnType<typeof riskWorklist>>;

export default function RiskView({ rows }: { rows: Rows }) {
  const total = Math.round(rows.reduce((n, r) => n + r.opportunity, 0) * 100) / 100;
  const scheduled = rows.filter((r) => r.nextVisit).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Risk adjustment</h1>
      <p className="mt-1 text-sm text-ink-2">Medicare patients with chronic conditions (CMS-HCC V28) not yet documented this calendar year, and conditions that results suggest but the problem list lacks. Recapture only what you assess at a visit: each condition needs support for monitoring, evaluation, assessment, or treatment (MEAT). Suspects are prompts for evaluation, never codes to add without an exam.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="risk-kpis">
        <Kpi label="Patients with open items" value={rows.length} />
        <Kpi label="RAF at stake if confirmed" value={total.toFixed(3)} tone="warn" />
        <Kpi label="Already scheduled" value={scheduled} tone="brand" hint="Close these at the next visit" />
      </div>
      <ul className="mt-6 space-y-3" data-testid="risk-list">
        {rows.map((r) => (
          <li key={r.patientId} className="card p-4" data-testid="risk-row">
            <div className="flex flex-wrap items-center gap-3">
              <Link href={`/patients/${r.patientId}`} className="font-medium hover:text-brand">{r.name}</Link>
              <span className="text-xs text-ink-3">{r.age} · {r.payer} · captured RAF {r.capturedRaf.toFixed(3)}{r.lastSeen ? ` · last seen ${new Date(r.lastSeen).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</span>
              <span className="flex-1" />
              {r.opportunity > 0 && <span className="pill bg-warn-50 text-[11px] text-warn">+{r.opportunity.toFixed(3)} RAF</span>}
              {r.nextVisit ? <Link className="btn-outline px-2.5 py-1 text-xs" href={`/encounters/${r.nextVisit.id}`}>Next visit {new Date(r.nextVisit.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Link> : <Link className="text-xs text-brand" href="/scheduling">Needs a visit</Link>}
            </div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {r.recapture.length > 0 && (
                <div><p className="label">Recapture this year</p><ul className="space-y-1 text-sm">{r.recapture.map((s) => <li key={s.code}><span className="font-mono text-xs">{s.code}</span> {s.label} <span className="text-xs text-ink-3">{s.hccs.join(", ")} · +{s.delta.toFixed(3)}</span></li>)}</ul></div>
              )}
              {r.evidence.length > 0 && (
                <div><p className="label">Evaluate: results suggest</p><ul className="space-y-1 text-sm">{r.evidence.map((e) => <li key={e.suggestedCode}>{e.condition} <span className="font-mono text-xs text-ink-3">{e.suggestedCode}</span><span className="block text-xs text-ink-3">{e.evidence}</span></li>)}</ul></div>
              )}
            </div>
          </li>
        ))}
        {!rows.length && <li className="card px-4 py-10 text-center text-sm text-ink-3">No open risk adjustment items.</li>}
      </ul>
    </div>
  );
}
