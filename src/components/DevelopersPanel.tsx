"use client";

import Hl7Settings from "./Hl7Settings";
import { useCallback, useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { Copy, Plus, Refresh, X } from "./icons";
import { Spinner } from "./ui";

interface Key { id: string; name: string; prefix: string; scopes: string[]; createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }
interface Hook { id: string; url: string; events: string[]; active: boolean; createdAt: string }
interface Delivery { id: string; webhookId: string; event: string; status: string; attempts: number; responseCode: number | null; error: string | null; createdAt: string }

const ago = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

export default function DevelopersPanel() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pickScopes, setPickScopes] = useState<Set<string>>(new Set(["patients:read", "encounters:read", "encounters:write", "notes:generate"]));
  const [pickEvents, setPickEvents] = useState<Set<string>>(new Set(["note.signed"]));

  const load = useCallback(async () => {
    const k = await api<{ keys: Key[]; scopes: string[] }>("/admin/api-keys");
    const w = await api<{ webhooks: Hook[]; deliveries: Delivery[]; events: string[] }>("/admin/webhooks");
    setKeys(k.keys);
    setScopes(k.scopes);
    setHooks(w.webhooks);
    setDeliveries(w.deliveries);
    setEvents(w.events);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  const toggle = (set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  if (!keys) return <div className="flex h-32 items-center justify-center text-brand"><Spinner /></div>;
  return (
    <div className="mt-5 space-y-5" data-testid="developers">
      <p className="text-sm text-ink-2">Connect EHRs, telehealth platforms, and internal tools. See the <a className="text-brand underline" href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI spec</a>: create a patient and encounter, post a transcript, generate the note, then read it as JSON or FHIR.</p>
      {err && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      {secret && (
        <div className="rounded-xl border border-brand/30 bg-brand-50/60 p-4" data-testid="secret-once">
          <p className="text-sm font-semibold text-brand">{secret.label}. Copy it now; it won&apos;t be shown again.</p>
          <p className="mt-2 break-all rounded bg-surface px-3 py-2 font-mono text-xs" data-testid="secret-value">{secret.value}</p>
          <div className="mt-2 flex gap-2"><button className="btn-outline px-2 py-1 text-xs" onClick={() => copyText(secret.value)}><Copy size={12} /> Copy</button><button className="btn-ghost px-2 py-1 text-xs" onClick={() => setSecret(null)}>Done</button></div>
        </div>
      )}
      <section className="card p-4">
        <p className="text-sm font-semibold">API keys</p>
        <ul className="mt-2 divide-y divide-line" data-testid="api-keys">
          {keys.map((k) => (
            <li key={k.id} className={`flex flex-wrap items-center gap-3 py-2 text-sm ${k.revokedAt ? "opacity-50" : ""}`} data-testid="api-key">
              <span className="font-medium">{k.name}</span>
              <span className="font-mono text-xs text-ink-3">cs_live_{k.prefix}_…</span>
              <span className="flex-1 text-xs text-ink-3">{k.scopes.join(", ")}</span>
              <span className="text-xs text-ink-4">last used {ago(k.lastUsedAt)}</span>
              {k.revokedAt ? <span className="pill bg-sunken text-[10px]">Revoked</span> : <button className="btn-ghost px-2 text-xs text-rec" onClick={() => run(async () => setKeys((await api<{ keys: Key[] }>(`/admin/api-keys/${k.id}`, { method: "DELETE" })).keys))} data-testid="revoke-key">Revoke</button>}
            </li>
          ))}
          {!keys.length && <li className="py-3 text-sm text-ink-3">No keys yet.</li>}
        </ul>
        <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; run(async () => { const r = await api<{ token: string; keys: Key[] }>("/admin/api-keys", { body: { name: f.get("name"), scopes: [...pickScopes] } }); setKeys(r.keys); setSecret({ label: "New API key", value: r.token }); form.reset(); }); }}>
          <input name="name" className="input text-sm" placeholder="Key name, e.g. Telehealth platform" data-testid="key-name" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">{scopes.map((s) => <label key={s} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={pickScopes.has(s)} onChange={() => setPickScopes((x) => toggle(x, s))} />{s}</label>)}</div>
          <button className="btn-outline" data-testid="create-key"><Plus size={14} /> Create key</button>
        </form>
      </section>
      <section className="card p-4">
        <p className="text-sm font-semibold">Webhooks</p>
        <ul className="mt-2 divide-y divide-line" data-testid="webhooks">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 py-2 text-sm" data-testid="webhook">
              <span className="font-mono text-xs">{h.url}</span>
              <span className="flex-1 text-xs text-ink-3">{h.events.join(", ")}</span>
              <button className="btn-ghost px-2 text-xs" onClick={() => run(async () => setDeliveries((await api<{ deliveries: Delivery[] }>(`/admin/webhooks/${h.id}`, { body: {} })).deliveries))} data-testid="ping-webhook">Send test</button>
              <button className="btn-ghost px-1.5 text-rec" aria-label="Delete webhook" onClick={() => run(async () => setHooks((await api<{ webhooks: Hook[] }>(`/admin/webhooks/${h.id}`, { method: "DELETE" })).webhooks))}><X size={13} /></button>
            </li>
          ))}
          {!hooks.length && <li className="py-3 text-sm text-ink-3">No webhooks yet.</li>}
        </ul>
        <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; run(async () => { const r = await api<{ secret: string; webhooks: Hook[] }>("/admin/webhooks", { body: { url: f.get("url"), events: [...pickEvents] } }); setHooks(r.webhooks); setSecret({ label: "Webhook signing secret", value: r.secret }); form.reset(); }); }}>
          <input name="url" className="input text-sm" placeholder="https://example.com/chartside/webhook" data-testid="webhook-url" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">{events.map((s) => <label key={s} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={pickEvents.has(s)} onChange={() => setPickEvents((x) => toggle(x, s))} data-testid={`event-${s}`} />{s}</label>)}</div>
          <button className="btn-outline" data-testid="create-webhook"><Plus size={14} /> Add webhook</button>
        </form>
      </section>
      <section className="card p-4">
        <div className="flex items-center"><p className="flex-1 text-sm font-semibold">Recent deliveries</p><button className="btn-ghost px-2 text-xs" onClick={load}><Refresh size={12} /> Refresh</button></div>
        <table className="mt-2 w-full text-xs" data-testid="deliveries">
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} className="border-t border-line" data-testid="delivery">
                <td className="py-1.5">{ago(d.createdAt)}</td>
                <td className="py-1.5 font-mono">{d.event}</td>
                <td className="py-1.5"><span className={`pill text-[10px] ${d.status === "delivered" ? "bg-ok-50 text-ok" : d.status === "failed" ? "bg-rec-50 text-rec" : "bg-warn-50 text-warn"}`}>{d.status}</span></td>
                <td className="py-1.5 text-ink-3">{d.responseCode ?? ""} {d.error ?? ""} · {d.attempts} attempt{d.attempts === 1 ? "" : "s"}</td>
                <td className="py-1.5 text-right">{d.status !== "delivered" && <button className="text-brand" onClick={() => run(async () => setDeliveries((await api<{ deliveries: Delivery[] }>(`/admin/webhooks/deliveries/${d.id}`, { body: {} })).deliveries))}>Retry</button>}</td>
              </tr>
            ))}
            {!deliveries.length && <tr><td className="py-3 text-ink-3">No deliveries yet.</td></tr>}
          </tbody>
        </table>
      </section>
      <Hl7Settings />
    </div>
  );
}
