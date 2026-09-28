import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { draftReply, triageMessage } from "@/lib/engine/messages";
import { detectTasks, intervalDays } from "@/lib/engine/tasks";
import type { Chart, StagedOrder, Utterance } from "@/lib/types";
import { demo } from "./helpers";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-inbox-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const chart: Chart = {
  problems: [{ name: "Essential hypertension", icd10: "I10" }],
  medications: [{ name: "lisinopril", dose: "10 mg", frequency: "daily" }, { name: "metformin", dose: "500 mg", frequency: "twice daily" }],
  allergies: [],
  labs: [
    { name: "Hemoglobin A1c", value: "8.4 %", date: "2026-09-10", flag: "high" },
    { name: "LDL", value: "96 mg/dL", date: "2026-09-10", flag: "normal" },
  ],
};

describe("post-visit task detection", () => {
  it("parses follow-up intervals", () => {
    expect(intervalDays("follow up in 3 months")).toBe(90);
    expect(intervalDays("see you in two weeks")).toBe(14);
    expect(intervalDays("return in a couple of weeks")).toBe(14);
    expect(intervalDays("see you next year")).toBe(365);
    expect(intervalDays("as needed")).toBeNull();
  });

  it("finds follow-ups, results to review, referrals, paperwork, and callbacks with evidence", () => {
    const { facts, utterances } = demo("gonzalez");
    const orders: StagedOrder[] = [
      { id: "o1", kind: "lab", name: "Basic metabolic panel", detail: "", status: "accepted", evidence: ["u20"], alerts: [], problem: "Hypertension" },
      { id: "o2", kind: "referral", name: "Ophthalmology referral", detail: "Diabetic eye exam", status: "staged", evidence: ["u21"], alerts: [], problem: "" },
      { id: "o3", kind: "imaging", name: "Chest X-ray", detail: "", status: "rejected", evidence: [], alerts: [], problem: "" },
    ];
    const extra: Utterance[] = [
      { id: "x1", seq: 90, speaker: "patient", text: "Could you also give me a note for work for today?", tStart: 0, tEnd: 1 },
      { id: "x2", seq: 91, speaker: "clinician", text: "Sure. I'll call you when the results come back.", tStart: 1, tEnd: 2 },
    ];
    const tasks = detectTasks(facts, orders, [...utterances, ...extra], { at: new Date("2026-09-28T15:00:00Z"), paServices: ["CGM"] });
    const keys = tasks.map((t) => t.key);
    expect(keys).toEqual(expect.arrayContaining(["result:basic metabolic panel", "referral:ophthalmology referral", "doc:work note", "callback", "pa:cgm"]));
    expect(keys).not.toContain("result:chest x-ray");
    if (facts.followUp) expect(keys).toContain("follow_up");
    expect(tasks.find((t) => t.key === "doc:work note")!.evidence).toEqual(["x1"]);
    expect(tasks.find((t) => t.key === "callback")!.title).toBe("Call patient with results");
  });
});

describe("patient message triage and drafting", () => {
  it("escalates emergencies and self-harm and adds crisis resources", () => {
    const t = triageMessage("I have chest pain and I can't breathe", chart);
    expect(t).toMatchObject({ urgency: "emergency", reasons: ["chest pain", "trouble breathing"] });
    const s = triageMessage("I don't want to live anymore, I think about ending my life", chart);
    expect(s.urgency).toBe("emergency");
    const d = draftReply("", s, { patientFirst: "Ana", clinician: "Dr. Chen", chart });
    expect(d.text).toContain("988");
    expect(d.text).toContain("call 911");
    expect(triageMessage("My fever is 102 and I keep vomiting", chart).urgency).toBe("same_day");
    expect(triageMessage("Can I reschedule my appointment?", chart)).toMatchObject({ urgency: "routine", intent: "appointment" });
  });

  it("drafts a refill reply from the chart and a results reply that explains each value", () => {
    const refill = triageMessage("I'm almost out of my lisinopril, can you send more?", chart);
    expect(refill).toMatchObject({ intent: "refill", meds: ["lisinopril"] });
    const d = draftReply("", refill, { patientFirst: "Maria", clinician: "Dr. Avery Chen", chart, lastVisit: { date: new Date().toISOString(), plan: [] } });
    expect(d.text).toContain("I sent a refill of lisinopril 10 mg daily to your pharmacy.");
    expect(d.placeholders).toBe(0);
    expect(d.actions).toEqual([{ kind: "refill", title: "Send refill: lisinopril 10 mg daily" }]);
    const stale = draftReply("", refill, { patientFirst: "Maria", clinician: "Dr. Avery Chen", chart, lastVisit: { date: "2024-01-01", plan: [] } });
    expect(stale.text).toContain("30-day supply");

    const res = triageMessage("What does my A1c result mean?", chart);
    expect(res).toMatchObject({ intent: "result", labs: ["Hemoglobin A1c"] });
    const r = draftReply("", res, { patientFirst: "Maria", clinician: "Dr. Avery Chen", chart, lastVisit: { date: "2026-09-10", plan: ["Increase metformin to 1000 mg twice daily"] } });
    expect(r.text).toContain("Your Hemoglobin A1c was 8.4 % on September 10. That is above our goal of under 7%.");
    expect(r.text).toContain("Increase metformin to 1000 mg twice daily");
    expect(r.placeholders).toBe(1);
  });

  it("replies in Spanish when the patient writes in Spanish", () => {
    const t = triageMessage("Hola, mi hija tiene fiebre de 102 desde anoche y está vomitando", chart);
    expect(t).toMatchObject({ lang: "es", urgency: "same_day" });
    const d = draftReply("", t, { patientFirst: "Lucia", clinician: "Dr. Chen", chart });
    expect(d.text.startsWith("Hola Lucia:")).toBe(true);
    expect(d.text).toContain("llame al 911");
  });
});

describe("inbox flow", () => {
  it("receives a visit-link message, drafts a reply, blocks unresolved markers, sends, and creates tasks", async () => {
    const repo = await import("@/lib/server/repo");
    const inbox = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Avery Chen");
    const other = await newMember("Dr. Ben Brooks", { orgId: doc.orgId, role: "clinician" });
    const scribe = await newMember("Sam Scribe", { orgId: doc.orgId, role: "scribe" });
    const p = await repo.patients.create(doc, { mrn: "5", name: "Maria Gonzalez", dob: "1968-03-14", sex: "F", pronouns: "she/her", language: "en", chart });
    const urgent = await inbox.receiveMessage({ orgId: doc.orgId, patient: p, assigneeId: doc.id, body: "Crushing chest pain since an hour ago", channel: "portal" });
    const routine = await inbox.receiveMessage({ orgId: doc.orgId, patient: p, assigneeId: doc.id, body: "I'm running out of lisinopril, please refill", channel: "portal" });
    const list = await inbox.messages.list(doc, { open: true });
    expect(list.map((m) => m.id)).toEqual([urgent, routine]);
    expect((await inbox.tasks.forUser(doc)).map((t) => t.title)).toEqual([expect.stringContaining("Call now: Maria Gonzalez (chest pain)")]);
    expect(await inbox.messages.get(other, routine)).toBeUndefined();
    expect((await inbox.messages.get(scribe, routine))?.id).toBe(routine);

    const drafted = await inbox.prepareDraft(doc, routine);
    expect(drafted.status).toBe("drafted");
    expect(drafted.draftMeta?.engine).toBe("local");
    await expect(inbox.sendReply(scribe, routine, {})).rejects.toThrow("Only Dr. Avery Chen can send");
    await expect(inbox.sendReply(doc, routine, { text: "Hi Maria, *** thanks" })).rejects.toThrow("Replace every ***");
    const sent = await inbox.sendReply(doc, routine, { actions: [drafted.draftMeta!.actions[0].title, "Made up action"] });
    expect(sent.status).toBe("replied");
    expect(sent.reply).toContain("lisinopril");
    await expect(inbox.sendReply(doc, routine, {})).rejects.toThrow("already answered");
    const open = await inbox.tasks.forUser(doc);
    expect(open.map((t) => t.kind).sort()).toEqual(["callback", "refill"]);
    await inbox.sendReply(doc, urgent, { text: "Hi Maria, please call 911 now. We are calling you as well." });
    expect((await inbox.tasks.forUser(doc)).map((t) => t.kind).sort()).toEqual(["callback", "refill"]);
    const box = await inbox.inboxFor(doc);
    expect(box.counts).toMatchObject({ messages: 0, tasks: 2, due: 1 });
    expect((await repo.audit.forOrg(doc.orgId)).map((a) => a.action)).toEqual(expect.arrayContaining(["message.received", "message.drafted", "message.replied"]));
  });

  it("syncs auto tasks with the visit and keeps completed ones closed", async () => {
    const repo = await import("@/lib/server/repo");
    const inbox = await import("@/lib/server/inbox");
    const pipeline = await import("@/lib/server/pipeline");
    const doc = await newMember("Dr. Tess Tasks");
    const p = await repo.patients.create(doc, { mrn: "6", name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart });
    const enc = await repo.encounters.create(doc, { scheduledAt: "2026-09-28T14:00:00.000Z", patientId: p.id, reason: "BP follow-up" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, [
      { speaker: "clinician", text: "Your blood pressure is 152 over 94. Let's increase lisinopril to 20 milligrams daily and check a basic metabolic panel.", tStart: 0, tEnd: 5 },
      { speaker: "patient", text: "Okay. Can you write me a note for work too?", tStart: 5, tEnd: 8 },
      { speaker: "clinician", text: "Yes. Follow up in 4 weeks. I'll call you with the results.", tStart: 8, tEnd: 12 },
    ]);
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const first = await inbox.tasks.forEncounter(enc.id);
    expect(first.map((t) => t.kind)).toEqual(expect.arrayContaining(["follow_up", "result_review", "document", "callback"]));
    const fu = first.find((t) => t.kind === "follow_up")!;
    expect(fu.title).toBe("Schedule follow-up in 4 weeks");
    await inbox.tasks.setStatus(doc, fu.id, "done");
    const lab = (await repo.orders.list(enc.id)).find((o) => o.kind === "lab")!;
    await repo.orders.setStatus(enc.id, lab.id, "rejected");
    const again = await inbox.syncTasks(doc, (await repo.encounters.get(doc, enc.id))!);
    expect(again.find((t) => t.kind === "follow_up")!.status).toBe("done");
    expect(again.some((t) => t.kind === "result_review")).toBe(false);
  });
});
