import { describe, expect, it } from "vitest";
import { buildNote, noteToText } from "@/lib/engine/note";
import { systemTemplate, SYSTEM_TEMPLATES } from "@/lib/engine/templates";
import { detectOmissions, scoreSupport, supportStats } from "@/lib/engine/verify";
import { demo, SCHEDULED } from "./helpers";

function note(key: string, tpl?: string) {
  const { d, facts, patient, utterances } = demo(key);
  const template = systemTemplate(tpl ?? d.visit.template)!;
  const n = buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: SCHEDULED }, template });
  return { n: scoreSupport(n, utterances, patient.chart), facts, template, utterances };
}

describe("buildNote", () => {
  it("writes a problem-oriented SOAP note", () => {
    const { n } = note("gonzalez");
    const text = noteToText(n);
    expect(text).toContain("SUBJECTIVE");
    expect(text).toContain("1. Type 2 diabetes mellitus with hyperglycemia (E11.65) — not at goal.");
    expect(text).toContain("Increase lisinopril to 20 mg daily.");
    expect(text).toMatch(/she skips the evening dose/);
    expect(text).toContain("Follow up in 3 months.");
  });

  it("keeps templated normal exam findings pending until accepted", () => {
    const { n } = note("carter");
    const pending = n.sections.flatMap((s) => s.sentences).filter((s) => s.pending);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((s) => s.kind === "default" && s.support === "none")).toBe(true);
    expect(noteToText(n)).not.toContain("rubs, or gallops");
  });

  it("links every non-heading sentence to evidence", () => {
    for (const key of ["gonzalez", "carter", "shah", "kim", "ramirez"]) {
      const { n } = note(key);
      const stats = supportStats(n);
      expect(stats.none).toBe(0);
      expect(stats.pct).toBeGreaterThanOrEqual(85);
    }
  });

  it("renders every system template", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const { n } = note("gonzalez", t.id);
      expect(n.sections.length).toBe(t.sections.length);
      expect(noteToText(n).length).toBeGreaterThan(100);
    }
  });

  it("writes caregiver-voiced HPI for children", () => {
    const text = noteToText(note("ramirez").n);
    expect(text).toContain("History provided by parent.");
    expect(text).toContain("Parent also reports fever");
  });
});

describe("omission detector", () => {
  it("flags facts that are missing from an edited note", () => {
    const { n, facts, template } = note("gonzalez", "hp");
    expect(detectOmissions(n, facts, template)).toEqual([]);
    const stripped = { ...n, sections: n.sections.map((s) => (s.key === "ap" ? { ...s, sentences: s.sentences.filter((x) => !/lisinopril|metabolic/i.test(x.text)) } : s.key === "meds" ? { ...s, sentences: [] } : s)) };
    const flags = detectOmissions(stripped, facts, template);
    expect(flags.map((f) => f.category)).toEqual(expect.arrayContaining(["medication", "order"]));
    expect(flags.find((f) => f.category === "medication")?.suggestion).toMatch(/Increase lisinopril 20 mg/);
  });

  it("marks sentences that cite nothing as unsupported", () => {
    const { n, utterances } = note("carter");
    const tampered = { ...n, meta: { ...n.meta, engine: "claude" as const }, sections: n.sections.map((s, i) => (i === 0 ? { ...s, sentences: [...s.sentences, { id: "x", text: "Patient reports a fever of 104.", evidence: ["u5"], kind: "fact" as const, support: "strong" as const }] } : s)) };
    const scored = scoreSupport(tampered, utterances);
    expect(scored.sections[0].sentences.find((s) => s.id === "x")?.support).toBe("none");
  });
});
