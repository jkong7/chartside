import { describe, expect, it } from "vitest";
import { buildClaim } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { extractFacts } from "@/lib/engine/extract";
import { extractPrenatal, gaFrom, prenatalCodes, prenatalDue, warningSentences } from "@/lib/engine/prenatal";
import type { Utterance } from "@/lib/types";
import { icdRelease } from "@/lib/codesets";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));
const AT = new Date("2026-09-28T10:00:00");
const PREG = { edd: "2026-12-21", gravida: 2, para: 1, rh: "negative" as const };

const VISIT = utts([
  ["clinician", "How are you feeling? Any bleeding, leaking of fluid, or contractions?"],
  ["patient", "No, none of that."],
  ["clinician", "And is the baby moving a lot?"],
  ["patient", "Yes, kicking all the time, especially at night."],
  ["patient", "I've had a headache the last two days that Tylenol isn't touching."],
  ["clinician", "Your blood pressure is 144 over 92. Your urine shows trace protein."],
  ["clinician", "You're measuring 31 centimeters, and the baby's heart rate is 145."],
]);

describe("prenatal visit", () => {
  it("computes gestational age from the EDD", () => {
    expect(gaFrom("2026-12-21", AT)).toEqual({ weeks: 28, days: 0 });
    expect(gaFrom("2026-12-21", new Date("2026-12-24T09:00:00"))).toEqual({ weeks: 40, days: 3 });
    expect(gaFrom("2026-12-21", new Date("2026-09-29T04:30:00Z"), "America/Chicago")).toEqual({ weeks: 28, days: 0 });
    expect(gaFrom("2026-12-21", new Date("2026-09-29T04:30:00Z"), "UTC")).toEqual({ weeks: 28, days: 1 });
    expect(gaFrom("2026-12-21", new Date("2026-11-02T05:30:00Z"), "America/Chicago")).toEqual({ weeks: 32, days: 6 });
  });

  it("reviews warning signs, flags hypertension with symptoms and a size/dates discrepancy, and lists what's due", () => {
    const f = extractPrenatal(VISIT, PREG, AT);
    expect(f).toMatchObject({ ga: { weeks: 28, days: 0, source: "edd" }, fundalHeight: { cm: 31 }, fhr: { bpm: 145 }, bp: { sys: 144, dia: 92 }, urineProtein: { value: "trace" } });
    expect(f.preeclampsia.map((p) => p.symptom)).toEqual(["headache"]);
    expect(warningSentences(f, "w").map((x) => x.text)).toEqual(["Reports active fetal movement; denies vaginal bleeding, leakage of fluid, contractions."]);
    const due = prenatalDue(PREG, f);
    expect(due.map((d) => d.key)).toEqual(["bp", "fh", "gtt", "tdap", "rhogam", "visits"]);
    expect(due[0].text).toContain("symptoms reported: headache");
  });

  it("codes Z34 and Z3A and bills the visit inside the global OB package", () => {
    const f = extractPrenatal(VISIT, PREG, AT);
    const codes = prenatalCodes(PREG, f);
    expect(codes.map((c) => c.code)).toEqual(["Z34.83", "Z3A.28"]);
    expect(prenatalCodes({ edd: "2026-12-21", gravida: 1 }, f)[0].code).toBe("Z34.03");
    const facts = extractFacts(VISIT);
    const coding = computeCoding(facts, { patientType: "established", minutes: 15, prenatal: { codes, globalPackage: true } });
    expect(coding.em.code).toBe("0502F");
    expect(coding.diagnoses.slice(0, 2).map((d) => d.code)).toEqual(["Z34.83", "Z3A.28"]);
    const claim = buildClaim(facts, coding, { age: 31, sex: "F", setting: "in-person", patientType: "established", minutes: 15, orders: [], payer: "Commercial" });
    expect(claim.lines.map((l) => [l.cpt, l.charge])).toEqual([["0502F", 0]]);
  });

  it("only emits billable pregnancy codes", () => {
    const r = icdRelease("icd10cm-2027");
    for (let w = 4; w <= 42; w++) {
      for (const g of [1, 3]) {
        for (const c of prenatalCodes({ edd: "2026-12-21", gravida: g }, { ...extractPrenatal([], null, AT), ga: { weeks: w, days: 0, source: "stated" } })) expect(r.lookup(c.code)?.billable, c.code).toBe(true);
      }
    }
  });
});
