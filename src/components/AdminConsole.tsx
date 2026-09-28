"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { CREDENTIALS } from "@/lib/engine/attest";
import DevelopersPanel from "./DevelopersPanel";
import AdminSecurity from "./AdminSecurity";
import { ROLE_INFO, roleLabel, type Role } from "@/lib/roles";
import { Check, Copy, Plus, Shield, X } from "./icons";
import { Avatar, Kpi, Spinner, Tabs, Toast } from "./ui";

const ROLES = Object.keys(ROLE_INFO) as Role[];

const needsSupervisor = (credential: string, apps: boolean) => ["Resident", "Fellow", "Student"].includes(credential) || (apps && ["NP", "PA"].includes(credential));

interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  joinedAt: string;
  hasPassword: boolean;
  credential: string;
  supervisorId: string | null;
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
  org: { id: string; name: string; slug: string; createdAt: string; appsRequireCosign: boolean; aiDisclosure: boolean; externalSharing: boolean };
  members: Member[];
  invites: { token: string; email: string; role: Role; expiresAt: string; createdAt: string }[];
  sso: Sso | null;
  analytics: { userId: string; name: string; role: string; visits: number; signed: number; medianSignMinutes: number | null; uneditedRate: number | null; afterHoursSigned: number; evidencePct: number | null }[];
  audit: { id: string; action: string; detail: Record<string, unknown>; created_at: string; user_name: string | null; encounter_id: string | null }[];
}

type Tab = "members" | "sso" | "security" | "billing" | "developers" | "analytics" | "audit" | "org";

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
  "note.cosigned": "Co-signed a note",
  "note.returned": "Returned a note for changes",
  "note.addendum": "Added an addendum",
  "cosign.requested": "Requested a co-signature",
  "member.clinical_updated": "Updated a credential or supervisor",
  "org.cosign_policy": "Changed the co-signature policy",
  "api_key.created": "Created an API key",
  "api_key.revoked": "Revoked an API key",
  "webhook.created": "Added a webhook",
  "webhook.deleted": "Deleted a webhook",
  "api.call": "API request",
  "security.updated": "Changed security settings",
  "mfa.enabled": "Turned on two-step verification",
  "mfa.disabled": "Turned off two-step verification",
  "user.mfa_challenged": "Asked for a verification code",
  "session.revoked": "Signed out a session",
  "session.signed_out_everywhere": "Signed out everywhere",
  "scim.token_rotated": "Rotated the SCIM token",
  "scim.user_created": "Provisioned a member via SCIM",
  "scim.user_updated": "Updated a member via SCIM",
  "scim.user_deleted": "Removed a member via SCIM",
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
  const [tab, setTab] = useState<Tab>((["members", "sso", "security", "billing", "developers", "analytics", "audit", "org"].includes(initialTab ?? "") ? initialTab : "members") as Tab);
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
            { id: "security", label: "Security" },
            { id: "billing", label: "Billing & code sets" },
            { id: "developers", label: "Developers" },
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
                    className="input w-36 py-1.5 text-sm"
                    aria-label={`Credential for ${m.name}`}
                    data-testid="member-credential"
                    value={m.credential}
                    disabled={busy}
                    onChange={(e) => run(() => api(`/admin/members/${m.userId}`, { method: "PATCH", body: { credential: e.target.value } }), `${m.name}'s credential was updated.`)}
                  >
                    {CREDENTIALS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  {needsSupervisor(m.credential, d.org.appsRequireCosign) && (
                    <select
                      className="input w-44 py-1.5 text-sm"
                      aria-label={`Supervising physician for ${m.name}`}
                      data-testid="member-supervisor"
                      value={m.supervisorId ?? ""}
                      disabled={busy}
                      onChange={(e) => run(() => api(`/admin/members/${m.userId}`, { method: "PATCH", body: { supervisorId: e.target.value || null } }), e.target.value ? `${m.name}'s notes now go to ${d.members.find((x) => x.userId === e.target.value)?.name} for co-signature.` : `${m.name} has no supervisor.`)}
                    >
                      <option value="">No supervisor</option>
                      {d.members.filter((x) => x.userId !== m.userId && x.status === "active" && ["MD", "DO"].includes(x.credential) && ["owner", "admin", "clinician"].includes(x.role)).map((x) => <option key={x.userId} value={x.userId}>Supervisor: {x.name}</option>)}
                    </select>
                  )}
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
            <div className="card p-4" data-testid="cosign-policy">
              <p className="text-sm font-semibold">Co-signature</p>
              <p className="mt-1 text-xs text-ink-3">Residents, fellows, and students always need a supervising physician to co-sign. Their claims are held until the attestation is added.</p>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={d.org.appsRequireCosign} disabled={busy} onChange={(e) => run(() => api("/admin", { method: "PATCH", body: { appsRequireCosign: e.target.checked } }), e.target.checked ? "NP and PA notes now need a co-signature." : "NP and PA notes no longer need a co-signature.")} data-testid="apps-cosign" />
                Also require co-signature for NP and PA notes
              </label>
              <label className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
                <input type="checkbox" checked={d.org.aiDisclosure} disabled={busy} onChange={(e) => run(() => api("/admin", { method: "PATCH", body: { aiDisclosure: e.target.checked } }), e.target.checked ? "Signed notes now include an AI disclosure line." : "AI disclosure line turned off.")} data-testid="ai-disclosure" />
                Add an AI-assistance disclosure to signed notes
              </label>
              <label className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm">
                <input type="checkbox" checked={d.org.externalSharing} disabled={busy} onChange={(e) => run(() => api("/admin", { method: "PATCH", body: { externalSharing: e.target.checked } }), e.target.checked ? "Clinicians can share notes outside the organization with a verified link." : "External sharing turned off.")} data-testid="external-sharing" />
                Allow sharing notes outside the organization (email link with one-time code)
              </label>
            </div>
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

      {tab === "billing" && <BillingAdmin onSaved={(m) => setToast(m)} />}

      {tab === "developers" && <DevelopersPanel />}
      {tab === "security" && <AdminSecurity />}
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

interface BillingData {
  settings: { locality: string; chargeMultiplier: number; qualifyingApm: boolean; commercialMultiplier: number; medicaidMultiplier: number; npi?: string; tin?: string; taxonomy?: string; demoIdentifiers?: boolean };
  localities: { key: string; label: string; mac: string }[];
  codesets: {
    public: { id: string; name: string; version: string; effective: { from: string; to: string }; stats: Record<string, number>; builtAt: string; artifact: { sha256: string }; files: { url: string; sha256: string; bytes: number }[] }[];
    pos: { name: string; source: string; retrieved: string };
    licensed: { loaded: false } | { loaded: true; acceptedAt: string; acceptedBy: string; sources: { id: string; name: string; version: string; rows?: unknown }[] };
  };
}

function BillingAdmin({ onSaved }: { onSaved: (m: string) => void }) {
  const [d, setD] = useState<BillingData | null>(null);
  const [form, setForm] = useState<BillingData["settings"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<BillingData>("/admin/billing").then((x) => { setD(x); setForm(x.settings); }).catch((e) => setErr(e instanceof Error ? e.message : "Could not load billing settings"));
  }, []);
  if (!d || !form) return <div className="mt-6 text-ink-3">{err ?? <Spinner />}</div>;
  const set = (patch: Partial<BillingData["settings"]>) => setForm({ ...form, ...patch });
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <form
        className="card space-y-4 p-5"
        data-testid="billing-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await api<{ settings: BillingData["settings"] }>("/admin/billing", { method: "PUT", body: form });
            setForm(r.settings);
            onSaved("Billing settings saved.");
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="font-semibold">Billing provider & pricing</p>
        {form.demoIdentifiers && <p className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn" data-testid="demo-identifiers">Demo NPI and tax ID are in use. Replace them before submitting real claims.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="b-npi">Billing NPI</label><input className="input font-mono" id="b-npi" value={form.npi ?? ""} onChange={(e) => set({ npi: e.target.value })} /></div>
          <div><label className="label" htmlFor="b-tin">Tax ID (EIN)</label><input className="input font-mono" id="b-tin" value={form.tin ?? ""} onChange={(e) => set({ tin: e.target.value })} /></div>
        </div>
        <div>
          <label className="label" htmlFor="b-loc">Medicare payment locality</label>
          <select className="input" id="b-loc" value={form.locality} onChange={(e) => set({ locality: e.target.value })}>{d.localities.map((l) => <option key={l.key} value={l.key}>{l.label} (MAC {l.mac})</option>)}</select>
          <p className="mt-1 text-xs text-ink-3">Sets the GPCIs for Medicare pricing and the MAC whose LCD articles apply.</p>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.qualifyingApm} onChange={(e) => set({ qualifyingApm: e.target.checked })} /> Qualifying APM participant (2026 conversion factor $33.5675 instead of $33.4009)</label>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="label" htmlFor="b-cm">Charge × Medicare</label><input className="input" id="b-cm" type="number" step="0.05" value={form.chargeMultiplier} onChange={(e) => set({ chargeMultiplier: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="b-com">Commercial ×</label><input className="input" id="b-com" type="number" step="0.05" value={form.commercialMultiplier} onChange={(e) => set({ commercialMultiplier: Number(e.target.value) })} /></div>
          <div><label className="label" htmlFor="b-mcd">Medicaid ×</label><input className="input" id="b-mcd" type="number" step="0.05" value={form.medicaidMultiplier} onChange={(e) => set({ medicaidMultiplier: Number(e.target.value) })} /></div>
        </div>
        <p className="text-xs text-ink-3">Your charge master is the national Medicare amount times the charge multiplier. Commercial and Medicaid expected payments are estimates until you load contracted fee schedules.</p>
        {err && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
        <div className="flex justify-end"><button className="btn-primary" disabled={busy} data-testid="billing-save">{busy ? <Spinner /> : <Check />} Save</button></div>
      </form>

      <div className="space-y-4">
        <div className="card overflow-x-auto" data-testid="codeset-status">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Official code sets</p>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Code set</th><th>Version</th><th>Effective</th><th className="px-4">Source files (SHA-256)</th></tr></thead>
            <tbody>
              {d.codesets.public.map((c) => (
                <tr key={c.id} className="border-t border-line align-top" data-testid="codeset-row">
                  <td className="px-4 py-2"><p className="font-medium">{c.name}</p><p className="text-xs text-ink-3">{Object.entries(c.stats).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ")}</p></td>
                  <td className="py-2 font-mono text-xs">{c.version}</td>
                  <td className="py-2 text-xs">{c.effective.from} → {c.effective.to}</td>
                  <td className="px-4 py-2 text-xs">{c.files.map((f) => <p key={f.url} className="truncate"><a className="text-brand hover:underline" href={f.url} target="_blank" rel="noreferrer">{new URL(f.url).hostname}{new URL(f.url).pathname.split("/").slice(-1)[0] ? `/…/${new URL(f.url).pathname.split("/").slice(-1)[0]}` : ""}</a> <span className="font-mono text-ink-4">{f.sha256.slice(0, 12)}…</span></p>)}</td>
                </tr>
              ))}
              <tr className="border-t border-line"><td className="px-4 py-2 font-medium">{d.codesets.pos.name}</td><td className="py-2 text-xs">retrieved {d.codesets.pos.retrieved}</td><td /><td className="px-4 py-2 text-xs"><a className="text-brand hover:underline" href={d.codesets.pos.source} target="_blank" rel="noreferrer">cms.gov</a></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card p-4 text-sm" data-testid="licensed-status">
          <p className="font-semibold">NCCI, MUE, and Medicare Coverage Database</p>
          {d.codesets.licensed.loaded ? (
            <>
              <p className="mt-1 text-ok">Loaded · license accepted by {d.codesets.licensed.acceptedBy} on {new Date(d.codesets.licensed.acceptedAt).toLocaleDateString()}</p>
              <ul className="mt-1 text-xs text-ink-2">{d.codesets.licensed.sources.map((x) => <li key={x.id}>{x.name} · {x.version}</li>)}</ul>
            </>
          ) : (
            <>
              <p className="mt-1 text-ink-2">Not loaded. These CMS files contain CPT content licensed by the AMA, so Chartside never ships them. Your administrator downloads them after accepting the CMS/AMA terms:</p>
              <pre className="mt-2 rounded-lg bg-sunken p-2 font-mono text-xs">npm run codesets:licensed -- --accept-cms-ama-license</pre>
              <p className="mt-1 text-xs text-ink-3">Until then, Chartside applies its own clearly labeled clinical-necessity rules instead of MAC-specific LCD articles.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
