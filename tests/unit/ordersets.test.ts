import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { SYSTEM_SETS } from "@/lib/engine/ordersets";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-osets-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("order sets", () => {
  it("applies a set without duplicating orders, notes recent results, and saves personal sets", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const os = await import("@/lib/server/ordersets");
    const owner = await newMember("Dr. Set Owner");
    const doc = await newMember("Dr. Set User", { orgId: owner.orgId });
    const d = DEMO_PATIENTS.find((x) => x.key === "gonzalez")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: "2026-09-28T09:00:00", visitType: "follow-up", reason: d.visit.reason, templateId: "soap" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 900 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const before = (await repo.orders.list(enc.id)).map((o) => o.name);
    const dm = SYSTEM_SETS.find((s) => s.id === "sys_dm")!;
    const r = await os.applyOrderSet(doc, enc.id, "sys_dm");
    expect(r.added + r.skipped).toBe(dm.items.length);
    expect(r.skipped).toBe(dm.items.filter((i) => before.includes(i.name)).length);
    const names = r.orders.map((o) => o.name);
    expect(new Set(names).size).toBe(names.length);
    const lipid = r.orders.find((o) => o.name === "Lipid panel")!;
    expect(lipid.detail).toContain("CPT 80061");
    expect(lipid.detail).toContain("From order set: Diabetes annual");
    expect(lipid.status).toBe("accepted");
    expect((await os.applyOrderSet(doc, enc.id, "sys_dm")).added).toBe(0);

    await expect(os.saveOrderSet(doc, { name: "Mine", items: [{ kind: "lab", name: "Unobtainium level" }] })).rejects.toThrow("catalog");
    await expect(os.saveOrderSet(doc, { name: "Org", items: [{ kind: "lab", name: "TSH" }], scope: "org" })).rejects.toThrow("Only admins");
    const mine = await os.saveOrderSet(doc, { name: "My thyroid check", items: [{ kind: "lab", name: "TSH" }, { kind: "lab", name: "Nope" }] });
    expect(mine.items).toEqual([{ kind: "lab", name: "TSH" }]);
    const orgSet = await os.saveOrderSet(owner, { name: "Clinic anemia panel", items: [{ kind: "lab", name: "Complete blood count" }, { kind: "lab", name: "Iron studies" }], scope: "org" });
    expect((await os.listOrderSets(doc)).map((s) => s.name)).toEqual(expect.arrayContaining(["My thyroid check", "Clinic anemia panel"]));
    expect((await os.listOrderSets(owner)).map((s) => s.name)).not.toContain("My thyroid check");
    await expect(os.deleteOrderSet(doc, orgSet.id)).rejects.toThrow("can't delete");
    await os.deleteOrderSet(doc, mine.id);
    expect((await os.listOrderSets(doc)).map((s) => s.name)).not.toContain("My thyroid check");
  });
});
