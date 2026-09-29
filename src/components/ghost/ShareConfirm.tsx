"use client";

import Link from "next/link";
import { useState } from "react";

export default function ShareConfirm({ id, name, size }: { id: string; name: string; size: number }) {
  const [phase, setPhase] = useState<"ask" | "sending" | "drafting" | "ready" | "discarded" | "failed">("ask");
  const [enc, setEnc] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (consent: boolean) => {
    setPhase(consent ? "sending" : "discarded");
    const r = await fetch("/api/go/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, consent }) }).catch(() => null);
    if (!consent) return;
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) {
      setError(j.error || "Upload failed");
      setPhase("failed");
      return;
    }
    setEnc(j.encounterId);
    setGuest(!!j.guest);
    setPhase("drafting");
    for (let i = 0; i < 160; i++) {
      const s = await (await fetch(`/api/capture/${j.encounterId}`)).json().catch(() => ({}));
      if (s.status === "ready" || s.status === "signed") return setPhase("ready");
      if (s.status === "failed") {
        setError(s.error || "Drafting failed");
        return setPhase("failed");
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
  };

  return (
    <div className="card mx-auto w-full max-w-md p-6" data-testid="share-confirm" data-phase={phase}>
      <p className="label">Shared to Chartside</p>
      <p className="font-medium text-ink">{name}</p>
      <p className="text-sm text-ink-3">{(size / 1024 / 1024).toFixed(1)} MB</p>
      {phase === "ask" && (
        <>
          <h1 className="mt-5 font-serif text-2xl font-semibold text-ink">Did your patient agree to be recorded?</h1>
          <p className="mt-2 text-sm text-ink-2">Chartside keeps nothing until you confirm. If they didn't agree, the recording is discarded right away.</p>
          <div className="mt-5 flex flex-col gap-2">
            <button className="btn-primary py-3 text-base" onClick={() => decide(true)} data-testid="share-yes">They agreed, write the note</button>
            <button className="btn-ghost" onClick={() => decide(false)} data-testid="share-no">They didn't, discard it</button>
          </div>
        </>
      )}
      {phase === "sending" && <p className="mt-5 text-ink">Uploading…</p>}
      {phase === "drafting" && <p className="mt-5 text-ink">Writing your note…</p>}
      {phase === "discarded" && (
        <p className="mt-5 text-ink" data-testid="share-discarded">
          Discarded. Nothing was kept. <Link href="/go" className="underline">Back to Chartside</Link>
        </p>
      )}
      {phase === "ready" && enc && (
        <Link href={`/go/stack?focus=${encodeURIComponent(enc)}`} className="btn-primary mt-5 w-full py-3 text-base" data-testid="share-review">
          {guest ? "Read it and save it" : "Review and sign"}
        </Link>
      )}
      {phase === "failed" && <p className="mt-5 text-sm text-rec" role="alert">{error}</p>}
    </div>
  );
}
