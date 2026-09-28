import { describe, expect, it } from "vitest";
import { localAssist } from "@/lib/engine/assist";
import { buildNote } from "@/lib/engine/note";
import { applyStyle, learnFromEdits } from "@/lib/engine/style";
import { systemTemplate } from "@/lib/engine/templates";
import type { StyleRule } from "@/lib/types";
import { demo, SCHEDULED } from "./helpers";

function gen() {
  const { d, facts, patient, utterances } = demo("gonzalez");
  const note = buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: SCHEDULED }, template: systemTemplate("soap")! });
  return { note, utterances, patient };
}

describe("style learning", () => {
  it("learns dropped lines and added boilerplate from a signed note", () => {
    const { note } = gen();
    const final = {
      ...note,
      sections: note.sections.map((s) =>
        s.key === "assessment_plan"
          ? { ...s, sentences: [...s.sentences.filter((x) => !/^Patient questions addressed/.test(x.text)), { id: "c1", text: "Medication risks and benefits reviewed.", evidence: [], kind: "clinician" as const, support: "strong" as const }] }
          : s,
      ),
    };
    const rules = learnFromEdits(note, final);
    expect(rules.map((r) => r.kind)).toEqual(expect.arrayContaining(["drop_phrase", "always_include"]));
  });

  it("applies active rules to a new note", () => {
    const { note } = gen();
    const rules: StyleRule[] = [
      { id: "r1", kind: "drop_phrase", section: "assessment_plan", value: "patient questions addressed", label: "", source: "learned", support: 2, active: true },
      { id: "r2", kind: "always_include", section: "assessment_plan", value: "Medication risks and benefits reviewed.", label: "", source: "learned", support: 2, active: true },
      { id: "r3", kind: "abbreviate", section: "*", value: "standard", label: "", source: "manual", support: 1, active: true },
    ];
    const styled = applyStyle(note, rules);
    const ap = styled.sections.find((s) => s.key === "assessment_plan")!.sentences.map((s) => s.text);
    expect(ap.some((t) => t.startsWith("Patient questions"))).toBe(false);
    expect(ap).toContain("Medication risks and benefits reviewed.");
    expect(ap.some((t) => t.includes("(I10)") && t.includes("HTN"))).toBe(true);
  });
});

describe("assistant", () => {
  it("edits the note from natural commands", () => {
    const { note, utterances } = gen();
    const added = localAssist("add patient declined flu shot to plan", note, utterances);
    expect(added.action).toBe("edit");
    expect(added.note!.sections.find((s) => s.key === "assessment_plan")!.sentences.at(-1)!.text).toBe("Patient declined flu shot.");
    const shorter = localAssist("make the subjective shorter", note, utterances);
    expect(shorter.action).toBe("edit");
    const removed = localAssist("remove the line about diabetes education", note, utterances);
    expect(removed.reply).toMatch(/Removed 1 line/);
  });

  it("rewrites format, abbreviations, and length, and remembers 'always' instructions as style rules", () => {
    const { note, utterances } = gen();
    const bullets = localAssist("use bullets in the subjective", note, utterances);
    expect(bullets.note!.sections.find((s) => s.key === "subjective")!.format).toBe("bullets");
    expect(bullets.rule).toBeUndefined();
    const remembered = localAssist("Always write the subjective as a paragraph", note, utterances);
    expect(remembered.rule).toMatchObject({ kind: "format", section: "subjective", value: "paragraph" });
    const abbr = localAssist("use abbreviations", note, utterances);
    expect(JSON.stringify(abbr.note)).toContain("HTN");
    const expanded = localAssist("expand abbreviations", abbr.note!, utterances);
    expect(JSON.stringify(expanded.note)).not.toMatch(/\bHTN\b/);
    const capped = localAssist("always keep the subjective under 40 words", note, utterances);
    const words = capped.note!.sections.find((s) => s.key === "subjective")!.sentences.filter((s) => !s.pending).slice(1).reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    expect(words).toBeLessThanOrEqual(40);
    expect(capped.rule).toMatchObject({ kind: "max_words", value: "40" });
    const styled = applyStyle(note, [{ id: "f", kind: "format", section: "assessment_plan", value: "paragraph", label: "", source: "manual", support: 1, active: true }]);
    expect(styled.sections.find((s) => s.key === "assessment_plan")!.format).toBe("paragraph");
  });

  it("drafts brief, standard, and detailed notes from the same visit", () => {
    const { d, facts, patient } = demo("gonzalez");
    const t = systemTemplate("soap")!;
    const words = (v: "concise" | "standard" | "detailed") => buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: SCHEDULED }, template: { ...t, style: { ...t.style, verbosity: v } } }).sections.flatMap((s) => s.sentences.filter((x) => !x.pending)).reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    expect(words("concise")).toBeLessThan(words("standard"));
    expect(words("standard")).toBeLessThan(words("detailed"));
  });

  it("answers questions with transcript citations", () => {
    const { utterances, patient } = gen();
    const r = localAssist("what did she say about the metformin?", null, utterances, patient.chart);
    expect(r.action).toBe("answer");
    expect(r.citations).toContain("u3");
    expect(r.reply).toMatch(/On file: lisinopril 10 mg/);
  });
});
