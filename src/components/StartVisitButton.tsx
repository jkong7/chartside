"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { Encounter } from "@/lib/types";
import { Mic } from "./icons";
import { Spinner } from "./ui";

export default function StartVisitButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { encounter } = await api<{ encounter: Encounter }>("/encounters", { body: { patientId, visitType: "follow-up", reason: "", scheduledAt: new Date().toISOString() } });
        router.push(`/encounters/${encounter.id}`);
      }}
    >
      {busy ? <Spinner /> : <Mic />} Start visit
    </button>
  );
}
