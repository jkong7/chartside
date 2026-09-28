"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Send } from "./icons";
import { Spinner } from "./ui";

export default function SendToPatient({ encounterId, kind }: { encounterId: string; kind: "summary" | "intake" }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button className="btn-outline px-2.5 py-1 text-xs" disabled={busy} onClick={async () => {
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ status: string; channel: string; to: string; error: string | null }>(`/encounters/${encounterId}/notify`, { body: { kind } });
          setMsg(r.status === "sent" ? { ok: true, text: `Sent by ${r.channel === "sms" ? "text" : "email"} to ${r.to}` } : r.status === "unconfigured" ? { ok: false, text: `${r.error}. Logged in the outbox; copy the link instead.` } : { ok: false, text: `Couldn't send: ${r.error}` });
        } catch (e) {
          setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't send" });
        } finally {
          setBusy(false);
        }
      }} data-testid={`send-${kind}`}>{busy ? <Spinner /> : <Send size={12} />} Send to patient</button>
      {msg && <span className={`text-xs ${msg.ok ? "text-ok" : "text-warn"}`} role="status" data-testid={`send-${kind}-status`}>{msg.text}</span>}
    </span>
  );
}
