"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Spinner } from "../ui";

export default function ClaimBanner({ onClaimed }: { onClaimed: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSentTo((await api<{ email: string }>("/auth/magic", { body: { email, next: "/go/stack" } })).email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfa?: boolean }>("/auth/magic/verify", { body: { email, code } });
      if (r.mfa) {
        window.location.assign(`/login?next=${encodeURIComponent("/go/stack")}`);
        return;
      }
      onClaimed();
      const u = new URL(window.location.href);
      u.searchParams.set("claimed", "1");
      window.location.assign(u.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <section className="card border-brand bg-brand-50 p-4" data-testid="claim-banner">
      <p className="font-semibold text-brand">Save this note</p>
      <p className="mt-0.5 text-sm text-ink-2">It&apos;s on us. Add your email to keep it and sign it. Unsaved visits are deleted after two hours.</p>
      {sentTo ? (
        <form onSubmit={verify} className="mt-3 flex gap-2">
          <input className="input flex-1 text-center font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required aria-label={`Code sent to ${sentTo}`} data-testid="claim-code" />
          <button className="btn-primary" disabled={busy} data-testid="claim-verify">{busy && <Spinner />} Save</button>
        </form>
      ) : (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input className="input flex-1" type="email" autoComplete="email" placeholder="you@clinic.com" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" data-testid="claim-email" />
          <button className="btn-primary" disabled={busy} data-testid="claim-send">{busy && <Spinner />} Send code</button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-rec" role="alert">{error}</p>}
    </section>
  );
}
