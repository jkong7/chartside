import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clfs, hcc, hcpcs, icdRelease, icdReleaseFor, manifest, partB, pfs, pos } from "@/lib/codesets";
import { buildClaim, type ClaimLine } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { CONDITIONS } from "@/lib/engine/lexicon";
import { reviewDiagnoses } from "@/lib/rcm/dx";
import { makeClaimReference } from "@/lib/rcm/reference";
import { riskSummary } from "@/lib/rcm/risk";
import type { StagedOrder } from "@/lib/types";
import { demo } from "./helpers";

const FY26 = "2026-09-27";

describe("official code-set artifacts", () => {
  it("match the SHA-256 recorded in the manifest and come only from CMS or CDC", () => {
    const m = manifest();
    const ids = Object.keys(m.sources);
    expect(ids).toEqual(expect.arrayContaining(["icd10cm-2026-apr", "icd10cm-2027", "hcpcs-2026-oct", "pfs-2026-d", "hcc-v28-2026", "asp-2026-oct", "clfs-2026-q4"]));
    for (const id of ids) {
      const s = m.sources[id];
      expect(createHash("sha256").update(readFileSync(s.artifact.file)).digest("hex")).toBe(s.artifact.sha256);
      for (const f of Object.values(s.files)) {
        expect(new URL(f.url).hostname).toMatch(/(^|\.)(cms\.gov|cdc\.gov)$/);
        expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
    expect(m.sources["icd10cm-2027"].stats).toMatchObject({ billable: 74879, headers: 23524 });
    expect(m.sources["icd10cm-2026-apr"].stats).toMatchObject({ billable: 74719 });
  });

  it("selects the ICD-10-CM release in effect on the date of service", () => {
    expect(icdReleaseFor("2026-09-30")?.meta.version).toBe("FY2026-April");
    expect(icdReleaseFor("2026-10-01")?.meta.version).toBe("FY2027");
    expect(icdReleaseFor("2025-06-01")).toBeNull();
  });

  it("every diagnosis code Chartside can emit is billable in both releases", () => {
    const codes = CONDITIONS.flatMap((c) => [c.icd10, ...(c.specific ?? []).map((s) => s.icd10)]);
    for (const id of ["icd10cm-2026-apr", "icd10cm-2027"]) {
      const r = icdRelease(id);
      for (const c of codes) expect(r.lookup(c)?.billable, `${c} in ${id}`).toBe(true);
    }
  });

  it("walks the tabular hierarchy for headers, 7th characters, and inherited notes", () => {
    const r = icdRelease("icd10cm-2027");
    expect(r.lookup("E11")).toMatchObject({ billable: false, long: "Type 2 diabetes mellitus" });
    expect(r.lookup("E11.65")).toMatchObject({ billable: true, long: "Type 2 diabetes mellitus with hyperglycemia" });
    expect(r.descendants("S93.409").map((c) => c.dotted)).toEqual(["S93.409A", "S93.409D", "S93.409S"]);
    const notes = r.notes("E11.65");
    expect(notes.excludes1.some((n) => n.at === "E11" && /E09/.test(n.text))).toBe(true);
    expect(notes.chapter).toMatch(/^Endocrine/);
    expect(notes.section).toBe("Diabetes mellitus (E08-E13)");
    expect(r.notes("S93.409A").sevenChar?.defs.A).toBe("initial encounter");
    expect(r.search("streptococcal pharyngitis", 3)[0].dotted).toBe("J02.0");
  });

  it("maps V28 HCCs with CMS age conditions, hierarchies, and interactions", () => {
    expect(hcc.forCode("E11.65")).toEqual(["HCC38"]);
    expect(hcc.forCode("I50.22")).toEqual(["HCC226"]);
    expect(hcc.forCode("F32.9")).toEqual([]);
    expect(hcc.forCode("N18.9")).toEqual([]);
    expect(hcc.forCode("N18.4")).toEqual(["HCC327"]);
    expect(hcc.forCode("C50.011", { age: 45, sex: "F" })).toEqual(["HCC22"]);
    expect(hcc.forCode("C50.011", { age: 55, sex: "F" })).toEqual(["HCC23"]);
    const s = hcc.score(["E11.9", "I50.22"], { age: 72, sex: "F" });
    expect(s.demographic).toMatchObject({ variable: "F70_74", factor: 0.395 });
    expect(s.interactions.map((i) => i.variable)).toEqual(["DIABETES_HF_V28"]);
    expect(s.total).toBe(1.033);
    const h = hcc.score(["E11.22", "E11.9"], { age: 72, sex: "F" });
    expect(h.hccs.find((x) => x.hcc === "HCC38")).toMatchObject({ droppedBy: "HCC37", factor: 0 });
  });

  it("prices services from the fee schedule, lab schedule, and Part B limits", () => {
    const office = pfs.price("99214", { pos: "11", locality: "06102:16" })!;
    expect(office).toMatchObject({ allowed: 142.45, facility: false, conversionFactor: 33.4009, rvu: { work: 1.92, pe: 2, mp: 0.14 } });
    expect(pfs.price("99214", { pos: "22", locality: "06102:16" })!.allowed).toBe(91.09);
    expect(pfs.price("99214", { pos: "11", locality: "06102:16", qualifyingApm: true })!.conversionFactor).toBe(33.5675);
    expect(pfs.row("99417")?.s).toBe("I");
    expect(pfs.row("G2212")?.s).toBe("A");
    expect(pfs.row("99397")?.s).toBe("N");
    expect(clfs.rate("87880", "QW")?.rate).toBe(16.53);
    expect(partB.limit("90677")).toMatchObject({ limit: 361.418, coinsurance: 0, vaccine: true });
    expect(partB.limit("90686")).toBeUndefined();
    expect(hcpcs.lookup("G2211")?.short).toBe("Complex e/m visit add on");
    expect(hcpcs.activeOn("G2211", FY26)).toBe(true);
    expect(pos.isFacility("22")).toBe(true);
    expect(pos.isFacility("10")).toBe(false);
  });
});

describe("diagnosis review", () => {
  it("rejects headers and missing 7th characters with the official options", () => {
    const { details } = reviewDiagnoses([{ code: "E11", label: "diabetes" }, { code: "S93.409", label: "ankle sprain" }, { code: "E11.99", label: "made up" }], { dos: FY26, age: 60, sex: "F", meds: [] });
    expect(details[0].issues[0]).toMatchObject({ rule: "ICD.NOT_BILLABLE", severity: "error" });
    expect(details[1].issues[0]).toMatchObject({ rule: "ICD.SEVENTH_CHARACTER", codes: ["S93.409A", "S93.409D", "S93.409S"] });
    expect(details[1].issues[0].message).toContain("A = initial encounter");
    expect(details[2].issues[0].rule).toBe("ICD.INVALID");
  });

  it("flags Excludes1 conflicts, use-additional codes from the med list, and sex conflicts", () => {
    const { details, issues } = reviewDiagnoses([{ code: "E11.9", label: "t2" }, { code: "E10.9", label: "t1" }, { code: "N80.00", label: "endometriosis" }], { dos: FY26, age: 60, sex: "M", meds: ["metformin 1000 mg", "insulin glargine"] });
    expect(issues.find((i) => i.rule === "ICD.EXCLUDES1")).toMatchObject({ codes: ["E11.9", "E10.9"], source: { set: "ICD-10-CM Tabular List" } });
    expect(details[0].issues.filter((i) => i.rule === "ICD.USE_ADDITIONAL").flatMap((i) => i.codes)).toEqual(["Z79.4", "Z79.84"]);
    expect(details[2].issues.some((i) => i.rule === "ICD.SEX_CONFLICT")).toBe(true);
  });

  it("builds a non-leading specificity query from the official sibling codes", () => {
    const { details } = reviewDiagnoses([{ code: "F32.9", label: "depression" }], { dos: FY26, age: 50, sex: "F", meds: [] });
    const q = details[0].query!;
    expect(q.options.map((o) => o.code)).toEqual(["F32.0", "F32.1", "F32.2", "F32.3", "F32.4", "F32.5"]);
    expect(q.question).toMatch(/^The documentation supports "Major depressive disorder, single episode, unspecified"\. Based on your clinical judgment/);
    expect(q.source.set).toMatch(/Compliant Query Practice/);
  });
});

describe("Medicare claim rules with provenance", () => {
  const ref = makeClaimReference({ dos: FY26 });
  const line = (cpt: string, extra: Partial<ClaimLine> = {}): ClaimLine => ({ id: `l_${cpt}`, cpt, description: cpt, modifiers: [], pointers: ["A"], units: 1, charge: 0, source: "procedure", rationale: "", evidence: [], ...extra });
  const review = (lines: ClaimLine[], dx = [{ pointer: "A", code: "J44.9", label: "COPD" }], minutes = 20) => ref.review({ placeOfService: "11", payer: "Medicare", dx, lines, edits: [], opportunities: [], totals: { charges: 0, lines: lines.length }, excludedOrders: [], dos: FY26 }, { age: 72, sex: "F", minutes, facts: null });

  it("uses Medicare status indicators to catch non-covered and invalid codes", () => {
    const e = review([line("99397", { source: "em" }), line("99417", { source: "addon" })]);
    expect(e.find((x) => x.rule === "MPFS.STATUS" && x.lineId === "l_99397")?.message).toContain("G0438/G0439");
    expect(e.find((x) => x.rule === "PROLONGED.MEDICARE")?.source).toMatchObject({ set: "MPFS", ref: "99417 status I; G2212 status A" });
  });

  it("enforces G2211 modifier 25 rules and vaccine administration and Part D rules", () => {
    const withProc = review([line("99214", { source: "em", modifiers: ["25"] }), line("93000"), line("G2211", { source: "addon" })]);
    expect(withProc.some((x) => x.rule === "G2211.MODIFIER_25")).toBe(true);
    const withAdmin = review([line("99214", { source: "em", modifiers: ["25"] }), line("90677", { source: "vaccine" }), line("G0009", { source: "vaccine_admin" }), line("G2211", { source: "addon" })]);
    expect(withAdmin.some((x) => x.rule.startsWith("G2211"))).toBe(false);
    const wrongAdmin = review([line("90677", { source: "vaccine" }), line("90471", { source: "vaccine_admin" })]);
    expect(wrongAdmin.some((x) => x.rule === "MEDICARE.VACCINE_ADMIN")).toBe(true);
    const partD = review([line("90750", { source: "vaccine" })], [{ pointer: "A", code: "Z23", label: "imm" }]);
    expect(partD.some((x) => x.rule === "MEDICARE.PART_D_VACCINE")).toBe(true);
    const quad = review([line("90686", { source: "vaccine" })], [{ pointer: "A", code: "Z23", label: "imm" }]);
    expect(quad.some((x) => x.rule === "ASP.NO_LIMIT")).toBe(true);
  });

  it("checks prolonged-service time thresholds", () => {
    const short = review([line("99215", { source: "em" }), line("G2212", { source: "addon" })], undefined, 60);
    expect(short.find((x) => x.rule === "PROLONGED.TIME")?.message).toContain("at least 69 minutes");
    expect(review([line("99215", { source: "em" }), line("G2212", { source: "addon" })], undefined, 70).some((x) => x.rule === "PROLONGED.TIME")).toBe(false);
  });

  it("prices a real Medicare claim from official sources and emits Medicare-correct lines", () => {
    const { facts, patient, d } = demo("morales");
    const coding = computeCoding(facts, { patientType: "established", minutes: 18, chart: patient.chart });
    const vaccine: StagedOrder = { id: "v1", kind: "vaccine", name: "Pneumococcal vaccine", detail: "today · CPT 90677", status: "accepted", evidence: [], alerts: [], problem: "" };
    const claim = buildClaim(facts, coding, { age: 72, sex: d.sex, setting: "in-person", patientType: "established", chart: patient.chart, minutes: 18, orders: [vaccine], final: true, at: new Date(`${FY26}T15:00:00Z`), ref });
    const by = Object.fromEntries(claim.lines.map((l) => [l.cpt, l]));
    expect(by["90677"].pricing).toMatchObject({ basis: "ASP", allowed: 361.42, coinsurance: 0 });
    expect(by.G0009).toBeTruthy();
    expect(by["99214"].pricing).toMatchObject({ basis: "MPFS", allowed: 142.45 });
    expect(by["99214"].charge).toBe(Math.ceil(pfs.price("99214", { pos: "11", locality: "00000:00" })!.allowed * 2));
    expect(claim.totals.allowed).toBeGreaterThan(500);
    expect(claim.reference?.map((r) => r.label)).toEqual(expect.arrayContaining(["ICD-10-CM", "Physician fee schedule", "CMS-HCC"]));
    expect(claim.edits.filter((e) => e.severity === "error")).toEqual([]);
  });

  it("finds HCC suspects on the problem list that were not captured this year", () => {
    const r = riskSummary({ visitCodes: ["E11.9"], chartProblems: [{ name: "Chronic kidney disease, stage 4" }, { name: "Type 2 diabetes mellitus" }, { name: "Heart failure", icd10: "I50.22" }], priorYearCodes: ["I50.22"], age: 74, sex: "M" });
    expect(r.hccs.map((h) => h.hcc)).toEqual(["HCC38"]);
    expect(r.suspects.map((s) => s.code)).toEqual(["N18.4"]);
    expect(r.suspects[0].delta).toBeGreaterThan(0);
    expect(r.recaptureYear.captured).toEqual(["HCC226", "HCC38"]);
    expect(r.recaptureYear.outstanding).toEqual(["HCC327"]);
  });
});
