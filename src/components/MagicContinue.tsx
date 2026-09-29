"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "./icons";
import { Spinner } from "./ui";

export default function MagicContinue({ token, email, note = false, next = "/today" }: { token: string; email: string | null; note?: boolean; next?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<{ id: string; next: string } | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ mfa?: boolean; challenge?: string; next: string }>("/auth/magic/verify", { body: { token } });
      if (r.mfa && r.challenge) {
        setChallenge({ id: r.challenge, next: r.next });
        setBusy(false);
        return;
      }
      window.location.assign(r.next || "/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await api("/auth/mfa", { body: { challenge: challenge.id, code: new FormData(e.currentTarget).get("code") } });
      window.location.assign(challenge.next || "/today");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setBusy(false);
    }
  }

  return (
    <div className="card w-full max-w-sm space-y-4 p-6 text-center shadow-sm" data-testid="magic-continue">
      <div className="flex items-center justify-center gap-2"><Logo /><span className="font-serif text-xl">Chartside</span></div>
      {challenge ? (
        <form onSubmit={verify} className="space-y-3" data-testid="magic-mfa">
          <p className="text-sm text-ink-2">Enter the 6-digit code from your authenticator app.</p>
          <input className="input text-center font-mono text-lg tracking-widest" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required aria-label="Verification code" />
          <button className="btn-primary w-full" disabled={busy} type="submit">{busy && <Spinner />} Verify</button>
        </form>
      ) : (
        <>
          {note ? <p className="font-serif text-xl font-semibold text-ink">Your note is ready.</p> : null}
          <p className="text-sm text-ink-2">{email ? <>Continue as <b>{email}</b></> : note ? "Tap to open it and review it." : "Continue to Chartside"}</p>
          <button className="btn-primary w-full" onClick={go} disabled={busy} data-testid="magic-go">{busy && <Spinner />} {note ? "Open my note" : "Continue"}</button>
        </>
      )}
      {error && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{error}</p>}
      {error && /single sign-on/i.test(error) && (
        <a className="btn-outline w-full" href={`/login?next=${encodeURIComponent(next)}`} data-testid="magic-sso">
          Sign in with your organization
        </a>
      )}
    </div>
  );
}
