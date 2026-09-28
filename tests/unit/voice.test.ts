import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expandSnippet, findSnippet, SYSTEM_SNIPPETS } from "@/lib/engine/snippets";
import { applyOps, parseUtterance, sectionTarget } from "@/lib/engine/voice";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-voice-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (utts: string[], start = "") => utts.reduce((s, u) => applyOps(s, parseUtterance(u)), { value: start, history: [] as string[] });

describe("dictation grammar", () => {
  it("turns spoken punctuation and line breaks into text with sentence capitalization", () => {
    expect(run(["patient reports improved energy period", "no chest pain comma no dyspnea period new line", "bullet continue metformin"]).value).toBe("Patient reports improved energy. No chest pain, no dyspnea.\n- Continue metformin");
    expect(run(["Blood pressure is better period."]).value).toBe("Blood pressure is better.");
    expect(run(["question mark"], "Any fever").value).toBe("Any fever?");
  });

  it("recognizes whole-utterance commands and leaves ordinary speech alone", () => {
    expect(parseUtterance("Scratch that.")).toEqual([{ type: "delete_last" }]);
    expect(parseUtterance("go to the plan section")).toEqual([{ type: "goto", target: "plan" }]);
    expect(parseUtterance("Next section")).toEqual([{ type: "next_section" }]);
    expect(parseUtterance("insert normal exam")).toEqual([{ type: "snippet", name: "normal exam" }]);
    expect(parseUtterance("Stop dictation.")).toEqual([{ type: "stop" }]);
    expect(parseUtterance("What can I say?")).toEqual([{ type: "help" }]);
    expect(parseUtterance("we will stop the lisinopril")).toEqual([{ type: "text", text: "we will stop the lisinopril" }]);
    expect(parseUtterance("add metformin to the plan")[0].type).toBe("text");
  });

  it("undoes the last utterance and clears a section", () => {
    const s = run(["first sentence period", "second sentence period", "scratch that"]);
    expect(s.value).toBe("First sentence.");
    expect(applyOps(s, parseUtterance("clear section")).value).toBe("");
  });

  it("applies vocabulary replacements while dictating", () => {
    const s = applyOps({ value: "", history: [] }, parseUtterance("reports shortness of breath on exertion"), [{ from: "shortness of breath", to: "SOB" }]);
    expect(s.value).toBe("Reports SOB on exertion");
  });

  it("maps spoken section names to template sections", () => {
    const soap = [{ key: "subjective", title: "Subjective", kind: "subjective" }, { key: "objective", title: "Objective", kind: "objective" }, { key: "assessment_plan", title: "Assessment & Plan", kind: "assessment_plan" }];
    expect(sectionTarget("plan", soap)).toBe("assessment_plan");
    expect(sectionTarget("the assessment", soap)).toBe("assessment_plan");
    expect(sectionTarget("objective", soap)).toBe("objective");
    expect(sectionTarget("HPI", [{ key: "hpi", title: "History of Present Illness", kind: "hpi" }])).toBe("hpi");
    expect(sectionTarget("billing", soap)).toBeNull();
  });
});

describe("snippets", () => {
  it("expands chart placeholders and leaves blanks for unknowns", () => {
    const text = expandSnippet("{{patient.first}} ({{patient.age}} {{patient.sex}}) takes {{meds}}; allergies: {{allergies}}; BP {{vitals.BP}}; {{nope}}", {
      patient: { name: "Maria Gonzalez", dob: "1968-03-14", sex: "F" },
      chart: { problems: [], medications: [{ name: "lisinopril", dose: "10 mg", frequency: "daily" }], allergies: [{ substance: "sulfa", reaction: "hives" }], vitals: { BP: "146/92" } },
      today: new Date("2026-09-28T12:00:00"),
    });
    expect(text).toBe("Maria (58 female) takes lisinopril 10 mg daily; allergies: sulfa (hives); BP 146/92; ***");
  });

  it("finds snippets by spoken name or shortcut", () => {
    expect(findSnippet("normal exam", SYSTEM_SNIPPETS)?.trigger).toBe("exam");
    expect(findSnippet("return precautions", SYSTEM_SNIPPETS)?.trigger).toBe("return");
    expect(findSnippet("med rec", SYSTEM_SNIPPETS)?.trigger).toBe("medrec");
    expect(findSnippet("quantum physics", SYSTEM_SNIPPETS)).toBeNull();
  });

  it("stores personal and shared snippets, imports Epic SmartPhrases, and applies replacements to drafted notes", async () => {
    const { snippets, vocabulary, applyReplacements } = await import("@/lib/server/snippets");
    const owner = await newMember("Dr. Olivia Owner");
    const doc = await newMember("Dr. Ana Alvarez", { orgId: owner.orgId, role: "clinician" });
    await snippets.save(doc, { trigger: "knee", name: "Knee exam", body: "Right knee: no effusion, full range of motion." });
    await expect(snippets.save(doc, { trigger: "knee", name: "Dup", body: "x" })).rejects.toThrow("already have a snippet");
    await expect(snippets.save(doc, { trigger: "Bad Trigger!", name: "x", body: "x" })).rejects.toThrow("Shortcuts are");
    await expect(snippets.save(doc, { trigger: "team", name: "Team", body: "x", shared: true })).rejects.toThrow("Only admins");
    await snippets.save(owner, { trigger: "clinic", name: "Clinic phone", body: "Call us at 555-0100.", shared: true });
    await snippets.save(doc, { trigger: "exam", name: "My exam", body: "Custom exam." });
    const mine = await snippets.list(doc);
    expect(mine.map((s) => s.trigger)).toEqual(expect.arrayContaining(["knee", "clinic", "exam", "lungs"]));
    expect(mine.filter((s) => s.trigger === "exam")).toHaveLength(1);
    expect(mine.find((s) => s.trigger === "exam")!.body).toBe("Custom exam.");

    const res = await snippets.importCsv(doc, 'SmartPhrase,Text,Display\n.HTNFU,"@FNAME@ is here for BP follow-up, meds: @MEDS@",HTN follow-up\n.BAD!!,,\n');
    expect(res.added).toBe(1);
    expect(res.skipped).toHaveLength(1);
    expect((await snippets.list(doc)).find((s) => s.trigger === "htnfu")!.body).toBe("{{patient.first}} is here for BP follow-up, meds: {{meds}}");

    await vocabulary.add(doc, { kind: "term", term: "tirzepatide" });
    await vocabulary.add(doc, { kind: "replace", term: "shortness of breath", replacement: "SOB" });
    expect(await vocabulary.keyterms(doc)).toEqual(expect.arrayContaining(["tirzepatide", "shortness of breath"]));
    const reps = await vocabulary.replacements(doc.id, doc.orgId);
    const note = applyReplacements({ sections: [{ key: "hpi", title: "HPI", format: "paragraph", sentences: [{ id: "s1", text: "Reports shortness of breath.", evidence: [], kind: "fact", support: "strong" }] }], meta: { engine: "local", templateId: "soap", generatedAt: "" } }, reps);
    expect(note.sections[0].sentences[0].text).toBe("Reports SOB.");
  });
});
