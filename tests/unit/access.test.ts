import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-access-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("restricted notes and access reports", () => {
  it("makes non-care-team users break the glass for behavioral health notes and reports every access", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const acc = await import("@/lib/server/access");
    const owner = await newMember("Dr. Therapist Owner");
    const coder = await newMember("Casey Coder", { orgId: owner.orgId, role: "coder" });
    const peer = await newMember("Dr. Peer", { orgId: owner.orgId });
    const d = DEMO_PATIENTS.find((x) => x.key === "reyes")!;
    const p = await repo.patients.create(owner, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const mk = async (template: string) => {
      const enc = await repo.encounters.create(owner, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: d.visit.reason, templateId: template });
      await pipeline.recordConsent(owner, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 30, tEnd: i * 30 + 20 })));
      await repo.encounters.update(owner, enc.id, { status: "processing", durationS: 3000 });
      await pipeline.processEncounter(owner, enc.id, { engine: "local" });
      return (await repo.encounters.get(owner, enc.id))!;
    };
    const bh = await mk("bh_psychotherapy");
    const plain = await mk("soap");
    expect(await acc.needsBreakGlass(owner, bh)).toBe(false);
    expect(await acc.needsBreakGlass(coder, plain)).toBe(false);
    await expect(acc.assertNoteAccess(coder, bh)).rejects.toThrow("restricted behavioral health note");
    await expect(acc.breakGlass(coder, bh.id, { reason: "Because" })).rejects.toThrow("Choose a reason");
    await expect(acc.breakGlass(coder, bh.id, { reason: "Other", detail: "x" })).rejects.toThrow("Describe");
    await acc.breakGlass(coder, bh.id, { reason: "Coding or billing review", detail: "Denied 90834 appeal" });
    expect(await acc.needsBreakGlass(coder, bh)).toBe(false);
    const sh = await import("@/lib/server/sharing");
    await sh.shareWithMember(owner, bh.id, { userId: peer.id, access: "view" });
    expect(await acc.needsBreakGlass(peer, bh)).toBe(false);
    await acc.logView(coder, bh.id);
    await acc.logView(coder, bh.id);
    await acc.logView(owner, plain.id);
    await expect(acc.accessReport(coder, p.id)).rejects.toThrow("Only admins");
    const r = await acc.accessReport(owner, p.id);
    expect(r.breakGlass).toBe(1);
    expect(r.events.filter((e) => e.action === "Viewed the visit" && e.who === "Casey Coder")).toHaveLength(1);
    expect(r.events.find((e) => e.action.startsWith("Opened a restricted"))!.detail).toBe("Reason: Coding or billing review (Denied 90834 appeal)");
    expect(r.events.find((e) => e.action === "Shared the visit")!.detail).toBe("Shared with a colleague (view)");
    expect(acc.reportCsv(r).split("\n")[0]).toBe("When,Who,Action,Detail,Visit date");
  });
});
