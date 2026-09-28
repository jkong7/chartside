import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ED_DEMO } from "@/lib/demo/scripts";
import { criticalCareMinutes, edCourse, edDisposition } from "@/lib/engine/ed";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-ed-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const utt = (i: number, speaker: "clinician" | "patient", text: string) => ({ id: `u${i}`, encounterId: "e", seq: i, speaker, text, tStart: i * 600, tEnd: i * 600 + 5, source: "live" }) as import("@/lib/types").Utterance;

describe("emergency department", () => {
  it("builds a timed ED course and picks the latest disposition", () => {
    const u = [utt(0, "clinician", "Let's give you morphine."), utt(1, "clinician", "Re-evaluating now, you're feeling much better."), utt(2, "clinician", "We might admit you to the hospital for this."), utt(3, "clinician", "Actually you're safe to go home.")];
    const course = edCourse(u, "2026-09-28T14:00:00", "c");
    expect(course).toHaveLength(1);
    expect(course[0].text).toBe("14:10 Re-evaluation: Patient is feeling much better.");
    expect(edDisposition(u, "d")[0].text).toBe("Disposition: Discharge home.");
    expect(edDisposition([utt(0, "clinician", "I'm going to admit you to the observation unit.")], "d")[0].text).toBe("Disposition: Observation.");
    expect(criticalCareMinutes([utt(0, "clinician", "Critical care time was 45 minutes excluding procedures.")])).toBe(45);
  });

  it("documents the demo chest pain visit with ACS workup, observation, ED codes, and POS 23", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const doc = await newMember("Dr. Riley Park");
    const d = ED_DEMO;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: "2026-09-28T14:00:00", visitType: "ed", reason: d.complaint });
    await pipeline.recordConsent(doc, (await repo.encounters.get(doc, enc.id))!, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, d.script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 600, tEnd: i * 600 + 8 })));
    await repo.encounters.update(doc, enc.id, { status: "processing", startedAt: "2026-09-28T14:00:00", durationS: 7200 });
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const note = (await repo.notes.latest(enc.id))!.content;
    const all = JSON.stringify(note);
    expect(all).toContain("Troponin: <5 ng/L.");
    expect(all).toMatch(/unstable angina/i);
    expect(all).toContain("Disposition: Observation.");
    const course = note.sections.find((s) => s.key === "course")!;
    expect(course.sentences.map((s) => s.text.replace(/^\d{2}:\d{2} /, "").split(":")[0])).toEqual(["Initial results", "Re-evaluation", "Results"]);
    const coding = (await repo.artifacts.get<import("@/lib/types").CodingResult>(enc.id, "coding"))!;
    expect(["99283", "99284", "99285"]).toContain(coding.em.code);
    expect(coding.diagnoses.map((x) => x.code)).toContain("I20.0");
    for (const o of await repo.orders.list(enc.id)) if (o.status === "staged") await repo.orders.setStatus(enc.id, o.id, "accepted");
    await pipeline.signEncounter(doc, enc.id, { force: true });
    const claim = (await repo.claims.get(enc.id))!;
    expect(claim.content.placeOfService).toBe("23");
  });
});
