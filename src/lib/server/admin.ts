import { CREDENTIALS, SUPERVISORS, type Credential } from "../engine/attest";
import { seal } from "../fhir/crypto";
import { discoverOidc } from "../sso/oidc";
import { Forbidden, Invalid } from "./policy";
import { audit, invites, orgs, ROLES, sessions, type Role, type SsoConfig, type User } from "./repo";

export async function adminSnapshot(user: User) {
  const org = (await orgs.get(user.orgId))!;
  const [members, pendingTokens] = await Promise.all([orgs.members(user.orgId), invites.pending(user.orgId)]);
  const pending = (await Promise.all(pendingTokens.map((t) => invites.get(t)))).filter((x) => !!x);
  const sso = org.settings.sso;
  return {
    org: { id: org.id, name: org.name, slug: org.slug, createdAt: org.createdAt, appsRequireCosign: !!org.settings.appsRequireCosign, aiDisclosure: org.settings.aiDisclosure !== false },
    members,
    invites: pending.map((i) => ({ token: i.token, email: i.email, role: i.role, expiresAt: i.expiresAt, createdAt: i.createdAt })),
    sso: sso ? { ...sso, clientSecret: undefined, hasSecret: !!sso.clientSecret } : null,
  };
}

function assertRole(role: unknown): asserts role is Role {
  if (!ROLES.includes(role as Role)) throw new Invalid("Unknown role");
}

async function activeOwners(orgId: string) {
  return (await orgs.members(orgId)).filter((m) => m.role === "owner" && m.status === "active");
}

export async function updateMember(actor: User, userId: string, patch: { role?: Role; status?: "active" | "disabled"; credential?: string; supervisorId?: string | null }) {
  const target = await orgs.membership(actor.orgId, userId);
  if (!target) throw new Error("Member not found");
  if (patch.credential !== undefined || patch.supervisorId !== undefined) {
    const credential = patch.credential ?? target.credential ?? "";
    if (!CREDENTIALS.some((c) => c.value === credential)) throw new Invalid("Unknown credential");
    const supervisorId = patch.supervisorId === undefined ? target.supervisor_id : patch.supervisorId || null;
    if (supervisorId) {
      if (supervisorId === userId) throw new Invalid("A clinician can't supervise themselves");
      const sup = await orgs.membership(actor.orgId, supervisorId);
      if (!sup || sup.status !== "active") throw new Invalid("The supervising physician must be an active member of this organization");
      if (!SUPERVISORS.has(sup.credential as Credential)) throw new Invalid("Set the supervisor's credential to MD or DO first");
      if (!["owner", "admin", "clinician"].includes(sup.role)) throw new Invalid("The supervisor needs a role that can sign notes");
    }
    await orgs.setClinical(actor.orgId, userId, credential, supervisorId);
    await audit.log(actor, null, "member.clinical_updated", { userId, credential, supervisorId });
    if (patch.role === undefined && patch.status === undefined) return;
  }
  if (patch.role === undefined && patch.status === undefined) return;
  if (userId === actor.id) throw new Forbidden("You can't change your own role or access. Ask another admin.");
  if ((target.role === "owner" || patch.role === "owner") && actor.role !== "owner") throw new Forbidden("Only an owner can change owners.");
  if (patch.role !== undefined) {
    assertRole(patch.role);
    if (target.role === "owner" && patch.role !== "owner" && (await activeOwners(actor.orgId)).length < 2) throw new Invalid("The organization needs at least one owner");
    await orgs.setRole(actor.orgId, userId, patch.role);
    await audit.log(actor, null, "member.role_changed", { userId, from: target.role, to: patch.role });
  }
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "disabled") throw new Invalid("Unknown status");
    if (patch.status === "disabled" && target.role === "owner" && (await activeOwners(actor.orgId)).length < 2) throw new Invalid("The organization needs at least one owner");
    await orgs.setStatus(actor.orgId, userId, patch.status);
    if (patch.status === "disabled") await sessions.removeForUserInOrg(userId, actor.orgId);
    await audit.log(actor, null, patch.status === "disabled" ? "member.disabled" : "member.enabled", { userId });
  }
}

export async function removeMember(actor: User, userId: string) {
  const target = await orgs.membership(actor.orgId, userId);
  if (!target) throw new Error("Member not found");
  if (userId === actor.id) throw new Forbidden("You can't remove yourself.");
  if (target.role === "owner" && actor.role !== "owner") throw new Forbidden("Only an owner can remove an owner.");
  if (target.role === "owner" && (await activeOwners(actor.orgId)).length < 2) throw new Invalid("The organization needs at least one owner");
  await orgs.removeMember(actor.orgId, userId);
  await sessions.removeForUserInOrg(userId, actor.orgId);
  await audit.log(actor, null, "member.removed", { userId, role: target.role });
}

export async function inviteMember(actor: User, email: string, role: Role, origin: string) {
  assertRole(role);
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Invalid("Enter a valid email address");
  if (role === "owner" && actor.role !== "owner") throw new Forbidden("Only an owner can invite owners.");
  const existing = (await orgs.members(actor.orgId)).find((m) => m.email === clean);
  if (existing) throw new Invalid(`${clean} is already a member`);
  const token = await invites.create(actor.orgId, clean, role, actor.id);
  await audit.log(actor, null, "member.invited", { email: clean, role });
  return { token, url: `${origin}/invite/${token}` };
}

export async function saveSso(actor: User, input: Partial<SsoConfig> & { clientSecret?: string }) {
  const org = (await orgs.get(actor.orgId))!;
  const cur = org.settings.sso;
  const domains = (input.domains ?? cur?.domains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  const cfg: SsoConfig = {
    enabled: input.enabled ?? cur?.enabled ?? false,
    issuer: (input.issuer ?? cur?.issuer ?? "").trim().replace(/\/+$/, ""),
    clientId: (input.clientId ?? cur?.clientId ?? "").trim(),
    clientSecret: input.clientSecret ? seal(input.clientSecret) : cur?.clientSecret,
    domains,
    defaultRole: input.defaultRole ?? cur?.defaultRole ?? "clinician",
    jit: input.jit ?? cur?.jit ?? true,
    requireSso: input.requireSso ?? cur?.requireSso ?? false,
  };
  assertRole(cfg.defaultRole);
  if (cfg.defaultRole === "owner") throw new Invalid("Just-in-time users can't be owners");
  if (cfg.enabled) {
    if (!/^https?:\/\//.test(cfg.issuer)) throw new Invalid("Enter the identity provider's issuer URL");
    if (!cfg.clientId) throw new Invalid("Enter the client ID from your identity provider");
    if (!domains.length) throw new Invalid("Add at least one email domain");
    for (const d of domains) {
      const other = await orgs.forDomain(d);
      if (other && other.id !== actor.orgId) throw new Invalid(`${d} is already claimed by another organization`);
    }
    await discoverOidc(cfg.issuer);
  }
  await orgs.update(actor.orgId, { settings: { ...org.settings, sso: cfg } });
  await audit.log(actor, null, "sso.updated", { enabled: cfg.enabled, issuer: cfg.issuer, domains, requireSso: cfg.requireSso, jit: cfg.jit, defaultRole: cfg.defaultRole });
  return cfg;
}
