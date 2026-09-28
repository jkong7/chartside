import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { INPATIENT_DEMO, type DemoLine } from "@/lib/demo/scripts";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-ip-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const day = (n: number, h = 9) => {
  const d = new Date("2026-09-25T00:00:00");
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d;
};

async function capture(user: import("@/lib/server/repo").User, encId: string, script: DemoLine[]) {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const enc = (await repo.encounters.get(user, encId))!;
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(encId, script.map((l, i) => ({ speaker: l.s, text: l.t, tStart: i * 5, tEnd: i * 5 + 4 })));
  await repo.encounters.update(user, encId, { status: "processing", durationS: 1500 });
  await pipeline.processEncounter(user, encId, { engine: "local" });
  for (const o of await repo.orders.list(encId)) if (o.status === "staged") await repo.orders.setStatus(encId, o.id, "accepted");
  return (await repo.notes.latest(encId))!.content;
}

const text = (n: import("@/lib/types").Note, key: string) => n.sections.find((s) => s.key === key)?.sentences.map((s) => s.text).join(" | ") ?? "";

describe("inpatient stay", () => {
  it("admits, writes progress notes that show what changed, carries forward problems, discharges, and bills hospital codes", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const ip = await import("@/lib/server/inpatient");
    const doc = await newMember("Dr. Avery Chen");
    const d = INPATIENT_DEMO;
    const p = await repo.patients.create(doc, { mrn: d.mrn, name: d.name, dob: d.dob, sex: d.sex, pronouns: d.pronouns, language: "en", chart: d.chart });
    const { admission, encounterId: hp } = await ip.admit(doc, { patientId: p.id, unit: d.unit, room: d.room, reason: d.reason, admitAt: day(0, 22).toISOString() });
    await expect(ip.admit(doc, { patientId: p.id, reason: "again" })).rejects.toThrow("already admitted");
    const hpNote = await capture(doc, hp, d.scripts.hp);
    expect(JSON.stringify(hpNote)).toContain("BNP");
    const hpCoding = (await repo.artifacts.get<import("@/lib/types").CodingResult>(hp, "coding"))!;
    expect(["99221", "99222", "99223"]).toContain(hpCoding.em.code);
    await pipeline.signEncounter(doc, hp, { force: true });
    const hpClaim = (await repo.claims.get(hp))!;
    expect(hpClaim.content.placeOfService).toBe("21");
    expect(hpClaim.content.lines.map((l) => l.cpt)).not.toContain("G2211");
    expect(hpClaim.content.excludedOrders.join(" ")).toContain("hospital facility claim");

    const d2 = await ip.startNote(doc, admission.id, "progress", day(1));
    expect(await ip.startNote(doc, admission.id, "progress", day(1))).toBe(d2);
    const n2 = await capture(doc, d2, d.scripts.day2);
    expect(n2.sections[0].title).toBe("Changes Since Yesterday (Hospital Day 2)");
    expect(text(n2, "interval")).toContain("Weight 92 kg, down 2 kg from 94 kg yesterday.");
    expect(text(n2, "interval")).toContain("Creatinine 1.5 mg/dL (up from 1.4)");
    expect(text(n2, "interval")).toContain("Started potassium chloride 20 mg daily");
    await pipeline.signEncounter(doc, d2, { force: true });

    const d3 = await ip.startNote(doc, admission.id, "progress", day(2));
    const n3 = await capture(doc, d3, d.scripts.day3);
    expect(text(n3, "interval")).toContain("Weight 90 kg, down 2 kg");
    const ap = n3.sections.find((s) => s.key === "ap")!;
    const carried = ap.sentences.filter((s) => s.pending && s.kind === "carried");
    expect(carried.map((s) => s.text).join(" ")).toMatch(/atrial fibrillation/i);
    const c3 = (await repo.artifacts.get<import("@/lib/types").CodingResult>(d3, "coding"))!;
    expect(["99231", "99232", "99233"]).toContain(c3.em.code);
    await pipeline.signEncounter(doc, d3, { force: true });

    const census = await ip.census(doc);
    expect(census[0]).toMatchObject({ room: "412", unit: "4 West" });
    expect(census[0].handoff.summary).toContain("admitted for acute on chronic heart failure exacerbation");

    const dc = await ip.startNote(doc, admission.id, "discharge", day(3));
    const ndc = await capture(doc, dc, d.scripts.discharge);
    const all = (k: string) => text(ndc, k);
    expect(ndc.sections.map((s) => s.title)).toEqual(["Admission", "Discharge Diagnoses", "Hospital Course", "Procedures and Imaging", "Discharge Medications", "Results Pending at Discharge", "Follow-up", "Discharge Instructions"]);
    expect(all("dc_dates")).toContain("length of stay 3 days");
    expect(all("dc_dx")).toMatch(/heart failure/i);
    expect(all("dc_course")).toMatch(/Day 1: .*furosemide/);
    expect(all("dc_course")).toContain("Weight 94 kg on admission to 89.5 kg at discharge.");
    expect(all("dc_procedures")).toContain("Echocardiogram (hospital day 1)");
    expect(all("dc_meds")).toContain("New: potassium chloride 20 mg daily");
    expect(all("dc_meds")).toContain("Continue: apixaban");
    expect(all("dc_meds")).toMatch(/lisinopril 10 mg daily/);
    expect(all("dc_followup")).toContain("Referral to Cardiology");
    const dcc = (await repo.artifacts.get<import("@/lib/types").CodingResult>(dc, "coding"))!;
    expect(dcc.em.code).toBe("99238");
    await pipeline.signEncounter(doc, dc, { force: true });
    expect((await ip.admissions.get(doc, admission.id))!.status).toBe("discharged");
    expect(await ip.census(doc)).toEqual([]);
    const detail = (await ip.admissionDetail(doc, admission.id))!;
    expect(detail.encounters.map((e) => e.kind)).toEqual(["inpatient", "progress", "progress", "discharge"]);
    expect(detail.weights.map((w) => w.weight)).toEqual(["94 kg", "92 kg", "90 kg"]);
  });
});
