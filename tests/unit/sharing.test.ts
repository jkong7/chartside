import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-share-"));
const mail: { to: string; body: string }[] = [];
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.SENDGRID_API_KEY = "k";
  process.env.CHARTSIDE_EMAIL_FROM = "notes@x.test";
  process.env.SENDGRID_BASE_URL = "http://mail.test";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    mail.push({ to: b.personalizations[0].to[0].email, body: b.content[0].value });
    return new Response(null, { status: 202, headers: { "x-message-id": "m1" } });
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

async function visit(doc: import("@/lib/server/repo").User, template = "soap") {
  const repo = await import("@/lib/server/repo");
  const pipeline = await import("@/lib/server/pipeline");
  const p = await repo.patients.create(doc, { mrn: String(Math.random()).slice(2, 8), name: "Ruth Alvarez", dob: "1955-02-02", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
  const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Hypertension", templateId: template });
  await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
  await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 150 over 94, so let's start lisinopril 10 milligrams daily for your hypertension.", tStart: 0, tEnd: 5 }]);
  await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 600 });
  await pipeline.processEncounter(doc, enc.id, { engine: "local" });
  return enc.id;
}

describe("visit sharing", () => {
  it("gives colleagues view or edit access, and only edit access opens the visit", async () => {
    const repo = await import("@/lib/server/repo");
    const sh = await import("@/lib/server/sharing");
    const doc = await newMember("Dr. Hana Ito");
    const peer = await newMember("Dr. Omar Said", { orgId: doc.orgId });
    const outsider = await newMember("Dr. Elsewhere");
    const encId = await visit(doc);
    expect(await repo.encounters.get(peer, encId)).toBeUndefined();
    await expect(sh.shareWithMember(peer, encId, { userId: doc.id })).rejects.toThrow("not found");
    await expect(sh.shareWithMember(doc, encId, { userId: outsider.id })).rejects.toThrow("active member");
    const s = await sh.shareWithMember(doc, encId, { userId: peer.id, access: "view", message: "Curbside on BP plan" });
    expect(await repo.encounters.get(peer, encId)).toBeUndefined();
    const v = (await sh.memberView(peer, s.id))!;
    expect(v.noteText).toMatch(/lisinopril/);
    expect(await sh.memberView(outsider, s.id)).toBeNull();
    expect((await sh.sharedWithMe(peer))[0]).toMatchObject({ patientName: "Ruth Alvarez", ownerName: "Dr. Hana Ito", access: "view" });
    const s2 = await sh.shareWithMember(doc, encId, { userId: peer.id, access: "edit" });
    expect(s2.id).toBe(s.id);
    expect((await repo.encounters.get(peer, encId))?.id).toBe(encId);
    await sh.revokeShare(doc, encId, s.id);
    expect(await repo.encounters.get(peer, encId)).toBeUndefined();
    expect(await sh.memberView(peer, s.id)).toBeNull();
    expect((await sh.listShares(doc, encId))[0].views).toBe(1);
  });

  it("protects external links with an emailed one-time code and blocks sensitive notes", async () => {
    const repo = await import("@/lib/server/repo");
    const sh = await import("@/lib/server/sharing");
    const doc = await newMember("Dr. Lena Park");
    const encId = await visit(doc);
    const { url, delivery } = await sh.shareExternal(doc, encId, { email: "Cardio@Partner.org", days: 7, message: "Please see before Friday" }, "https://app.test");
    expect(delivery).toBe("sent");
    const token = url.split("/x/")[1];
    expect(mail.at(-1)).toMatchObject({ to: "cardio@partner.org" });
    expect(mail.at(-1)!.body).toContain(url);
    expect(mail.at(-1)!.body).not.toContain("Lena Park shared a visit note with you (patient Ruth");
    expect(await sh.externalInfo(token)).toMatchObject({ email: "c•••@partner.org", from: "Dr. Lena Park" });
    expect(await sh.externalView(token, undefined)).toBeNull();
    await sh.sendCode(token);
    const code = /\b(\d{6})\b/.exec(mail.at(-1)!.body)![1];
    const bad = code === "000000" ? "111111" : "000000";
    await expect(sh.verifyCode(token, bad)).rejects.toThrow("isn't right");
    const { cookie } = await sh.verifyCode(token, code);
    await expect(sh.verifyCode(token, code)).rejects.toThrow("new code");
    const view = (await sh.externalView(token, cookie))!;
    expect(view.noteText).toMatch(/lisinopril/);
    expect(view.message).toBe("Please see before Friday");
    expect(await sh.externalView("nope", cookie)).toBeNull();
    const outbox = await (await import("@/lib/server/notify")).outboxFor(doc);
    expect(outbox.map((o) => o.kind)).toEqual(expect.arrayContaining(["share_link", "share_code"]));
    const share = (await sh.listShares(doc, encId))[0];
    await sh.revokeShare(doc, encId, share.id);
    expect(await sh.externalView(token, cookie)).toBeNull();
    expect(await sh.externalInfo(token)).toBeNull();
    const bh = await visit(doc, "bh_psychotherapy");
    await expect(sh.shareExternal(doc, bh, { email: "a@b.org" }, "https://app.test")).rejects.toThrow("Behavioral health");
    const org = (await repo.orgs.get(doc.orgId))!;
    await repo.orgs.update(org.id, { settings: { ...org.settings, sharing: { external: false } } });
    await expect(sh.shareExternal(doc, encId, { email: "a@b.org" }, "https://app.test")).rejects.toThrow("turned off external sharing");
  });

  it("locks the link after five wrong codes", async () => {
    const sh = await import("@/lib/server/sharing");
    const doc = await newMember("Dr. Ada Brooks");
    const encId = await visit(doc);
    const { url } = await sh.shareExternal(doc, encId, { email: "x@y.org" }, "https://app.test");
    const token = url.split("/x/")[1];
    await sh.sendCode(token);
    const code = /\b(\d{6})\b/.exec(mail.at(-1)!.body)![1];
    const wrong = code === "999999" ? "888888" : "999999";
    for (let i = 0; i < 5; i++) await expect(sh.verifyCode(token, wrong)).rejects.toThrow();
    await expect(sh.verifyCode(token, code)).rejects.toThrow("Too many tries");
  });
});
