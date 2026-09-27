import { describe, expect, it } from "vitest";
import { extractFacts, guessSpeaker } from "@/lib/engine/extract";
import { demo } from "./helpers";

describe("extractFacts", () => {
  it("captures chronic follow-up facts with evidence", () => {
    const { facts } = demo("gonzalez");
    expect(facts.problems.map((p) => p.icd10)).toEqual(["E11.65", "I10"]);
    expect(facts.problems.every((p) => p.status === "not at goal")).toBe(true);
    expect(facts.vitals.find((v) => v.name === "BP")?.value).toBe("152/94 mmHg");
    expect(facts.results.find((r) => r.name === "Hemoglobin A1c")?.value).toBe("8.4 %");
    const lis = facts.meds.find((m) => m.name === "lisinopril" && m.action === "increase");
    expect(lis?.dose).toBe("20 mg");
    expect(facts.meds.some((m) => m.name === "metformin" && m.action === "change")).toBe(true);
    expect(facts.meds.some((m) => m.name === "metformin" && m.action === "not_taking")).toBe(true);
    expect(facts.allergies).toEqual([expect.objectContaining({ substance: "sulfa", reaction: "hives" })]);
    expect(facts.nkda).toBeNull();
    expect(facts.followUp?.interval).toBe("3 months");
    for (const s of facts.symptoms) expect(s.evidence.length).toBeGreaterThan(0);
  });

  it("links yes/no answers to the clinician's question", () => {
    const { facts } = demo("gonzalez");
    const negs = facts.symptoms.filter((s) => s.negated).map((s) => s.key);
    expect(negs).toEqual(expect.arrayContaining(["headache", "chest_pain", "dyspnea", "numbness"]));
    expect(facts.symptoms.find((s) => s.key === "diarrhea")?.negated).toBe(false);
    expect(facts.symptoms.find((s) => s.key === "nausea")).toBeUndefined();
  });

  it("builds a rich HPI for an acute complaint", () => {
    const { facts } = demo("shah");
    const back = facts.symptoms.find((s) => s.key === "back_pain")!;
    expect(facts.chiefComplaint?.key).toBe("back_pain");
    expect(back).toMatchObject({ duration: "two weeks", severity: "6/10", quality: "sharp", radiation: "left leg" });
    expect(back.aggravating).toContain("sitting for a long time");
    expect(back.relieving).toEqual(expect.arrayContaining(["walking", "ibuprofen"]));
    expect(facts.symptoms.find((s) => s.key === "bowel_bladder")?.negated).toBe(true);
    expect(facts.problems[0].icd10).toBe("M54.40");
    expect(facts.orders.map((o) => o.name)).toEqual(["Referral to Physical therapy"]);
  });

  it("carries the verb across a list of medications", () => {
    const { facts } = demo("shah");
    const starts = facts.meds.filter((m) => m.action === "start").map((m) => m.name);
    expect(starts).toEqual(["naproxen", "cyclobenzaprine"]);
  });

  it("cancels a medication stopped in the same visit and explains why", () => {
    const { facts } = demo("ramirez");
    expect(facts.meds.find((m) => m.name === "amoxicillin" && m.action === "start")?.cancelled).toBe(true);
    const plan = facts.problems[0].plan.map((p) => p.text);
    expect(plan.some((t) => /amoxicillin avoided/i.test(t))).toBe(true);
    expect(plan.some((t) => /^Start azithromycin/.test(t))).toBe(true);
    expect(facts.problems[0].icd10).toBe("H66.91");
  });

  it("prefers the diagnosis tied to the chief complaint", () => {
    const { facts } = demo("kim");
    expect(facts.problems.map((p) => p.key)).toEqual(["gad", "insomnia"]);
    expect(facts.symptoms.find((s) => s.key === "si")?.negated).toBe(true);
  });

  it("does not treat clinician warnings as reported symptoms", () => {
    const { facts } = demo("shah");
    expect(facts.symptoms.find((s) => s.key === "numbness")?.negated).toBe(true);
  });

  it("ignores redacted utterances", () => {
    const facts = extractFacts([
      { id: "a", seq: 0, speaker: "patient", text: "I've had chest pain for two days.", tStart: 0, tEnd: 1, redacted: true },
      { id: "b", seq: 1, speaker: "patient", text: "My knee hurts.", tStart: 1, tEnd: 2 },
    ]);
    expect(facts.symptoms.map((s) => s.key)).toEqual(["knee_pain"]);
  });

  it("guesses speakers from cues", () => {
    expect(guessSpeaker("Let me take a listen to your lungs.", null)).toBe("clinician");
    expect(guessSpeaker("I've been feeling dizzy all week.", "clinician")).toBe("patient");
    expect(guessSpeaker("How long has this been going on?", "patient")).toBe("clinician");
  });
});

describe("symptom phrasing", () => {
  it("recognizes body-part-first complaints", () => {
    const facts = extractFacts([
      { id: "a", seq: 0, speaker: "patient", text: "My throat has been sore for three days and it hurts to swallow.", tStart: 0, tEnd: 3 },
      { id: "b", seq: 1, speaker: "patient", text: "My lower back has been hurting since Monday.", tStart: 3, tEnd: 6 },
    ]);
    expect(facts.symptoms.map((s) => s.key)).toEqual(["sore_throat", "back_pain"]);
    expect(facts.symptoms[0].duration).toBe("three days");
  });
});
