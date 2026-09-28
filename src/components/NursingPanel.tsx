"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Dictation, type DictationStatus } from "@/lib/audio/dictation";
import { api } from "@/lib/client";
import type { FlowRow } from "@/lib/engine/flowsheet";
import type { nursingView, NursingNote } from "@/lib/server/nursing";
import { Check, Mic, Plus, Send, X } from "./icons";
import { Spinner } from "./ui";

type View = Awaited<ReturnType<typeof nursingView>>;

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export default function NursingPanel({ admissionId, canDocument, demo }: { admissionId: string; canDocument: boolean; demo?: string[] }) {
  const [v, setV] = useState<View | null>(null);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<NursingNote | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [newCare, setNewCare] = useState("");
  const dict = useRef<Dictation | null>(null);

  const load = useCallback(async () => setV(await api<View>(`/admissions/${admissionId}/nursing`)), [admissionId]);
  useEffect(() => {
    load();
    return () => dict.current?.stop();
  }, [load]);

  async function extract() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ note: NursingNote }>(`/admissions/${admissionId}/nursing`, { body: { text } });
      setDraft(r.note);
      setValues(Object.fromEntries(r.note.rows.map((x) => [x.key, x.value])));
      setSkip(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the assessment");
    } finally {
      setBusy(false);
    }
  }

  async function file() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await api<View>(`/admissions/${admissionId}/nursing/${draft.id}`, { body: { rows: draft.rows.filter((x) => !skip.has(x.key)).map((x) => ({ key: x.key, value: values[x.key] ?? x.value })) } });
      setV(r);
      setDraft(null);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  async function mic() {
    if (dict.current) {
      dict.current.stop();
      dict.current = null;
      return;
    }
    const cfg = await api<{ provider: "deepgram" | "browser"; url: string | null }>("/speech/dictation");
    const d = new Dictation(cfg, { onFinal: (t) => setText((x) => `${x}${x && !x.endsWith(" ") ? " " : ""}${t}`), onInterim: () => {}, onStatus: (s, m) => { setStatus(s); if (s === "error") setErr(m ?? "Dictation stopped"); if (s !== "listening" && s !== "starting") dict.current = null; } });
    dict.current = d;
    await d.start();
  }

  if (!v) return <div className="flex h-32 items-center justify-center text-brand"><Spinner /></div>;
  const times = [...new Set(v.flowsheet.map((e) => e.recordedAt))].sort().slice(-6);
  const rows = [...new Map(v.flowsheet.map((e) => [`${e.group}:${e.row}`, { group: e.group, row: e.row }])).values()];
  const groups = [...new Set(rows.map((r) => r.group))];
  const pendingDraft = v.notes.find((n) => n.status === "draft");

  return (
    <div className="space-y-5" data-testid="nursing-panel">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {canDocument && !draft && (
            <div className="card space-y-2 p-4">
              <p className="text-sm font-semibold">Record an assessment</p>
              <p className="text-xs text-ink-3">Speak or type what you assessed. Chartside fills the flowsheet rows for you to confirm, and updates the care list.</p>
              <textarea className="input min-h-[120px] text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Blood pressure 128 over 74, heart rate 72, sats 97 percent on room air. Pain 2 out of 10…" data-testid="nursing-text" />
              {err && <p className="text-sm text-rec" role="alert">{err}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <button className={`btn-outline ${status === "listening" ? "border-rec text-rec" : ""}`} onClick={mic} data-testid="nursing-mic"><Mic size={14} /> {status === "listening" ? "Stop" : "Dictate"}</button>
                {demo?.length ? <button className="btn-ghost text-xs" onClick={() => setText(demo[Math.min(v.notes.filter((n) => n.status === "filed").length, demo.length - 1)])} data-testid="nursing-demo">Use demo assessment</button> : null}
                <span className="flex-1" />
                <button className="btn-primary" disabled={busy || text.trim().length < 5} onClick={extract} data-testid="nursing-extract">{busy ? <Spinner /> : <Check size={14} />} Build flowsheet entries</button>
              </div>
              {pendingDraft && <p className="text-xs text-ink-3">An unfiled assessment from {time(pendingDraft.recordedAt)} is waiting. <button className="text-brand underline" onClick={() => { setDraft(pendingDraft); setValues(Object.fromEntries(pendingDraft.rows.map((x) => [x.key, x.value]))); }}>Review it</button></p>}
            </div>
          )}
          {draft && (
            <div className="card p-4" data-testid="nursing-review">
              <p className="text-sm font-semibold">Review {draft.rows.length} flowsheet entries</p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {draft.rows.map((r: FlowRow) => (
                    <tr key={r.key} className={`border-t border-line ${skip.has(r.key) ? "opacity-40" : ""}`} data-testid="review-row">
                      <td className="py-1.5 pr-2"><input type="checkbox" checked={!skip.has(r.key)} onChange={(e) => setSkip((s) => { const n = new Set(s); if (e.target.checked) n.delete(r.key); else n.add(r.key); return n; })} aria-label={`File ${r.row}`} /></td>
                      <td className="py-1.5 pr-2 text-xs text-ink-3">{r.group}</td>
                      <td className="py-1.5 pr-2 font-medium">{r.row}</td>
                      <td className="py-1.5 pr-2"><input className={`input py-1 text-sm ${r.abnormal ? "border-warn text-warn" : ""}`} value={values[r.key] ?? r.value} onChange={(e) => setValues((x) => ({ ...x, [r.key]: e.target.value }))} title={r.evidence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(draft.care.added.length > 0 || draft.care.closed.length > 0) && (
                <div className="mt-3 rounded-lg bg-sunken px-3 py-2 text-xs">
                  {draft.care.added.map((c) => <p key={c.key}>+ Add to care list: {c.text}</p>)}
                  {draft.care.closed.map((c) => <p key={c.key} className="text-ok">✓ Done: {c.text}</p>)}
                </div>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <button className="btn-ghost" onClick={async () => { await api(`/admissions/${admissionId}/nursing/${draft.id}`, { method: "DELETE" }); setDraft(null); load(); }}>Discard</button>
                <button className="btn-primary" disabled={busy} onClick={file} data-testid="nursing-file">{busy ? <Spinner /> : <Check size={14} />} File {draft.rows.length - skip.size} entries</button>
              </div>
            </div>
          )}
          <div className="card overflow-x-auto" data-testid="flowsheet">
            <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Flowsheet</p>
            {times.length ? (
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-[11px] text-ink-3"><tr><th className="px-4 py-1.5">Row</th>{times.map((t) => <th key={t} className="px-2 py-1.5 font-mono">{new Date(t).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</th>)}</tr></thead>
                <tbody>
                  {groups.map((g) => (
                    <Fragment key={g}>
                      <tr><td colSpan={times.length + 1} className="bg-sunken px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{g}</td></tr>
                      {rows.filter((r) => r.group === g).map((r) => (
                        <tr key={`${g}-${r.row}`} className="border-t border-line" data-testid="flow-row">
                          <td className="px-4 py-1.5">{r.row}</td>
                          {times.map((t) => { const e = v.flowsheet.find((x) => x.row === r.row && x.group === g && x.recordedAt === t); return <td key={t} className={`px-2 py-1.5 ${e?.abnormal ? "font-medium text-warn" : ""}`}>{e?.value ?? ""}</td>; })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-4 py-6 text-center text-sm text-ink-3">Nothing filed yet.</p>}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-4" data-testid="shift-summary">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Shift summary</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-2">{v.summary.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          <div className="card p-4" data-testid="care-list">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Pending care</p>
            <ul className="mt-2 space-y-1.5">
              {v.care.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm" data-testid="care-item">
                  {canDocument && <button className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line-strong hover:border-brand" aria-label={`Done: ${c.text}`} onClick={async () => setV(await api<View>(`/admissions/${admissionId}/care`, { body: { done: c.key } }))}><Check size={10} className="text-transparent hover:text-brand" /></button>}
                  <span className="flex-1">{c.text}{c.due ? <span className="text-xs text-ink-4"> · {c.due}</span> : null}</span>
                </li>
              ))}
              {!v.care.length && <li className="text-sm text-ink-3">Nothing pending.</li>}
            </ul>
            {canDocument && (
              <form className="mt-2 flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (!newCare.trim()) return; setV(await api<View>(`/admissions/${admissionId}/care`, { body: { text: newCare } })); setNewCare(""); }}>
                <input className="input py-1 text-sm" placeholder="Add a care item" value={newCare} onChange={(e) => setNewCare(e.target.value)} />
                <button className="btn-ghost px-2" aria-label="Add care item"><Plus size={14} /></button>
              </form>
            )}
          </div>
          <div className="card p-4">
            <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Ask about this shift</p>
            <form className="mt-2 flex gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (!q.trim()) return; setAnswer((await api<{ answer: string }>(`/admissions/${admissionId}/nursing/ask`, { body: { question: q } })).answer); }}>
              <input className="input py-1 text-sm" placeholder="What was his last blood pressure?" value={q} onChange={(e) => setQ(e.target.value)} data-testid="shift-question" />
              <button className="btn-primary px-2" aria-label="Ask"><Send size={13} /></button>
            </form>
            {answer && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-sunken px-3 py-2 text-sm" data-testid="shift-answer">{answer}<button className="ml-2 align-middle text-ink-4" aria-label="Clear" onClick={() => setAnswer(null)}><X size={11} /></button></p>}
          </div>
        </div>
      </div>
    </div>
  );
}
