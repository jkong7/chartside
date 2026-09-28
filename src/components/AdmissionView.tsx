"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { age, api } from "@/lib/client";
import type { admissionDetail } from "@/lib/server/inpatient";
import { HandoffEditor } from "./HospitalView";
import NursingPanel from "./NursingPanel";
import { NURSING_DEMO, INPATIENT_DEMO } from "@/lib/demo/scripts";
import { Tabs } from "./ui";
import { Spinner, StatusPill, Toast } from "./ui";

type Data = NonNullable<Awaited<ReturnType<typeof admissionDetail>>>;

const KIND: Record<string, string> = { inpatient: "Admission H&P", progress: "Progress note", discharge: "Discharge summary" };

function WeightChart({ weights }: { weights: { day: number; weight: string | null }[] }) {
  const pts = weights.map((w) => ({ day: w.day, v: Number.parseFloat(w.weight ?? "") })).filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return null;
  const W = 280;
  const H = 90;
  const min = Math.min(...pts.map((p) => p.v)) - 1;
  const max = Math.max(...pts.map((p) => p.v)) + 1;
  const x = (i: number) => 24 + (i * (W - 40)) / (pts.length - 1);
  const y = (v: number) => 10 + (H - 30) * (1 - (v - min) / (max - min));
  const unit = (weights[0].weight ?? "").replace(/[\d.\s]/g, "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-xs" role="img" aria-label={`Weight by hospital day: ${pts.map((p) => `day ${p.day} ${p.v} ${unit}`).join(", ")}`}>
      <polyline fill="none" stroke="var(--color-brand)" strokeWidth={2} points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} />
      {pts.map((p, i) => (
        <g key={p.day}>
          <circle cx={x(i)} cy={y(p.v)} r={3.5} fill="var(--color-brand)" />
          <text x={x(i)} y={y(p.v) - 7} textAnchor="middle" fontSize={10} fill="var(--color-ink-2)">{p.v}</text>
          <text x={x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">Day {p.day}</text>
        </g>
      ))}
    </svg>
  );
}

export default function AdmissionView({ initial, canDocument, canNurse }: { initial: Data; canDocument: boolean; canNurse: boolean }) {
  const [view, setView] = useState<"physician" | "nursing">(canDocument ? "physician" : "nursing");
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const a = d.admission;
  const active = a.status === "active";

  async function start(kind: "progress" | "discharge") {
    setBusy(kind);
    setErr(null);
    try {
      const { encounterId } = await api<{ encounterId: string }>(`/admissions/${a.id}/notes`, { body: { kind } });
      router.push(`/encounters/${encounterId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <Link href="/hospital" className="text-sm text-ink-3 hover:text-ink">← Census</Link>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl" data-testid="admission-patient">{a.patientName}</h1>
          <p className="mt-1 text-sm text-ink-2">{age(a.dob)}{a.sex} · MRN {a.mrn} · {[a.unit, a.room].filter(Boolean).join(" ")} · Hospital day {a.day} · {a.attendingName}</p>
          <p className="text-sm text-ink-3">{a.reason} · admitted {new Date(a.admitAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{a.dischargeAt ? ` · discharged ${new Date(a.dischargeAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</p>
        </div>
        {!active && <span className="pill bg-sunken text-ink-3" data-testid="discharged">Discharged</span>}
        {active && canDocument && (
          <>
            <button className="btn-outline" disabled={!!busy} onClick={() => start("progress")} data-testid="admission-progress">{busy === "progress" ? <Spinner /> : null} Today&apos;s progress note</button>
            <button className="btn-primary" disabled={!!busy} onClick={() => start("discharge")} data-testid="admission-discharge">{busy === "discharge" ? <Spinner /> : null} Discharge summary</button>
          </>
        )}
      </div>
      {err && <p className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      <div className="mt-5"><Tabs<"physician" | "nursing"> value={view} onChange={setView} tabs={[{ id: "physician", label: "Physician" }, { id: "nursing", label: "Nursing" }]} /></div>
      {view === "nursing" ? <div className="mt-5"><NursingPanel admissionId={a.id} canDocument={canNurse && active} demo={a.mrn === INPATIENT_DEMO.mrn ? NURSING_DEMO : undefined} /></div> : (
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="card">
            <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Notes</h2>
            <ul className="divide-y divide-line" data-testid="admission-notes">
              {d.encounters.map((e) => (
                <li key={e.id}><Link href={`/encounters/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-sunken"><span className="w-14 text-xs text-ink-3">Day {e.day}</span><span className="flex-1 font-medium">{KIND[e.kind] ?? e.reason}</span><span className="text-xs text-ink-4">{new Date(e.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><StatusPill status={e.status as never} /></Link></li>
              ))}
            </ul>
          </section>
          <section className="card p-4" data-testid="hospital-course">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Hospital course so far</h2>
            <p className="mt-1 text-xs text-ink-3">Built from each day&apos;s assessment and plan. The discharge summary starts from this.</p>
            {d.course.problems.length ? (
              <div className="mt-3 space-y-3">
                {d.course.problems.map((p) => (
                  <div key={p.label}><p className="text-sm font-medium">{p.label}</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">{p.items.map((x) => <li key={x}>{x}</li>)}</ul></div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm text-ink-3">Sign the admission H&amp;P to start the course.</p>}
          </section>
        </div>
        <div className="space-y-5">
          {d.weights.length >= 2 && (
            <section className="card p-4"><h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Daily weight</h2><div className="mt-2"><WeightChart weights={d.weights} /></div></section>
          )}
          <section className="card p-4">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-2">I-PASS handoff</h2>
            <HandoffEditor admissionId={a.id} handoff={d.handoff} draft={!a.handoff} readOnly={!canDocument || !active} onSaved={async () => { setD(await api<Data>(`/admissions/${a.id}`)); setToast("Handoff saved."); }} />
          </section>
        </div>
      </div>
      )}
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
