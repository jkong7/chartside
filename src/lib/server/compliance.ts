import { all, get } from "../db";
import { Forbidden } from "./policy";
import { orgSecurity } from "./security";
import { hl7Config } from "./hl7";
import { audit, j, orgs, type User } from "./repo";

export interface Check {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  href?: string;
}

const n = async (sql: string, ...p: string[]) => Number((await get<{ n: number }>(sql, ...p))?.n ?? 0);

export async function complianceReport(u: User, days = 30) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only admins can view compliance");
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const org = (await orgs.get(u.orgId))!;
  const sec = await orgSecurity(u.orgId);
  const members = (await orgs.members(u.orgId)).filter((m) => m.status === "active");
  let mfa = 0;
  const retention: number[] = [];
  for (const m of members) {
    const usr = await get<{ mfa_enabled_at: string | null; prefs: string }>("SELECT mfa_enabled_at, prefs FROM users WHERE id = ?", m.userId);
    if (usr?.mfa_enabled_at) mfa++;
    if (["owner", "admin", "clinician"].includes(m.role)) retention.push(Number(j<{ audioRetentionDays?: number }>(usr?.prefs, {}).audioRetentionDays ?? 0));
  }
  const withAudio = await n("SELECT COUNT(DISTINCT e.id) AS n FROM encounters e JOIN audio_chunks a ON a.encounter_id = e.id WHERE e.org_id = ? AND e.created_at >= ?", u.orgId, since);
  const audioNoConsent = await n("SELECT COUNT(DISTINCT e.id) AS n FROM encounters e JOIN utterances ut ON ut.encounter_id = e.id WHERE e.org_id = ? AND e.created_at >= ? AND ut.source <> 'typed' AND NOT EXISTS (SELECT 1 FROM consents c WHERE c.encounter_id = e.id AND c.decision = 'granted')", u.orgId, since);
  const breakGlass = await n("SELECT COUNT(*) AS n FROM audit WHERE org_id = ? AND action = 'note.break_glass' AND created_at >= ?", u.orgId, since);
  const external = await n("SELECT COUNT(*) AS n FROM encounter_shares WHERE org_id = ? AND kind = 'external' AND created_at >= ?", u.orgId, since);
  const failedLogins = await n("SELECT COUNT(*) AS n FROM audit WHERE org_id = ? AND action IN ('share.code_failed', 'auth.mfa_failed') AND created_at >= ?", u.orgId, since);
  const hl7 = await hl7Config(u.orgId);
  const pct = members.length ? Math.round((mfa / members.length) * 100) : 0;
  const checks: Check[] = [
    { key: "mfa", label: "Two-step verification", status: sec.requireMfa ? "pass" : pct === 100 ? "pass" : pct >= 50 ? "warn" : "fail", detail: `${mfa} of ${members.length} active members enrolled${sec.requireMfa ? "; required for everyone" : "; not required by policy"}`, href: "/admin" },
    { key: "sso", label: "Single sign-on", status: org.settings.sso?.enabled ? "pass" : "warn", detail: org.settings.sso?.enabled ? `OIDC via ${new URL(org.settings.sso.issuer).host}${org.settings.sso.requireSso ? ", passwords disabled for your domains" : ""}` : "Not configured; members sign in with passwords", href: "/admin" },
    { key: "idle", label: "Idle sign-out", status: (sec.idleMinutes ?? 30) <= 30 ? "pass" : "warn", detail: `After ${sec.idleMinutes ?? 30} minutes of inactivity`, href: "/admin" },
    { key: "consent", label: "Recording consent", status: audioNoConsent ? "fail" : "pass", detail: audioNoConsent ? `${audioNoConsent} recorded visit${audioNoConsent === 1 ? "" : "s"} in ${days} days without granted consent` : `Every recorded visit in the last ${days} days has a consent record`, href: "/admin" },
    { key: "audio", label: "Audio retention", status: retention.every((d) => d <= 30) ? "pass" : "warn", detail: `${retention.filter((d) => d === 0).length} of ${retention.length} clinicians delete audio at signing; longest retention ${Math.max(0, ...retention)} days${withAudio ? ` · ${withAudio} visits with audio in ${days} days` : ""}` },
    { key: "breakglass", label: "Restricted note access", status: breakGlass > 5 ? "warn" : "pass", detail: `${breakGlass} break-the-glass open${breakGlass === 1 ? "" : "s"} in ${days} days; each is in the patient's access report`, href: "/admin" },
    { key: "external", label: "External disclosures", status: "pass", detail: org.settings.sharing?.external === false ? "External sharing is off" : `${external} emailed link${external === 1 ? "" : "s"} in ${days} days, each gated by a one-time code${failedLogins ? `; ${failedLogins} failed code attempts` : ""}` },
    { key: "ai", label: "AI disclosure on signed notes", status: org.settings.aiDisclosure === false ? "warn" : "pass", detail: org.settings.aiDisclosure === false ? "Off; some states and payers expect it" : "On", href: "/admin" },
    { key: "hl7", label: "Interface security", status: hl7?.enabled && hl7.includeSensitive ? "warn" : "pass", detail: hl7?.enabled ? `HL7 MLLP to ${hl7.host}:${hl7.port}; ${hl7.includeSensitive ? "restricted notes are sent (confirm the receiving system honors confidentiality)" : "restricted notes are withheld"}. Use a VPN or TLS tunnel.` : "No HL7 interface configured" },
  ];
  return { days, checks, score: Math.round((checks.filter((c) => c.status === "pass").length / checks.length) * 100) };
}

export async function auditCsv(u: User, from: string, to: string) {
  if (!["owner", "admin"].includes(u.role)) throw new Forbidden("Only admins can export the audit log");
  const rows = await all<{ created_at: string; user_name: string | null; action: string; encounter_id: string | null; detail: string }>("SELECT a.created_at, us.name AS user_name, a.action, a.encounter_id, a.detail FROM audit a LEFT JOIN users us ON us.id = a.user_id WHERE a.org_id = ? AND a.created_at >= ? AND a.created_at < ? ORDER BY a.created_at", u.orgId, from, to);
  await audit.log(u, null, "audit.exported", { from, to, rows: rows.length });
  const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  return ["When,Who,Action,Visit,Detail", ...rows.map((r) => [r.created_at, r.user_name ?? "system", r.action, r.encounter_id ?? "", r.detail].map(q).join(","))].join("\n");
}
