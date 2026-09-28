import { describe, expect, it } from "vitest";
import { buildClaim } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { extractFacts } from "@/lib/engine/extract";
import { extractProcedures, procedureSentences } from "@/lib/engine/procedures";
import type { Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

const KNEE: [Utterance["speaker"], string][] = [
  ["patient", "My right knee has been really painful for three months, worse on stairs."],
  ["clinician", "Your x-ray shows moderate osteoarthritis of the right knee."],
  ["clinician", "The risks are infection, bleeding, and a short flare of pain. Is it okay to go ahead with the injection?"],
  ["patient", "Yes, let's do it."],
  ["clinician", "Time out, right knee confirmed. I cleaned the site with chlorhexidine."],
  ["clinician", "I injected 40 milligrams of Kenalog with 3 mL of lidocaine into the right knee."],
  ["clinician", "You tolerated it well with no complications. Also let's refill your meloxicam 15 milligrams daily for the knee osteoarthritis."],
];

describe("office procedures", () => {
  it("documents a joint injection with drug units, laterality, and modifier 25 on the E/M", () => {
    const u = utts(KNEE);
    const p = extractProcedures(u);
    expect(p.procedures.map((x) => [x.cpt, x.laterality, x.site])).toEqual([["20610", "RT", "knee"]]);
    expect(p.drugs).toEqual([{ hcpcs: "J3301", label: "Triamcinolone acetonide", dose: "40 mg", units: 4, evidence: ["u5"] }]);
    expect(p).toMatchObject({ timeOut: true, prep: "chlorhexidine", complications: "None; tolerated well" });
    expect(p.consent.documented).toBe(true);
    const text = procedureSentences(p, "procedure").map((s) => s.text);
    expect(text[0]).toBe("Procedure: Arthrocentesis, aspiration and/or injection, major joint or bursa, right knee (20610).");
    expect(text).toContain("Medication: Triamcinolone acetonide 40 mg (J3301 x4).");
    const facts = extractFacts(u);
    const coding = computeCoding(facts, { patientType: "established", minutes: 20, procedures: p });
    const claim = buildClaim(facts, coding, { age: 66, sex: "F", setting: "in-person", patientType: "established", minutes: 20, orders: [], payer: "Medicare" });
    const byCpt = Object.fromEntries(claim.lines.map((l) => [l.cpt, l]));
    expect(byCpt["20610"].modifiers).toEqual(["RT"]);
    expect(byCpt.J3301.units).toBe(4);
    const em = claim.lines.find((l) => l.source === "em")!;
    expect(em.modifiers).toContain("25");
  });

  it("counts biopsies, cryotherapy lesions, laceration length, and IM injections", () => {
    const p = extractProcedures(utts([
      ["clinician", "I took two punch biopsies on the left forearm."],
      ["clinician", "Then I froze 6 actinic keratoses on the scalp with liquid nitrogen."],
      ["clinician", "The 4 cm laceration on the right forearm was repaired with simple interrupted sutures."],
      ["clinician", "I gave you 60 milligrams of Toradol IM in the deltoid for the pain."],
      ["clinician", "Next time we could consider a shave biopsy of the back lesion."],
    ]));
    expect(p.procedures.map((x) => [x.cpt, x.addOn?.cpt ?? null, x.addOn?.units ?? 0])).toEqual([["11104", "11105", 1], ["17000", "17003", 5], ["12002", null, 0], ["96372", null, 0]]);
    expect(p.drugs.map((d) => [d.hcpcs, d.units])).toEqual([["J1885", 4]]);
    expect(p.consent.documented).toBe(false);
    expect(procedureSentences(p, "x").find((s) => s.text.startsWith("Consent"))!.text).toBe("Consent: ***");
  });

  it("ignores procedures that are only discussed", () => {
    expect(extractProcedures(utts([["clinician", "If it doesn't improve, we could do a cortisone injection in the knee next visit."]])).procedures).toEqual([]);
  });
});
