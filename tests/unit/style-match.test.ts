import { describe, expect, it } from "vitest";
import { buildNote, noteToText } from "@/lib/engine/note";
import { applyStyle, pronounText } from "@/lib/engine/style";
import { detailFromWords, matchStyle, samplePhiProblem, splitSample } from "@/lib/engine/styleMatch";
import { systemTemplate } from "@/lib/engine/templates";
import type { StyleRule } from "@/lib/types";
import { demo, SCHEDULED } from "./helpers";

function gen(template = "soap") {
  const { d, facts, patient } = demo("gonzalez");
  return buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: SCHEDULED }, template: systemTemplate(template)! });
}

const asRules = (c: ReturnType<typeof matchStyle>["rules"]): StyleRule[] => c.map((r, i) => ({ ...r, id: `m${i}`, source: "manual", support: 1, active: true }));

const APSO = `A/P:
- T2DM, A1c 8.1, not at goal. Switch to metformin ER 1000 mg w/ dinner.
- HTN above goal. Increase lisinopril 20 mg daily.
- f/u 3 mo, labs prior.
S: Pt here for DM and HTN f/u. Pt reports good adherence, no SOB or chest pain.
O:
- BP 148/92, HR 78
- Lungs clear, no edema`;

describe("paste an old note, match its style", () => {
  it("splits a pasted note into its headed sections", () => {
    const secs = splitSample(APSO);
    expect(secs.map((s) => [s.slot, s.heading])).toEqual([["assessment_plan", "A/P"], ["subjective", "S"], ["objective", "O"]]);
    expect(secs[0].lines).toHaveLength(3);
    expect(secs[1].lines[0]).toMatch(/^Pt here/);
  });

  it("derives section order, headings, bullets, abbreviations, pronouns and length", () => {
    const note = gen();
    const m = matchStyle(APSO, note);
    const byKind = (k: string) => m.rules.filter((r) => r.kind === k);
    expect(byKind("order")[0].value).toBe("assessment_plan,subjective,objective");
    expect(byKind("heading").map((r) => [r.section, r.value])).toEqual(expect.arrayContaining([["assessment_plan", "A/P"], ["subjective", "S"], ["objective", "O"]]));
    expect(byKind("abbreviate")).toHaveLength(1);
    expect(byKind("pronoun")[0].value).toBe("Pt");
    expect(m.detail).toBe("concise");
    expect(m.findings.join(" ")).toContain("A/P, S, O");
  });

  it("maps separate A and P headings onto a combined section", () => {
    const m = matchStyle("SUBJECTIVE\nThe client reports better sleep. The client practiced skills.\nASSESSMENT\nImproving.\nPLAN\nContinue weekly sessions.", gen());
    expect(m.rules.find((r) => r.kind === "heading" && r.section === "assessment_plan")?.value).toBe("ASSESSMENT/PLAN");
    expect(m.rules.find((r) => r.kind === "pronoun")?.value).toBe("client");
    expect(m.rules.some((r) => r.kind === "order")).toBe(false);
  });

  it("shows a before and after of the note that was just made", () => {
    const note = gen();
    const before = noteToText(note);
    const after = noteToText(applyStyle(note, asRules(matchStyle(APSO, note).rules)));
    expect(before.indexOf("SUBJECTIVE")).toBeLessThan(before.indexOf("ASSESSMENT & PLAN"));
    expect(after.indexOf("A/P")).toBeGreaterThanOrEqual(0);
    expect(after.indexOf("A/P")).toBeLessThan(after.indexOf("\nS\n"));
    expect(after).not.toBe(before);
  });

  it("returns nothing but a length reading for plain prose with no headings", () => {
    const m = matchStyle("Doing well overall. No complaints today. Continue current plan.", gen());
    expect(m.rules).toEqual([]);
    expect(m.findings[0]).toMatch(/^Length: brief/);
  });

  it("buckets length into note detail levels", () => {
    expect(detailFromWords(60)).toBe("concise");
    expect(detailFromWords(200)).toBe("standard");
    expect(detailFromWords(500)).toBe("detailed");
  });

  it("swaps pronoun style without touching other words", () => {
    expect(pronounText("The patient reports pain. Discussed with the patient.", "Pt")).toBe("Pt reports pain. Discussed with pt.");
    expect(pronounText("Patient agrees. Other patients too.", "client")).toBe("Client agrees. Other clients too.");
  });

  it("asks for names, dates of birth and record numbers to be removed first", () => {
    expect(samplePhiProblem("Mrs. Gonzalez here for f/u")).toMatch(/name/);
    expect(samplePhiProblem("DOB: 03/04/1950")).toMatch(/dates of birth/);
    expect(samplePhiProblem("MRN 12345")).toMatch(/record numbers/);
    expect(samplePhiProblem("Call 312-555-0199")).toMatch(/phone/);
    expect(samplePhiProblem(APSO)).toBeNull();
  });
});

describe("style match on templates with separate assessment and plan", () => {
  it("moves the A/P block up front without burying the other sections", () => {
    const note = { sections: [
      { key: "subjective", title: "Subjective", format: "paragraph" as const, sentences: [{ id: "s1", text: "The patient reports knee pain.", evidence: [], kind: "fact" as const, support: "strong" as const }] },
      { key: "objective", title: "Objective", format: "bullets" as const, sentences: [{ id: "o1", text: "Swelling noted.", evidence: [], kind: "fact" as const, support: "strong" as const }] },
      { key: "assessment", title: "Assessment", format: "bullets" as const, sentences: [{ id: "a1", text: "Knee strain.", evidence: [], kind: "fact" as const, support: "strong" as const }] },
      { key: "plan", title: "Plan", format: "bullets" as const, sentences: [{ id: "p1", text: "Ice and rest.", evidence: [], kind: "fact" as const, support: "strong" as const }] },
    ] };
    const m = matchStyle("A/P:\n- Knee strain, ice.\nS: Pt with knee pain after a fall, better with rest.\nO:\n- Mild swelling", note);
    const styled = applyStyle({ ...note, meta: { engine: "local", templateId: "x", generatedAt: "" } }, asRules(m.rules));
    expect(styled.sections.map((s) => s.key)).toEqual(["assessment", "plan", "subjective", "objective"]);
    expect(styled.sections.find((s) => s.key === "subjective")!.title).toBe("S");
    expect(m.findings[0]).toBe("Section order: A/P, S, O");
  });
});
