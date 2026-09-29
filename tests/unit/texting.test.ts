import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-texting-"));
const sent: { to: string; body: string; kind: string }[] = [];

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  process.env.CHARTSIDE_TZ = "America/Chicago";
  const { setTransport } = await import("@/lib/server/delivery");
  setTransport(async (m) => {
    sent.push({ to: m.to, body: m.body, kind: m.kind });
    return { status: "sent", transport: "custom", id: "t" };
  });
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const PHI = /(Ruth|Hale|hypertension|lisinopril|blood pressure|MRN|\bI10\b)/i;

async function pendingNote(user: import("@/lib/server/repo").User) {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const pat = await repo.patients.create(user, { mrn: String(Math.random()).slice(2, 8), name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
  const enc = await repo.encounters.create(user, { scheduledAt: new Date().toISOString(), patientId: pat.id, reason: "Hypertension follow-up", visitType: "follow-up" });
  await pipeline.recordConsent(user, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, [
    { speaker: "clinician", text: "Your blood pressure today is 152 over 94, so hypertension is not controlled.", tStart: 0, tEnd: 3 },
    { speaker: "clinician", text: "Let's increase lisinopril to 20 milligrams daily and follow up in 4 weeks.", tStart: 4, tEnd: 7 },
  ]);
  await repo.encounters.update(user, enc.id, { status: "processing", durationS: 600 });
  await pipeline.processEncounter(user, enc.id, { engine: "local" });
}

describe("texting the line", () => {
  it("summarizes a queue without patient details", async () => {
    const { queueLine } = await import("@/lib/server/telephony/texting");
    expect(queueLine({ total: 0, urgent: 0, byKind: {} })).toBe("Your stack is clear. Nothing is waiting on you.");
    expect(queueLine({ total: 4, urgent: 1, byKind: { "note.sign": 3, "message.reply": 1 } })).toBe("3 notes to sign, 1 patient message. 1 marked urgent. About 5 min to clear.");
  });

  it("pitches the line to an unknown number", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const reply = await inboundText("+13125550111", "what is this", "https://line.test");
    expect(reply).toContain("AI scribe you can call");
    expect(reply).toContain("https://line.test/line?src=text");
  });

  it("answers status, link, help and stop for a verified clinician, never with PHI", async () => {
    const magic = await import("@/lib/server/magic");
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const doc = await newMember("Dr. Ada Park");
    await magic.verifyPhone(doc.id, "+13125550122");
    await pendingNote(doc);
    const status = await inboundText("(312) 555-0122", "STATUS", "https://line.test");
    expect(status).toMatch(/^Chartside: 1 note to sign\. About 1 min to clear\. Open: https:\/\/line\.test\/m\//);
    expect(status).not.toMatch(PHI);
    expect(await inboundText("+13125550122", "link", "https://line.test")).toMatch(/^Your stack: https:\/\/line\.test\/m\//);
    expect(await inboundText("+13125550122", "help", "https://line.test")).toContain("never include patient details");
    const other = await inboundText("+13125550122", "what was Ruth's blood pressure", "https://line.test");
    expect(other).toContain("can't read or send patient details by text");
    expect(other).not.toMatch(PHI);
    expect(await inboundText("+13125550122", "stop", "https://line.test")).toContain("won't get texts");
    const repo = await import("@/lib/server/repo");
    expect((await repo.users.byId(doc.id))!.prefs.textOptOut).toBe(true);
    expect(await inboundText("+13125550122", "start", "https://line.test")).toContain("back on");
  });

  it("sets an afternoon nudge time from a bare hour", async () => {
    const magic = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const doc = await newMember("Dr. Lee Hart");
    await magic.verifyPhone(doc.id, "+13125550133");
    expect(await inboundText("+13125550133", "nudge 5", "https://line.test")).toContain("5 PM");
    expect((await repo.users.byId(doc.id))!.prefs.clinicNudgeHour).toBe(17);
    const hourOf = async (body: string) => (await inboundText("+13125550133", body, "https://line.test"), (await repo.users.byId(doc.id))!.prefs.clinicNudgeHour);
    expect(await hourOf("remind me at 9pm")).toBe(20);
    expect(await hourOf("remind me at 4 pm")).toBe(16);
    expect(await hourOf("nudge me 1:30")).toBe(13);
    expect(await hourOf("remind me in 30 minutes")).toBe(17);
    expect(await hourOf("nudge the team")).toBe(17);
  });

  it("sends one PHI-free end-of-clinic nudge at the chosen hour and skips empty stacks", async () => {
    const magic = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { sendClinicNudges } = await import("@/lib/server/telephony/texting");
    const at = new Date("2026-09-29T22:05:00Z");
    const busy = await newMember("Dr. Busy Bee");
    await magic.verifyPhone(busy.id, "+13125550144");
    await repo.users.update(busy.id, { prefs: { ...busy.prefs, clinicNudgeHour: 17 } });
    await pendingNote(busy);
    const idle = await newMember("Dr. Idle Ivy");
    await magic.verifyPhone(idle.id, "+13125550155");
    await repo.users.update(idle.id, { prefs: { ...idle.prefs, clinicNudgeHour: 17 } });
    const before = sent.length;
    const first = await sendClinicNudges(at);
    expect(first.hour).toBe(17);
    const mine = sent.slice(before).filter((m) => m.kind === "clinic_nudge");
    expect(mine.map((m) => m.to)).toEqual(["+13125550144"]);
    expect(mine[0].body).toMatch(/^Chartside: 1 note to sign\. About 1 min to clear\. Clear it before you leave: https:\/\/line\.test\/m\//);
    expect(mine[0].body).not.toMatch(PHI);
    await sendClinicNudges(new Date(at.getTime() + 10 * 60_000));
    expect(sent.slice(before).filter((m) => m.kind === "clinic_nudge")).toHaveLength(1);
    const early = await sendClinicNudges(new Date("2026-09-29T20:05:00Z"));
    expect(early.sent).toBe(0);
  });

  it("answers SCHEDULE with a count and first time, and sends an opt-in morning brief once", async () => {
    const magic = await import("@/lib/server/magic");
    const repo = await import("@/lib/server/repo");
    const { inboundText, sendClinicNudges, dayLine } = await import("@/lib/server/telephony/texting");
    const doc = await newMember("Dr. Early Bird");
    await magic.verifyPhone(doc.id, "+13125550166");
    const pat = await repo.patients.create(doc, { mrn: "77", name: "Ruth Hale", dob: "1950-03-04", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [], coverage: { payer: "Medicare" } } });
    await repo.encounters.create(doc, { scheduledAt: "2026-09-29T14:30:00Z", patientId: pat.id, reason: "Hypertension", visitType: "follow-up" });
    await repo.encounters.create(doc, { scheduledAt: "2026-09-29T16:00:00Z", patientId: pat.id, reason: "Hypertension", visitType: "follow-up" });
    const at = new Date("2026-09-29T12:05:00Z");
    expect((await dayLine(doc, at)).text).toBe("2 visits today, starting at 9:30 AM.");
    expect(await inboundText("+13125550166", "brief 7", "https://line.test")).toContain("7 AM");
    expect((await repo.users.byId(doc.id))!.prefs.morningBriefHour).toBe(7);
    const before = sent.length;
    const r = await sendClinicNudges(at);
    expect(r.briefs).toBe(1);
    const mine = sent.slice(before).filter((m) => m.kind === "morning_brief");
    expect(mine).toHaveLength(1);
    expect(mine[0].body).toBe("Chartside: 2 visits today, starting at 9:30 AM. Call the line before each visit. Reply STOP to end these.");
    expect(mine[0].body).not.toMatch(PHI);
    await sendClinicNudges(new Date(at.getTime() + 15 * 60_000));
    expect(sent.slice(before).filter((m) => m.kind === "morning_brief")).toHaveLength(1);
    const reply = await inboundText("+13125550166", "schedule", "https://line.test");
    expect(reply).toMatch(/^Chartside: (No visits on your schedule today\.|\d+ visits? today, starting at )/);
    expect(reply).not.toMatch(PHI);
  });

  it("finds the clinic's day correctly across daylight saving changes", async () => {
    const { dayBounds } = await import("@/lib/server/telephony/texting");
    const tz = "America/Chicago";
    expect(dayBounds(new Date("2027-03-14T15:00:00Z"), tz)).toEqual({ from: "2027-03-14T06:00:00.000Z", to: "2027-03-15T05:00:00.000Z" });
    expect(dayBounds(new Date("2026-11-01T15:00:00Z"), tz)).toEqual({ from: "2026-11-01T05:00:00.000Z", to: "2026-11-02T06:00:00.000Z" });
    expect(dayBounds(new Date("2026-09-29T04:30:00Z"), tz)).toEqual({ from: "2026-09-28T05:00:00.000Z", to: "2026-09-29T05:00:00.000Z" });
  });
});
