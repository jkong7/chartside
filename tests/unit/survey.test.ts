import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nudgesFrom } from "@/lib/server/survey";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-survey-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("clinician survey and adoption nudges", () => {
  it("waits for five of the clinician's own signed notes, not sample clinic notes", async () => {
    const repo = await import("@/lib/server/repo");
    const { run } = await import("@/lib/db");
    const sv = await import("@/lib/server/survey");
    const doc = await newMember("Dr. Ava Stone");
    const sign = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const e = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), reason: "x" });
        await run("UPDATE encounters SET status = 'signed' WHERE id = ?", e.id);
      }
    };
    await sign(11);
    await repo.users.update(doc.id, { prefs: { demoSigned: 11 } });
    const fresh = async () => (await repo.actorFor(doc.id, doc.orgId))!;
    expect(await sv.surveyDue(await fresh())).toBe(false);
    await sign(4);
    expect(await sv.surveyDue(await fresh())).toBe(false);
    await sign(1);
    expect(await sv.surveyDue(await fresh())).toBe(true);
  });

  it("asks after enough signed notes, respects snooze, and reports NPS", async () => {
    const repo = await import("@/lib/server/repo");
    const { run } = await import("@/lib/db");
    const sv = await import("@/lib/server/survey");
    const doc = await newMember("Dr. Nia Brooks");
    const peer = await newMember("Dr. Leo Hart", { orgId: doc.orgId });
    expect(await sv.surveyDue(doc)).toBe(false);
    for (let i = 0; i < 10; i++) {
      const e = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), reason: "x" });
      await run("UPDATE encounters SET status = 'signed' WHERE id = ?", e.id);
    }
    expect(await sv.surveyDue(doc)).toBe(true);
    await sv.snoozeSurvey(doc);
    const snoozed = (await repo.actorFor(doc.id, doc.orgId))!;
    expect(await sv.surveyDue(snoozed)).toBe(false);
    expect(await sv.surveyDue(snoozed, new Date(Date.now() + 8 * 86400000))).toBe(true);
    await expect(sv.submitSurvey(doc, { score: 11 })).rejects.toThrow("0 to 10");
    await sv.submitSurvey(doc, { score: 9, comment: "Notes are ready before I leave the room" });
    await sv.submitSurvey(peer, { score: 5, comment: "Wish the A&P were shorter" });
    expect(await sv.surveyDue(snoozed, new Date(Date.now() + 8 * 86400000))).toBe(false);
    const n = await sv.npsFor(doc.orgId);
    expect(n).toMatchObject({ responses: 2, nps: 0, promoters: 1, detractors: 1 });
    expect(n.comments.map((c) => c.name)).toEqual(expect.arrayContaining(["Dr. Nia Brooks", "Dr. Leo Hart"]));
  });

  it("flags low ambient use, after-hours charting, and unsigned backlogs", () => {
    const n = nudgesFrom([
      { name: "A", visits: 10, ambient: 3, afterHours: 0, signed: 10, backlog: 0 },
      { name: "B", visits: 10, ambient: 9, afterHours: 5, signed: 10, backlog: 4 },
      { name: "C", visits: 2, ambient: 0, afterHours: 0, signed: 0, backlog: 0 },
    ]);
    expect(n.map((x) => `${x.name}:${x.kind}`)).toEqual(["A:low_ambient", "B:after_hours", "B:backlog"]);
  });
});
