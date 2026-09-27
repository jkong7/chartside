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

  it("answers questions with transcript citations", () => {
    const { utterances, patient } = gen();
    const r = localAssist("what did she say about the metformin?", null, utterances, patient.chart);
    expect(r.action).toBe("answer");
    expect(r.citations).toContain("u3");
    expect(r.reply).toMatch(/On file: lisinopril 10 mg/);
  });
});
