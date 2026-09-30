"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { AnimalProfile } from "@/lib/engine/vet";

const pretty = (p: string) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
};

export default function OwnerPhone({ patientId, animal, editable, onSaved }: { patientId: string; animal: AnimalProfile; editable: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(animal.ownerPhone ? pretty(animal.ownerPhone) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (phone: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/patients/${patientId}/owner-phone`, { body: { phone, confirm: !!phone } });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const confirmed = !!animal.ownerPhone && !!animal.ownerPhoneConfirmedAt;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3" data-testid="owner-phone">
      <span>{animal.owner ? `Owner: ${animal.owner}` : "Owner"}</span>
      <span aria-hidden="true">·</span>
      {editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(value.trim() || null);
          }}
        >
          <label htmlFor={`owner-phone-${patientId}`} className="sr-only">Owner&apos;s phone number</label>
          <input id={`owner-phone-${patientId}`} className="input w-40 py-1 text-sm" type="tel" inputMode="tel" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Owner's phone" data-testid="owner-phone-input" />
          <button className="btn-primary px-3 py-1 text-xs" disabled={busy} data-testid="owner-phone-save">Save</button>
          <button type="button" className="btn-outline px-3 py-1 text-xs" onClick={() => setEditing(false)}>Cancel</button>
        </form>
      ) : (
        <>
          <span className="text-ink-2" data-testid="owner-phone-number">{animal.ownerPhone ? pretty(animal.ownerPhone) : "No phone"}</span>
          {animal.ownerPhone && (
            <span className={`pill text-[10px] ${confirmed ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`} data-testid="owner-phone-status">{confirmed ? "Confirmed" : "Not confirmed"}</span>
          )}
          {editable && animal.ownerPhone && !confirmed && (
            <button className="font-medium text-brand underline-offset-2 hover:underline" disabled={busy} onClick={() => save(animal.ownerPhone!)} data-testid="owner-phone-confirm">Confirm owner phone</button>
          )}
          {editable && (
            <button className="font-medium text-brand underline-offset-2 hover:underline" onClick={() => setEditing(true)} data-testid="owner-phone-edit">{animal.ownerPhone ? "Change" : "Add phone"}</button>
          )}
        </>
      )}
      {error && <span className="text-rec" role="alert">{error}</span>}
    </div>
  );
}
