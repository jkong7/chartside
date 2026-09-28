"use client";

import { useCallback, useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { Copy, Shield, X } from "./icons";
import { Spinner } from "./ui";

interface Session { id: string; current: boolean; createdAt: string | null; lastSeenAt: string | null; device: string }

export function MfaSetup({ onDone }: { onDone?: () => void }) {
  const [enroll, setEnroll] = useState<{ secret: string; uri: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (codes) {
    return (
      <div className="space-y-2" data-testid="recovery-codes">
        <p className="text-sm font-medium text-ok">Two-step verification is on.</p>
        <p className="text-sm text-ink-2">Save these recovery codes somewhere safe. Each works once if you lose your phone.</p>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-3 font-mono text-sm">{codes.map((c) => <span key={c}>{c}</span>)}</div>
        <div className="flex gap-2"><button className="btn-outline" onClick={() => copyText(codes.join("\n"))}><Copy size={13} /> Copy codes</button><button className="btn-primary" onClick={() => onDone?.()} data-testid="mfa-done">Done</button></div>
      </div>
    );
  }
  if (!enroll) return <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setEnroll(await api<{ secret: string; uri: string }>("/auth/security", { body: { action: "start" } })); setBusy(false); }} data-testid="mfa-start">{busy ? <Spinner /> : <Shield size={14} />} Set up two-step verification</button>;
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { setCodes((await api<{ recoveryCodes: string[] }>("/auth/security", { body: { action: "confirm", code } })).recoveryCodes); } catch (x) { setErr(x instanceof Error ? x.message : "Could not verify"); } }}>
      <p className="text-sm text-ink-2">Add Chartside to an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy) with this setup key, then enter the 6-digit code it shows.</p>
      <p className="break-all rounded-lg bg-sunken px-3 py-2 font-mono text-sm" data-testid="mfa-secret">{enroll.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
      <a className="text-xs text-brand underline" href={enroll.uri}>Open in an authenticator app on this device</a>
      <div className="flex gap-2"><input className="input w-40 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" aria-label="Verification code" data-testid="mfa-confirm-code" /><button className="btn-primary" data-testid="mfa-confirm">Turn on</button></div>
      {err && <p className="text-sm text-rec" role="alert">{err}</p>}
    </form>
  );
}

export default function SecurityCard() {
  const [mfa, setMfa] = useState<{ enabled: boolean; enabledAt: string | null; recoveryLeft: number } | null>(null);
  const [list, setList] = useState<Session[]>([]);
  const [disableCode, setDisableCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    setMfa((await api<{ mfa: NonNullable<typeof mfa> }>("/auth/security")).mfa);
    setList((await api<{ sessions: Session[] }>("/auth/sessions")).sessions);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!mfa) return null;
  return (
    <div className="card space-y-4 p-5" data-testid="security-card">
      <div>
        <p className="text-sm font-semibold">Two-step verification</p>
        {mfa.enabled ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-ok" data-testid="mfa-on">On since {new Date(mfa.enabledAt!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {mfa.recoveryLeft} recovery codes left</p>
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api("/auth/security", { body: { action: "disable", code: disableCode } }); setDisableCode(""); load(); } catch (x) { setErr(x instanceof Error ? x.message : "Could not turn off"); } }}>
              <input className="input w-40 text-sm" placeholder="Current code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} aria-label="Code to turn off" />
              <button className="btn-ghost text-rec">Turn off</button>
            </form>
          </div>
        ) : <div className="mt-2"><MfaSetup onDone={load} /></div>}
        {err && <p className="mt-1 text-sm text-rec" role="alert">{err}</p>}
      </div>
      <div className="border-t border-line pt-4">
        <div className="flex items-center"><p className="flex-1 text-sm font-semibold">Where you&apos;re signed in</p><button className="btn-ghost px-2 text-xs text-rec" onClick={async () => setList((await api<{ sessions: Session[] }>("/auth/sessions", { method: "DELETE" })).sessions)} data-testid="signout-everywhere">Sign out everywhere else</button></div>
        <ul className="mt-2 divide-y divide-line" data-testid="sessions">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm" data-testid="session">
              <span className="flex-1">{s.device}{s.current && <span className="ml-2 pill bg-ok-50 text-[10px] text-ok">This device</span>}</span>
              <span className="text-xs text-ink-4">active {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "unknown"}</span>
              {!s.current && <button className="btn-ghost px-1.5" aria-label="Sign out this session" onClick={async () => setList((await api<{ sessions: Session[] }>(`/auth/sessions/${s.id}`, { method: "DELETE" })).sessions)}><X size={13} /></button>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
