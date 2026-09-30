import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-orgs-"));
const PORT = 3394;
const IDP = `http://localhost:${PORT}`;
let idp: ChildProcess;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  idp = spawn(process.execPath, ["tests/e2e/mock-oidc.mjs"], { env: { ...process.env, MOCK_OIDC_PORT: String(PORT) }, stdio: "pipe" });
  await new Promise<void>((resolve) => idp.stdout!.on("data", (d) => String(d).includes("mock oidc") && resolve()));
});

afterAll(() => {
  idp.kill();
  rmSync(dir, { recursive: true, force: true });
});

async function clinic() {
  const repo = await import("@/lib/server/repo");
  const owner = await newMember("Dr. Olivia Owner");
  const orgId = owner.orgId;
  const [a, b, scribe, coder, viewer, admin] = await Promise.all([
    newMember("Dr. Ana Alvarez", { orgId, role: "clinician" }),
    newMember("Dr. Ben Brooks", { orgId, role: "clinician" }),
    newMember("Sam Scribe", { orgId, role: "scribe" }),
    newMember("Casey Coder", { orgId, role: "coder" }),
    newMember("Val Viewer", { orgId, role: "viewer" }),
    newMember("Ada Admin", { orgId, role: "admin" }),
  ]);
  return { repo, owner, a, b, scribe, coder, viewer, admin, orgId };
}

describe("organizations and roles", () => {
  it("scopes patients and visits to the org and to the treating clinician", async () => {
    const { repo, a, b, scribe, coder, viewer } = await clinic();
    const outsider = await newMember("Dr. Other Org");
    const pat = await repo.patients.create(a, { mrn: "1", name: "Pat Doe", dob: "1980-01-01", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(a, { scheduledAt: new Date().toISOString(), patientId: pat.id, reason: "Cough" });
    expect(enc.clinicianName).toBe("Dr. Ana Alvarez");
    expect(await repo.encounters.get(b, enc.id)).toBeUndefined();
    for (const u of [scribe, coder, viewer]) expect((await repo.encounters.get(u, enc.id))?.id).toBe(enc.id);
    expect(await repo.encounters.get(outsider, enc.id)).toBeUndefined();
    expect((await repo.patients.list(b)).map((p) => p.id)).toContain(pat.id);
    expect(await repo.patients.get(outsider, pat.id)).toBeUndefined();
    expect((await repo.encounters.list(scribe)).map((e) => e.id)).toContain(enc.id);
    expect((await repo.encounters.list(b)).map((e) => e.id)).not.toContain(enc.id);
  });

  it("enforces the permission matrix and signing rights", async () => {
    const { can, canSign } = await import("@/lib/server/policy");
    const pipeline = await import("@/lib/server/pipeline");
    const { repo, owner, a, scribe, coder, viewer } = await clinic();
    expect([owner, a, scribe, coder, viewer].map((u) => can(u, "clinical.edit"))).toEqual([true, true, true, false, false]);
    expect([owner, a, scribe, coder, viewer].map((u) => can(u, "billing.review"))).toEqual([true, false, false, true, false]);
    expect([owner, a, scribe, coder, viewer].map((u) => can(u, "org.manage"))).toEqual([true, false, false, false, false]);
    const enc = await repo.encounters.create(a, { scheduledAt: new Date().toISOString(), reason: "Sore throat" });
    expect(canSign(a, enc)).toBe(true);
    expect(canSign(owner, enc)).toBe(false);
    expect(canSign(scribe, enc)).toBe(false);
    await expect(pipeline.signEncounter(scribe, enc.id)).rejects.toThrow("Scribes can prepare notes but only the treating clinician can sign.");
    await expect(pipeline.signEncounter(owner, enc.id)).rejects.toThrow("Only the treating clinician can sign this note.");
  });

  it("protects owners, blocks self-changes, and revokes sessions when access is removed", async () => {
    const admin = await import("@/lib/server/admin");
    const { repo, owner, a, admin: adm, orgId } = await clinic();
    await expect(admin.updateMember(owner, owner.id, { role: "clinician" })).rejects.toThrow("your own role");
    await expect(admin.updateMember(adm, owner.id, { role: "clinician" })).rejects.toThrow("Only an owner can change owners");
    await expect(admin.updateMember(adm, a.id, { role: "owner" })).rejects.toThrow("Only an owner can change owners");
    await expect(admin.inviteMember(adm, "x@y.test", "owner", "http://app")).rejects.toThrow("Only an owner can invite owners");
    await expect(admin.updateMember(adm, a.id, { role: "wizard" as never })).rejects.toThrow("Unknown role");
    await admin.updateMember(adm, a.id, { role: "scribe" });
    expect((await repo.actorFor(a.id, orgId))?.role).toBe("scribe");

    const token = await repo.sessions.create(a.id, orgId);
    expect((await repo.sessions.user(token))?.orgId).toBe(orgId);
    await admin.updateMember(owner, a.id, { status: "disabled" });
    expect(await repo.sessions.user(token)).toBeUndefined();
    expect(await repo.actorFor(a.id, orgId)).toBeUndefined();
    await admin.updateMember(owner, a.id, { status: "active" });
    expect((await repo.actorFor(a.id, orgId))?.orgId).toBe(orgId);

    await admin.updateMember(owner, adm.id, { role: "owner" });
    const promoted = (await repo.actorFor(adm.id, orgId))!;
    expect(promoted.role).toBe("owner");
    await admin.updateMember(promoted, owner.id, { role: "admin" });
    await expect(admin.updateMember((await repo.actorFor(owner.id, orgId))!, adm.id, { role: "clinician" })).rejects.toThrow("Only an owner");
    await expect(admin.removeMember((await repo.actorFor(adm.id, orgId))!, adm.id)).rejects.toThrow("remove yourself");
    const log = (await repo.audit.forOrg(orgId)).map((x) => x.action);
    expect(log).toEqual(expect.arrayContaining(["member.role_changed", "member.disabled", "member.enabled"]));
  });

  it("invites carry a role and multi-org users switch context", async () => {
    const admin = await import("@/lib/server/admin");
    const { repo, owner } = await clinic();
    const elsewhere = await newMember("Dr. Multi Org");
    const { token, url } = await admin.inviteMember(owner, elsewhere.email, "coder", "http://app");
    expect(url).toBe(`http://app/invite/${token}`);
    await expect(admin.inviteMember(owner, elsewhere.email.toUpperCase(), "coder", "http://app")).resolves.toBeTruthy();
    const inv = (await repo.invites.get(token))!;
    expect(inv).toMatchObject({ email: elsewhere.email, role: "coder", acceptedAt: null });
    await repo.orgs.addMember(inv.orgId, elsewhere.id, inv.role);
    await repo.invites.accept(token);
    expect((await repo.orgs.memberships(elsewhere.id)).map((m) => m.role).sort()).toEqual(["coder", "owner"]);
    expect((await repo.actorFor(elsewhere.id, owner.orgId))?.role).toBe("coder");
    expect((await repo.actorFor(elsewhere.id, elsewhere.orgId))?.role).toBe("owner");
    await expect(admin.inviteMember(owner, elsewhere.email, "viewer", "http://app")).rejects.toThrow("already a member");
  });
});

describe("OIDC single sign-on", () => {
  async function ssoOrg(domain: string, patch: Record<string, unknown> = {}) {
    const admin = await import("@/lib/server/admin");
    const owner = await newMember("Dr. SSO Owner");
    await admin.saveSso(owner, { enabled: true, issuer: IDP, clientId: "chartside-sso", clientSecret: "idp-secret", domains: [domain], defaultRole: "clinician", jit: true, requireSso: true, ...patch });
    return owner;
  }

  async function login(email: string) {
    const sso = await import("@/lib/server/sso");
    const binding = (await import("@/lib/server/oidcBinding")).newBinding();
    const url = await sso.beginSso({ email, next: "/today" }, "http://app/sso/callback", binding.hash);
    const res = await fetch(url, { redirect: "manual" });
    const back = new URL(res.headers.get("location")!);
    if (back.searchParams.get("error")) throw new Error(back.searchParams.get("error")!);
    return sso.completeSso(back.searchParams.get("state")!, back.searchParams.get("code")!, "http://app/sso/callback", binding.value);
  }

  const setMode = (mode: string) => fetch(`${IDP}/mode`, { method: "POST", body: JSON.stringify({ mode }) });

  it("stores the client secret encrypted and validates the provider", async () => {
    const repo = await import("@/lib/server/repo");
    const admin = await import("@/lib/server/admin");
    const owner = await ssoOrg("lakeside.test");
    const org = (await repo.orgs.get(owner.orgId))!;
    expect(org.settings.sso?.clientSecret).toMatch(/^v1\./);
    expect(JSON.stringify(org.settings)).not.toContain("idp-secret");
    expect((await repo.orgs.requiringSso("LAKESIDE.test"))?.id).toBe(owner.orgId);
    const other = await newMember("Dr. Rival");
    await expect(admin.saveSso(other, { enabled: true, issuer: IDP, clientId: "x", domains: ["lakeside.test"] })).rejects.toThrow("already claimed");
    await expect(admin.saveSso(other, { enabled: true, issuer: "http://localhost:1", clientId: "x", domains: ["rival.test"] })).rejects.toThrow("Could not reach");
    await expect(admin.saveSso(other, { enabled: true, issuer: IDP, clientId: "x", domains: ["rival.test"], defaultRole: "owner" })).rejects.toThrow("can't be owners");
  });

  it("provisions a user just in time, links the identity, and signs them into the org", async () => {
    const repo = await import("@/lib/server/repo");
    const owner = await ssoOrg("riverside.test");
    const first = await login("jordan.lee@riverside.test");
    expect(first).toMatchObject({ created: true, next: "/today" });
    expect(first.user).toMatchObject({ orgId: owner.orgId, role: "clinician", name: "Dr. Jordan Lee", hasPassword: false });
    const again = await login("jordan.lee@riverside.test");
    expect(again.created).toBe(false);
    expect(again.user.id).toBe(first.user.id);
    expect((await repo.orgs.members(owner.orgId)).filter((m) => m.email === "jordan.lee@riverside.test")).toHaveLength(1);
    const actions = (await repo.audit.forOrg(owner.orgId)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["member.provisioned", "user.login", "sso.updated"]));
  });

  it("rejects forged, replayed, or misdirected tokens and unverified or disabled users", async () => {
    const repo = await import("@/lib/server/repo");
    const sso = await import("@/lib/server/sso");
    const owner = await ssoOrg("hillcrest.test");
    for (const [mode, msg] of [["bad-signature", "signature is invalid"], ["bad-nonce", "nonce mismatch"], ["wrong-aud", "different application"]]) {
      await setMode(mode);
      await expect(login("pat@hillcrest.test")).rejects.toThrow(msg);
    }
    await setMode("normal");
    await expect(sso.completeSso("never-issued", "code", "http://app/sso/callback", null)).rejects.toThrow("expired");
    await fetch(`${IDP}/people`, { method: "POST", body: JSON.stringify({ email: "unverified@hillcrest.test", email_verified: false }) });
    await expect(login("unverified@hillcrest.test")).rejects.toThrow("verified email");
    await fetch(`${IDP}/people`, { method: "POST", body: JSON.stringify({ email: "spoof@hillcrest.test", sub: "spoof-sub", email_verified: true }) });
    const ok = await login("spoof@hillcrest.test");
    const admin = await import("@/lib/server/admin");
    await admin.updateMember(owner, ok.user.id, { status: "disabled" });
    await expect(login("spoof@hillcrest.test")).rejects.toThrow("disabled");
    expect((await repo.audit.forOrg(owner.orgId)).filter((a) => a.action === "sso.rejected").length).toBeGreaterThanOrEqual(3);
  });

  it("without just-in-time provisioning, only invited or existing members get in", async () => {
    const repo = await import("@/lib/server/repo");
    const owner = await ssoOrg("northside.test", { jit: false });
    await expect(login("new.person@northside.test")).rejects.toThrow("Ask your administrator for an invitation");
    const existing = await newMember("Dr. Existing", { email: "existing@northside.test", orgId: owner.orgId, role: "scribe" });
    const r = await login("existing@northside.test");
    expect(r.user).toMatchObject({ id: existing.id, role: "scribe", orgId: owner.orgId });
    expect(await repo.users.byEmail("new.person@northside.test")).toBeUndefined();
  });
});
