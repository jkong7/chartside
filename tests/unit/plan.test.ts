import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-plan-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("plans and seats", () => {
  it("gives a 14-day, 3-seat trial and counts pending clinician invites against seats", async () => {
    const admin = await import("@/lib/server/admin");
    const pl = await import("@/lib/server/plan");
    const owner = await newMember("Dr. Founder");
    const p = await pl.planFor(owner.orgId);
    expect(p).toMatchObject({ tier: "trial", seats: 3, used: 1, pending: 0, daysLeft: 14 });
    await admin.inviteMember(owner, "a@x.test", "clinician", "https://app.test");
    await admin.inviteMember(owner, "b@x.test", "clinician", "https://app.test");
    await expect(admin.inviteMember(owner, "c@x.test", "clinician", "https://app.test")).rejects.toThrow("All 3 clinician seats are in use (including 2 pending invites)");
    await admin.inviteMember(owner, "scribe@x.test", "scribe", "https://app.test");
    const scribe = await newMember("Sam Scribe", { orgId: owner.orgId, role: "scribe" });
    await expect(admin.updateMember(owner, scribe.id, { role: "clinician" })).rejects.toThrow("seats");
  });

  it("lets the owner move to Pro with seats or Enterprise, never below active clinicians", async () => {
    const pl = await import("@/lib/server/plan");
    const owner = await newMember("Dr. Owner Two");
    const doc = await newMember("Dr. Staff", { orgId: owner.orgId });
    await expect(pl.changePlan(doc, { tier: "pro", seats: 5 })).rejects.toThrow("Only an owner");
    await expect(pl.changePlan(owner, { tier: "pro", seats: 1 })).rejects.toThrow("2 clinicians are active");
    await expect(pl.changePlan(owner, { tier: "trial" })).rejects.toThrow("trial");
    expect(await pl.changePlan(owner, { tier: "pro", seats: 5 })).toMatchObject({ tier: "pro", seats: 5, monthly: 495, daysLeft: null });
    expect(await pl.changePlan(owner, { tier: "enterprise" })).toMatchObject({ tier: "enterprise", seats: null });
    await pl.assertSeat(owner.orgId, "clinician");
  });
});
