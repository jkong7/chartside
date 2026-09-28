"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { ImportRow } from "@/lib/server/schedule";
import { Check } from "./icons";
import { Modal, Spinner } from "./ui";

const MATCH: Record<string, { label: string; cls: string }> = {
  mrn: { label: "Matched by MRN", cls: "bg-ok-50 text-ok" },
  name_dob: { label: "Matched by name and DOB", cls: "bg-ok-50 text-ok" },
  name: { label: "Matched by name", cls: "bg-warn-50 text-warn" },
  new: { label: "New patient", cls: "bg-info-50 text-info" },
  ambiguous: { label: "Ambiguous", cls: "bg-rec-50 text-rec" },
};

export default function ImportSchedule({ open, onClose, clinicians, me }: { open: boolean; onClose: () => void; clinicians: { id: string; name: string }[]; me: string }) {
  const router = useRouter();
  const today = new Date();
  const [date, setDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
  const [text, setText] = useState("");
  const [clinicianId, setClinicianId] = useState(me);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function go(commit: boolean) {
    setBusy(true);
    setErr(null);
    try {
      if (commit) {
        const r = await api<{ created: number; newPatients: number; skipped: string[] }>("/schedule/import", { body: { text, date, clinicianId, commit: true } });
        setDone(`Added ${r.created} visit${r.created === 1 ? "" : "s"}${r.newPatients ? ` and ${r.newPatients} new patient${r.newPatients === 1 ? "" : "s"}` : ""}.${r.skipped.length ? ` Skipped ${r.skipped.length}.` : ""}`);
        setRows(null);
        setText("");
        router.refresh();
      } else setRows((await api<{ rows: ImportRow[] }>("/schedule/import", { body: { text, date, clinicianId } })).rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the schedule");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import a clinic schedule" wide>
      <div className="space-y-3" data-testid="import-schedule">
        <p className="text-sm text-ink-2">Paste your day from the EHR schedule screen (one appointment per line) or a CSV export. Chartside matches existing patients by MRN, or name and date of birth, and creates the rest.</p>
        <div className="flex flex-wrap gap-2">
          <input type="date" className="input w-44" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Clinic date" />
          {clinicians.length > 1 && <select className="input w-56" value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} aria-label="Clinician">{clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          <input type="file" accept=".csv,text/csv,text/plain" className="text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} aria-label="Upload CSV" />
        </div>
        <textarea className="input min-h-[140px] font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setRows(null); }} placeholder={"8:30 AM   Maria Gonzalez   03/14/1968   MRN 100482   Follow-up: diabetes\n9:15 AM   Lee, Dana   02/03/1990   Telehealth - back pain"} data-testid="import-text" />
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        {done && <p className="text-sm text-ok" role="status" data-testid="import-done">{done}</p>}
        {rows && (
          <table className="w-full text-sm" data-testid="import-preview">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="py-1">Time</th><th>Patient</th><th>DOB</th><th>Type</th><th>Reason</th><th>Match</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className="border-t border-line" data-testid="import-row">
                  <td className="py-1.5 font-mono text-xs">{r.time ?? "—"}</td>
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-xs">{r.dob ?? "—"}</td>
                  <td className="py-1.5 text-xs">{r.visitType}</td>
                  <td className="py-1.5 text-xs text-ink-3">{r.reason}</td>
                  <td className="py-1.5"><span className={`pill text-[10px] ${MATCH[r.match.kind].cls}`}>{MATCH[r.match.kind].label}</span>{r.duplicate && <span className="ml-1 text-[11px] text-ink-4">already booked</span>}{r.error && <span className="ml-1 text-[11px] text-rec">{r.error}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Close</button>
          {rows ? <button className="btn-primary" disabled={busy || !rows.some((r) => !r.error && !r.duplicate)} onClick={() => go(true)} data-testid="import-commit">{busy ? <Spinner /> : <Check size={14} />} Add {rows.filter((r) => !r.error && !r.duplicate).length} visits</button> : <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => go(false)} data-testid="import-preview-btn">{busy ? <Spinner /> : null} Preview</button>}
        </div>
      </div>
    </Modal>
  );
}
