import { describe, expect, it } from "vitest";
import { computeCoding } from "@/lib/engine/coding";
import { extractFacts } from "@/lib/engine/extract";
import { detectTasks } from "@/lib/engine/tasks";
import type { Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

describe("social determinants of health", () => {
  it("codes social needs, lifts MDM risk when they limit treatment, and opens a resources task", () => {
    const u = utts([
      ["clinician", "How has the insulin been going for your diabetes?"],
      ["patient", "Honestly I've been rationing my insulin because I can't afford it since I lost my job."],
      ["patient", "Some weeks we don't have enough food, and I missed my last appointment because of the bus."],
      ["clinician", "That makes sense. Let's switch you to a cheaper human insulin that's 25 dollars at Walmart for your diabetes."],
      ["clinician", "I'll also have our social worker connect you with a food pantry and a ride service."],
    ]);
    const f = extractFacts(u);
    const z = f.problems.filter((p) => p.def?.sdoh).map((p) => p.icd10);
    expect(z).toEqual(expect.arrayContaining(["Z91.120", "Z56.0", "Z59.41", "Z59.82"]));
    const c = computeCoding(f, { patientType: "established", minutes: 25 });
    expect(c.em.risk.reasons.join(" ")).toMatch(/limited by social determinants of health/);
    expect(["moderate", "high"]).toContain(c.em.risk.level);
    const t = detectTasks(f, [], u, { at: new Date("2026-09-28T10:00:00") }).find((x) => x.key === "sdoh")!;
    expect(t.title).toContain("not always having enough food");
  });

  it("ignores negated or neutral mentions", () => {
    const f = extractFacts(utts([
      ["clinician", "Any trouble affording food or your medicines?"],
      ["patient", "No, we have enough food and I can get to appointments fine."],
    ]));
    expect(f.problems.filter((p) => p.def?.sdoh)).toHaveLength(0);
  });

  it("uses the specific homelessness code", () => {
    const f = extractFacts(utts([["patient", "I've been staying at the shelter on Clark Street since August."], ["clinician", "Let's get you connected with social work today."]]));
    expect(f.problems.find((p) => p.key === "sdoh_homeless")?.icd10).toBe("Z59.01");
  });
});
