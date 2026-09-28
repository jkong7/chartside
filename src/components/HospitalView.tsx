"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { census, Handoff } from "@/lib/server/inpatient";
import { Bed, Check, Plus } from "./icons";
import { Kpi, Modal, Spinner, StatusPill, Toast } from "./ui";

type Row = Awaited<ReturnType<typeof census>>[number];

export const SEVERITY: Record<Handoff["severity"], { label: string; cls: string }> = {
  stable: { label: "Stable", cls: "bg-ok-50 text-ok" },
  watcher: { label: "Watcher", cls: "bg-warn-50 text-warn" },
  unstable: { label: "Unstable", cls: "bg-rec-50 text-rec" },
};

export function HandoffEditor({ admissionId, handoff, draft, onSaved, readOnly }: { admissionId: string; handoff: Handoff; draft: boolean; onSaved: () => void; readOnly?: boolean }) {
  const [h, setH] = useState<Handoff>(handoff);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-2 text-sm" data-testid="handoff-editor">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Illness severity</span>
        {(Object.keys(SEVERITY) as Handoff["severity"][]).map((s) => (
          <button key={s} disabled={readOnly} className={`pill text-[11px] ${h.severity === s ? SEVERITY[s].cls + " ring-1 ring-current" : "bg-sunken text-ink-3"}`} onClick={() => setH({ ...h, severity: s })} data-testid={`severity-${s}`}>{SEVERITY[s].label}</button>
        ))}
        {draft && <span className="text-[11px] text-ink-4">Drafted from the latest note; review before handoff</span>}
      </div>
      <label className="block"><span className="label">Patient summary</span><textarea className="input text-sm" rows={3} value={h.summary} disabled={readOnly} onChange={(e) => setH({ ...h, summary: e.target.value })} data-testid="handoff-summary" /></label>
      <label className="block"><span className="label">Action list (one per line)</span><textarea className="input text-sm" rows={3} value={h.actions.join("\n")} disabled={readOnly} onChange={(e) => setH({ ...h, actions: e.target.value.split("\n") })} data-testid="handoff-actions" /></label>
      <label className="block"><span className="label">Situation awareness and contingencies</span><textarea className="input text-sm" rows={2} value={h.awareness} disabled={readOnly} onChange={(e) => setH({ ...h, awareness: e.target.value })} placeholder="If ___, then ___" data-testid="handoff-awareness" /></label>
      {!readOnly && (
        <div className="flex items-center justify-end gap-2">
          {h.updatedAt && <span className="text-[11px] text-ink-4">Updated by {h.updatedBy} {new Date(h.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
          <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); await api(`/admissions/${admissionId}/handoff`, { method: "PUT", body: { ...h, actions: h.actions.filter((x) => x.trim()) } }); setBusy(false); onSaved(); }} data-testid="handoff-save">{busy ? <Spinner /> : <Check size={14} />} Save handoff</button>
        </div>
      )}
    </div>
  );
}

export default function HospitalView({ initial, patients, attendings, me, canDocument }: { initial: Row[]; patients: { id: string; name: string; mrn: string }[]; attendings: { id: string; name: string }[]; me: string; canDocument: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async () => setRows((await api<{ census: Row[] }>("/admissions")).census);
  const unstable = rows.filter((r) => r.handoff.severity !== "stable").length;
  const unsigned = rows.filter((r) => !r.todayNote || r.todayNote.status !== "signed").length;

  async function start(r: Row, kind: "progress" | "discharge") {
    setBusy(`${r.id}:${kind}`);
    try {
      const { encounterId } = await api<{ encounterId: string }>(`/admissions/${r.id}/notes`, { body: { kind } });
      router.push(`/encounters/${encounterId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start the note");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Hospital</h1>
          <p className="mt-1 text-sm text-ink-2">Your inpatient census. Daily notes show what changed since yesterday, the hospital course builds itself, and the discharge summary is assembled from the whole stay.</p>
        </div>
        <Link className="btn-outline" href="/hospital/handoff">I-PASS handoff</Link>
        {canDocument && <button className="btn-primary" onClick={() => setAdmitOpen(true)} data-testid="admit"><Plus size={14} /> Admit patient</button>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3" data-testid="census-kpis">
        <Kpi label="Patients on service" value={rows.length} tone="brand" />
        <Kpi label="Watcher or unstable" value={unstable} tone={unstable ? "warn" : "ink"} />
        <Kpi label="Today's notes not signed" value={unsigned} tone={unsigned ? "warn" : "ok"} />
      </div>
      {err && <p className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      <ul className="card mt-6 divide-y divide-line" data-testid="census">
        {rows.map((r) => (
          <li key={r.id} data-testid="census-row">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="w-20 shrink-0 text-center"><p className="font-mono text-sm font-semibold">{r.room || "—"}</p><p className="text-[11px] text-ink-4">{r.unit}</p></div>
              <div className="min-w-0 flex-1">
                <Link href={`/hospital/${r.id}`} className="font-medium hover:text-brand" data-testid="census-patient">{r.patientName}</Link>
                <p className="truncate text-xs text-ink-3">Day {r.day} · {r.reason}{r.attendingId !== me && r.attendingName ? ` · ${r.attendingName}` : ""}</p>
              </div>
              <span className={`pill text-[10px] ${SEVERITY[r.handoff.severity].cls}`}>{SEVERITY[r.handoff.severity].label}</span>
              {r.todayNote ? (
                <Link href={`/encounters/${r.todayNote.encounterId}`} className="flex items-center gap-1.5 text-xs" data-testid="today-note">{r.todayNote.kind === "discharge" ? "Discharge" : r.todayNote.kind === "inpatient" ? "H&P" : "Progress"} <StatusPill status={r.todayNote.status} /></Link>
              ) : canDocument ? (
                <button className="btn-outline px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => start(r, "progress")} data-testid="start-progress">{busy === `${r.id}:progress` ? <Spinner /> : null} Today&apos;s progress note</button>
              ) : <span className="text-xs text-ink-4">No note today</span>}
              <button className="btn-ghost px-2 text-xs" onClick={() => setOpen(open === r.id ? null : r.id)} data-testid="toggle-handoff">Handoff</button>
              {canDocument && <button className="btn-ghost px-2 text-xs" disabled={!!busy} onClick={() => start(r, "discharge")} data-testid="start-discharge">Discharge</button>}
            </div>
            {open === r.id && (
              <div className="border-t border-line bg-paper px-4 py-3">
                <HandoffEditor admissionId={r.id} handoff={r.handoff} draft={r.handoffDraft} readOnly={!canDocument} onSaved={async () => { await reload(); setToast("Handoff saved."); }} />
              </div>
            )}
          </li>
        ))}
        {!rows.length && <li className="flex flex-col items-center gap-2 px-4 py-12 text-sm text-ink-3"><Bed size={22} /> No patients on your service.</li>}
      </ul>
      <AdmitModal open={admitOpen} onClose={() => setAdmitOpen(false)} patients={patients.filter((p) => !rows.some((r) => r.patientId === p.id))} attendings={attendings} me={me} onAdmitted={(encId) => router.push(`/encounters/${encId}`)} />
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}

function AdmitModal({ open, onClose, patients, attendings, me, onAdmitted }: { open: boolean; onClose: () => void; patients: { id: string; name: string; mrn: string }[]; attendings: { id: string; name: string }[]; me: string; onAdmitted: (encId: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Admit a patient">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        try {
          const r = await api<{ encounterId: string }>("/admissions", { body: { patientId: f.get("patientId"), unit: f.get("unit"), room: f.get("room"), reason: f.get("reason"), attendingId: f.get("attendingId") } });
          onAdmitted(r.encounterId);
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Could not admit");
          setBusy(false);
        }
      }}>
        <label className="block"><span className="label">Patient</span><select name="patientId" className="input" required data-testid="admit-patient"><option value="">Choose…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · MRN {p.mrn}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Unit</span><input name="unit" className="input" placeholder="4 West" data-testid="admit-unit" /></label>
          <label className="block"><span className="label">Room</span><input name="room" className="input" placeholder="412" data-testid="admit-room" /></label>
        </div>
        <label className="block"><span className="label">Reason for admission</span><input name="reason" className="input" required placeholder="Community-acquired pneumonia" data-testid="admit-reason" /></label>
        <label className="block"><span className="label">Attending</span><select name="attendingId" className="input" defaultValue={attendings.some((a) => a.id === me) ? me : attendings[0]?.id}>{attendings.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="admit-save">{busy ? <Spinner /> : <Bed size={14} />} Admit and start H&amp;P</button></div>
      </form>
    </Modal>
  );
}
