"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { OrderSet } from "@/lib/engine/ordersets";
import type { StagedOrder } from "@/lib/types";
import { Plus } from "../icons";
import { Spinner } from "../ui";

export default function OrderSets({ encounterId, orders, locked, onApplied }: { encounterId: string; orders: StagedOrder[]; locked: boolean; onApplied: (orders: StagedOrder[], note: string) => void }) {
  const [sets, setSets] = useState<OrderSet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ sets: OrderSet[] }>("/order-sets").then((r) => setSets(r.sets)).catch(() => undefined);
  }, []);
  if (locked) return null;
  const savable = orders.filter((o) => o.status === "accepted" && o.kind !== "medication" && o.kind !== "follow_up");
  return (
    <div className="card p-3" data-testid="order-sets">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Order sets</span>
        {sets.map((s) => (
          <button key={s.id} className="pill bg-sunken text-xs text-ink-2 hover:bg-brand-50 hover:text-brand" disabled={!!busy} title={s.items.map((i) => i.name).join(", ")} onClick={async () => {
            setBusy(s.id);
            const r = await api<{ orders: StagedOrder[]; added: number; skipped: number }>(`/encounters/${encounterId}/order-sets`, { body: { setId: s.id } });
            onApplied(r.orders, `${s.name}: added ${r.added}${r.skipped ? `, ${r.skipped} already on the list` : ""}.`);
            setBusy(null);
          }} data-testid="order-set">{busy === s.id ? <Spinner /> : null}{s.name}{s.scope !== "system" && <span className="ml-1 text-[10px] text-ink-4">{s.scope === "org" ? "org" : "mine"}</span>}</button>
        ))}
      </div>
      {savable.length > 1 && (
        saving ? (
          <form className="mt-2 flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            const r = await api<{ set: OrderSet }>("/order-sets", { body: { name, items: savable.map((o) => ({ kind: o.kind, name: o.name })), scope: "personal" } }).catch((x: Error) => { setMsg(x.message); return null; });
            if (r) { setSets([r.set, ...sets]); setSaving(false); setName(""); setMsg(`Saved "${r.set.name}".`); }
          }}>
            <input className="input flex-1 text-sm" placeholder="Name this set" value={name} onChange={(e) => setName(e.target.value)} required data-testid="order-set-name" />
            <button className="btn-primary text-xs" data-testid="order-set-save">Save</button>
          </form>
        ) : <button className="btn-ghost mt-1 px-2 text-xs" onClick={() => setSaving(true)} data-testid="order-set-new"><Plus size={12} /> Save these {savable.length} orders as a set</button>
      )}
      {msg && <p className="mt-1 text-xs text-ink-3" data-testid="order-set-msg">{msg}</p>}
    </div>
  );
}
