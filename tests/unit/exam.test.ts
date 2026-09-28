import { describe, expect, it } from "vitest";
import { extractLesions, extractMsk, lesionSentences, mskSentences } from "@/lib/engine/exam";
import type { Utterance } from "@/lib/types";

const utts = (lines: [Utterance["speaker"], string][]): Utterance[] => lines.map(([speaker, text], i) => ({ id: `u${i}`, seq: i, speaker, text, tStart: i * 5, tEnd: i * 5 + 4 }));

describe("specialty exams", () => {
  it("structures an orthopedic knee exam", () => {
    const x = extractMsk(utts([
      ["clinician", "On the right knee, flexion is 110 degrees and your quad strength is 4 out of 5."],
      ["clinician", "McMurray is positive with medial joint line pain, and Lachman is negative with a firm endpoint."],
      ["clinician", "Anterior drawer is negative. You're neurovascularly intact distally."],
    ]));
    expect(x.tests.map((t) => [t.name, t.result, t.side])).toEqual([["McMurray", "positive", null], ["Lachman", "negative", null], ["Anterior drawer", "negative", null]]);
    expect(mskSentences(x, "msk").map((s) => s.text)).toEqual(["Range of motion: flexion is 110 degrees.", "Strength: quad strength is 4 out of 5.", "Positive: McMurray.", "Negative: Lachman, Anterior drawer.", "Neurovascularly intact distally."]);
  });

  it("describes skin lesions with size, color, surface, location, and ABCDE flags", () => {
    const ls = extractLesions(utts([
      ["clinician", "There's a 7 mm dark brown macule with irregular borders on the left upper back, and she says it's changing."],
      ["clinician", "You also have three pink scaly papules on the scalp."],
    ]));
    expect(lesionSentences(ls, "skin").map((s) => s.text)).toEqual([
      "7 mm dark brown macule with irregular borders on the left upper back. Concerning features: irregular border, diameter over 6 mm, evolving.",
      "3 pink scaly papules on the scalp.",
    ]);
  });
});
