"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Refresh } from "./icons";
import { Spinner } from "./ui";

export default function ResyncButton({ patientId, system }: { patientId: string; system: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className="btn-outline"
        disabled={busy}
        data-testid="ehr-resync"
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await api(`/patients/${patientId}/ehr/sync`, { method: "POST" });
            setMsg("Chart updated");
            router.refresh();
          } catch (e) {
            setMsg(e instanceof Error ? e.message : "Resync failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <Refresh />} Resync from {system}
      </button>
      {msg && <span className="text-xs text-ink-3" role="status">{msg}</span>}
    </span>
  );
}
