import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-barn-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "b.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  delete process.env.DEEPGRAM_API_KEY;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const FARM = "Note: Farm call at Miller's barn, owner is Jane Miller, owner's number is 555-016-0042. First horse is Biscuit, a 12 year old Quarter Horse gelding. Owner reports he has been off on the left front since Tuesday. Grade 2 of 5 lameness left fore, positive hoof testers at the toe. Likely a sole abscess. Gave 2 grams bute PO and pared out the abscess. Stall rest for 3 days and soak the foot twice a day. Next horse, Duchess, a 7 year old Thoroughbred mare. Temperature 100.1, heart rate 36, gut sounds normal. Vaccinated for rabies and West Nile. Moving on to cow 214, a Holstein heifer. Palpated 90 days pregnant. Recheck at 150 days.";

async function vet(name: string, phone: string) {
  const magic = await import("@/lib/server/magic");
  const repo = await import("@/lib/server/repo");
  const { setJurisdiction } = await import("@/lib/server/jurisdiction");
  const doc = await newMember(name);
  await repo.users.update(doc.id, { prefs: { ...doc.prefs, defaultTemplate: "vet_equine" } });
  await magic.verifyPhone(doc.id, phone);
  await setJurisdiction(doc, "veterinary");
  return (await repo.actorFor(doc.id, doc.orgId))!;
}

describe("Barn Line", () => {
  it("splits a texted farm call into one record per animal and texts the vet the records", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const { settleCaptures } = await import("@/lib/server/capture");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const repo = await import("@/lib/server/repo");
    const doc = await vet("Dr. Lee Farrow", "+15550160001");
    expect(await inboundText("+15550160001", FARM, "https://line.test")).toContain("Writing the note");
    await settleCaptures();
    const list = await repo.encounters.list(doc, {});
    expect(list).toHaveLength(3);
    const pats = await repo.patients.list(doc);
    expect(pats.map((p) => p.name).sort()).toEqual(["Biscuit", "Cow 214", "Duchess"]);
    const biscuit = pats.find((p) => p.name === "Biscuit")!;
    expect(biscuit.chart.animal).toMatchObject({ species: "Equine", breed: "Quarter Horse", owner: "Jane Miller", ownerPhone: "+15550160042" });
    const byPatient = Object.fromEntries(await Promise.all(list.map(async (e) => [pats.find((p) => p.id === e.patientId)!.name, e] as const)));
    expect(byPatient.Biscuit.templateId).toBe("vet_lameness");
    expect(byPatient["Cow 214"].templateId).toBe("vet_repro");
    const note = await repo.notes.latest(byPatient.Duchess.id);
    const text = JSON.stringify(note!.content);
    expect(text).toContain("Vaccinated for rabies");
    expect(text).not.toContain("abscess");
    const vetTexts = simMessages("+15550160001").map((m: { body: string }) => m.body).join("\n");
    expect(vetTexts).toContain("Biscuit");
    expect(vetTexts).toContain("Edit and sign: https://line.test/m/");
  });

  it("texts the owner plain care instructions after the vet signs, once, and honors STOP", async () => {
    const { signEncounter } = await import("@/lib/server/pipeline");
    const { simMessages, clearSim } = await import("@/lib/server/telephony/sms");
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const all = await import("@/lib/db");
    const row = await all.get<{ user_id: string; org_id: string; id: string }>("SELECT e.user_id, e.org_id, e.id FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE p.name = 'Biscuit'");
    const lee = (await repo.actorFor(row!.user_id, row!.org_id))!;
    const { setOwnerPhone, setOwnerTexts } = await import("@/lib/server/barn");
    await setOwnerTexts(lee, true);
    const biscuit = (await repo.patients.list(lee)).find((p) => p.name === "Biscuit")!;
    await setOwnerPhone(lee, biscuit.id, { phone: biscuit.chart.animal!.ownerPhone, confirm: true });
    clearSim("+15550160042");
    const r = await signEncounter(lee, row!.id, { force: true });
    expect(r.signed).toBe(true);
    const owner = simMessages("+15550160042").map((m: { body: string }) => m.body);
    expect(owner).toHaveLength(1);
    expect(owner[0]).toMatch(/^Care instructions for Biscuit from Dr\. Lee Farrow:/);
    expect(owner[0]).toContain("Stall rest for 3 days");
    expect(owner[0]).toContain("Prepared with Chartside");
    expect(owner[0]).not.toMatch(/\b(sale|discount|offer|try)\b/i);
    expect(await inboundText("+15550160042", "STOP", "https://line.test")).toContain("won't get texts");
    const duchess = await all.get<{ id: string; patient_id: string }>("SELECT e.id, e.patient_id FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE p.name = 'Duchess'");
    await setOwnerPhone(lee, duchess!.patient_id, { phone: "+15550160042", confirm: true });
    await signEncounter(lee, duchess!.id, { force: true });
    expect(simMessages("+15550160042")).toHaveLength(1);
  });

  it("never texts owners from a human-care practice", async () => {
    const { afterVetSign } = await import("@/lib/server/barn");
    const human = await newMember("Dr. People Pat");
    expect((await afterVetSign(human, "enc_missing")).sent).toBe(false);
  });

  it("sends no owner text while the practice setting is off, which is the default", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const { settleCaptures } = await import("@/lib/server/capture");
    const { signEncounter } = await import("@/lib/server/pipeline");
    const { setOwnerPhone } = await import("@/lib/server/barn");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const repo = await import("@/lib/server/repo");
    const doc = await vet("Dr. Off Setting", "+15550160101");
    expect((await repo.orgs.get(doc.orgId))!.settings.ownerTexts).toBeUndefined();
    await inboundText("+15550160101", "Note: This is Pepper, a 9 year old Arabian mare at Stone farm, owner is Amy Stone, owner's number is 555-016-0102. Stall rest for 3 days.", "https://line.test");
    await settleCaptures();
    const pat = (await repo.patients.list(doc)).find((p) => p.name === "Pepper")!;
    await setOwnerPhone(doc, pat.id, { phone: "+15550160102", confirm: true });
    const enc = (await repo.encounters.list(doc, {}))[0];
    expect((await signEncounter(doc, enc.id, { force: true })).signed).toBe(true);
    expect(simMessages("+15550160102")).toHaveLength(0);
  });

  it("sends no owner text until the vet confirms the phone that came from speech", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const { settleCaptures } = await import("@/lib/server/capture");
    const { afterVetSign, setOwnerTexts } = await import("@/lib/server/barn");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const repo = await import("@/lib/server/repo");
    const doc = await vet("Dr. Unconfirmed", "+15550160201");
    await setOwnerTexts(doc, true);
    await inboundText("+15550160201", "Note: This is Maple, a 6 year old Morgan mare at Oak farm, owner is Ben Oak, owner's number is 555-016-0202. Stall rest for 3 days.", "https://line.test");
    await settleCaptures();
    const pat = (await repo.patients.list(doc)).find((p) => p.name === "Maple")!;
    expect(pat.chart.animal).toMatchObject({ ownerPhone: "+15550160202", ownerPhoneConfirmedAt: null });
    const enc = (await repo.encounters.list(doc, {}))[0];
    expect(await afterVetSign(doc, enc.id)).toEqual({ sent: false, reason: "unconfirmed_phone" });
    expect(simMessages("+15550160202")).toHaveLength(0);
  });

  it("files a same-name animal of another species, or with no shared owner or farm, as a new animal", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const { settleCaptures } = await import("@/lib/server/capture");
    const { setOwnerPhone } = await import("@/lib/server/barn");
    const repo = await import("@/lib/server/repo");
    const doc = await vet("Dr. Two Biscuits", "+15550160301");
    await inboundText("+15550160301", "Note: This is Biscuit, a 12 year old Quarter Horse gelding at Miller's barn, owner is Jane Miller, owner's number is 555-016-0302. Stall rest for 3 days.", "https://line.test");
    await settleCaptures();
    const horse = (await repo.patients.list(doc)).find((p) => p.name === "Biscuit")!;
    await setOwnerPhone(doc, horse.id, { phone: "+15550160302", confirm: true });
    await inboundText("+15550160301", "Note: This is Biscuit, a 4 year old Labrador dog, owner is Jane Miller, owner's number is 555-016-0399. Recheck in 2 weeks.", "https://line.test");
    await inboundText("+15550160301", "Note: This is Biscuit, a 10 year old Quarter Horse gelding. Recheck in 2 weeks.", "https://line.test");
    await inboundText("+15550160301", "Note: This is Biscuit, a 12 year old Quarter Horse gelding at Miller's barn, owner is Jane Miller, owner's number is 555-016-0377. Recheck in 2 weeks.", "https://line.test");
    await inboundText("+15550160301", "Note: This is Biscuit, a 12 year old Quarter Horse gelding at Miller's barn, owner is Jane Miller. Recheck in 2 weeks.", "https://line.test");
    await settleCaptures();
    const all = (await repo.patients.list(doc)).filter((p) => p.name === "Biscuit");
    expect(all).toHaveLength(4);
    const same = (await repo.patients.get(doc, horse.id))!;
    expect(same.chart.animal).toMatchObject({ ownerPhone: "+15550160302" });
    expect(same.chart.animal!.ownerPhoneConfirmedAt).toBeTruthy();
    expect((await repo.encounters.list(doc, { patientId: horse.id })).length).toBe(2);
    expect(all.find((p) => p.chart.animal!.ownerPhone === "+15550160399")!.chart.animal!.species).not.toBe("Equine");
  });

  it("reads the owner's name whatever the case of the word owner", async () => {
    const { profileFrom } = await import("@/lib/engine/vet");
    expect(profileFrom("Owner is Jane Miller. Horse is lame.").owner).toBe("Jane Miller");
    expect(profileFrom("OWNER IS Jane Miller.").owner).toBe("Jane Miller");
    expect(profileFrom("Client is Bob Stone.").owner).toBe("Bob Stone");
  });

  it("lets only the practice owner turn owner texts on, and logs it", async () => {
    const { setOwnerTexts } = await import("@/lib/server/barn");
    const repo = await import("@/lib/server/repo");
    const all = await import("@/lib/db");
    const owner = await vet("Dr. Org Owner", "+15550160401");
    const member = await newMember("Dr. Member", { orgId: owner.orgId, role: "clinician" });
    await expect(setOwnerTexts(member, true)).rejects.toThrow(/owner/);
    expect(await setOwnerTexts(owner, true)).toBe(true);
    expect((await repo.orgs.get(owner.orgId))!.settings.ownerTexts).toBe(true);
    const log = await all.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit WHERE org_id = ? AND action = 'org.owner_texts'", owner.orgId);
    expect(Number(log!.n)).toBe(1);
  });
});
