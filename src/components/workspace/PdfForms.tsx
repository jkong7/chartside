"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Doc, Download } from "../icons";
import { Modal, Spinner } from "../ui";

type Form = { id: string; name: string; fields: { name: string; type: string; options?: string[] }[]; mapping: Record<string, string> };

export default function PdfForms({ encounterId, canEdit }: { encounterId: string; canEdit: boolean }) {
  const [forms, setForms] = useState<Form[]>([]);
  const [open, setOpen] = useState<{ form: Form; values: Record<string, string>; missing: string[] } | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ forms: Form[] }>("/forms").then((r) => setForms(r.forms)).catch(() => setForms([]));
  }, []);
  if (!forms.length || !canEdit) return null;
  return (
    <div className="card p-3" data-testid="pdf-forms">
      <p className="label">PDF forms</p>
      <ul className="space-y-1">
        {forms.map((f) => (
          <li key={f.id}>
            <button className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-sunken" onClick={async () => { setErr(null); const r = await api<{ form: Form; values: Record<string, string>; missing: string[] }>(`/encounters/${encounterId}/forms/${f.id}`); setOpen(r); setVals(r.values); }} data-testid="pdf-form-open"><Doc size={14} /> {f.name}</button>
          </li>
        ))}
      </ul>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.form.name ?? ""} wide>
        {open && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Filled from this visit. Fields with nothing to fill are highlighted; type in them or leave them blank.</p>
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {open.form.fields.map((f) => (
                <label key={f.name} className="block" data-testid="pdf-form-field">
                  <span className="label">{f.name}</span>
                  {f.type === "checkbox" ? (
                    <input type="checkbox" checked={/^(true|yes|on|x|1)$/i.test(vals[f.name] ?? "")} onChange={(e) => setVals({ ...vals, [f.name]: e.target.checked ? "true" : "" })} />
                  ) : f.options?.length ? (
                    <select className="input text-sm" value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}><option value="" />{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  ) : (
                    <input className={`input text-sm ${!vals[f.name] ? "border-warn" : ""}`} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} />
                  )}
                </label>
              ))}
            </div>
            {err && <p className="text-sm text-rec" role="alert">{err}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setOpen(null)}>Close</button>
              <button className="btn-primary" disabled={busy} data-testid="pdf-form-download" onClick={async () => {
                setBusy(true);
                setErr(null);
                const r = await fetch(`/api/encounters/${encounterId}/forms/${open.form.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: vals }) });
                setBusy(false);
                if (!r.ok) return setErr((await r.json().catch(() => ({}))).error ?? "Could not fill the form");
                const url = URL.createObjectURL(await r.blob());
                const a = document.createElement("a");
                a.href = url;
                a.download = `${open.form.name}.pdf`;
                a.click();
                URL.revokeObjectURL(url);
              }}>{busy ? <Spinner /> : <Download size={14} />} Download filled PDF</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
