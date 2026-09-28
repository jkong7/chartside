"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { gaFrom } from "@/lib/engine/prenatal";
import type { Pregnancy } from "@/lib/types";
import { Spinner } from "./ui";

export default function PregnancyCard({ patientId, initial, canEdit }: { patientId: string; initial: Pregnancy | null; canEdit: boolean }) {
  const [preg, setPreg] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ga = preg ? gaFrom(preg.edd, new Date()) : null;
  async function save(next: Pregnancy | null) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ patient: { chart: { pregnancy?: Pregnancy } } }>(`/patients/${patientId}`, { method: "PATCH", body: { chart: { pregnancy: next } } });
      setPreg(r.patient.chart.pregnancy ?? null);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
    setBusy(false);
  }
  if (!preg && !canEdit) return null;
  return (
    <div className="card mt-4 max-w-xl p-4" data-testid="pregnancy-card">
      <div className="flex items-baseline gap-2">
        <p className="label mb-0">Pregnancy</p>
        {preg && ga && <p className="text-sm" data-testid="pregnancy-ga">{ga.weeks} weeks {ga.days} days · EDD {preg.edd}{preg.gravida ? ` · G${preg.gravida}P${preg.para ?? 0}` : ""}{preg.rh ? ` · Rh ${preg.rh}` : ""}</p>}
        {!preg && !editing && <p className="text-sm text-ink-3">Not pregnant or not recorded</p>}
        {canEdit && !editing && <button className="btn-ghost ml-auto px-2 text-xs" onClick={() => setEditing(true)} data-testid="pregnancy-edit">{preg ? "Edit" : "Record pregnancy"}</button>}
      </div>
      {editing && (
        <form className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({ edd: String(f.get("edd")), gravida: f.get("gravida") ? Number(f.get("gravida")) : undefined, para: f.get("para") ? Number(f.get("para")) : undefined, rh: (f.get("rh") || undefined) as Pregnancy["rh"] });
        }}>
          <label className="col-span-2 block"><span className="label">Estimated due date</span><input name="edd" type="date" className="input" required defaultValue={preg?.edd} data-testid="pregnancy-edd" /></label>
          <label className="block"><span className="label">Gravida</span><input name="gravida" type="number" min={1} className="input" defaultValue={preg?.gravida} data-testid="pregnancy-gravida" /></label>
          <label className="block"><span className="label">Para</span><input name="para" type="number" min={0} className="input" defaultValue={preg?.para} /></label>
          <label className="col-span-2 block"><span className="label">Rh</span><select name="rh" className="input" defaultValue={preg?.rh ?? ""} data-testid="pregnancy-rh"><option value="">Unknown</option><option value="positive">Positive</option><option value="negative">Negative</option></select></label>
          <div className="col-span-2 flex items-end justify-end gap-2">
            {preg && <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => save(null)}>Clear</button>}
            <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy} data-testid="pregnancy-save">{busy ? <Spinner /> : null} Save</button>
          </div>
          {err && <p className="col-span-4 text-sm text-rec" role="alert">{err}</p>}
        </form>
      )}
    </div>
  );
}
