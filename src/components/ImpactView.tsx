"use client";

import { useRouter } from "next/navigation";
import type { impact } from "@/lib/server/impact";
import { Kpi } from "./ui";

type Data = Awaited<ReturnType<typeof impact>>;

function WeekBars({ weeks }: { weeks: Data["weeks"] }) {
  if (!weeks.length) return <p className="text-sm text-ink-3">No visits yet.</p>;
  const max = Math.max(1, ...weeks.map((w) => w.visits));
  const W = 520;
  const H = 150;
  const bw = (W - 40) / weeks.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Visits per week: ${weeks.map((w) => `${w.week} ${w.visits} visits, ${w.ambient} ambient`).join("; ")}`}>
      {weeks.map((w, i) => {
        const x = 30 + i * bw + 4;
        const h = ((H - 30) * w.visits) / max;
        const ha = ((H - 30) * w.ambient) / max;
        return (
          <g key={w.week}>
            <rect x={x} y={H - 20 - h} width={bw - 8} height={h} rx={3} fill="var(--color-line)" />
            <rect x={x} y={H - 20 - ha} width={bw - 8} height={ha} rx={3} fill="var(--color-brand)" />
            <text x={x + (bw - 8) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">{new Date(`${w.week}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</text>
            <text x={x + (bw - 8) / 2} y={H - 24 - h} textAnchor="middle" fontSize={10} fill="var(--color-ink-2)">{w.visits}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ImpactView({ data: d }: { data: Data }) {
  const router = useRouter();
  const go = (days: number, baseline = d.baselineMinutes) => router.push(`/impact?days=${days}&baseline=${baseline}`);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Impact</h1>
          <p className="mt-1 text-sm text-ink-2">Adoption, time back, revenue integrity, quality, and patient communication across the organization.</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line text-sm" role="radiogroup" aria-label="Period">
          {[7, 30, 90].map((n) => <button key={n} role="radio" aria-checked={d.days === n} className={`px-3 py-1.5 ${d.days === n ? "bg-brand text-white" : "hover:bg-sunken"}`} onClick={() => go(n)}>{n} days</button>)}
        </div>
      </div>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">Adoption</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-3" data-testid="impact-adoption">
        <Kpi label="Active clinicians" value={d.adoption.clinicians} />
        <Kpi label="Visits" value={d.adoption.visits} />
        <Kpi label="Visits with ambient capture" value={d.adoption.ambientRate === null ? "—" : `${d.adoption.ambientRate}%`} tone="brand" hint="Sustained use is the metric that predicts value" />
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card p-4"><p className="text-sm font-semibold">Visits per week <span className="font-normal text-ink-3">(teal: captured ambiently)</span></p><WeekBars weeks={d.weeks} /></div>
        {d.adoption.byLocation.length > 1 && <div className="card p-4"><p className="text-sm font-semibold">By location</p><ul className="mt-2 space-y-1.5 text-sm" data-testid="impact-locations">{d.adoption.byLocation.map((l) => <li key={l.name} className="flex items-center gap-2"><span className="flex-1 truncate">{l.name}</span><span className="text-xs text-ink-3">{l.visits} visits · {l.signed} signed</span><span className="w-10 text-right font-mono text-xs">{l.rate}%</span></li>)}</ul></div>}
        <div className="card p-4"><p className="text-sm font-semibold">By clinician</p><ul className="mt-2 space-y-1.5 text-sm" data-testid="impact-clinicians">{d.adoption.byClinician.map((c) => <li key={c.name} className="flex items-center gap-2"><span className="flex-1 truncate">{c.name}</span><span className="text-xs text-ink-3">{c.visits} visits</span><span className="w-10 text-right font-mono text-xs">{c.rate}%</span></li>)}</ul></div>
      </div>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">Time</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-4" data-testid="impact-time">
        <Kpi label="Estimated hours saved" value={d.time.hoursSaved} tone="ok" hint={<span>vs <input type="number" min={1} max={30} defaultValue={d.baselineMinutes} className="w-10 rounded border border-line bg-surface px-1 text-center" onBlur={(e) => go(d.days, Number(e.target.value) || 7)} aria-label="Baseline minutes per note" /> min per note by hand</span>} />
        <Kpi label="Median draft-to-sign" value={d.time.medianReviewMinutes === null ? "—" : `${d.time.medianReviewMinutes} min`} />
        <Kpi label="Signed same day" value={d.time.sameDayRate === null ? "—" : `${d.time.sameDayRate}%`} tone="brand" />
        <Kpi label="Signed after hours" value={d.time.afterHoursRate === null ? "—" : `${d.time.afterHoursRate}%`} tone={(d.time.afterHoursRate ?? 0) > 20 ? "warn" : "ink"} />
      </div>
      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-3">Revenue integrity and quality</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-4" data-testid="impact-revenue">
        <Kpi label="Claims built from notes" value={d.revenue.claims} />
        <Kpi label="Add-on codes captured" value={d.revenue.addOnLines} hint={`$${d.revenue.addOnCharges.toLocaleString("en-US")} in charges`} tone="brand" />
        <Kpi label="First-pass acceptance" value={d.revenue.firstPassRate === null ? "—" : `${d.revenue.firstPassRate}%`} />
        <Kpi label="Care gaps closed at the visit" value={d.quality.addressed} hint={`${d.quality.open} still open`} tone="ok" />
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <p className="text-sm font-semibold">Level of service mix</p>
          <ul className="mt-2 space-y-1 text-sm" data-testid="em-mix">
            {d.revenue.emMix.map((m) => { const total = d.revenue.emMix.reduce((n, x) => n + x.count, 0); return <li key={m.code} className="flex items-center gap-2"><span className="w-14 font-mono text-xs">{m.code}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-brand" style={{ width: `${(m.count / total) * 100}%` }} /></span><span className="w-8 text-right font-mono text-xs">{m.count}</span></li>; })}
            {!d.revenue.emMix.length && <li className="text-ink-3">No claims yet.</li>}
          </ul>
        </div>
        <div className="card p-4">
          <p className="text-sm font-semibold">Patient messages</p>
          <p className="mt-2 text-sm text-ink-2" data-testid="impact-messages">{d.messages.received} received · {d.messages.replied} answered{d.messages.medianReplyHours !== null ? ` · median reply ${d.messages.medianReplyHours} h` : ""}</p>
          <p className="mt-2 text-xs text-ink-3">Chart-grounded drafts don&apos;t save much typing time; their value is clearer answers, which reduces follow-up questions.</p>
        </div>
      </div>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Clinician experience</h2>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div className="card p-4" data-testid="impact-nps">
          <p className="text-sm font-semibold">Net Promoter Score</p>
          <p className="mt-1 font-serif text-4xl">{d.satisfaction.nps === null ? "—" : d.satisfaction.nps}</p>
          <p className="text-xs text-ink-3">{d.satisfaction.responses} responses · {d.satisfaction.promoters} promoters · {d.satisfaction.passives} passives · {d.satisfaction.detractors} detractors</p>
          <ul className="mt-3 space-y-2 text-sm">{d.satisfaction.comments.map((c, i) => <li key={i}><span className="font-mono text-xs text-ink-3">{c.score}</span> {c.comment} <span className="text-xs text-ink-4">· {c.name}</span></li>)}</ul>
        </div>
        <div className="card p-4" data-testid="impact-nudges">
          <p className="text-sm font-semibold">Who may need help</p>
          <ul className="mt-2 space-y-3 text-sm">
            {d.nudges.map((n, i) => <li key={i}><p><span className="font-medium">{n.name}</span> · {n.detail}</p><p className="text-xs text-ink-3">{n.tip}</p></li>)}
            {!d.nudges.length && <li className="text-ink-3">Everyone is using Chartside steadily.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
