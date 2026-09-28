import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GROUP_DEMO } from "@/lib/demo/scripts";
import { guessAssignments, memberTranscript } from "@/lib/engine/group";
import type { Utterance } from "@/lib/types";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-group-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const members = GROUP_DEMO.members.map((name, i) => ({ id: `p${i}`, name }));
const utts: Utterance[] = GROUP_DEMO.script.map((l, i) => ({ id: `u${i}`, seq: i, speaker: l.s, text: l.t, tStart: i * 30, tEnd: i * 30 + 20 }));

describe("group therapy", () => {
  it("attributes member lines from how the facilitator addresses them", () => {
    const a = guessAssignments(utts, members);
    expect([a.u2, a.u4, a.u6, a.u7, a.u9, a.u12]).toEqual(["p0", "p0", "p1", "p1", "p2", "p0"]);
  });

  it("keeps only group-wide facilitator lines and the member's own exchange, with other members never named", () => {
    const t = memberTranscript(utts, guessAssignments(utts, members), members[1], members);
    const text = t.map((x) => x.text).join(" ");
    expect(t.filter((x) => x.speaker === "patient")).toHaveLength(2);
    expect(text).toContain("Today's topic is managing stress");
    expect(text).toContain("homework this week");
    expect(text).not.toMatch(/Jordan|Priya|breathing exercise|new job/);
  });

  it("creates one note per member from a single recording and bills 90853 per member", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const grp = await import("@/lib/server/group");
    const doc = await newMember("Dr. Morgan Lee");
    const ids: string[] = [];
    for (const name of GROUP_DEMO.members) ids.push((await repo.patients.create(doc, { mrn: name.length + String(Math.random()).slice(2, 8), name, dob: "1990-01-01", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } })).id);
    await expect(grp.createGroup(doc, { title: "Coping", memberIds: [ids[0]] })).rejects.toThrow("at least two");
    const { group } = await grp.createGroup(doc, { title: GROUP_DEMO.title, memberIds: ids });
    await expect(grp.createMemberNotes(doc, group.id)).rejects.toThrow("consent");
    const enc = (await repo.encounters.get(doc, group.encounterId))!;
    expect(enc).toMatchObject({ patientId: null, visitType: "group", templateId: "bh_group" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: true });
    await repo.utterances.append(enc.id, GROUP_DEMO.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 30, tEnd: i * 30 + 20 })));
    await repo.encounters.update(doc, enc.id, { durationS: 3600 });
    const detail = (await grp.groupDetail(doc, group.id))!;
    expect(detail.participation.map((p) => p.lines)).toEqual([3, 2, 1]);
    expect(detail.unassigned).toBe(0);
    const priyaLine = detail.utterances.find((x) => /new job/.test(x.text))!;
    await grp.assign(doc, group.id, priyaLine.id, ids[2]);
    const created = await grp.createMemberNotes(doc, group.id);
    expect(Object.keys(created)).toHaveLength(3);
    const jordan = (await repo.notes.latest(created[ids[0]]))!.content;
    const all = JSON.stringify(jordan);
    expect(all).toContain("Group psychotherapy session: Coping skills group (3 members).");
    expect(all).toContain("Topic: managing stress with coping skills.");
    expect(all).not.toMatch(/Daniel|Priya|gym|new job/);
    const daniel = (await repo.notes.latest(created[ids[1]]))!.content.sections.find((x) => x.key === "participation")!.sentences.map((x) => x.text);
    expect(daniel).toEqual(["Shared: She has been sleeping better, and she went to the gym three times.", "Shared: She got into an argument with her brother, but she walked away instead of yelling."]);
    const coding = (await repo.artifacts.get<import("@/lib/types").CodingResult>(created[ids[0]], "coding"))!;
    expect(coding.em.code).toBe("90853");
    await expect(pipeline.signEncounter(doc, enc.id, { force: true })).rejects.toThrow("member's note");
    const dn = (await repo.notes.latest(created[ids[1]]))!.content;
    await pipeline.saveNoteEdits(doc, created[ids[1]], { ...dn, sections: dn.sections.map((sec) => ({ ...sec, sentences: sec.sentences.map((x) => ({ ...x, text: x.text.replace("***", "Denies suicidal ideation when asked after group.") })) })) });
    expect((await pipeline.signEncounter(doc, created[ids[1]], { force: true })).signed).toBe(true);
    expect((await repo.claims.get(created[ids[1]]))!.content.lines[0].cpt).toBe("90853");
    const again = await grp.createMemberNotes(doc, group.id);
    expect(again[ids[1]]).toBe(created[ids[1]]);
  });
});
