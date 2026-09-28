"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Plus } from "./icons";
import { Spinner } from "./ui";

type Loc = { id: string; name: string; address: string; pos: string; archived: boolean };

export default function LocationsCard() {
  const [list, setList] = useState<Loc[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = () => api<{ locations: Loc[] }>("/locations").then((r) => setList(r.locations));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="card mt-5 max-w-2xl p-5" data-testid="locations">
      <p className="text-sm font-semibold">Locations</p>
      <p className="mt-1 text-xs text-ink-3">Clinics and sites in your organization. Visits are stamped with the clinician&apos;s location, Today and Impact can be filtered by it, and the address appears as the service facility on claims.</p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {list.map((l) => (
          <li key={l.id} className={`flex items-center gap-2 py-2 ${l.archived ? "opacity-50" : ""}`} data-testid="location-row">
            <span className="flex-1"><span className="font-medium">{l.name}</span> <span className="text-xs text-ink-3">{l.address} · POS {l.pos}</span></span>
            <button className="btn-ghost px-2 text-xs" onClick={async () => { await api("/locations", { body: { id: l.id, archived: !l.archived } }); load(); }}>{l.archived ? "Restore" : "Archive"}</button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true);
        setErr(null);
        try {
          await api("/locations", { body: { name: f.get("name"), address: f.get("address"), pos: f.get("pos") } });
          (e.target as HTMLFormElement).reset();
          await load();
        } catch (x) {
          setErr(x instanceof Error ? x.message : "Could not add");
        }
        setBusy(false);
      }}>
        <label className="block"><span className="label">Name</span><input name="name" className="input w-44" required data-testid="location-name" /></label>
        <label className="block flex-1"><span className="label">Address</span><input name="address" className="input" data-testid="location-address" /></label>
        <label className="block"><span className="label">POS</span><select name="pos" className="input w-24"><option value="11">11 Office</option><option value="22">22 Hospital outpatient</option><option value="19">19 Off-campus HOPD</option><option value="20">20 Urgent care</option></select></label>
        <button className="btn-outline" disabled={busy} data-testid="location-add">{busy ? <Spinner /> : <Plus size={14} />} Add</button>
      </form>
      {err && <p className="mt-2 text-sm text-rec">{err}</p>}
    </div>
  );
}
