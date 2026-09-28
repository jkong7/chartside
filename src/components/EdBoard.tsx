"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { edBoard } from "@/lib/server/ed";
import { Alert, Bed, Plus } from "./icons";
import { Kpi, Modal, Spinner, StatusPill, Toast } from "./ui";

type Board = Awaited<ReturnType<typeof edBoard>>;
type Row = Board["rows"][number];

const DISPOSITIONS = ["Discharge home", "Admit", "Observation", "Transfer", "Left against medical advice"];

const ESI_CLS: Record<number, string> = { 1: "bg-rec text-white", 2: "bg-rec-50 text-rec", 3: "bg-warn-50 text-warn", 4: "bg-brand-50 text-brand", 5: "bg-sunken text-ink-3" };

const STAGE: Record<Row["status"], string> = { waiting: "Waiting", roomed: "Roomed", seen: "With provider", dispo: "Dispositioned", departed: "Departed", lwbs: "Left without being seen" };

const fmtMins = (m: number | null) => (m === null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export default function EdBoard({ initial, patients, attendings, me, canUpdate, isProvider }: { initial: Board; patients: { id: string; name: string; mrn: string }[]; attendings: { id: string; name: string }[]; me: string; canUpdate: boolean; isProvider: boolean }) {
  const router = useRouter();
  const [board, setBoard] = useState(initial);
  const [arriveOpen, setArriveOpen] = useState(false);
  const [admitFor, setAdmitFor] = useState<Row | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "mine" | "unassigned">("all");

  const reload = async () => setBoard(await api<Board>("/ed"));
  useEffect(() => {
    const t = setInterval(() => { reload().catch(() => {}); }, 30000);
    return () => clearInterval(t);
  }, []);

  async function act(r: Row, body: Record<string, unknown>, done?: string) {
    setBusy(`${r.id}:${body.action}`);
    setErr(null);
    try {
      const res = await api<{ encounterId?: string }>(`/ed/${r.id}`, { body });
      if (body.action === "pickup" && res.encounterId) return router.push(`/encounters/${res.encounterId}`);
      await reload();
      if (done) setToast(done);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update the board");
    }
    setBusy(null);
  }

  const rows = board.rows.filter((r) => (filter === "mine" ? r.providerId === me : filter === "unassigned" ? !r.providerId : true));
  const m = board.metrics;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Emergency department</h1>
          <p className="mt-1 text-sm text-ink-2">The track board. Pick up a patient to start an ED note with a timed course, disposition, and critical care time, coded 99281 to 99285 and billed at place of service 23.</p>
        </div>
        {canUpdate && <button className="btn-primary" onClick={() => setArriveOpen(true)} data-testid="ed-arrive"><Plus size={14} /> New arrival</button>}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ed-kpis">
        <Kpi label="In department" value={m.inDepartment} hint={`${m.waiting} waiting for a provider`} tone="brand" />
        <Kpi label="Door to provider (median)" value={fmtMins(m.doorToProvider)} hint={`${m.arrivals} arrivals today`} tone={m.doorToProvider !== null && m.doorToProvider > 30 ? "warn" : "ink"} />
        <Kpi label="Length of stay (median)" value={fmtMins(m.medianLos)} hint={m.admitRate === null ? "No departures yet" : `${m.admitRate}% admitted or transferred`} />
        <Kpi label="Left without being seen" value={m.lwbs} tone={m.lwbs ? "warn" : "ok"} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(["all", "mine", "unassigned"] as const).map((f) => (
          <button key={f} className={`pill text-xs ${filter === f ? "bg-brand text-white" : "bg-sunken text-ink-3"}`} onClick={() => setFilter(f)} data-testid={`ed-filter-${f}`}>{f === "all" ? "All" : f === "mine" ? "My patients" : "Unassigned"}</button>
        ))}
      </div>
      {err && <p className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-testid="ed-board">
          <thead className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-4">
            <tr><th className="px-3 py-2">Bed</th><th className="px-3 py-2">ESI</th><th className="px-3 py-2">Patient</th><th className="px-3 py-2">Complaint</th><th className="px-3 py-2">LOS</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top" data-testid="ed-row">
                <td className="px-3 py-2.5">
                  {r.bed ? <span className="font-mono font-semibold" data-testid="ed-bed">{r.bed}</span> : canUpdate ? (
                    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const bed = new FormData(e.currentTarget).get("bed"); act(r, { action: "bed", bed }, `Roomed in ${bed}.`); }}>
                      <input name="bed" className="input w-16 px-2 py-1 text-xs" placeholder="Bed" data-testid="ed-bed-input" />
                      <button className="btn-ghost px-1.5 text-xs" data-testid="ed-bed-save">Room</button>
                    </form>
                  ) : <span className="text-ink-4">Lobby</span>}
                </td>
                <td className="px-3 py-2.5"><span className={`pill text-[11px] font-semibold ${ESI_CLS[r.esi]}`}>{r.esi}</span></td>
                <td className="px-3 py-2.5">
                  <Link href={`/patients/${r.patientId}`} className="font-medium hover:text-brand" data-testid="ed-patient">{r.patientName}</Link>
                  <p className="text-xs text-ink-3">{r.age}{r.sex} · MRN {r.mrn}</p>
                  {r.flags.map((f) => <p key={f} className="mt-0.5 flex items-center gap-1 text-[11px] text-rec" data-testid="ed-flag"><Alert size={11} /> {f}</p>)}
                </td>
                <td className="px-3 py-2.5 text-ink-2">{r.complaint}</td>
                <td className="px-3 py-2.5 font-mono text-xs">{fmtMins(r.losMinutes)}</td>
                <td className="px-3 py-2.5 text-xs">{r.providerName ?? <span className="text-ink-4">Unassigned</span>}</td>
                <td className="px-3 py-2.5 text-xs">
                  <p data-testid="ed-stage">{STAGE[r.status]}{r.disposition ? `: ${r.disposition}` : ""}</p>
                  {r.noteStatus && r.encounterId && <Link href={`/encounters/${r.encounterId}`} className="mt-1 inline-block" data-testid="ed-note"><StatusPill status={r.noteStatus} /></Link>}
                  {r.suggestedDisposition && <p className="mt-1 text-[11px] text-ink-3" data-testid="ed-suggested">Heard: {r.suggestedDisposition}</p>}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {isProvider && (!r.providerId || r.providerId !== me) && <button className="btn-primary px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => act(r, { action: "pickup" })} data-testid="ed-pickup">{busy === `${r.id}:pickup` ? <Spinner /> : null}{r.providerId ? "Take over" : "Pick up"}</button>}
                    {r.providerId === me && r.encounterId && <Link className="btn-outline px-2.5 py-1 text-xs" href={`/encounters/${r.encounterId}`} data-testid="ed-open">Open note</Link>}
                    {canUpdate && r.encounterId && !r.disposition && (
                      <select className="input w-36 px-2 py-1 text-xs" value="" onChange={(e) => e.target.value && act(r, { action: "disposition", disposition: e.target.value }, "Disposition recorded.")} data-testid="ed-dispo">
                        <option value="">{r.suggestedDisposition ? `Disposition (${r.suggestedDisposition})` : "Disposition…"}</option>
                        {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    )}
                    {isProvider && /Admit|Observation/.test(r.disposition ?? r.suggestedDisposition ?? "") && !r.admissionId && <button className="btn-outline px-2.5 py-1 text-xs" onClick={() => setAdmitFor(r)} data-testid="ed-admit"><Bed size={12} /> Admit</button>}
                    {r.admissionId && <Link className="btn-ghost px-2 text-xs" href={`/hospital/${r.admissionId}`} data-testid="ed-admission">Admission</Link>}
                    {canUpdate && r.disposition && <button className="btn-ghost px-2 text-xs" disabled={!!busy} onClick={() => act(r, { action: "depart" }, `${r.patientName} departed.`)} data-testid="ed-depart">Depart</button>}
                    {canUpdate && !r.encounterId && <button className="btn-ghost px-2 text-xs text-ink-3" disabled={!!busy} onClick={() => act(r, { action: "lwbs" }, "Marked left without being seen.")} data-testid="ed-lwbs">LWBS</button>}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-3">No patients on the board.</td></tr>}
          </tbody>
        </table>
      </div>
      <ArrivalModal open={arriveOpen} onClose={() => setArriveOpen(false)} patients={patients.filter((p) => !board.rows.some((r) => r.patientId === p.id))} onDone={async () => { setArriveOpen(false); await reload(); setToast("Patient added to the board."); router.refresh(); }} />
      <AdmitFromEd row={admitFor} attendings={attendings} me={me} onClose={() => setAdmitFor(null)} onDone={(encId) => router.push(`/encounters/${encId}`)} />
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}

function ArrivalModal({ open, onClose, patients, onDone }: { open: boolean; onClose: () => void; patients: { id: string; name: string; mrn: string }[]; onDone: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="New arrival">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        try {
          await api("/ed", { body: { patientId: mode === "existing" ? f.get("patientId") : undefined, name: f.get("name"), dob: f.get("dob"), sex: f.get("sex"), complaint: f.get("complaint"), esi: Number(f.get("esi")), bed: f.get("bed") } });
          onDone();
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Could not add the patient");
        }
        setBusy(false);
      }}>
        <div className="flex gap-2">
          {(["existing", "new"] as const).map((x) => <button type="button" key={x} className={`pill text-xs ${mode === x ? "bg-brand text-white" : "bg-sunken text-ink-3"}`} onClick={() => setMode(x)} data-testid={`arrive-${x}`}>{x === "existing" ? "Existing patient" : "New patient"}</button>)}
        </div>
        {mode === "existing" ? (
          <label className="block"><span className="label">Patient</span><select name="patientId" className="input" required data-testid="arrive-patient"><option value="">Choose…</option>{patients.map((p) => <option key={p.id} value={p.id}>{p.name} · MRN {p.mrn}</option>)}</select></label>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-3 block"><span className="label">Name</span><input name="name" className="input" required data-testid="arrive-name" /></label>
            <label className="col-span-2 block"><span className="label">Date of birth</span><input name="dob" type="date" className="input" required data-testid="arrive-dob" /></label>
            <label className="block"><span className="label">Sex</span><select name="sex" className="input" data-testid="arrive-sex"><option value="F">F</option><option value="M">M</option><option value="X">X</option></select></label>
          </div>
        )}
        <label className="block"><span className="label">Chief complaint</span><input name="complaint" className="input" required placeholder="Chest pain" data-testid="arrive-complaint" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Triage acuity (ESI)</span><select name="esi" className="input" defaultValue="3" data-testid="arrive-esi">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 1 ? " · resuscitation" : n === 2 ? " · emergent" : n === 3 ? " · urgent" : n === 4 ? " · less urgent" : " · non-urgent"}</option>)}</select></label>
          <label className="block"><span className="label">Bed (optional)</span><input name="bed" className="input" placeholder="ED 7" data-testid="arrive-bed" /></label>
        </div>
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="arrive-save">{busy ? <Spinner /> : <Plus size={14} />} Add to board</button></div>
      </form>
    </Modal>
  );
}

function AdmitFromEd({ row, attendings, me, onClose, onDone }: { row: Row | null; attendings: { id: string; name: string }[]; me: string; onClose: () => void; onDone: (encId: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!row} onClose={onClose} title={row ? `Admit ${row.patientName}` : "Admit"}>
      {row && (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ encounterId: string }>(`/ed/${row.id}`, { body: { action: "admit", unit: f.get("unit"), room: f.get("room"), attendingId: f.get("attendingId") } });
            onDone(r.encounterId);
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not admit");
            setBusy(false);
          }
        }}>
          <p className="text-sm text-ink-2">Creates the admission on the hospital census and starts the H&amp;P. The ED note stays with the ED visit.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Unit</span><input name="unit" className="input" placeholder={/Observation/.test(row.disposition ?? row.suggestedDisposition ?? "") ? "Obs unit" : "4 West"} data-testid="ed-admit-unit" /></label>
            <label className="block"><span className="label">Room</span><input name="room" className="input" data-testid="ed-admit-room" /></label>
          </div>
          <label className="block"><span className="label">Attending</span><select name="attendingId" className="input" defaultValue={attendings.some((a) => a.id === me) ? me : attendings[0]?.id}>{attendings.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="ed-admit-save">{busy ? <Spinner /> : <Bed size={14} />} Admit and start H&amp;P</button></div>
        </form>
      )}
    </Modal>
  );
}
