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
    const duchess = await all.get<{ id: string }>("SELECT e.id FROM encounters e JOIN patients p ON p.id = e.patient_id WHERE p.name = 'Duchess'");
    await signEncounter(lee, duchess!.id, { force: true });
    expect(simMessages("+15550160042")).toHaveLength(1);
  });

  it("never texts owners from a human-care practice", async () => {
    const { afterVetSign } = await import("@/lib/server/barn");
    const human = await newMember("Dr. People Pat");
    expect((await afterVetSign(human, "enc_missing")).sent).toBe(false);
  });
});
