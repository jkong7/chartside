import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/engine/extract";
import { gdmtFor, gdmtPlan } from "@/lib/engine/gdmt";
import type { Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));
const base = { potassium: 4.4, egfr: 55, sbp: 118, hr: 72, weightKg: 80, angioedema: false };

describe("HFrEF guideline-directed therapy", () => {
  it("only applies with a reduced ejection fraction", () => {
    expect(gdmtPlan({ ...base, ef: 55, meds: [] })).toBeNull();
    expect(gdmtPlan({ ...base, ef: null, meds: [] })).toBeNull();
  });

  it("grades each pillar against target doses and flags metoprolol tartrate", () => {
    const p = gdmtPlan({ ...base, ef: 30, meds: [{ name: "lisinopril", dose: "20 mg", frequency: "daily" }, { name: "metoprolol tartrate", dose: "25 mg", frequency: "twice daily" }, { name: "spironolactone", dose: "25 mg", frequency: "daily" }] })!;
    expect(p.map((x) => [x.key, x.status])).toEqual([["raas", "below_target"], ["bb", "not_evidence_based"], ["mra", "at_target"], ["sglt2", "missing"]]);
    expect(p[0].note).toContain("36 hours");
  });

  it("holds therapies when potassium, kidney function, blood pressure, or heart rate don't allow them", () => {
    const p = gdmtPlan({ ...base, ef: 25, potassium: 5.3, egfr: 18, sbp: 92, hr: 54, meds: [] })!;
    expect(p.map((x) => x.status)).toEqual(["held", "held", "held", "held"]);
    expect(p[2].note).toContain("potassium 5.3, eGFR 18");
  });

  it("reads LVEF and today's med changes from the visit", () => {
    const u = utts([
      ["clinician", "Your echo shows an ejection fraction of 30 to 35 percent."],
      ["clinician", "Your blood pressure is 124 over 76 and heart rate 68, potassium 4.2."],
      ["clinician", "Let's start dapagliflozin 10 milligrams daily and increase carvedilol to 25 milligrams twice daily."],
    ]);
    const g = gdmtFor(u, extractFacts(u), { problems: [], allergies: [], medications: [{ name: "sacubitril-valsartan", dose: "49/51 mg", frequency: "twice daily" }, { name: "carvedilol", dose: "12.5 mg", frequency: "twice daily" }], egfr: 62 });
    expect(g.ef).toEqual({ ef: 33, evidence: ["u0"] });
    expect(g.pillars!.map((x) => [x.key, x.status])).toEqual([["raas", "below_target"], ["bb", "at_target"], ["mra", "missing"], ["sglt2", "at_target"]]);
  });
});
