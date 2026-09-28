"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { FormTemplate } from "@/lib/server/forms";
import { Doc, Plus, X } from "./icons";
import { Spinner, Toast } from "./ui";

export default function FormsAdmin({ initial, sources }: { initial: FormTemplate[]; sources: { key: string; label: string }[] }) {
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cur = list.find((f) => f.id === open) ?? null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">PDF forms</h1>
      <p className="mt-1 text-sm text-ink-2">Upload the fillable PDFs your practice uses (payer forms, work status, disability, school, DME). Map each field once and clinicians can fill them from any visit in one click.</p>
      <form className="card mt-5 flex flex-wrap items-end gap-3 p-4" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const file = f.get("file") as File | null;
        if (!file?.size) return setErr("Choose a PDF");
        setBusy(true);
        setErr(null);
        try {
          const buf = new Uint8Array(await file.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          const r = await api<{ form: FormTemplate }>("/forms", { body: { name: f.get("name") || file.name.replace(/\.pdf$/i, ""), base64: btoa(bin) } });
          setList([...list, r.form].sort((a, b) => a.name.localeCompare(b.name)));
          setOpen(r.form.id);
          (e.target as HTMLFormElement).reset();
          setToast(`Found ${r.form.fields.length} fields and mapped what we could.`);
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Upload failed");
        }
        setBusy(false);
      }}>
        <label className="block flex-1"><span className="label">Form name</span><input name="name" className="input" placeholder="Acme work status form" data-testid="form-name" /></label>
        <label className="block"><span className="label">Fillable PDF</span><input name="file" type="file" accept="application/pdf" className="text-sm" data-testid="form-file" /></label>
        <button className="btn-primary" disabled={busy} data-testid="form-upload">{busy ? <Spinner /> : <Plus size={14} />} Upload</button>
        {err && <p className="w-full text-sm text-rec" role="alert">{err}</p>}
      </form>
      <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
        <ul className="card divide-y divide-line self-start" data-testid="form-list">
          {list.map((f) => (
            <li key={f.id}><button className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${open === f.id ? "bg-brand-50 text-brand" : "hover:bg-sunken"}`} onClick={() => setOpen(f.id)}><Doc size={14} /> {f.name}</button></li>
          ))}
          {!list.length && <li className="px-3 py-6 text-center text-sm text-ink-3">No forms yet.</li>}
        </ul>
        {cur && (
          <div className="card p-4" data-testid="form-mapping">
            <div className="flex items-center gap-2">
              <p className="flex-1 font-medium">{cur.name} · {cur.fields.length} fields</p>
              <button className="btn-ghost px-2 text-xs text-rec" onClick={async () => { await api(`/forms/${cur.id}`, { method: "DELETE" }); setList(list.filter((f) => f.id !== cur.id)); setOpen(null); }}><X size={12} /> Delete</button>
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-line">
                {cur.fields.map((fld) => (
                  <tr key={fld.name} data-testid="form-field">
                    <td className="py-1.5 pr-3">{fld.name} <span className="text-[11px] text-ink-4">{fld.type}</span></td>
                    <td className="w-64 py-1.5">
                      <select className="input px-2 py-1 text-xs" value={cur.mapping[fld.name] ?? "none"} onChange={async (e) => {
                        const r = await api<{ form: FormTemplate }>(`/forms/${cur.id}`, { method: "PATCH", body: { mapping: { ...cur.mapping, [fld.name]: e.target.value } } });
                        setList(list.map((f) => (f.id === cur.id ? r.form : f)));
                      }} aria-label={`Source for ${fld.name}`} data-testid="form-source">
                        {sources.filter((s) => (fld.type === "checkbox" ? ["const.yes", "none"].includes(s.key) : s.key !== "const.yes")).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} tone="ok" />
    </div>
  );
}
