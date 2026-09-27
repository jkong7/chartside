import { describe, expect, it } from "vitest";
import { computeCoding } from "@/lib/engine/coding";
import { computeCoverage } from "@/lib/engine/coverage";
import { stageOrders } from "@/lib/engine/orders";
import { buildPatientSummary } from "@/lib/engine/summary";
import { demo } from "./helpers";

describe("coding", () => {
  it("levels MDM from two of three elements", () => {
    const { facts, patient } = demo("gonzalez");
    const c = computeCoding(facts, { patientType: "established", minutes: 18, chart: patient.chart });
    expect(c.em.code).toBe("99214");
    expect(c.em.problems.level).toBe("moderate");
    expect(c.em.risk.reasons[0]).toMatch(/Prescription drug management/);
    expect(c.hcc[0].code).toBe("HCC 38");
    expect(c.cdi.some((x) => /BMI 31.6/.test(x.message))).toBe(true);
  });

  it("codes a self-limited viral illness as low complexity", () => {
    const { facts } = demo("carter");
    const c = computeCoding(facts, { patientType: "established", minutes: 12 });
    expect(c.em.code).toBe("99213");
    expect(c.diagnoses[0].code).toBe("J06.9");
  });

  it("uses new-patient codes", () => {
    const { facts } = demo("kim");
    expect(computeCoding(facts, { patientType: "new", minutes: 20 }).em.code).toBe("99204");
  });

  it("asks for laterality when the code is unspecified", () => {
    const { facts } = demo("shah");
    expect(computeCoding(facts, { patientType: "established", minutes: 15 }).cdi[0].message).toMatch(/laterality/);
  });
});

describe("orders", () => {
  it("blocks an allergy conflict and flags pediatric dosing", () => {
    const { facts, patient } = demo("ramirez");
    const orders = stageOrders(facts, { chart: patient.chart, ageYears: 6 });
    const amox = orders.find((o) => o.name === "Start amoxicillin")!;
    expect(amox.status).toBe("rejected");
    expect(amox.alerts.some((a) => a.level === "block")).toBe(true);
    expect(orders.find((o) => o.name === "Start azithromycin")?.alerts[0].message).toMatch(/weight-based/);
  });

  it("notes recently resulted labs", () => {
    const { facts, patient } = demo("gonzalez");
    const a1c = stageOrders(facts, { chart: patient.chart, now: new Date("2026-09-27") }).find((o) => o.name === "Hemoglobin A1c")!;
    expect(a1c.alerts[0].message).toMatch(/17 days ago/);
    expect(a1c.detail).toContain("in 3 months");
  });
});

describe("coverage", () => {
  it("tracks HPI elements and red flags for the chief complaint", () => {
    const { facts } = demo("shah");
    const cov = computeCoverage(facts);
    const byKey = Object.fromEntries(cov.items.map((i) => [i.key, i.met]));
    expect(byKey.hpi_onset).toBe(true);
    expect(byKey.hpi_severity).toBe(true);
    expect(byKey.rf_bowel_bladder).toBe(true);
    expect(byKey.followup).toBe(true);
    expect(cov.score).toBeGreaterThan(60);
  });

  it("requires a suicide screen for mood complaints", () => {
    const { facts } = demo("kim");
    expect(computeCoverage(facts).items.find((i) => i.key === "rf_si")?.met).toBe(true);
  });
});

describe("patient summary", () => {
  it("writes plain-language English at a low reading level", () => {
    const { facts, patient } = demo("gonzalez");
    const s = buildPatientSummary(facts, patient, "en");
    expect(s.greeting).toContain("Maria");
    expect(s.sections.find((x) => x.title === "Your medicines")?.items).toContain("Increase lisinopril to 20 mg once a day.");
    expect(s.readingGrade).toBeLessThan(9);
  });

  it("writes Spanish summaries", () => {
    const { facts, patient } = demo("ramirez");
    const s = buildPatientSummary(facts, patient, "es");
    expect(s.sections[0].title).toBe("De qué hablamos");
    expect(s.sections.find((x) => x.title === "Su próxima visita")?.items[0]).toBe("Por favor regrese en 2 semanas.");
  });
});
