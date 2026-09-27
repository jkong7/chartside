"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "./ui";

export default function AcceptInvite({ token, orgName }: { token: string; orgName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
      <button
        className="btn-primary w-full"
        disabled={busy}
        data-testid="accept-invite"
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/invites/${token}`, { method: "POST" });
            window.location.assign("/today");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not accept the invitation");
            setBusy(false);
          }
        }}
      >
        {busy && <Spinner />} Join {orgName}
      </button>
    </>
  );
}
