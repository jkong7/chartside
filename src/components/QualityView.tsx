"use client";

import Link from "next/link";
import { useState } from "react";
import type { qualityDashboard } from "@/lib/server/quality";
import { Kpi } from "./ui";

type Data = Awaited<ReturnType<typeof qualityDashboard>>;

function Bar({ rate, inverse }: { rate: number | null; inverse?: boolean }) {
  if (rate === null) return <span className="text-xs text-ink-4">No eligible patients</span>;
  const good = inverse ? rate >= 80 : rate >= 70;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${rate}%`}>
        <div className={`h-full rounded-full ${good ? "bg-ok" : "bg-warn"}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="w-10 text-right font-mono text-sm">{rate}%</span>
    </div>
  );
}

export default function QualityView({ data, scope }: { data: Data; scope: "mine" | "org" }) {
  const [open, setOpen] = useState<string | null>(null);
  const eligible = data.measures.filter((m) => m.eligible > 0);
  const totalGaps = data.gaps.length;
  const avg = eligible.length ? Math.round(eligible.reduce((n, m) => n + (m.rate ?? 0), 0) / eligible.length) : null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Quality</h1>
      <p className="mt-1 text-sm text-ink-2">Performance on CMS electronic clinical quality measures across {scope === "mine" ? "your" : "the organization's"} patients, using each patient&apos;s most recent signed visit in the last 12 months. Gaps show up in the pre-visit brief so they can be closed at the next visit.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3" data-testid="quality-kpis">
        <Kpi label="Patients measured" value={data.patients} />
        <Kpi label="Average performance" value={avg === null ? "—" : `${avg}%`} tone="brand" hint="Across measures with eligible patients" />
        <Kpi label="Open care gaps" value={totalGaps} tone={totalGaps ? "warn" : "ok"} />
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-testid="quality-table">
          <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Measure</th><th>eCQM</th><th className="text-right">Eligible</th><th className="text-right">Met</th><th className="text-right">Gaps</th><th className="px-4">Performance</th></tr></thead>
          <tbody>
            {data.measures.map((m) => (
              <tr key={m.id} className="border-t border-line align-top" data-testid="quality-row">
                <td className="px-4 py-2.5">
                  <button className="text-left font-medium hover:text-brand" onClick={() => setOpen(open === m.id ? null : m.id)}>{m.title}</button>
                  <p className="text-xs text-ink-3">{m.population}{m.inverse ? " · inverse measure, shown as the share in control" : ""}</p>
                  {open === m.id && m.clinicians.length > 0 && (
                    <ul className="mt-2 space-y-1">{m.clinicians.map((c) => <li key={c.name} className="flex items-center gap-3 text-xs"><span className="w-40 truncate">{c.name}</span><Bar rate={c.rate} inverse={m.inverse} /></li>)}</ul>
                  )}
                </td>
                <td className="py-2.5 font-mono text-xs">{m.ecqm}</td>
                <td className="py-2.5 text-right">{m.eligible}</td>
                <td className="py-2.5 text-right">{m.met + (m.inverse ? m.addressed : 0)}</td>
                <td className="py-2.5 text-right">{m.gap || ""}</td>
                <td className="px-4 py-2.5"><Bar rate={m.rate} inverse={m.inverse} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-serif text-xl">Open care gaps</h2>
      <ul className="card mt-3 divide-y divide-line" data-testid="gap-list">
        {data.gaps.map((g, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <Link className="font-medium text-brand hover:underline" href={`/patients/${g.patientId}`}>{g.patientName}</Link>
            <span className="flex-1 text-ink-2">{g.measure}: <span className="text-ink-3">{g.reason}</span></span>
            {scope === "org" && <span className="text-xs text-ink-4">{g.clinician}</span>}
            <Link className="text-xs text-brand hover:underline" href={`/encounters/${g.encounterId}?tab=quality`}>Last visit</Link>
          </li>
        ))}
        {!data.gaps.length && <li className="px-4 py-8 text-center text-ink-3">No open gaps.</li>}
      </ul>
    </div>
  );
}
