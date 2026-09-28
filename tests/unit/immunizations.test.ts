import { describe, expect, it } from "vitest";
import { ageInMonths, cms117, immunizationGaps } from "@/lib/engine/immunizations";
import { evaluateQuality } from "@/lib/engine/quality";
import { demo } from "./helpers";

const at = new Date("2026-09-28T12:00:00");

describe("childhood immunizations", () => {
  it("computes age in months and finds nothing due for a newborn", () => {
    expect(ageInMonths("2026-08-28", at)).toBe(1);
    expect(immunizationGaps("2026-09-07", [{ name: "Hepatitis B", date: "2026-09-07" }], at)).toEqual([]);
    expect(immunizationGaps("2026-08-28", [], at).map((g) => g.key)).toEqual(["hepb"]);
  });

  it("flags the 2-month series when it is overdue", () => {
    const gaps = immunizationGaps("2026-05-20", [{ name: "Hepatitis B", date: "2026-05-21" }], at);
    expect(gaps.map((g) => `${g.key}#${g.dose}`)).toEqual(["hepb#2", "rv#1", "dtap#1", "hib#1", "pcv#1", "ipv#1"]);
  });

  it("finds the 4 to 6 year boosters due for a 6-year-old", () => {
    const { patient } = demo("ramirez");
    const gaps = immunizationGaps(patient.dob, patient.chart.immunizations ?? [], at);
    expect(gaps.map((g) => `${g.key}#${g.dose}`)).toEqual(["dtap#5", "ipv#4", "mmr#2", "var#2"]);
    const r = evaluateQuality({ patient, facts: null, utterances: [], orders: [], at });
    expect(r.find((x) => x.id === "peds_catchup")).toMatchObject({ status: "gap", ecqm: "CDC" });
    expect(r.find((x) => x.id === "peds_catchup")!.reason).toContain("DTaP dose 5 (due now, by 7 years)");
  });

  it("scores CMS117 for a 2-year-old", () => {
    const full = ["DTaP", "DTaP", "DTaP", "DTaP", "IPV", "IPV", "IPV", "MMR", "Hib", "Hib", "Hib", "Hepatitis B", "Hepatitis B", "Hepatitis B", "Varicella", "PCV15", "PCV15", "PCV15", "PCV15", "Hepatitis A", "Rotavirus", "Rotavirus", "Influenza", "Influenza"].map((name) => ({ name, date: "2025-06-01" }));
    expect(cms117("2024-03-01", full, at)).toEqual({ met: true, missing: [] });
    const partial = cms117("2024-03-01", full.filter((x, i) => !(x.name === "Influenza" && i === 23)), at)!;
    expect(partial).toEqual({ met: false, missing: ["Influenza (1 of 2)"] });
    expect(cms117("2020-03-01", full, at)).toBeNull();
  });
});
