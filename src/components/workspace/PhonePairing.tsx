"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Modal, Spinner } from "../ui";

export default function PhonePairing({ encounterId, onDone }: { encounterId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<{ id: string; url: string; svg: string; expiresAt: string } | null>(null);
  const [state, setState] = useState<{ connected: boolean; expired: boolean; status: string | null } | null>(null);
  useEffect(() => {
    if (!open || !p) return;
    const t = setInterval(async () => {
      const s = await api<{ connected: boolean; expired: boolean; status: string | null }>(`/pairings/${p.id}`).catch(() => null);
      if (!s) return;
      setState(s);
      if (s.status === "review" || s.status === "signed") {
        setOpen(false);
        onDone();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [open, p, onDone]);
  return (
    <>
      <button className="btn-outline" onClick={async () => { setOpen(true); setState(null); setP(await api(`/encounters/${encounterId}/pair`, { method: "POST" })); }} data-testid="pair-phone">Record on phone</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record on your phone">
        <div className="flex flex-col items-center gap-3 text-center" data-testid="pair-modal">
          {!p ? <Spinner /> : state?.connected ? (
            <>
              <p className="font-medium text-ok" data-testid="pair-connected">Phone connected</p>
              <p className="text-sm text-ink-2">Record on the phone. When you end the visit there, the draft opens here automatically.</p>
              <Spinner className="text-brand" />
            </>
          ) : state?.expired ? (
            <p className="text-sm text-rec">The code expired. Close this and show a new one.</p>
          ) : (
            <>
              <div className="h-56 w-56 rounded-lg bg-white p-2" dangerouslySetInnerHTML={{ __html: p.svg }} data-testid="pair-qr" />
              <p className="text-sm text-ink-2">Scan with your phone&apos;s camera while signed in to Chartside. The code works once and expires in 5 minutes.</p>
              <a href={p.url} className="break-all text-[11px] text-ink-4" data-testid="pair-link">{p.url}</a>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
