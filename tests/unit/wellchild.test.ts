import { describe, expect, it } from "vitest";
import { buildClaim } from "@/lib/engine/billing";
import { computeCoding } from "@/lib/engine/coding";
import { extractFacts } from "@/lib/engine/extract";
import { pediatricPreventive, wellChild } from "@/lib/engine/wellchild";
import type { Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

describe("well-child visits", () => {
  it("maps age and patient type to the preventive code", () => {
    expect([pediatricPreventive(0, "established"), pediatricPreventive(1, "established"), pediatricPreventive(9, "new"), pediatricPreventive(16, "established"), pediatricPreventive(30, "new"), pediatricPreventive(50, "established"), pediatricPreventive(70, "new")]).toEqual(["99391", "99392", "99383", "99394", "99385", "99396", "99387"]);
  });

  it("lists what is due at 18 months, detects what was done, and bills screens with the preventive code", () => {
    const u = utts([
      ["clinician", "Mom filled out the ASQ and the M-CHAT in the waiting room, and both look reassuring."],
      ["clinician", "We'll do fluoride varnish on her teeth today."],
      ["clinician", "Keep her rear-facing in the car seat as long as the seat allows, and keep reading books together."],
    ]);
    const r = wellChild(18, u);
    expect(r.due.map((d) => [d.key, d.done])).toEqual([["developmental", true], ["autism", true], ["fluoride", true]]);
    expect(r.guidance.map((g) => g.covered)).toEqual([true, false, true]);
    const facts = extractFacts(u);
    const coding = computeCoding(facts, { patientType: "established", minutes: 25, pediatric: true, wellChild: r });
    expect(coding.em.code).toBe("99392");
    expect(coding.diagnoses[0].code).toBe("Z00.129");
    const claim = buildClaim(facts, coding, { age: 1, sex: "F", setting: "in-person", patientType: "established", minutes: 25, orders: [], payer: "Medicaid" });
    expect(claim.lines.map((l) => [l.cpt, l.units])).toEqual([["99392", 1], ["96110", 2], ["99188", 1]]);
  });

  it("flags maternal depression screening at infant visits and lipids at 9 to 11 years", () => {
    expect(wellChild(4, []).due.map((d) => d.key)).toEqual(["maternal_dep"]);
    expect(wellChild(4, utts([["clinician", "Your Edinburgh score is 4 today, which is reassuring."]])).due[0].done).toBe(true);
    expect(wellChild(9 * 12, []).due.map((d) => d.key)).toEqual(["lipid"]);
    expect(wellChild(4 * 12, []).due.map((d) => d.key)).toEqual(["fluoride", "vision", "hearing"]);
  });
});
