"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { NpiField, type NpiMatch } from "../RegisterForm";
import { Spinner } from "../ui";

export default function ClaimBanner({ onClaimed, callerPhone = null }: { onClaimed: () => void; callerPhone?: string | null }) {
  const [via, setVia] = useState<"phone" | "email">(callerPhone ? "phone" : "email");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [npi, setNpi] = useState("");
  const [match, setMatch] = useState<NpiMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (via === "phone") setSentTo((await api<{ phone: string }>("/auth/phone/claim", { body: {} })).phone);
      else setSentTo((await api<{ email: string }>("/auth/magic", { body: { email, next: "/go/stack" } })).email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    }
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const profile = match ? { name: `${match.name}${match.credential ? `, ${match.credential}` : ""}`, npi: npi.replace(/\D/g, "") } : {};
    try {
      const r = via === "phone"
        ? await api<{ mfa?: boolean }>("/auth/phone/claim/verify", { body: { code, ...profile } })
        : await api<{ mfa?: boolean }>("/auth/magic/verify", { body: { email, code, ...profile } });
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

  const switchTo = (v: "phone" | "email") => {
    setVia(v);
    setSentTo(null);
    setCode("");
    setError(null);
  };

  return (
    <section className="card border-brand bg-brand-50 p-4" data-testid="claim-banner" data-via={via}>
      <p className="font-semibold text-brand">Save this note</p>
      <p className="mt-0.5 text-sm text-ink-2">
        {via === "phone" ? "It's free. We'll text a code to the phone you just called from. Unsaved visits are deleted after two hours." : "It's free. Add your email to keep it and sign it. Unsaved visits are deleted after two hours."}
      </p>
      {sentTo ? (
        <form onSubmit={verify} className="mt-3 space-y-3">
          <div className="flex gap-2">
            <input className="input flex-1 text-center font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} required aria-label={`Code sent to ${sentTo}`} data-testid="claim-code" />
            <button className="btn-primary" disabled={busy} data-testid="claim-verify">{busy && <Spinner />} Save</button>
          </div>
          <p className="text-xs text-ink-3" data-testid="claim-sent">{callerPhone === "the browser phone" && via === "phone" ? "Code sent. It's in the browser phone's Messages, in the tab you called from." : `Code sent to ${sentTo}.`}</p>
          <NpiField id="claim-npi" compact value={npi} onChange={setNpi} onMatch={setMatch} />
        </form>
      ) : via === "phone" ? (
        <form onSubmit={send} className="mt-3">
          <button className="btn-primary w-full" disabled={busy} data-testid="claim-text">{busy && <Spinner />} Text a code to {callerPhone}</button>
        </form>
      ) : (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input className="input min-w-0 flex-1" type="email" autoComplete="email" placeholder="you@clinic.com" value={email} onChange={(e) => setEmail(e.target.value)} required aria-label="Email" data-testid="claim-email" />
          <button className="btn-primary shrink-0" disabled={busy} data-testid="claim-send">{busy && <Spinner />} Email me a code</button>
        </form>
      )}
      {callerPhone && (
        <button type="button" className="mt-2 text-sm font-medium text-brand underline" onClick={() => switchTo(via === "phone" ? "email" : "phone")} data-testid="claim-switch">
          {via === "phone" ? "Use my email instead" : `Text a code to ${callerPhone} instead`}
        </button>
      )}
      {error && <p className="mt-2 text-sm text-rec" role="alert">{error}</p>}
    </section>
  );
}
