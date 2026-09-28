import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diffNotes, provenance } from "@/lib/engine/diff";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-hist-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("note history", () => {
  it("records every change with its source, diffs sentences, restores drafts, and discloses AI use at signing", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const signoff = await import("@/lib/server/signoff");
    const doc = await newMember("Dr. Avery Chen");
    const p = await repo.patients.create(doc, { mrn: "H1", name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), patientId: p.id, reason: "BP" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 152 over 94. Let's start lisinopril 10 milligrams daily. Follow up in 4 weeks.", tStart: 0, tEnd: 5 }]);
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const draft = (await repo.notes.latest(enc.id))!.content;
    const edited = { ...draft, sections: draft.sections.map((s) => (s.key === "assessment_plan" ? { ...s, sentences: [...s.sentences.slice(1), { id: "x1", text: "Discussed home BP monitoring.", evidence: [], kind: "clinician" as const, support: "strong" as const, edited: true }] } : s)) };
    await pipeline.saveNoteEdits(doc, enc.id, edited, "section.edited");
    await pipeline.saveNoteEdits(doc, enc.id, edited, "section.edited");
    await pipeline.saveNoteEdits(doc, enc.id, { ...edited, sections: edited.sections.map((s) => (s.key === "subjective" ? { ...s, sentences: [...s.sentences, { id: "d1", text: "Dictated line.", evidence: [], kind: "clinician" as const, support: "strong" as const, edited: true }] } : s)) }, "section.dictated");
    const revs = await repo.revisions.list(enc.id);
    expect(revs.map((r) => r.source)).toEqual(["ai:local", "edit", "dictation"]);
    const d = diffNotes(revs[0].content, revs[1].content);
    expect(d[0].key).toBe("assessment_plan");
    expect(d[0].added).toEqual(["Discussed home BP monitoring."]);
    expect(d[0].removed).toHaveLength(1);
    expect(provenance(revs[2].content).clinician).toBeGreaterThanOrEqual(2);
    const restored = await pipeline.saveNoteEdits(doc, enc.id, revs[0].content, "restore");
    expect(JSON.stringify(restored.note.sections.map((s) => s.sentences.map((x) => x.text)))).toBe(JSON.stringify(revs[0].content.sections.map((s) => s.sentences.map((x) => x.text))));
    expect((await repo.revisions.list(enc.id)).at(-1)!.source).toBe("restore");
    await pipeline.signEncounter(doc, enc.id, { force: true });
    expect((await repo.revisions.list(enc.id)).at(-1)!.source).toBe("signature");
    const text = await signoff.documentText(enc.id, (await repo.notes.latest(enc.id))!.content);
    expect(text).toContain("drafted by Chartside, an AI documentation tool");
    const org = (await repo.orgs.get(doc.orgId))!;
    await repo.orgs.update(doc.orgId, { settings: { ...org.settings, aiDisclosure: false } });
    expect(await signoff.documentText(enc.id, (await repo.notes.latest(enc.id))!.content)).not.toContain("AI documentation tool");
  });
});
