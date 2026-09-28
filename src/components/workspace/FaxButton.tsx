"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Send } from "../icons";
import { Spinner } from "../ui";

export default function FaxButton({ encounterId, docId }: { encounterId: string; docId: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="btn-ghost px-2 text-xs" onClick={() => setOpen(true)} data-testid="fax-open"><Send size={13} /> Fax</button>;
  return (
    <form className="flex items-center gap-1.5" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setMsg(null);
      try {
        const r = await api<{ status: string; error: string | null; to: string }>(`/encounters/${encounterId}/documents/${docId}/fax`, { body: { to } });
        setMsg(r.status === "sent" ? `Faxed to ${r.to}` : r.error ?? r.status);
      } catch (x) {
        setMsg(x instanceof Error ? x.message : "Fax failed");
      }
      setBusy(false);
    }}>
      <input className="input w-36 px-2 py-1 text-xs" placeholder="Fax number" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Fax number" data-testid="fax-to" />
      <button className="btn-outline px-2 py-1 text-xs" disabled={busy || !to} data-testid="fax-send">{busy ? <Spinner /> : null} Send</button>
      {msg && <span className="text-xs text-ink-3" data-testid="fax-msg">{msg}</span>}
    </form>
  );
}
