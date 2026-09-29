import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

  it("runs the track board from arrival through pickup, disposition, admission, and departure", async () => {
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(noon);
    const ed = await import("@/lib/server/ed");
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Sam Ortiz");
    const nurse = await newMember("Pat Nguyen RN", { role: "nurse", orgId: doc.orgId });
    const t0 = new Date(Date.now() - 50 * 60000).toISOString();
    const a = await ed.arrive(nurse, { name: "Lena Ward", dob: "1950-03-04", sex: "F", complaint: "Shortness of breath", esi: 2, arrivedAt: t0 });
    expect(a.status).toBe("waiting");
    await expect(ed.arrive(nurse, { patientId: a.patientId, complaint: "again" })).rejects.toThrow("already on the board");
    await expect(ed.arrive(nurse, { name: "X", dob: "2000-01-01", complaint: "Cough", esi: 7 })).rejects.toThrow("ESI");
    const b = await ed.arrive(nurse, { name: "Gus Hale", dob: "1990-01-01", sex: "M", complaint: "Ankle injury", esi: 4, bed: "Fast 2" });
    expect(b.status).toBe("roomed");
    await expect(ed.assignBed(nurse, a.id, "fast 2")).rejects.toThrow("occupied");
    await ed.assignBed(nurse, a.id, "Resus 1");
    let board = await ed.edBoard(doc);
    expect(board.rows.map((r) => r.patientName)).toEqual(["Lena Ward", "Gus Hale"]);
    expect(board.rows[0].flags.join(" ")).toContain("ESI 2 not seen in 50 min");
    await expect(ed.pickUp(nurse, a.id)).rejects.toThrow("Only a provider");
    await expect(ed.setDisposition(doc, a.id, "Admit")).rejects.toThrow("not seen");
    const encId = await ed.pickUp(doc, a.id);
    expect(await ed.pickUp(doc, a.id)).toBe(encId);
    const enc = (await repo.encounters.get(doc, encId))!;
    expect(enc).toMatchObject({ visitType: "ed", setting: "ed", templateId: "ed_note" });
    expect((await repo.encounters.list(doc, { outpatient: true })).some((e) => e.id === encId)).toBe(false);
    await repo.utterances.append(encId, [{ speaker: "clinician", text: "I'm going to admit you to the hospital for your COPD exacerbation.", tStart: 0, tEnd: 4 }]);
    board = await ed.edBoard(doc);
    expect(board.rows[0]).toMatchObject({ status: "seen", suggestedDisposition: "Admit", noteStatus: enc.status });
    expect(board.metrics.doorToProvider).toBeGreaterThanOrEqual(49);
    await expect(ed.depart(nurse, a.id)).rejects.toThrow("disposition");
    const { admission } = await ed.admitFromEd(doc, a.id, { unit: "4 West", room: "410" });
    expect(admission.reason).toBe("shortness of breath");
    expect((await ed.edVisits.get(doc, a.id))).toMatchObject({ disposition: "Admit", status: "dispo", admissionId: admission.id });
    await ed.depart(nurse, a.id);
    await expect(ed.depart(nurse, b.id, false)).rejects.toThrow("disposition");
    await ed.depart(nurse, b.id, true);
    board = await ed.edBoard(doc);
    expect(board.rows).toHaveLength(0);
    expect(board.metrics).toMatchObject({ arrivals: 2, lwbs: 1, admitRate: 100 });
    expect(board.metrics.medianLos).toBeGreaterThanOrEqual(49);
    vi.useRealTimers();
  });
});
