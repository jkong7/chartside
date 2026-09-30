import { describe, expect, it } from "vitest";
import { CASES, practiceCase } from "@/lib/engine/practice/cases";
import { endCommand, examRequest, matchTopics } from "@/lib/engine/practice/intent";
import { respond, studentTopics } from "@/lib/engine/practice/patient";
import { buildFixes, clock, gradeEncounter, gradeNote, hasAny, overall, categories, scorecard } from "@/lib/engine/practice/grade";
import { gradePimp, gradePresentation } from "@/lib/engine/practice/attending";
import { referenceNote } from "@/lib/engine/practice/reference";
import type { PracticeCase, Turn } from "@/lib/engine/practice/types";

function play(c: PracticeCase, questions: string[], step = 20) {
  const turns: Turn[] = [];
  let t = 0;
  for (const q of questions) {
    t += step;
    const r = respond(c, q, turns);
    turns.push({ id: `t${turns.length}`, role: "student", text: q, t, topics: r.topics });
    turns.push({ id: `t${turns.length}`, role: "patient", text: r.text, t: t + 2, cue: r.cue });
    for (const e of r.exams) turns.push({ id: `t${turns.length}`, role: "exam", text: e.finding, t: t + 3, exam: e.key });
  }
  return turns;
}

describe("practice case library", () => {
  it("has at least 8 complete cases across specialties", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(new Set(CASES.map((c) => c.specialty)).size).toBeGreaterThanOrEqual(5);
    for (const c of CASES) {
      expect(c.checklist.some((i) => i.redFlag), c.id).toBe(true);
      expect(c.exam.some((e) => e.required), c.id).toBe(true);
      expect(c.note.differential.filter((d) => d.leading), c.id).toHaveLength(1);
      expect(c.pimp, c.id).toHaveLength(3);
      for (const f of c.note.facts) if (f.exam) expect(c.exam.some((e) => e.key === f.exam), `${c.id}:${f.id}`).toBe(true);
    }
    expect(practiceCase("pediatric-fever")?.patient.speaker?.relation).toBe("mother");
    expect(practiceCase("nope")).toBeNull();
  });

  it("answers every checklist question in character and credits the right item", () => {
    for (const c of CASES) {
      for (const item of c.checklist) {
        const { topics } = studentTopics(c, item.ask);
        expect(topics.some((t) => item.topics.includes(t)), `${c.id} ${item.id}: "${item.ask}" -> ${topics.join(",")}`).toBe(true);
        const r = respond(c, item.ask, [{ id: "x", role: "patient", text: "Hi.", t: 0 }]);
        expect(r.text, `${c.id} ${item.id}`).not.toMatch(/not sure what you mean/);
      }
    }
  });

  it("maps every exam request to its maneuver and never answers it as history", () => {
    for (const c of CASES) {
      for (const e of c.exam) {
        const hits = examRequest(e.ask, c).map((x) => x.key);
        expect(hits, `${c.id} ${e.key}: "${e.ask}"`).toContain(e.key);
      }
    }
  });
});

describe("intent matching", () => {
  const c = practiceCase("chest-pain")!;
  it("finds OPQRST topics and communication moves", () => {
    expect(matchTopics("Hi, I'm Sam, a third year medical student. What brings you in today?", c)).toEqual(expect.arrayContaining(["greet", "intro", "open"]));
    expect(matchTopics("Does the pain go anywhere, like your arm or jaw?", c)).toContain("radiation");
    expect(matchTopics("On a scale of 1 to 10 how bad is it?", c)).toContain("severity");
    expect(matchTopics("What makes it worse?", c)).toContain("aggravating");
    expect(matchTopics("That sounds really scary, I'm sorry.", c)).toContain("empathy");
    expect(matchTopics("Just to make sure I have this right, the pain started two hours ago?", c)).toContain("summary");
    expect(matchTopics("Do you have high blood pressure?", c)).not.toContain("character");
    expect(matchTopics("Does heart disease run in your family?", c)).toEqual(["family"]);
    expect(matchTopics("We'll get an ECG and some blood work.", c)).toEqual(["next_steps"]);
  });

  it("knows exam requests and end commands", () => {
    expect(examRequest("I'd like to listen to your heart and lungs", c).map((e) => e.key)).toEqual(["heart", "lungs"]);
    expect(examRequest("Do you have high blood pressure?", c)).toEqual([]);
    expect(examRequest("Let me check your vitals", c).map((e) => e.key)).toEqual(["vitals"]);
    expect(endCommand("Okay, end encounter")).toBe(true);
    expect(endCommand("I'm done with the interview")).toBe(true);
    expect(endCommand("Have you done anything for it?")).toBe(false);
  });

  it("uses case-specific topics", () => {
    const h = practiceCase("headache")!;
    expect(matchTopics("Did it come on suddenly, all at once?", h)).toContain("thunderclap");
    const d = practiceCase("depression-screen")!;
    expect(matchTopics("Do you have access to a gun?", d)).toContain("firearm");
    expect(matchTopics("Have you had thoughts of hurting yourself?", d)).toContain("suicide");
  });
});

describe("offline standardized patient", () => {
  it("opens with the chief complaint, then the story, and never volunteers", () => {
    for (const c of CASES) {
      const turns = play(c, ["Hi, I'm Sam, a medical student. What brings you in today?", "Tell me more about that."]);
      expect(turns[1].text, c.id).toContain(c.patient.opening);
      expect(turns[3].text, c.id).toBe(c.patient.story);
      for (const flag of c.checklist.filter((i) => i.redFlag)) {
        const facts = flag.topics.map((t) => c.facts[t]).filter(Boolean);
        for (const f of facts) if (f.length > 30 && !c.patient.opening.includes(f) && !c.patient.story.includes(f)) expect(turns[1].text + turns[3].text, `${c.id} volunteered ${flag.id}`).not.toContain(f);
      }
    }
  });

  it("answers the parent persona for the toddler case", () => {
    const c = practiceCase("pediatric-fever")!;
    const turns = play(c, ["Hello, I'm Dr. Lee. What brings Mateo in?", "Is he still having wet diapers?"]);
    expect(turns[1].text).toMatch(/^Hi\. I'm Ana, Mateo's mom\./);
    expect(turns[3].text).toMatch(/four wet diapers/);
  });

  it("returns exam findings on request and defaults unasked ROS to a denial", () => {
    const c = practiceCase("shortness-of-breath")!;
    const turns = play(c, ["I'd like to look at the veins in your neck", "Any rash?", "Are you short of breath?"]);
    expect(turns[1].text).toBe("Okay, go ahead.");
    expect(turns[2]).toMatchObject({ role: "exam", exam: "neck" });
    expect(turns[2].text).toMatch(/Jugular venous pressure elevated/);
    expect(turns[4].text).toBe("No, nothing like that.");
    expect(turns[6].text).toMatch(/winded/);
  });

  it("flags emotional cues", () => {
    const c = practiceCase("depression-screen")!;
    const r = respond(c, "Have you had any thoughts of hurting yourself?", []);
    expect(r.cue).toBe(true);
    expect(r.text).toMatch(/didn't wake up/);
  });

  it("is deterministic", () => {
    const c = practiceCase("abdominal-pain")!;
    const q = ["What brings you in?", "When was your last period?", "Could you be pregnant?"];
    expect(play(c, q)).toEqual(play(c, q));
  });
});

const STRONG_CHEST = [
  "Hi, I'm Sam, a third year medical student. What brings you in today?",
  "That sounds really scary. When did it start?",
  "Where exactly is it?",
  "Does the pain go anywhere, like your arm or jaw?",
  "On a scale of 0 to 10, how bad is it?",
  "Is it constant, or does it come and go?",
  "Have you had chest tightness with exertion, like climbing stairs?",
  "Does anything make it better, like rest?",
  "Any sweating, nausea, or shortness of breath with it?",
  "Do you have high blood pressure, diabetes, or high cholesterol?",
  "What medicines do you take?",
  "Any allergies to medicines?",
  "Do you smoke?",
  "Do you use any drugs, like cocaine?",
  "Does anyone in your family have heart disease?",
  "I'm sorry, that must be frightening. What worries you most?",
  "That is completely understandable. Any recent long trips, surgery, or leg swelling?",
  "Let me check your vital signs.",
  "I'd like to listen to your heart.",
  "I'd like to listen to your lungs.",
  "Let me feel the pulses in both of your arms.",
  "Let me look at your legs.",
  "Let me summarize to make sure I have this right. Did I get that right?",
  "I'm worried this could be your heart. We'll get an ECG and blood work right away.",
];

const GOOD_NOTE = `S: 58M with 2 hours of substernal chest pressure that began climbing stairs, radiating to the left arm and jaw, with diaphoresis and nausea. Two weeks of exertional tightness. HTN, hyperlipidemia, 30 pack-year smoker. Father MI at 52. Denies cocaine.
O: BP 158/94, HR 104. Heart tachycardic, regular rhythm, no murmur. Lungs clear to auscultation. Radial pulses equal bilaterally.
A: Acute coronary syndrome most likely (NSTEMI vs unstable angina). Also consider aortic dissection and pulmonary embolism.
P: ECG now, serial troponin, aspirin 325 chewed, cardiology consult, chest x-ray.`;

describe("grading math", () => {
  const c = practiceCase("chest-pain")!;

  it("scores a thorough encounter and note near the top", () => {
    const s = scorecard(c, play(c, STRONG_CHEST), GOOD_NOTE);
    expect(s.historyHits).toBe(s.historyTotal);
    expect(s.missedRedFlags).toEqual([]);
    expect(s.categories.map((x) => [x.key, x.score])).toEqual([["history", 100], ["exam", 100], ["communication", 100], ["note", 100]]);
    expect(s.overall).toBe(100);
    expect(s.note!.invented).toEqual([]);
  });

  it("finds missed red flags with a timestamp and exact weights", () => {
    const turns = play(c, ["What brings you in today?", "When did it start?", "Where is it?", "How bad is it out of 10?", "I'd like to listen to your heart."], 30);
    const enc = gradeEncounter(c, turns);
    const cats = categories(enc, null);
    const history = cats.find((x) => x.key === "history")!;
    expect(history.max).toBe(c.checklist.reduce((s, i) => s + i.weight, 0));
    expect(history.got).toBe(2 + 1 + 1 + 1);
    expect(history.score).toBe(Math.round((100 * 5) / history.max));
    expect(cats.find((x) => x.key === "communication")).toMatchObject({ got: 2, max: 9, score: 22 });
    expect(cats.find((x) => x.key === "exam")).toMatchObject({ got: 2, max: 8, score: 25 });
    expect(overall(cats)).toBe(Math.round((40 * history.score + 10 * 25 + 20 * 22) / 70));
    const fixes = buildFixes(c, turns, enc, null);
    expect(fixes).toHaveLength(3);
    expect(fixes[0]).toMatchObject({ kind: "red_flag", at: 153, title: "Missed red flag: radiation to arm or jaw" });
    expect(fixes[0].detail).toContain("By 2:33 you had moved on to the exam");
    expect(clock(153)).toBe("2:33");
  });

  it("penalizes invented findings and contradictions, and rewards the differential and plan", () => {
    const turns = play(c, ["What brings you in today?", "When did it start?"]);
    const g = gradeNote(c, turns, "Chest pain radiating to the left arm. Lungs clear. Pain is pleuritic. Plan: ECG and aspirin. Assessment: GERD.");
    expect(g.invented).toEqual(["Radiation to left arm and jaw", "Lungs clear"]);
    expect(g.contradictions).toHaveLength(1);
    expect(g.parts.penalty).toBe(15);
    expect(g.differential.find((d) => d.leading)!.hit).toBe(false);
    expect(g.parts.differential).toBe(5);
    expect(g.parts.plan).toBe(Math.round((30 * 5) / 9));
    expect(g.score).toBe(Math.max(0, Math.round(g.parts.documentation + 5 + (30 * 5) / 9 - 15)));
    const full = play(c, STRONG_CHEST);
    const fixes = buildFixes(c, full, gradeEncounter(c, full), gradeNote(c, full, "Chest pain, pleuritic. Plan: ECG, troponin, aspirin. Assessment: GERD."));
    expect(fixes.map((f) => f.kind)).toEqual(["invented", "dx", "plan"]);
  });

  it("gives an empty note zero and flags a missed empathy cue with its time", () => {
    const d = practiceCase("depression-screen")!;
    const turns = play(d, ["What brings you in?", "Have you had thoughts of hurting yourself?", "How is your sleep?"], 60);
    expect(gradeNote(d, turns, "   ").score).toBe(0);
    const fixes = buildFixes(d, turns, gradeEncounter(d, turns), null);
    const empathy = fixes.find((f) => f.kind === "empathy") ?? buildFixes(d, turns, { ...gradeEncounter(d, turns), history: [] }, null).find((f) => f.kind === "empathy");
    expect(empathy).toMatchObject({ at: 122 });
    expect(empathy!.detail).toContain("At 2:02 Marcus said");
  });

  it("matches short keywords as whole words only", () => {
    expect(hasAny("Plan: ECG, ASA", ["asa"])).toBe(true);
    expect(hasAny("family history", ["mi"])).toBe(false);
    expect(hasAny("h/o MI in 2019", ["mi"])).toBe(true);
    expect(hasAny("radiating to the arm", ["radiat"])).toBe(true);
  });
});

describe("attending mode", () => {
  const c = practiceCase("chest-pain")!;
  it("scores the model presentation at 10 and a jumbled one low", () => {
    expect(gradePresentation(c, c.model, 90).score).toBe(10);
    const bad = gradePresentation(c, "So we should get an ECG. He smokes. His chest hurts and he's 58.", 20);
    expect(bad.score).toBeLessThan(5);
    expect(bad.fixes.length).toBeGreaterThan(0);
    const long = gradePresentation(c, c.model, 240);
    expect(long.score).toBe(9.5);
    expect(long.fixes[0]).toMatch(/Tighten/);
  });

  it("grades pimp answers by key concept", () => {
    const r = gradePimp(c, ["An EKG within ten minutes", "morphine", ""]);
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r[1].answer).toMatch(/Aspirin/);
  });

  it("every case's model presentation scores well", () => {
    for (const x of CASES) expect(gradePresentation(x, x.model, 100).score, x.id).toBeGreaterThanOrEqual(8.5);
  });
});

describe("how Chartside would chart it", () => {
  it("writes a SOAP note from the practice transcript with the offline engine", () => {
    const c = practiceCase("chest-pain")!;
    const r = referenceNote(c, play(c, STRONG_CHEST));
    expect(r.text).toContain("SUBJECTIVE");
    expect(r.text).toMatch(/chest/i);
    expect(r.text).toMatch(/left arm/i);
    expect(r.note.meta.engine).toBe("local");
  });
});
