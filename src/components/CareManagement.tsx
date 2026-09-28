"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { ccmWorklist } from "@/lib/server/ccm";
import { Download, Plus } from "./icons";
import { Modal, Spinner, Toast } from "./ui";

type Data = Awaited<ReturnType<typeof ccmWorklist>>;

const ACTIVITIES = ["Care plan review", "Medication management", "Care coordination with specialist", "Patient phone call", "Refill and lab follow-up", "Community resource referral"];

export default function CareManagement({ initial, clinicians, me, canWork }: { initial: Data; clinicians: { id: string; name: string }[]; me: string; canWork: boolean }) {
  const [d, setD] = useState(initial);
  const [enrollFor, setEnrollFor] = useState<Data["eligible"][number] | null>(null);
  const [logFor, setLogFor] = useState<Data["enrolled"][number] | null>(null);
  const [plan, setPlan] = useState<Data["enrolled"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const reload = async (month = d.month) => setD(await api<Data>(`/ccm?month=${month}`));
  const billable = d.enrolled.filter((e) => e.totals.codes.length).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Care management</h1>
          <p className="mt-1 text-sm text-ink-2">Chronic care management for patients with two or more chronic conditions: consent, a care plan drafted from the chart, monthly time, and month-end codes (99490 and 99439 for clinical staff, 99491 and 99437 for practitioners).</p>
        </div>
        <input type="month" className="input w-40" value={d.month} onChange={(e) => reload(e.target.value)} aria-label="Month" data-testid="ccm-month" />
        <a className="btn-outline" href={`/api/ccm/export?month=${d.month}`} data-testid="ccm-export"><Download size={14} /> Month-end export ({billable})</a>
      </div>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm" data-testid="ccm-enrolled">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-4"><tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">This month</th><th className="px-3 py-2">Codes</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {d.enrolled.map((e) => (
              <tr key={e.id} data-testid="ccm-row">
                <td className="px-3 py-2.5"><Link href={`/patients/${e.patientId}`} className="font-medium hover:text-brand">{e.name}</Link><p className="text-xs text-ink-3">Consent {e.consentMethod} · {e.consentAt.slice(0, 10)}</p></td>
                <td className="px-3 py-2.5">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-brand" style={{ width: `${Math.min(100, (e.totals.staffMinutes / 20) * 100)}%` }} /></div>
                  <p className="mt-1 text-xs text-ink-3" data-testid="ccm-minutes">{e.totals.staffMinutes} staff min{e.totals.physicianMinutes ? ` · ${e.totals.physicianMinutes} practitioner min` : ""}{e.totals.remainingFor99490 && !e.totals.codes.length ? ` · ${e.totals.remainingFor99490} to go` : ""}</p>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs" data-testid="ccm-codes">{e.totals.codes.map((c) => `${c.cpt}${c.units > 1 ? ` x${c.units}` : ""}`).join(", ") || "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  {canWork && <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => { setErr(null); setLogFor(e); }} data-testid="ccm-log"><Plus size={12} /> Log time</button>}
                  <button className="btn-ghost ml-1 px-2 text-xs" onClick={() => setPlan(e)} data-testid="ccm-plan">Care plan</button>
                </td>
              </tr>
            ))}
            {!d.enrolled.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-3">No one is enrolled yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Eligible, not enrolled ({d.eligible.length})</h2>
      <ul className="card mt-2 divide-y divide-line" data-testid="ccm-eligible">
        {d.eligible.map((e) => (
          <li key={e.patientId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="flex-1"><span className="font-medium">{e.name}</span> <span className="text-xs text-ink-3">{e.chronic.join(", ")}</span></span>
            {canWork && <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => { setErr(null); setEnrollFor(e); }} data-testid="ccm-enroll">Enroll</button>}
          </li>
        ))}
      </ul>
      <Modal open={!!enrollFor} onClose={() => setEnrollFor(null)} title={enrollFor ? `Enroll ${enrollFor.name}` : ""}>
        {enrollFor && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setErr(null);
            try {
              await api("/ccm", { body: { patientId: enrollFor.patientId, consentMethod: f.get("consent"), billingClinicianId: f.get("billing") } });
              setEnrollFor(null);
              await reload();
              setToast("Enrolled. A care plan was drafted from the chart.");
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Could not enroll");
            }
            setBusy(false);
          }}>
            <p className="text-sm text-ink-2">Tell the patient what CCM includes, that they can stop at any time, and that cost sharing may apply. Record their consent here.</p>
            <label className="block"><span className="label">Consent</span><select name="consent" className="input" required data-testid="ccm-consent"><option value="">Choose…</option><option value="verbal">Verbal consent, documented</option><option value="written">Written consent on file</option></select></label>
            <label className="block"><span className="label">Billing practitioner</span><select name="billing" className="input" defaultValue={clinicians.some((c) => c.id === me) ? me : clinicians[0]?.id}>{clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            {err && <p className="text-sm text-rec" role="alert">{err}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEnrollFor(null)}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="ccm-enroll-save">{busy ? <Spinner /> : null} Enroll</button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!logFor} onClose={() => setLogFor(null)} title={logFor ? `Log time for ${logFor.name}` : ""}>
        {logFor && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setErr(null);
            try {
              await api(`/ccm/${logFor.id}`, { body: { minutes: Number(f.get("minutes")), activity: f.get("activity"), note: f.get("note") } });
              setLogFor(null);
              await reload();
            } catch (x) {
              setErr(x instanceof Error ? x.message : "Could not log time");
            }
            setBusy(false);
          }}>
            <div className="grid grid-cols-3 gap-3">
              <label className="block"><span className="label">Minutes</span><input name="minutes" type="number" min={1} max={120} className="input" required data-testid="ccm-minutes-input" /></label>
              <label className="col-span-2 block"><span className="label">Activity</span><select name="activity" className="input" data-testid="ccm-activity">{ACTIVITIES.map((a) => <option key={a}>{a}</option>)}</select></label>
            </div>
            <label className="block"><span className="label">Note</span><textarea name="note" className="input text-sm" rows={2} /></label>
            {err && <p className="text-sm text-rec" role="alert">{err}</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setLogFor(null)}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="ccm-log-save">{busy ? <Spinner /> : null} Save</button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!plan} onClose={() => setPlan(null)} title={plan ? `Care plan · ${plan.name}` : ""} wide>
        {plan && (
          <div className="space-y-3 text-sm" data-testid="ccm-careplan">
            {plan.carePlan.map((p) => (
              <div key={p.problem} className="rounded-lg border border-line p-3">
                <p className="font-medium">{p.problem} {p.icd10 && <span className="font-mono text-xs text-ink-3">{p.icd10}</span>}</p>
                <p className="mt-1">Goal: {p.goal}</p>
                <ul className="mt-1 list-inside list-disc text-ink-2">{p.interventions.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
            <p className="text-xs text-ink-3">Share the care plan with the patient and review it at least yearly.</p>
          </div>
        )}
      </Modal>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
