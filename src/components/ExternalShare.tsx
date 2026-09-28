"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "./ui";

export default function ExternalShare({ token, email, from, org }: { token: string; email: string; from: string; org: string }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function call(path: string, body?: unknown) {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/x/${token}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) throw new Error(j.error ?? "Something went wrong");
    return j;
  }
  return (
    <div className="card mx-auto max-w-md p-6" data-testid="xshare-gate">
      <h1 className="font-serif text-2xl">A visit note was shared with you</h1>
      <p className="mt-2 text-sm text-ink-2">{from}{org ? ` at ${org}` : ""} shared a note with {email}. To protect patient privacy, confirm this is your email.</p>
      {!sent ? (
        <button className="btn-primary mt-5 w-full justify-center" disabled={busy} onClick={async () => { try { await call("code"); setSent(true); } catch (e) { setErr((e as Error).message); } }} data-testid="xshare-send">{busy ? <Spinner /> : null} Email me a code</button>
      ) : (
        <form className="mt-5 space-y-3" onSubmit={async (e) => { e.preventDefault(); try { await call("verify", { code }); router.refresh(); } catch (x) { setErr((x as Error).message); } }}>
          <label className="block"><span className="label">6-digit code sent to {email}</span><input className="input text-center font-mono text-lg tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} data-testid="xshare-code" /></label>
          <button className="btn-primary w-full justify-center" disabled={busy || code.length !== 6} data-testid="xshare-verify">{busy ? <Spinner /> : null} View note</button>
          <button type="button" className="btn-ghost w-full justify-center text-xs" disabled={busy} onClick={async () => { try { await call("code"); } catch (x) { setErr((x as Error).message); } }}>Send a new code</button>
        </form>
      )}
      {err && <p className="mt-3 text-sm text-rec" role="alert">{err}</p>}
    </div>
  );
}
