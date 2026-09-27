"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { ROLE_INFO, roleLabel, type Role } from "@/lib/roles";
import { Check, Copy, Plus, Shield, X } from "./icons";
import { Avatar, Kpi, Spinner, Tabs, Toast } from "./ui";

const ROLES = Object.keys(ROLE_INFO) as Role[];

interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  joinedAt: string;
  hasPassword: boolean;
}

interface Sso {
  enabled: boolean;
  issuer: string;
  clientId: string;
  hasSecret: boolean;
  domains: string[];
  defaultRole: Role;
  jit: boolean;
  requireSso: boolean;
}

interface Data {
  org: { id: string; name: string; slug: string; createdAt: string };
  members: Member[];
  invites: { token: string; email: string; role: Role; expiresAt: string; createdAt: string }[];
  sso: Sso | null;
  analytics: { userId: string; name: string; role: string; visits: number; signed: number; medianSignMinutes: number | null; uneditedRate: number | null; afterHoursSigned: number; evidencePct: number | null }[];
  audit: { id: string; action: string; detail: Record<string, unknown>; created_at: string; user_name: string | null; encounter_id: string | null }[];
}

type Tab = "members" | "sso" | "analytics" | "audit" | "org";

const ACTION_LABEL: Record<string, string> = {
  "user.login": "Signed in",
  "user.registered": "Created the organization",
  "member.invited": "Invited a member",
  "member.joined": "Joined",
  "member.provisioned": "Provisioned via SSO",
  "member.role_changed": "Changed a role",
  "member.disabled": "Disabled a member",
  "member.enabled": "Re-enabled a member",
  "member.removed": "Removed a member",
  "member.invite_revoked": "Revoked an invitation",
  "sso.updated": "Updated SSO settings",
  "sso.rejected": "SSO sign-in rejected",
  "org.renamed": "Renamed the organization",
  "org.switched": "Switched organization",
  "note.signed": "Signed a note",
  "note.edited": "Edited a note",
  "note.generated": "Drafted a note",
  "consent.granted": "Recorded consent",
  "consent.declined": "Recorded declined consent",
  "claim.approved": "Approved a claim",
  "claim.submitted": "Submitted a claim",
  "ehr.filed": "Filed a note to the EHR",
  "audio.purged": "Purged audio",
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function describe(a: Data["audit"][number], members: Member[]) {
  const who = (id: unknown) => members.find((m) => m.userId === id)?.name ?? "a former member";
  const d = a.detail;
  if (a.action === "member.role_changed") return `${who(d.userId)}: ${roleLabel(String(d.from))} → ${roleLabel(String(d.to))}`;
  if (a.action === "member.invited" || a.action === "member.invite_revoked") return `${d.email}${d.role ? ` as ${roleLabel(String(d.role))}` : ""}`;
  if (a.action === "member.disabled" || a.action === "member.enabled" || a.action === "member.removed") return who(d.userId);
  if (a.action === "user.login") return d.method === "sso" ? "Single sign-on" : "Password";
  if (a.action === "sso.rejected") return String(d.reason ?? "");
  if (a.action === "sso.updated") return d.enabled ? `Enabled for ${(d.domains as string[]).join(", ")}${d.requireSso ? " · required" : ""}` : "Disabled";
  if (a.action === "member.joined" || a.action === "member.provisioned") return d.role ? roleLabel(String(d.role)) : "";
  return "";
}

export default function AdminConsole({ initial, me, tab: initialTab, redirectOrigin }: { initial: Data; me: { id: string; role: Role }; tab?: string; redirectOrigin: string | null }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [tab, setTab] = useState<Tab>((["members", "sso", "analytics", "audit", "org"].includes(initialTab ?? "") ? initialTab : "members") as Tab);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [origin, setOrigin] = useState(redirectOrigin ?? "");
  const [sso, setSso] = useState<Sso>(initial.sso ?? { enabled: false, issuer: "", clientId: "", hasSecret: false, domains: [], defaultRole: "clinician", jit: true, requireSso: false });
  const [secret, setSecret] = useState("");
  const [domains, setDomains] = useState((initial.sso?.domains ?? []).join(", "));
  const [orgName, setOrgName] = useState(initial.org.name);

  useEffect(() => {
    if (!redirectOrigin) setOrigin(window.location.origin);
  }, [redirectOrigin]);

  async function reload() {
    setD(await api<Data>("/admin"));
  }

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await reload();
      if (ok) setToast(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const active = d.members.filter((m) => m.status === "active");
  const clinicians = active.filter((m) => ["owner", "admin", "clinician"].includes(m.role)).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <p className="text-sm text-ink-3">Administration</p>
      <h1 className="font-serif text-3xl" data-testid="admin-org-name">{d.org.name}</h1>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active members" value={active.length} />
        <Kpi label="Clinicians" value={clinicians} />
        <Kpi label="Pending invites" value={d.invites.length} />
        <Kpi label="Single sign-on" value={d.sso?.enabled ? "On" : "Off"} tone={d.sso?.enabled ? "ok" : "ink"} hint={d.sso?.enabled ? (d.sso.requireSso ? "Required" : "Optional") : undefined} />
      </div>

      <div className="mt-6">
        <Tabs<Tab>
          value={tab}
          onChange={(t) => { setTab(t); setErr(null); }}
          tabs={[
            { id: "members", label: "Members" },
            { id: "sso", label: "Single sign-on" },
            { id: "analytics", label: "Clinician analytics" },
            { id: "audit", label: "Audit log" },
            { id: "org", label: "Organization" },
          ]}
        />
      </div>
      {err && <p className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}

      {tab === "members" && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="card divide-y divide-line" data-testid="members">
            {d.members.map((m) => {
              const self = m.userId === me.id;
              const ownerLocked = m.role === "owner" && me.role !== "owner";
              return (
                <div key={m.userId} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${m.status === "disabled" ? "opacity-60" : ""}`} data-testid="member-row">
                  <Avatar name={m.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.name}{self && <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span>}</p>
                    <p className="truncate text-xs text-ink-3">{m.email} · {m.hasPassword ? "Password" : "SSO"}{m.status === "disabled" ? " · Disabled" : ""}</p>
                  </div>
                  <select
                    className="input w-40 py-1.5 text-sm"
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    disabled={busy || self || ownerLocked}
                    onChange={(e) => run(() => api(`/admin/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }), `${m.name} is now ${roleLabel(e.target.value)}.`)}
                  >
                    {ROLES.filter((r) => r !== "owner" || me.role === "owner" || m.role === "owner").map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                  </select>
                  {!self && !ownerLocked && (
                    <div className="flex gap-1">
                      <button className="btn-ghost px-2 text-xs" disabled={busy} onClick={() => run(() => api(`/admin/members/${m.userId}`, { method: "PATCH", body: { status: m.status === "active" ? "disabled" : "active" } }), m.status === "active" ? `${m.name} can no longer sign in.` : `${m.name} is active again.`)}>
                        {m.status === "active" ? "Disable" : "Enable"}
                      </button>
                      <button className="btn-ghost px-2 text-xs text-rec" disabled={busy} onClick={() => run(() => api(`/admin/members/${m.userId}`, { method: "DELETE" }), `${m.name} was removed.`)} aria-label={`Remove ${m.name}`}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-5">
            <form
              className="card space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                run(async () => {
                  const r = await api<{ url: string }>("/admin/invites", { body: { email: f.get("email"), role: f.get("role") } });
                  setInviteLink(r.url);
                  form.reset();
                }, "Invitation created.");
              }}
            >
              <p className="text-sm font-semibold">Invite a member</p>
              <div>
                <label className="label" htmlFor="invite-email">Email</label>
                <input className="input" id="invite-email" name="email" type="email" required placeholder="name@clinic.org" />
              </div>
              <div>
                <label className="label" htmlFor="invite-role">Role</label>
                <select className="input" id="invite-role" name="role" defaultValue="clinician">
                  {ROLES.filter((r) => r !== "owner" || me.role === "owner").map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
                </select>
              </div>
              <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : <Plus />} Create invitation</button>
              {inviteLink && (
                <div className="rounded-lg bg-brand-50 p-3 text-xs">
                  <p className="font-medium text-brand">Share this link with them. It expires in 7 days.</p>
                  <p className="mt-1 break-all font-mono text-ink-2" data-testid="invite-link">{inviteLink}</p>
                  <button type="button" className="mt-2 flex items-center gap-1 font-medium text-brand" onClick={async () => { await copyText(inviteLink); setToast("Link copied."); }}><Copy size={12} /> Copy link</button>
                </div>
              )}
            </form>
            {d.invites.length > 0 && (
              <div className="card p-4">
                <p className="text-sm font-semibold">Pending invitations</p>
                <ul className="mt-2 space-y-2" data-testid="pending-invites">
                  {d.invites.map((i) => (
                    <li key={i.token} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">{i.email}</p>
                        <p className="text-xs text-ink-3">{roleLabel(i.role)} · expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <button className="btn-ghost px-2" aria-label={`Revoke invitation for ${i.email}`} onClick={() => run(() => api(`/admin/invites/${i.token}`, { method: "DELETE" }), "Invitation revoked.")}><X size={14} /></button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="card p-4">
              <p className="text-sm font-semibold">Roles</p>
              <dl className="mt-2 space-y-2 text-xs">
                {ROLES.map((r) => (
                  <div key={r}>
                    <dt className="font-medium text-ink">{ROLE_INFO[r].label}</dt>
                    <dd className="text-ink-3">{ROLE_INFO[r].description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {tab === "sso" && (
        <form
          className="card mt-5 max-w-2xl space-y-4 p-5"
          data-testid="sso-form"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await api<{ sso: Sso }>("/admin/sso", { method: "PUT", body: { ...sso, domains: domains.split(/[\s,]+/).filter(Boolean), clientSecret: secret || undefined } });
              setSso(r.sso);
              setSecret("");
            }, "SSO settings saved.");
          }}
        >
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 text-brand" />
            <div>
              <p className="font-semibold">OpenID Connect single sign-on</p>
              <p className="text-sm text-ink-3">Works with Okta, Microsoft Entra ID, Google Workspace, Ping, and any OIDC provider. Chartside uses the authorization-code flow with PKCE and verifies every ID token&apos;s signature, issuer, audience, expiry, and nonce.</p>
            </div>
          </div>
          <div className="rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
            Register Chartside in your identity provider with the redirect URI <span className="font-mono" data-testid="sso-redirect">{origin}/sso/callback</span> and the scopes <span className="font-mono">openid email profile</span>.
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sso.enabled} onChange={(e) => setSso({ ...sso, enabled: e.target.checked })} data-testid="sso-enabled" /> Enable single sign-on
          </label>
          <div>
            <label className="label" htmlFor="sso-issuer">Issuer URL</label>
            <input className="input font-mono text-sm" id="sso-issuer" value={sso.issuer} onChange={(e) => setSso({ ...sso, issuer: e.target.value })} placeholder="https://your-org.okta.com" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="sso-client">Client ID</label>
              <input className="input font-mono text-sm" id="sso-client" value={sso.clientId} onChange={(e) => setSso({ ...sso, clientId: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="sso-secret">Client secret</label>
              <input className="input font-mono text-sm" id="sso-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={sso.hasSecret ? "Stored encrypted · leave blank to keep" : "Optional for public clients"} autoComplete="off" />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="sso-domains">Email domains</label>
            <input className="input" id="sso-domains" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="clinic.org, clinic-health.org" />
            <p className="mt-1 text-xs text-ink-3">People signing in with these domains are sent to your identity provider.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="sso-role">Default role for new users</label>
              <select className="input" id="sso-role" value={sso.defaultRole} onChange={(e) => setSso({ ...sso, defaultRole: e.target.value as Role })}>
                {ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_INFO[r].label}</option>)}
              </select>
            </div>
            <div className="space-y-2 pt-6 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={sso.jit} onChange={(e) => setSso({ ...sso, jit: e.target.checked })} /> Create accounts on first sign-in</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sso.requireSso} onChange={(e) => setSso({ ...sso, requireSso: e.target.checked })} data-testid="sso-require" /> Require SSO (disable passwords)</label>
            </div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" disabled={busy} data-testid="sso-save">{busy ? <Spinner /> : <Check />} Save and verify</button>
          </div>
        </form>
      )}

      {tab === "analytics" && (
        <div className="card mt-5 overflow-x-auto" data-testid="org-analytics">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-3">
              <tr>
                <th className="px-4 py-2.5 font-medium">Clinician</th>
                <th className="px-4 py-2.5 text-right font-medium">Visits (30d)</th>
                <th className="px-4 py-2.5 text-right font-medium">Signed</th>
                <th className="px-4 py-2.5 text-right font-medium">Median time to sign</th>
                <th className="px-4 py-2.5 text-right font-medium">Signed unedited</th>
                <th className="px-4 py-2.5 text-right font-medium">After-hours</th>
                <th className="px-4 py-2.5 text-right font-medium">Evidence coverage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.analytics.map((a) => (
                <tr key={a.userId}>
                  <td className="px-4 py-2.5 font-medium">{a.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.visits}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.signed}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.medianSignMinutes == null ? "—" : `${a.medianSignMinutes} min`}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.uneditedRate == null ? "—" : `${Math.round(a.uneditedRate * 100)}%`}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.afterHoursSigned}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{a.evidencePct == null ? "—" : `${a.evidencePct}%`}</td>
                </tr>
              ))}
              {!d.analytics.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">No clinicians yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="card mt-5 divide-y divide-line" data-testid="org-audit">
          {d.audit.map((a) => (
            <div key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2.5 text-sm">
              <span className="w-32 shrink-0 font-mono text-xs text-ink-3">{when(a.created_at)}</span>
              <span className="font-medium">{a.user_name ?? "System"}</span>
              <span className="text-ink-2">{ACTION_LABEL[a.action] ?? a.action}</span>
              <span className="text-ink-3">{describe(a, d.members)}</span>
              {a.encounter_id && <button className="ml-auto text-xs text-brand" onClick={() => router.push(`/encounters/${a.encounter_id}?tab=audit`)}>Open visit</button>}
            </div>
          ))}
          {!d.audit.length && <p className="px-4 py-8 text-center text-sm text-ink-3">No activity yet.</p>}
        </div>
      )}

      {tab === "org" && (
        <form
          className="card mt-5 max-w-lg space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("/admin", { method: "PATCH", body: { name: orgName } });
              router.refresh();
            }, "Organization renamed.");
          }}
        >
          <div>
            <label className="label" htmlFor="org-name-input">Organization name</label>
            <input className="input" id="org-name-input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <p className="text-xs text-ink-3">Organization ID <span className="font-mono">{d.org.id}</span> · created {new Date(d.org.createdAt).toLocaleDateString()}</p>
          <div className="flex justify-end"><button className="btn-primary" disabled={busy}>Save</button></div>
        </form>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
