import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PATIENTS } from "@/lib/demo/scripts";
import { ancGrade, extractOncology, hemoglobinGrade, plateletGrade, updateProfile } from "@/lib/engine/oncology";
import type { Utterance } from "@/lib/types";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-onc-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const utts = (lines: [("clinician" | "patient"), string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

describe("oncology", () => {
  it("grades labs on CTCAE v5 cutoffs", () => {
    expect([ancGrade(2.5), ancGrade(1.8), ancGrade(1.2), ancGrade(800), ancGrade(0.3)]).toEqual([0, 1, 2, 3, 4]);
    expect([plateletGrade(160), plateletGrade(98), plateletGrade(60000), plateletGrade(30), plateletGrade(20)]).toEqual([0, 1, 2, 3, 4]);
    expect([hemoglobinGrade(12.5), hemoglobinGrade(11), hemoglobinGrade(9), hemoglobinGrade(7.5)]).toEqual([0, 1, 2, 3]);
  });

  it("extracts stage, biomarkers, regimen, cycle, ECOG, graded toxicities, and decisions", () => {
    const f = extractOncology(utts([
      ["clinician", "You have stage 3A breast cancer, T2 N1 M0, ER positive, PR positive, HER2 negative."],
      ["clinician", "We're on cycle 3, day 1 of AC-T, adjuvant."],
      ["patient", "I've had diarrhea, about 5 watery stools a day."],
      ["patient", "I threw up twice yesterday."],
      ["patient", "I'm in bed most of the day and can't get dressed without help."],
      ["patient", "No numbness or tingling though."],
      ["clinician", "Your ANC is 0.8, so we're going to hold today's treatment and add pegfilgrastim with the next cycle."],
    ]));
    expect(f.cancer?.icd10).toBe("C50.919");
    expect(f.stage).toMatchObject({ group: "IIIA", tnm: "T2 N1 M0" });
    expect(f.biomarkers.map((b) => b.text)).toEqual(["ER positive", "PR positive", "HER2 negative"]);
    expect(f.regimen?.label).toBe("AC-T");
    expect(f.cycle).toMatchObject({ cycle: 3, day: 1 });
    expect(f.intent).toBe("adjuvant");
    const g = Object.fromEntries(f.toxicities.map((t) => [t.term, t.grade]));
    expect(g).toMatchObject({ Diarrhea: 2, Vomiting: 1, "Neutrophil count decreased": 3 });
    expect(g["Peripheral sensory neuropathy"]).toBeUndefined();
    expect(f.ecog).toMatchObject({ score: 3, inferred: true });
    expect(f.decisions.map((d) => d.action)).toEqual(["hold", "growth_factor"]);
  });

  it("documents the demo FOLFOX visit, codes high MDM with toxicity diagnoses, and updates the treatment record at signing", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const doc = await newMember("Dr. Priya Raman");
    const d = DEMO_PATIENTS.find((x) => x.key === "porter")!;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: "2026-09-28T16:00:00", visitType: "follow-up", reason: d.visit.reason, templateId: d.visit.template });
    await pipeline.recordConsent(doc, (await repo.encounters.get(doc, enc.id))!, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 20, tEnd: i * 20 + 15 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 1500 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const note = (await repo.notes.latest(enc.id))!.content;
    const sec = (k: string) => note.sections.find((s) => s.key === k)!.sentences.map((s) => s.text);
    expect(sec("onc_history")[0]).toBe("Stage IIIB (T3 N1b M0) cancer of the sigmoid colon, KRAS wild type, Microsatellite stable (pMMR), diagnosed April 2026.");
    expect(sec("onc_history")).toContain("Most recent imaging: no evidence of disease.");
    expect(sec("toxicity")).toContain("Peripheral sensory neuropathy: grade 2 (CTCAE v5.0), limiting instrumental activities of daily living.");
    expect(sec("toxicity")).toContain("Diarrhea: grade 1 (CTCAE v5.0), fewer than 4 stools per day over baseline.");
    expect(sec("toxicity")).toContain("Neutrophil count decreased: grade 2 (CTCAE v5.0), ANC 1.2.");
    expect(sec("toxicity")).toContain("Platelet count decreased: grade 1 (CTCAE v5.0), platelets 98.");
    expect(sec("treatment")).toEqual([
      "Current regimen: FOLFOX (oxaliplatin, leucovorin, fluorouracil), adjuvant, cycle 6.",
      "ECOG performance status 1.",
      "Dose reduce oxaliplatin by 20% for grade 2 peripheral sensory neuropathy and grade 2 neutrophil count decreased.",
      "Proceed with treatment today.",
    ]);
    const coding = (await repo.artifacts.get<import("@/lib/types").CodingResult>(enc.id, "coding"))!;
    expect(coding.em.code).toBe("99215");
    expect(coding.em.risk.reasons[0]).toMatch(/intensive monitoring for toxicity/);
    const codes = coding.diagnoses.map((x) => x.code);
    expect(codes[0]).toBe("C18.7");
    expect(codes).toEqual(expect.arrayContaining(["G62.0", "D70.1", "T45.1X5A"]));
    await pipeline.signEncounter(doc, enc.id, { force: true });
    const onc = (await repo.patients.get(doc, p.id))!.chart.oncology!;
    expect(onc.regimens[0]).toMatchObject({ name: "FOLFOX", cycles: 6 });
    expect(onc.toxicityHistory!.filter((t) => t.cycle === 6).map((t) => `${t.term} ${t.grade}`)).toContain("Peripheral sensory neuropathy 2");
    expect(onc.ecogHistory!.at(-1)).toMatchObject({ score: 1 });
  });

  it("closes the regimen and records the reason when switching for progression", () => {
    const profile = { diagnosis: "Malignant neoplasm of colon", icd10: "C18.9", regimens: [{ name: "FOLFOX", start: "2026-01-05", cycles: 12 }] };
    const f = extractOncology(utts([["clinician", "The CT scan shows progression in the liver, so we'll switch you to FOLFIRI, second-line."]]), profile);
    const next = updateProfile(profile, f, "2026-09-28T10:00:00")!;
    expect(next.regimens).toEqual([
      { name: "FOLFOX", start: "2026-01-05", cycles: 12, end: "2026-09-28", reason: "progression" },
      { name: "FOLFIRI", start: "2026-09-28", cycles: 0 },
    ]);
  });
});
