"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { OutsideRecord } from "@/lib/server/records";
import { Check, Doc } from "./icons";
import { Spinner } from "./ui";

const KIND: Record<string, string> = { problem: "Problems", medication: "Medications", allergy: "Allergies", lab: "Results", vital: "Vitals", plan: "Plan from outside care" };

export default function OutsideRecords({ patientId, initial, canEdit }: { patientId: string; initial: OutsideRecord[]; canEdit: boolean }) {
  const router = useRouter();
  const [records, setRecords] = useState(initial);
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, Set<number>>>(() => Object.fromEntries(initial.map((r) => [r.id, new Set(r.findings.map((f, i) => (f.status === "pending" ? i : -1)).filter((i) => i >= 0))])));

  function adopt(r: OutsideRecord) {
    setRecords((x) => [r, ...x.filter((y) => y.id !== r.id)]);
    setPicked((p) => ({ ...p, [r.id]: new Set(r.findings.map((f, i) => (f.status === "pending" ? i : -1)).filter((i) => i >= 0)) }));
  }

  async function upload(file: File) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/patients/${patientId}/records`, { method: "POST", body: fd });
    const j = await res.json();
    if (res.ok) adopt(j.record);
    else setErr(j.error ?? "Upload failed");
    setBusy(false);
  }

  return (
    <section className="mt-8" data-testid="outside-records">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-sm font-semibold uppercase tracking-wide text-ink-3">Outside records</h2>
        {canEdit && (
          <>
            <label className="btn-outline cursor-pointer"><Doc size={14} /> Upload C-CDA, PDF, or text<input type="file" className="sr-only" accept=".xml,.pdf,.txt,.ccd,.ccda,text/plain,application/pdf,application/xml,text/xml" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} data-testid="records-file" /></label>
            <button className="btn-ghost" onClick={() => setPaste(paste === null ? "" : null)} data-testid="records-paste">Paste text</button>
          </>
        )}
      </div>
      {paste !== null && (
        <div className="card mt-2 space-y-2 p-3">
          <textarea className="input min-h-[120px] font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a discharge summary, consult note, or medication list" data-testid="records-text" />
          <div className="flex justify-end"><button className="btn-primary" disabled={busy || !paste.trim()} onClick={async () => { setBusy(true); setErr(null); try { adopt((await api<{ record: OutsideRecord }>(`/patients/${patientId}/records`, { body: { text: paste, name: "Pasted record" } })).record); setPaste(null); } catch (e) { setErr(e instanceof Error ? e.message : "Could not read"); } finally { setBusy(false); } }} data-testid="records-read">{busy ? <Spinner /> : null} Read record</button></div>
        </div>
      )}
      {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
      {busy && paste === null && <p className="mt-2 flex items-center gap-2 text-sm text-ink-3"><Spinner /> Reading…</p>}
      <div className="mt-2 space-y-3">
        {records.map((r) => {
          const sel = picked[r.id] ?? new Set<number>();
          const pending = r.findings.some((f) => f.status === "pending");
          const groups = [...new Set(r.findings.map((f) => f.kind))];
          return (
            <div key={r.id} className="card p-4" data-testid="record">
              <p className="text-sm font-medium">{r.name} <span className="pill ml-1 bg-sunken text-[10px] uppercase">{r.format}</span></p>
              <p className="text-xs text-ink-3">Imported {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}{r.uploadedBy ? ` by ${r.uploadedBy}` : ""} · {r.findings.length} findings</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="label">{KIND[g]}</p>
                    <ul className="space-y-1">
                      {r.findings.map((f, i) => f.kind !== g ? null : (
                        <li key={i} className="flex items-start gap-2 text-sm" title={`Line ${f.source.line}: ${f.source.text}`} data-testid="finding">
                          {f.status === "pending" && canEdit ? <input type="checkbox" className="mt-1" checked={sel.has(i)} onChange={(e) => setPicked((p) => { const n = new Set(p[r.id]); if (e.target.checked) n.add(i); else n.delete(i); return { ...p, [r.id]: n }; })} /> : <span className="mt-0.5 w-3.5">{f.status === "accepted" ? <Check size={12} className="text-ok" /> : null}</span>}
                          <span className={`flex-1 ${f.status === "dismissed" ? "text-ink-4" : ""}`}>{f.label}{f.value ? ` ${f.value}` : ""}{f.detail ? ` · ${f.detail}` : ""}{f.code ? <span className="ml-1 font-mono text-[11px] text-ink-4">{f.code}</span> : null}{f.date ? <span className="ml-1 text-[11px] text-ink-4">{f.date}</span> : null}</span>
                          {f.status === "pending" && (f.change === "new" ? <span className={`pill text-[10px] ${f.kind === "allergy" ? "bg-rec-50 text-rec" : "bg-info-50 text-info"}`}>New{f.kind === "allergy" ? " allergy" : ""}</span> : f.change === "update" ? <span className="pill bg-warn-50 text-[10px] text-warn">Was {f.current}</span> : null)}
                          {f.status === "dismissed" && f.change === "same" && <span className="text-[10px] text-ink-4">already in chart</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {pending && canEdit && (
                <div className="mt-3 flex justify-end gap-2">
                  <button className="btn-ghost text-xs" onClick={async () => { const out = await api<{ records: OutsideRecord[] }>(`/patients/${patientId}/records/${r.id}`, { body: { decisions: r.findings.map((f, i) => (f.status === "pending" ? { index: i, action: "dismiss" } : null)).filter(Boolean) } }); setRecords(out.records); }}>Dismiss all</button>
                  <button className="btn-primary" disabled={!sel.size} onClick={async () => { const out = await api<{ accepted: number; records: OutsideRecord[] }>(`/patients/${patientId}/records/${r.id}`, { body: { decisions: r.findings.map((f, i) => (f.status === "pending" ? { index: i, action: sel.has(i) ? "accept" : "dismiss" } : null)).filter(Boolean) } }); setRecords(out.records); router.refresh(); }} data-testid="records-accept"><Check size={14} /> Add {sel.size} to chart</button>
                </div>
              )}
            </div>
          );
        })}
        {!records.length && <p className="text-sm text-ink-3">Upload a C-CDA summary, a text PDF, or paste a note from another practice. Chartside reads problems, medications, allergies, and results, shows what&apos;s new or changed, and adds only what you accept.</p>}
      </div>
    </section>
  );
}
