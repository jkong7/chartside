import { describe, expect, it } from "vitest";
import { assessRisk, interventionSentences, psychotherapyCode, responseSentences, riskSentences } from "@/lib/engine/behavioral";
import { buildNote } from "@/lib/engine/note";
import { computeCoding } from "@/lib/engine/coding";
import { systemTemplate } from "@/lib/engine/templates";
import type { Utterance } from "@/lib/types";
import { demo, SCHEDULED } from "./helpers";

const u = (id: string, speaker: Utterance["speaker"], text: string): Utterance => ({ id, seq: Number(id.slice(1)), speaker, text, tStart: 0, tEnd: 1 });

describe("behavioral health", () => {
  it("builds a complete suicide risk assessment from the conversation", () => {
    const { utterances } = demo("reyes");
    const r = assessRisk(utterances);
    expect(r).toMatchObject({ screened: true, ideation: "passive", plan: "none", intent: "none", means: "restricted", priorAttempt: "none", safetyPlan: true, level: "low", missing: [] });
    expect(r.protective).toContain("daughter");
    const text = riskSentences(r, "risk").map((s) => s.text).join(" ");
    expect(text).toContain("Suicidal ideation: passive");
    expect(text).toContain("Access to lethal means: means restricted");
    expect(text).toContain("Clinician risk formulation: low acute risk. ***");
  });

  it("flags what is missing and escalates active ideation with a plan", () => {
    const partial = assessRisk([u("u0", "clinician", "Any thoughts of hurting yourself?"), u("u1", "patient", "Yes, I think about killing myself.")]);
    expect(partial).toMatchObject({ ideation: "active", level: "moderate" });
    expect(partial.missing).toEqual(["plan", "intent", "access to lethal means", "prior attempts", "safety plan"]);
    const high = assessRisk([u("u0", "clinician", "Any thoughts of suicide?"), u("u1", "patient", "Yes."), u("u2", "clinician", "Do you have a plan?"), u("u3", "patient", "I would take all my pills.")]);
    expect(high.level).toBe("high");
    const none = assessRisk([u("u0", "clinician", "Any thoughts of hurting yourself?"), u("u1", "patient", "No, never.")]);
    expect(none).toMatchObject({ ideation: "none", missing: [], level: null });
    expect(riskSentences(none, "r")[0].text).toBe("Denies suicidal ideation.");
    expect(riskSentences(assessRisk([]), "r")[0].text).toContain("not assessed");
  });

  it("documents interventions and responses, and codes psychotherapy by time", () => {
    const { utterances, facts, patient, d } = demo("reyes");
    expect(interventionSentences(utterances, "i").map((s) => s.text)).toEqual(["Behavioral activation.", "Safety planning.", "Cognitive restructuring (CBT).", "Homework assigned."]);
    const resp = responseSentences(utterances, "r").map((s) => s.text);
    expect(resp.some((t) => /^Engaged and receptive: "I guess I did finish/.test(t))).toBe(true);
    expect(resp.some((t) => /^Engaged and receptive: "Okay, I can try that/.test(t))).toBe(true);
    expect([15, 16, 37, 38, 52, 53].map((m) => psychotherapyCode(m))).toEqual([null, "90832", "90832", "90834", "90834", "90837"]);
    expect(psychotherapyCode(45, true)).toBe("90836");
    const note = buildNote(facts, { patient, encounter: { reason: d.visit.reason, visitType: d.visit.type, scheduledAt: SCHEDULED }, template: systemTemplate("bh_psychotherapy")!, utterances, minutes: 50 });
    expect(note.meta.sensitive).toBe(true);
    expect(note.sections.find((s) => s.key === "time")!.sentences[0].text).toBe("Psychotherapy time: 50 minutes face to face (supports 90834).");
    expect(note.sections.find((s) => s.key === "mse")!.sentences.map((s) => s.text).join(" ")).toMatch(/affect/i);
    expect(computeCoding(facts, { patientType: "established", minutes: 50, psychotherapy: "standalone" }).em.code).toBe("90834");
    expect(computeCoding(facts, { patientType: "new", minutes: 70, psychotherapy: "intake" }).em.code).toBe("90791");
  });
});

describe("risk assessment sign blocker", () => {
  it("blocks signing when suicidal ideation is disclosed without a complete assessment, even when forced", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    process.env.CHARTSIDE_DB = path.join(mkdtempSync(path.join(tmpdir(), "chartside-bh-")), "t.db");
    process.env.CHARTSIDE_ENGINE = "local";
    const { newMember } = await import("./org-helpers");
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const doc = await newMember("Dr. Therapist");
    const p = await repo.patients.create(doc, { mrn: "BH1", name: "Sam Lee", dob: "1990-01-01", sex: "M", pronouns: "he/him", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(doc, { scheduledAt: new Date().toISOString(), patientId: p.id, templateId: "bh_dap", reason: "Therapy" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [
      { speaker: "clinician", text: "Any thoughts of hurting yourself?", tStart: 0, tEnd: 2 },
      { speaker: "patient", text: "Yes, sometimes I think about killing myself.", tStart: 2, tEnd: 5 },
      { speaker: "clinician", text: "Thank you for telling me. Let's keep talking about how work has been.", tStart: 5, tEnd: 8 },
    ]);
    await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 2700 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const out = await pipeline.signEncounter(doc, enc.id, { force: true });
    expect(out.signed).toBe(false);
    expect(out.blockers[0]).toContain("does not document: plan, intent, access to lethal means, prior attempts, safety plan");
  });
});

describe("psychiatry add-on, GIRP, and group templates", () => {
  it("bills E/M by MDM plus a psychotherapy add-on from separately documented time", async () => {
    const { computeCoding } = await import("@/lib/engine/coding");
    const { extractFacts } = await import("@/lib/engine/extract");
    const { psychotherapyMinutes } = await import("@/lib/engine/behavioral");
    const u = [
      { id: "a", seq: 0, speaker: "clinician" as const, text: "How has the sertraline been at 100 milligrams?", tStart: 0, tEnd: 3 },
      { id: "b", seq: 1, speaker: "patient" as const, text: "My mood is a little better but I still feel anxious most days.", tStart: 4, tEnd: 8 },
      { id: "c", seq: 2, speaker: "clinician" as const, text: "Let's increase the sertraline to 150 milligrams daily for your depression.", tStart: 9, tEnd: 12 },
      { id: "d", seq: 3, speaker: "clinician" as const, text: "We spent 25 minutes on psychotherapy today working on cognitive restructuring.", tStart: 13, tEnd: 16 },
    ];
    const pt = psychotherapyMinutes(u)!;
    expect(pt).toEqual({ minutes: 25, evidence: ["d"] });
    const c = computeCoding(extractFacts(u), { patientType: "established", minutes: 45, psychotherapy: "addon", psychotherapyMinutes: pt });
    expect(c.em.code).toMatch(/^992/);
    expect(c.em.timeBased).toBeUndefined();
    expect(c.psychotherapyAddOn).toEqual({ code: "90833", minutes: 25, evidence: ["d"] });
    expect(computeCoding(extractFacts(u), { patientType: "established", minutes: 60, psychotherapy: "group" }).em.code).toBe("90853");
  });

  it("builds GIRP goals from the prior plan and the session", async () => {
    const { goalSentences } = await import("@/lib/engine/behavioral");
    const g = goalSentences([{ id: "x", seq: 0, speaker: "clinician", text: "This week let's focus on getting outside once a day.", tStart: 0, tEnd: 2 }], ["Thought record practice"], "goals");
    expect(g.map((s) => s.text)).toEqual(["Goal carried from last session: Thought record practice.", "This week let's focus on getting outside once a day."]);
    expect(goalSentences([], [], "goals")[0].text).toContain("***");
  });
});
