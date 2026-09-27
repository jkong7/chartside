import { describe, expect, it } from "vitest";
import { buildClaim, to837, validateClaim } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { stageOrders } from "@/lib/engine/orders";
import { buildPriorAuths } from "@/lib/engine/priorauth";
import { ageFrom } from "@/lib/engine/text";
import type { StagedOrder } from "@/lib/types";
import { demo } from "./helpers";

function setup(key: string, opts: { accept?: boolean; setting?: "in-person" | "telehealth" } = {}) {
  const { d, facts, patient } = demo(key);
  const age = ageFrom(d.dob, new Date("2026-09-27"));
  const patientType = d.visit.type === "new" ? ("new" as const) : ("established" as const);
  const coding = computeCoding(facts, { patientType, minutes: 14, chart: d.chart, pediatric: age < 18 });
  const orders: StagedOrder[] = stageOrders(facts, { chart: d.chart, ageYears: age, now: new Date("2026-09-27") }).map((o, i) => ({ ...o, id: `o${i}`, status: opts.accept === false ? o.status : o.status === "rejected" ? "rejected" : "accepted" }));
  const ctx = { age, sex: d.sex, setting: opts.setting ?? ("in-person" as const), patientType, chart: d.chart, minutes: 14, orders, at: new Date("2026-09-27"), final: true };
  return { d, facts, patient, coding, orders, ctx, claim: buildClaim(facts, coding, ctx) };
}

describe("claim builder", () => {
  it("bills a Medicare chronic-care visit with vaccine, Medicare admin code G0009, modifier 25, and G2211", () => {
    const { claim } = setup("morales");
    expect(claim.payer).toBe("Medicare");
    expect(claim.dx.map((x) => x.code)).toEqual(["J44.9", "Z23"]);
    const byCpt = Object.fromEntries(claim.lines.map((l) => [l.cpt, l]));
    expect(byCpt["99214"].modifiers).toEqual(["25"]);
    expect(byCpt["99214"].pointers).toEqual(["A"]);
    expect(byCpt["90677"].pointers).toEqual(["B"]);
    expect(byCpt.G0009.pointers).toEqual(["B"]);
    expect(byCpt["90471"]).toBeUndefined();
    expect(byCpt.G2211).toBeTruthy();
    expect(claim.edits.filter((e) => e.severity !== "info")).toEqual([]);
    expect(claim.totals.charges).toBe(436);
  });

  it("offers G2211 as a payer-dependent opportunity for commercial patients and never bills send-out labs", () => {
    const { claim } = setup("gonzalez");
    expect(claim.payer).toBe("Commercial");
    expect(claim.lines.map((l) => l.cpt)).toEqual(["99214"]);
    expect(claim.opportunities.find((o) => o.category === "addon")?.line?.cpt).toBe("G2211");
  });

  it("bills point-of-care strep with QW and links it to the right diagnosis", () => {
    const { facts, coding, ctx } = setup("carter");
    const strepOrder: StagedOrder = { id: "s1", kind: "lab", name: "Rapid strep antigen", detail: "today · CPT 87880", status: "accepted", evidence: [], alerts: [], problem: coding.diagnoses[0].label };
    const claim = buildClaim(facts, coding, { ...ctx, orders: [strepOrder] });
    const strep = claim.lines.find((l) => l.cpt === "87880")!;
    expect(strep.modifiers).toEqual(["QW"]);
    expect(claim.edits.some((e) => e.rule === "medical-necessity")).toBe(false);
  });

  it("only bills accepted orders at signing and reports what was excluded", () => {
    const { facts, coding, ctx } = setup("morales");
    const claim = buildClaim(facts, coding, { ...ctx, orders: ctx.orders.map((o) => (o.kind === "vaccine" ? { ...o, status: "staged" as const } : o)) });
    expect(claim.lines.some((l) => l.cpt === "90677")).toBe(false);
    expect(claim.lines.find((l) => l.cpt === "99214")!.modifiers).toEqual([]);
    expect(claim.edits.find((e) => e.rule === "excluded-orders")?.message).toContain("Pneumococcal vaccine (not accepted)");
  });

  it("adds telehealth modifier and place of service", () => {
    const { claim } = setup("carter", { setting: "telehealth" });
    expect(claim.placeOfService).toBe("10");
    expect(claim.lines[0].modifiers).toContain("95");
  });
});

describe("claim edits", () => {
  it("catches missing modifier 25, unsupported E/M level, medical necessity, and bad pointers", () => {
    const { claim, facts, coding, ctx } = setup("morales");
    const broken = {
      ...claim,
      lines: [
        { ...claim.lines.find((l) => l.cpt === "99214")!, cpt: "99215", modifiers: [] },
        ...claim.lines.filter((l) => l.cpt !== "99214"),
        { id: "x1", cpt: "83036", description: "A1c", modifiers: [], pointers: ["A"], units: 1, charge: 13, source: "lab" as const, rationale: "", evidence: [] },
        { id: "x2", cpt: "93000", description: "ECG", modifiers: [], pointers: ["F"], units: 1, charge: 17, source: "procedure" as const, rationale: "", evidence: [] },
      ],
    };
    const rules = validateClaim(broken, facts, coding, ctx).edits.map((e) => e.rule);
    expect(rules).toEqual(expect.arrayContaining(["modifier-25", "em-level", "medical-necessity", "dx-pointer"]));
  });

  it("flags new-patient codes for patients seen within three years and sex-specific codes", () => {
    const { claim, facts, coding, ctx } = setup("gonzalez");
    const edited = { ...claim, lines: [{ ...claim.lines[0], cpt: "99204" }, { id: "p", cpt: "84153", description: "PSA", modifiers: [], pointers: ["A"], units: 1, charge: 25, source: "lab" as const, rationale: "", evidence: [] }] };
    const rules = validateClaim(edited, facts, coding, ctx).edits.map((e) => e.rule);
    expect(rules).toEqual(expect.arrayContaining(["new-patient", "sex-edit"]));
  });

  it("warns on unspecified laterality and finds mood-screening revenue", () => {
    expect(setup("shah").claim.edits.some((e) => e.rule === "laterality")).toBe(true);
    expect(setup("kim").claim.opportunities.some((o) => o.category === "screening")).toBe(true);
  });

  it("renders an 837P with claim, diagnosis, and service line segments", () => {
    const { claim } = setup("morales");
    const edi = to837(claim, { claimId: "CS123", patient: { name: "Ana Morales", dob: "1954-10-12", sex: "F", mrn: "100603" }, provider: { name: "Dr. Avery Chen", npi: "1234567893" }, date: "2026-09-27" });
    expect(edi).toContain("CLM*CS123*436.00");
    expect(edi).toContain("HI*ABK:J449*ABF:Z23~");
    expect(edi).toContain("SV1*HC:99214:25*132.00*UN*1***1~");
    expect(edi).toMatch(/^ISA\*/);
    expect(edi.trim().endsWith("IEA*1*000000001~")).toBe(true);
  });
});

describe("prior authorization", () => {
  it("builds an SGLT2 packet with every step-therapy criterion documented", () => {
    const { facts, coding, orders, d } = setup("gonzalez");
    const [pa] = buildPriorAuths(facts, coding, orders, { chart: d.chart, patientName: d.name, dob: d.dob, clinician: "Dr. Avery Chen", date: "September 27, 2026" });
    expect(pa.service).toBe("Empagliflozin");
    expect(pa.status).toBe("likely_approved");
    expect(pa.criteria.map((c) => c.met)).toEqual([true, true, true]);
    expect(pa.criteria[1].detail).toContain("8.4");
    expect(pa.criteria[2].detail).toContain("intolerance");
    expect(pa.letter).toContain("Re: Prior authorization request for Empagliflozin");
  });

  it("marks lumbar MRI as missing criteria before six weeks of conservative care", () => {
    const { facts, coding, d } = setup("shah");
    const mri: StagedOrder = { id: "m", kind: "imaging", name: "MRI, lumbar spine", detail: "CPT 72148", status: "accepted", evidence: [], alerts: [], problem: "" };
    const [pa] = buildPriorAuths(facts, coding, [mri], { chart: d.chart, patientName: d.name, dob: d.dob, clinician: "Dr. X", date: "today" });
    expect(pa.status).toBe("missing_criteria");
    expect(pa.criteria[0]).toMatchObject({ label: "Symptoms for at least 6 weeks", met: false });
    expect(pa.criteria[1].met).toBe(true);
  });

  it("requires no packet for routine generics", () => {
    const { facts, coding, orders, d } = setup("carter");
    expect(buildPriorAuths(facts, coding, orders, { chart: d.chart, patientName: d.name, dob: d.dob, clinician: "Dr. X", date: "today" })).toEqual([]);
  });
});
