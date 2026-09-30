"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post<T>(url: string, data: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Something went wrong. Try again.");
  return j as T;
}

export default function SaveProgress({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post("/api/auth/magic", { email, next });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send a code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ mfa?: boolean }>("/api/auth/magic/verify", { email, code });
      if (r.mfa) {
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const c = await post<{ saved: number; student: boolean }>("/api/practice/claim", {});
      setDone(`Saved ${c.saved} practice ${c.saved === 1 ? "case" : "cases"} to ${email}.${c.student ? " Student badge added." : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work");
    } finally {
      setBusy(false);
    }
  };

  if (done) return <p className="rounded-xl border border-ok/30 bg-ok-50 p-4 text-sm text-ok" role="status" data-testid="save-done">{done}</p>;

  return (
    <section className="rounded-xl border border-line bg-surface p-5" data-testid="save-progress">
      <h2 className="font-semibold">Save your progress</h2>
      <p className="mt-1 text-sm text-ink-2">Keep your scores and see them on any device. We email you a 6-digit code, no password. A school .edu email gets a student badge.</p>
      {!sent ? (
        <form onSubmit={send} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="save-email">Email</label>
          <input id="save-email" type="email" required className="input min-w-0 flex-1" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="save-email" />
          <button className="btn-primary" disabled={busy} data-testid="save-send">Email me a code</button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="save-code">6-digit code</label>
          <input id="save-code" inputMode="numeric" autoComplete="one-time-code" required className="input w-40 font-mono tracking-widest" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="save-code" />
          <button className="btn-primary" disabled={busy || code.length !== 6} data-testid="save-verify">Save</button>
          <button type="button" className="btn-ghost" onClick={() => setSent(false)}>Use a different email</button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-rec">{error}</p>}
    </section>
  );
}
