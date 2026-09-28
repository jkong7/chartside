import { describe, expect, it } from "vitest";
import { evaluateQuality } from "@/lib/engine/quality";
import type { Chart, StagedOrder, Utterance } from "@/lib/types";
import { demo } from "./helpers";

const at = new Date("2026-10-06T15:00:00");
const u = (id: string, speaker: Utterance["speaker"], text: string): Utterance => ({ id, seq: Number(id.slice(1)), speaker, text, tStart: 0, tEnd: 1 });
const byId = (r: ReturnType<typeof evaluateQuality>) => Object.fromEntries(r.map((x) => [x.id, x]));

describe("quality measures", () => {
  it("scores a diabetic, hypertensive woman from the chart and the visit", () => {
    const { facts, utterances, patient } = demo("gonzalez");
    const r = byId(evaluateQuality({ patient, facts, utterances, orders: [], at }));
    expect(Object.keys(r).sort()).toEqual(["bmi", "breast", "colorectal", "depression", "dm_a1c", "flu", "htn_bp", "kidney", "statin", "tobacco"]);
    expect(r.dm_a1c).toMatchObject({ status: "met", ecqm: "CMS122" });
    expect(r.htn_bp.status).toBe("addressed");
    expect(r.htn_bp.reason).toContain("152/94");
    expect(r.breast.status).toBe("met");
    expect(r.colorectal.status).toBe("met");
    expect(r.statin.status).toBe("met");
    expect(r.kidney.status).toBe("gap");
    expect(r.flu).toMatchObject({ status: "gap" });
    expect(r.flu.actions[0].order?.name).toMatch(/Influenza vaccine/);
  });

  it("closes gaps with orders placed today and conversation evidence", () => {
    const { facts, patient } = demo("gonzalez");
    const orders: StagedOrder[] = [
      { id: "o1", kind: "vaccine", name: "Influenza vaccine, trivalent (IIV3), preservative-free", detail: "", status: "accepted", evidence: [], alerts: [], problem: "" },
      { id: "o2", kind: "lab", name: "Urine microalbumin/creatinine ratio", detail: "", status: "accepted", evidence: [], alerts: [], problem: "" },
      { id: "o3", kind: "lab", name: "Basic metabolic panel", detail: "", status: "staged", evidence: [], alerts: [], problem: "" },
    ];
    const r = byId(evaluateQuality({ patient, facts, utterances: [u("u1", "clinician", "Over the past two weeks have you had little interest or pleasure in doing things?")], orders, at }));
    expect(r.flu.status).toBe("addressed");
    expect(r.kidney.status).toBe("met");
    expect(r.depression).toMatchObject({ status: "met", evidence: ["u1"] });
  });

  it("applies age, sex, season, and exclusion rules", () => {
    const chart: Chart = { problems: [{ name: "Major depressive disorder", icd10: "F33.1" }], medications: [], allergies: [], vitals: { BMI: "31" } };
    const young = { dob: "2000-01-01", sex: "M" as const, chart };
    const r = byId(evaluateQuality({ patient: young, facts: null, utterances: [u("u0", "clinician", "Do you smoke? Any vaping?"), u("u1", "patient", "I smoke half a pack a day.")], orders: [], at: new Date("2026-06-01T12:00:00") }));
    expect(r.depression.status).toBe("excluded");
    expect(r.flu).toBeUndefined();
    expect(r.breast).toBeUndefined();
    expect(r.colorectal).toBeUndefined();
    expect(r.bmi.status).toBe("gap");
    const smoker = byId(evaluateQuality({ patient: { ...young, chart: { ...chart, smoking: "current" } }, facts: null, utterances: [u("u0", "clinician", "Do you smoke?")], orders: [], at }));
    expect(smoker.tobacco.status).toBe("gap");
    expect(smoker.tobacco.reason).toContain("cessation");
    const declined = byId(evaluateQuality({ patient: young, facts: null, utterances: [u("u0", "patient", "I don't want the flu shot this year.")], orders: [], at }));
    expect(declined.flu.status).toBe("excluded");
    const older = byId(evaluateQuality({ patient: { dob: "1955-01-01", sex: "F", chart: { problems: [], medications: [], allergies: [] } }, facts: null, utterances: [u("u0", "clinician", "Have you had any falls this year?")], orders: [], at }));
    expect(older.falls.status).toBe("met");
    expect(older.breast.status).toBe("gap");
    const noted = byId(evaluateQuality({ patient: { ...young, chart: { ...chart, problems: [] } }, facts: null, utterances: [], orders: [], at, noteLines: ["PHQ-2 depression screening completed; score ***/6.", "Tobacco use screened: never smoker."] }));
    expect(noted.depression.status).toBe("gap");
    expect(noted.tobacco.status).toBe("met");
    const filled = byId(evaluateQuality({ patient: { ...young, chart: { ...chart, problems: [] } }, facts: null, utterances: [], orders: [], at, noteLines: ["PHQ-2 depression screening completed; score 0/6."] }));
    expect(filled.depression.status).toBe("met");
  });
});
