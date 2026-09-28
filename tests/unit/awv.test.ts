import { describe, expect, it } from "vitest";
import { awvReview, screeningSchedule } from "@/lib/engine/awv";
import { buildClaim } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { extractFacts } from "@/lib/engine/extract";
import type { Chart, Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

const CHART: Chart = { problems: [{ name: "Essential hypertension", icd10: "I10" }], medications: [], allergies: [], smoking: "former", priorVisits: [{ date: "2025-09-20", summary: "Annual wellness visit (G0438).", plan: [] }], screenings: [{ name: "Colonoscopy", date: "2019-05-01" }, { name: "Mammogram", date: "2025-10-01" }], immunizations: [{ name: "Influenza vaccine", date: "2025-10-15" }, { name: "Shingrix", date: "2021-03-01" }] };

const VISIT = utts([
  ["clinician", "I reviewed the health risk assessment you filled out. Any new diagnoses or surgeries since last year?"],
  ["patient", "No, nothing new."],
  ["clinician", "Your blood pressure is 128 over 76 and your weight is 150 pounds."],
  ["clinician", "Let's do a quick memory check. I'll say three words and ask you to recall them."],
  ["clinician", "Over the past two weeks, have you felt down, depressed, or hopeless? Your PHQ-2 is 0."],
  ["clinician", "Any falls this year, and do you have grab bars in the bathroom?"],
  ["patient", "No falls, and yes, we put grab bars in."],
  ["clinician", "You're due for a colonoscopy this year, and let's keep walking 30 minutes a day."],
  ["clinician", "We spent 20 minutes on advance care planning; your daughter is your health care power of attorney."],
]);

describe("Medicare annual wellness visit", () => {
  it("checks the required elements and finds what is missing", () => {
    const r = awvReview(VISIT, CHART, extractFacts(VISIT));
    expect(r.subsequent).toBe(true);
    expect(r.elements.filter((e) => e.required && !e.done).map((e) => e.key)).toEqual(["providers"]);
    expect(r).toMatchObject({ acpMinutes: 20, depressionScreened: true });
  });

  it("builds a screening schedule from age, sex, and dates on file", () => {
    const s = screeningSchedule(70, "F", CHART, new Date("2026-09-28"));
    const byName = Object.fromEntries(s.map((x) => [x.name, x.status]));
    expect(byName).toMatchObject({ "Colorectal cancer screening": "up to date", "Breast cancer screening (mammogram)": "up to date", "Osteoporosis screening (DEXA)": "due", "Influenza vaccine": "due", "Pneumococcal vaccine": "due", "Shingles vaccine (recombinant)": "up to date", "Tetanus booster (Td or Tdap)": "due" });
    expect(byName["Abdominal aortic aneurysm ultrasound"]).toBeUndefined();
  });

  it("bills G0439 with G0444 and 99497-33 for Medicare, and a preventive code otherwise", () => {
    const facts = extractFacts(VISIT);
    const coding = computeCoding(facts, { patientType: "established", minutes: 45, awv: awvReview(VISIT, CHART, facts) });
    expect(coding.em.code).toBe("G0439");
    const lines = (payer: "Medicare" | "Commercial") => buildClaim(facts, coding, { age: 70, sex: "F", setting: "in-person", patientType: "established", minutes: 45, orders: [], payer, chart: CHART }).lines.map((l) => `${l.cpt}${l.modifiers.length ? `-${l.modifiers.join("-")}` : ""}`);
    expect(lines("Medicare")).toEqual(["G0439", "G0444", "99497-33"]);
    expect(lines("Commercial")).toEqual(["99397", "99497"]);
    const initial = computeCoding(facts, { patientType: "established", minutes: 45, awv: awvReview(VISIT, { ...CHART, priorVisits: [] }, facts) });
    expect(buildClaim(facts, initial, { age: 70, sex: "F", setting: "in-person", patientType: "established", minutes: 45, orders: [], payer: "Medicare" }).lines.map((l) => l.cpt)).toEqual(["G0438", "99497"]);
  });
});
