"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "./ui";

interface Out { id: string; kind: string; channel: string; recipient: string; status: string; error: string | null; created_at: string }

export default function ContactCard({ patientId, initial, canEdit }: { patientId: string; initial: { phone: string | null; email: string | null; pref: string | null }; canEdit: boolean }) {
  const [c, setC] = useState({ phone: initial.phone ?? "", email: initial.email ?? "", pref: initial.pref ?? "" });
  const [out, setOut] = useState<Out[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ outbox: Out[] }>(`/patients/${patientId}/contact`).then((r) => setOut(r.outbox));
  }, [patientId]);
  return (
    <div className="card p-4" data-testid="contact-card">
      <p className="label">Contact</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="input text-sm" placeholder="Mobile phone" value={c.phone} disabled={!canEdit} onChange={(e) => setC({ ...c, phone: e.target.value })} aria-label="Mobile phone" data-testid="contact-phone" />
        <input className="input text-sm" placeholder="Email" value={c.email} disabled={!canEdit} onChange={(e) => setC({ ...c, email: e.target.value })} aria-label="Email" data-testid="contact-email" />
        <select className="input text-sm" value={c.pref} disabled={!canEdit} onChange={(e) => setC({ ...c, pref: e.target.value })} aria-label="Preferred contact"><option value="">Preferred: automatic</option><option value="sms">Prefers text</option><option value="email">Prefers email</option><option value="none">No messages</option></select>
      </div>
      {canEdit && <div className="mt-2 flex items-center gap-2"><button className="btn-outline px-2.5 py-1 text-xs" disabled={busy} onClick={async () => { setBusy(true); setMsg(null); try { const r = await api<{ patient: { phone: string | null } }>(`/patients/${patientId}/contact`, { method: "PUT", body: c }); setC((x) => ({ ...x, phone: r.patient.phone ?? "" })); setMsg("Saved"); } catch (e) { setMsg(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); } }} data-testid="contact-save">{busy ? <Spinner /> : null} Save contact</button>{msg && <span className="text-xs text-ink-3" role="status">{msg}</span>}</div>}
      {out.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-ink-3" data-testid="outbox">
          {out.slice(0, 5).map((o) => <li key={o.id}>{new Date(o.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {o.kind} by {o.channel} to {o.recipient} · <span className={o.status === "sent" ? "text-ok" : "text-warn"}>{o.status}</span>{o.error ? ` (${o.error})` : ""}</li>)}
        </ul>
      )}
    </div>
  );
}
