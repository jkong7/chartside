"use client";

import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { Copy } from "./icons";
import { Spinner } from "./ui";

export default function AdminSecurity() {
  const [s, setS] = useState<{ requireMfa: boolean; idleMinutes: number; scim: { createdAt: string; defaultRole: string } | null } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    api<NonNullable<typeof s>>("/admin/security").then(setS);
  }, []);
  async function patch(b: Record<string, unknown>, msg: string) {
    setErr(null);
    try {
      const r = await api<{ requireMfa: boolean; idleMinutes: number }>("/admin/security", { method: "PATCH", body: b });
      setS((x) => (x ? { ...x, ...r } : x));
      setSaved(msg);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    }
  }
  if (!s) return <div className="flex h-24 items-center justify-center text-brand"><Spinner /></div>;
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-2" data-testid="admin-security">
      <div className="card space-y-3 p-4">
        <p className="text-sm font-semibold">Sign-in policy</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.requireMfa} onChange={(e) => patch({ requireMfa: e.target.checked }, e.target.checked ? "Two-step verification is now required for password sign-ins." : "Two-step verification is optional.")} data-testid="require-mfa" /> Require two-step verification for everyone who signs in with a password</label>
        <p className="text-xs text-ink-3">Members who sign in with SSO use your identity provider&apos;s MFA. Members without two-step verification are asked to set it up at their next page load.</p>
        <label className="block text-sm"><span className="label">Sign out after inactivity</span>
          <select className="input w-48" value={s.idleMinutes} onChange={(e) => patch({ idleMinutes: Number(e.target.value) }, "Idle timeout updated.")} data-testid="idle-minutes">
            {[15, 30, 60, 120, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? "s" : ""}`}</option>)}
          </select>
        </label>
        <RetentionSelect onSaved={(m) => setSaved(m)} />
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        {saved && <p className="text-sm text-ok" role="status">{saved}</p>}
      </div>
      <div className="card space-y-3 p-4">
        <p className="text-sm font-semibold">SCIM provisioning</p>
        <p className="text-xs text-ink-3">Let Okta, Microsoft Entra ID, or another identity provider create, update, and deactivate members automatically. Deactivated users are signed out right away.</p>
        <p className="text-sm">Base URL: <span className="font-mono text-xs" data-testid="scim-url">{typeof window !== "undefined" ? window.location.origin : ""}/scim/v2</span></p>
        <p className="text-xs text-ink-3">{s.scim ? `Token created ${new Date(s.scim.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}; new users get the ${s.scim.defaultRole} role unless the IdP sends one.` : "No token yet."}</p>
        {token && (
          <div className="rounded-lg bg-brand-50 p-3 text-xs"><p className="font-medium text-brand">Copy this token now; it won&apos;t be shown again.</p><p className="mt-1 break-all font-mono" data-testid="scim-token">{token}</p><button className="mt-1 flex items-center gap-1 text-brand" onClick={() => copyText(token)}><Copy size={11} /> Copy</button></div>
        )}
        <button className="btn-outline" onClick={async () => { setToken((await api<{ token: string }>("/admin/security", { method: "PATCH", body: { rotateScim: true } })).token); setS((x) => (x ? { ...x, scim: { createdAt: new Date().toISOString(), defaultRole: "clinician" } } : x)); }} data-testid="rotate-scim">{s.scim ? "Rotate token" : "Generate token"}</button>
      </div>
    </div>
  );
}

function RetentionSelect({ onSaved }: { onSaved: (m: string) => void }) {
  const [days, setDays] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    api<{ transcriptDays: number | null }>("/admin/retention").then((r) => setDays(r.transcriptDays)).catch(() => undefined);
  }, []);
  if (days === undefined) return null;
  return (
    <label className="block text-sm"><span className="label">Delete transcripts after signing</span>
      <select className="input w-64" value={days === null ? "keep" : String(days)} onChange={async (e) => { const v = e.target.value === "keep" ? null : Number(e.target.value); const r = await api<{ transcriptDays: number | null; purged: number }>("/admin/retention", { method: "PUT", body: { transcriptDays: v } }); setDays(r.transcriptDays); onSaved(v === null ? "Transcripts are kept." : `Transcript retention updated${r.purged ? `; ${r.purged} older transcript${r.purged === 1 ? "" : "s"} removed` : ""}.`); }} data-testid="transcript-retention">
        <option value="keep">Keep transcripts</option>
        <option value="0">At signing</option>
        {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{d} days after signing</option>)}
      </select>
      <span className="mt-1 block text-xs text-ink-3">Signed notes are always kept. Evidence links show that the source was removed.</span>
    </label>
  );
}
