import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-compliance-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("compliance center", () => {
  it("scores safeguards and flags recorded visits without consent", async () => {
    const repo = await import("@/lib/server/repo");
    const c = await import("@/lib/server/compliance");
    const sec = await import("@/lib/server/security");
    const owner = await newMember("Dr. Privacy Officer");
    const doc = await newMember("Dr. Busy", { orgId: owner.orgId });
    await expect(c.complianceReport(doc)).rejects.toThrow("Only admins");
    let r = await c.complianceReport(owner);
    const status = () => Object.fromEntries(r.checks.map((x) => [x.key, x.status]));
    expect(status()).toMatchObject({ mfa: "fail", sso: "warn", idle: "pass", consent: "pass", audio: "pass" });
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), reason: "x" });
    await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Recorded without consent.", tStart: 0, tEnd: 1, source: "live" }]);
    await expect(sec.updateOrgSecurity(owner, { requireMfa: true })).rejects.toThrow();
    const org = (await repo.orgs.get(owner.orgId))!;
    await repo.orgs.update(org.id, { settings: { ...org.settings, security: { requireMfa: true, idleMinutes: 30 } } as typeof org.settings });
    await sec.updateOrgSecurity(owner, { idleMinutes: 15 });
    r = await c.complianceReport(owner);
    expect(status()).toMatchObject({ mfa: "pass", consent: "fail" });
    expect(r.checks.find((x) => x.key === "consent")!.detail).toBe("1 recorded visit in 30 days without granted consent");
    const csv = await c.auditCsv(owner, "2000-01-01", "2100-01-01");
    expect(csv.split("\n")[0]).toBe("When,Who,Action,Visit,Detail");
    expect(csv).toContain("security.updated");
  });
});
