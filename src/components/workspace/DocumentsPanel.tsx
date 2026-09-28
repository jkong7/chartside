"use client";

import FaxButton from "./FaxButton";
import PdfForms from "./PdfForms";
import { useCallback, useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import type { DocField } from "@/lib/engine/documents";
import type { ClinicalDocument } from "@/lib/server/documents";
import { Check, Copy, Download, Globe, Plus, Shield, X } from "../icons";
import { Spinner } from "../ui";

interface Data {
  documents: ClinicalDocument[];
  referrals: { id: string; title: string; body: string }[];
  types: { type: string; label: string; description: string; fields: DocField[] }[];
}

const SOURCE: Record<string, string> = { requested: "Requested in visit", auto: "Auto-generated", manual: "" };

export default function DocumentsPanel({ encounterId, canEdit, canSign, onCite }: { encounterId: string; canEdit: boolean; canSign: boolean; onCite: (ids: string[]) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rawEdit, setRawEdit] = useState(false);
  const [body, setBody] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>(`/encounters/${encounterId}/documents`);
    setD(r);
    setSel((s) => s ?? r.documents[0]?.id ?? r.referrals[0]?.id ?? null);
  }, [encounterId]);
  useEffect(() => {
    load();
  }, [load]);

  if (!d) return <div className="flex h-40 items-center justify-center text-brand"><Spinner /></div>;
  const doc = d.documents.find((x) => x.id === sel);
  const ref = d.referrals.find((x) => x.id === sel);
  const def = doc ? d.types.find((t) => t.type === doc.type) : undefined;

  async function patch(p: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ documents: ClinicalDocument[] }>(`/encounters/${encounterId}/documents/${sel}`, { method: "PATCH", body: p });
      setD((x) => (x ? { ...x, documents: r.documents } : x));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const locked = !canEdit || doc?.status === "final";
  return (
    <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]" data-testid="documents-panel">
      <div className="space-y-3">
        <PdfForms encounterId={encounterId} canEdit={canEdit} />
        <ul className="card divide-y divide-line">
          {d.referrals.map((r) => (
            <li key={r.id}><button className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-sunken ${sel === r.id ? "bg-brand-50/60" : ""}`} onClick={() => setSel(r.id)}><span className="font-medium">{r.title}</span><span className="mt-0.5 block text-[11px] text-ink-4">Referral letter · drafted from the visit</span></button></li>
          ))}
          {d.documents.map((x) => (
            <li key={x.id}>
              <button className={`block w-full px-3 py-2.5 text-left text-sm hover:bg-sunken ${sel === x.id ? "bg-brand-50/60" : ""}`} onClick={() => { setSel(x.id); setRawEdit(false); setErr(null); }} data-testid="document-row">
                <span className="flex items-center gap-1.5"><span className="flex-1 font-medium">{x.label}</span>{x.status === "final" ? <span className="pill bg-ok-50 text-[10px] text-ok">Signed</span> : <span className="pill bg-sunken text-[10px] text-ink-3">Draft</span>}</span>
                <span className="mt-0.5 block text-[11px] text-ink-4">{[SOURCE[x.source], x.shared ? "Shared with patient" : "", x.missing.length && x.status !== "final" ? `${x.missing.length} field${x.missing.length > 1 ? "s" : ""} missing` : ""].filter(Boolean).join(" · ") || (x.status === "final" && x.signedAt ? new Date(x.signedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Not signed yet")}</span>
              </button>
            </li>
          ))}
          {!d.documents.length && !d.referrals.length && <li className="px-3 py-6 text-center text-sm text-ink-3">No documents yet.</li>}
        </ul>
        {canEdit && (
          <select className="input text-sm" value="" onChange={async (e) => { if (!e.target.value) return; const r = await api<{ document: ClinicalDocument; documents: ClinicalDocument[] }>(`/encounters/${encounterId}/documents`, { body: { type: e.target.value } }); setD((x) => (x ? { ...x, documents: r.documents } : x)); setSel(r.document.id); }} aria-label="New document" data-testid="new-document">
            <option value="">+ New letter or form…</option>
            {d.types.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        )}
      </div>

      {ref && (
        <div className="card">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <p className="flex-1 text-[13px] font-semibold uppercase tracking-wide text-ink-2">{ref.title}</p>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => { await copyText(ref.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} className="text-ok" /> : <Copy size={14} />} Copy</button>
            <a className="btn-ghost px-2 py-1 text-xs" href={`/api/encounters/${encounterId}/documents/${ref.id}/pdf`}><Download size={14} /> PDF</a>
            {canEdit && <FaxButton encounterId={encounterId} docId={ref.id} />}
          </div>
          <pre className="whitespace-pre-wrap px-5 py-4 font-serif text-[15px] leading-7" data-testid="letters-panel">{ref.body}</pre>
        </div>
      )}

      {doc && def && (
        <div className="grid gap-4 2xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="card space-y-3 self-start p-4" data-testid="document-fields">
            <p className="text-sm font-semibold">{doc.label}</p>
            <p className="text-xs text-ink-3">{def.description}</p>
            {doc.evidence.length > 0 && <button className="text-xs font-medium text-brand" onClick={() => onCite(doc.evidence)}>Show the request in the transcript</button>}
            {def.fields.map((f) => {
              const missing = doc.status !== "final" && f.required && !doc.fields[f.key]?.trim();
              const common = { id: `f-${f.key}`, className: `input text-sm ${missing ? "border-warn" : ""}`, defaultValue: doc.fields[f.key] ?? "", disabled: locked || doc.custom, onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.target.value !== (doc.fields[f.key] ?? "")) patch({ fields: { [f.key]: e.target.value } }); }, "data-testid": `field-${f.key}` };
              return (
                <div key={`${doc.id}-${f.key}-${doc.updatedAt}`}>
                  <label className="label" htmlFor={`f-${f.key}`}>{f.label}{f.required && <span className="text-rec"> *</span>}</label>
                  {f.type === "textarea" ? <textarea {...common} rows={3} /> : <input {...common} type={f.type === "date" ? "date" : "text"} />}
                  {f.help && <p className="mt-0.5 text-[11px] text-ink-4">{f.help}</p>}
                </div>
              );
            })}
            {doc.custom && doc.status !== "final" && <p className="text-[11px] text-ink-3">You edited the letter text directly, so fields no longer update it.</p>}
          </div>
          <div className="card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</p>
              {doc.status === "final" ? <span className="pill bg-ok-50 text-[10px] text-ok" data-testid="document-signed"><Shield size={11} /> Signed by {doc.signedBy}</span> : doc.missing.length ? <span className="pill bg-warn-50 text-[10px] text-warn" data-testid="document-missing">Missing: {doc.missing.join(", ")}</span> : null}
            </div>
            {rawEdit && !locked ? (
              <div className="space-y-2 p-4">
                <textarea className="input min-h-[360px] font-serif text-[15px] leading-7" value={body} onChange={(e) => setBody(e.target.value)} data-testid="document-body" />
                <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setRawEdit(false)}>Cancel</button><button className="btn-primary" disabled={busy} onClick={async () => { await patch({ body }); setRawEdit(false); }}>Save text</button></div>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap px-5 py-4 font-serif text-[15px] leading-7" data-testid="document-preview">{doc.body}</pre>
            )}
            {err && <p className="mx-4 mb-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
              {!locked && !rawEdit && <button className="btn-ghost px-2 text-xs" onClick={() => { setBody(doc.body); setRawEdit(true); }} data-testid="document-edit-text">Edit text</button>}
              <button className="btn-ghost px-2 text-xs" onClick={async () => { await copyText(doc.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />} Copy</button>
              <a className="btn-ghost px-2 text-xs" href={`/api/encounters/${encounterId}/documents/${doc.id}/pdf`} data-testid="document-pdf"><Download size={13} /> PDF</a>
              {doc.status === "final" && canEdit && <FaxButton encounterId={encounterId} docId={doc.id} />}
              {doc.status === "final" && canEdit && (
                <label className="flex items-center gap-1.5 text-xs text-ink-2"><input type="checkbox" checked={doc.shared} onChange={(e) => patch({ shared: e.target.checked })} data-testid="document-share" /> <Globe size={12} /> Share with patient</label>
              )}
              <span className="flex-1" />
              {doc.status !== "final" && canEdit && <button className="btn-ghost px-2 text-xs text-rec" onClick={async () => { const r = await api<{ documents: ClinicalDocument[] }>(`/encounters/${encounterId}/documents/${doc.id}`, { method: "DELETE" }); setD((x) => (x ? { ...x, documents: r.documents } : x)); setSel(null); }}><X size={13} /> Delete draft</button>}
              {doc.status === "final" && canSign && <button className="btn-ghost px-2 text-xs" onClick={() => patch({ action: "reopen" })}>Reopen</button>}
              {doc.status !== "final" && canSign && <button className="btn-primary" disabled={busy} onClick={() => patch({ action: "finalize" })} data-testid="document-sign">{busy ? <Spinner /> : <Shield size={14} />} Sign</button>}
              {doc.status !== "final" && !canSign && canEdit && <span className="text-xs text-ink-3">Ready for the clinician to sign</span>}
            </div>
          </div>
        </div>
      )}
      {!doc && !ref && canEdit && (
        <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center text-sm text-ink-3"><Plus /> Pick a letter or form. Chartside fills it from this visit and highlights anything it couldn&apos;t find.</div>
      )}
    </div>
  );
}
