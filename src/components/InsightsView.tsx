"use client";

import Link from "next/link";
import { useState } from "react";
import type { Insights } from "@/lib/server/insights";
import type { StyleRule } from "@/lib/types";
import { Info, Sparkle } from "./icons";
import { Kpi } from "./ui";

function DailyBars({ title, unit, data, fmt }: { title: string; unit: string; data: { date: string; value: number | null }[]; fmt: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const W = 520;
  const H = 150;
  const pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.value ?? 0));
  const nice = max <= 5 ? Math.ceil(max) : Math.ceil(max / 5) * 5;
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const label = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button className="text-xs text-ink-3 hover:text-ink" onClick={() => setTable((t) => !t)}>{table ? "Chart" : "Table"}</button>
      </div>
      {table ? (
        <table className="mt-2 w-full text-sm"><tbody>{data.map((d) => <tr key={d.date} className="border-b border-line last:border-0"><td className="py-1 text-ink-2">{label(d.date)}</td><td className="py-1 text-right font-mono">{d.value === null ? "—" : fmt(d.value)}</td></tr>)}</tbody></table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label={title}>
            {Array.from(new Set([0, Math.round(nice / 2), nice])).map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-ink-3)">{Math.round(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const v = d.value ?? 0;
              const x = pad.l + i * bw + 2;
              const w = Math.max(2, bw - 4);
              const top = y(v);
              const h = H - pad.b - top;
              return (
                <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
                  {d.value !== null && v > 0 && <path d={`M${x},${H - pad.b} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`} fill={hover === i ? "var(--color-brand-600)" : "var(--color-brand)"} />}
                  {(i % 3 === 0 || i === data.length - 1) && <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">{label(d.date)}</text>}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute -top-2 rounded-md bg-ink px-2 py-1 text-xs text-white shadow" style={{ left: `${((pad.l + hover * bw + bw / 2) / W) * 100}%`, transform: "translate(-50%, -100%)" }}>
              {label(data[hover].date)} · {data[hover].value === null ? "no data" : `${fmt(data[hover].value!)} ${unit}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsView({ insights: i, rules }: { insights: Insights; rules: StyleRule[] }) {
  const learned = rules.filter((r) => r.source === "learned");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Insights</h1>
      <p className="mt-1 text-sm text-ink-2">Your last {i.windowDays} days. Computed from your own signing activity, not vendor benchmarks.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="kpis">
        <Kpi label="Notes signed" value={i.signed} hint={`${i.visits} visits scheduled`} />
        <Kpi label="Median time to sign" value={i.medianSignMinutes === null ? "—" : `${Math.round(i.medianSignMinutes)} min`} hint="From visit end to signature" tone="brand" />
        <Kpi label="Signed without edits" value={i.uneditedRate === null ? "—" : `${i.uneditedRate}%`} hint="Rises as Chartside learns your style" tone="ok" />
        <Kpi label="After-hours signing" value={i.afterHoursSigned} hint="Signed after 7 pm or on weekends" tone={i.afterHoursSigned ? "warn" : "ink"} />
        <Kpi label="Sentences linked to visit" value={i.evidencePct === null ? "—" : `${i.evidencePct}%`} hint="Average across drafted notes" />
        <Kpi label="Omissions caught" value={i.omissionsCaught} hint="Said in the room, missing from draft" />
        <Kpi label="Words drafted for you" value={i.wordsDrafted.toLocaleString()} hint={`≈ ${i.typingMinutesAvoided} min of typing at 40 wpm`} />
        <Kpi label="Average edit size" value={i.avgEditRatio === null ? "—" : `${i.avgEditRatio}%`} hint="Share of words changed before signing" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <DailyBars title="Notes signed per day" unit="notes" data={i.series.map((s) => ({ date: s.date, value: s.notes }))} fmt={(v) => String(v)} />
        <DailyBars title="Median minutes from visit end to signature" unit="min" data={i.series.map((s) => ({ date: s.date, value: s.medianSignMinutes === null ? null : Math.round(s.medianSignMinutes) }))} fmt={(v) => String(v)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-4" data-testid="coach">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkle size={15} className="text-brand" /> Coaching</p>
          {i.coach.length ? <ul className="mt-2 space-y-2 text-sm text-ink-2">{i.coach.map((c) => <li key={c} className="flex gap-2"><Info size={15} className="mt-0.5 shrink-0 text-info" />{c}</li>)}</ul> : <p className="mt-2 text-sm text-ink-3">You&apos;re using Chartside consistently. Nothing to suggest.</p>}
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-3">Ambient capture by visit type</p>
          <table className="mt-1 w-full text-sm">
            <tbody>
              {i.usage.map((u) => (
                <tr key={u.type} className="border-b border-line last:border-0"><td className="py-1.5 capitalize">{u.type}</td><td className="py-1.5 text-right text-ink-3">{u.captured}/{u.total}</td><td className="w-32 py-1.5 pl-3"><div className="h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full bg-brand" style={{ width: `${u.pct}%` }} /></div></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-4" data-testid="learned-rules">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">What Chartside learned from your edits</p>
            <Link href="/settings" className="text-xs font-medium text-brand">Manage</Link>
          </div>
          {learned.length ? (
            <ul className="mt-2 space-y-2 text-sm">
              {learned.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span className={`pill ${r.active ? "bg-ok-50 text-ok" : "bg-sunken text-ink-3"}`}>{r.active ? "Applied" : `Seen ${r.support}×`}</span>
                  <span className="text-ink-2">{r.label}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-ink-3">Sign a few notes with edits and your preferences will appear here.</p>}
          <p className="mt-3 text-xs text-ink-3">A pattern becomes a rule after you make the same edit twice. Every rule can be turned off.</p>
        </div>
      </div>
    </div>
  );
}
