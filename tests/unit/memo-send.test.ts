import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-memo-send-"));

beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "s.db");
  process.env.CHARTSIDE_DATA = dir;
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  delete process.env.DEEPGRAM_API_KEY;
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const NOTE = "Note: This is Biscuit, a 12 year old Quarter Horse gelding. Grade 2 of 5 lameness left fore. Likely a sole abscess. Stall rest for 3 days.";

async function vetWithNote(name: string, phone: string) {
  const magic = await import("@/lib/server/magic");
  const repo = await import("@/lib/server/repo");
  const { setJurisdiction } = await import("@/lib/server/jurisdiction");
  const { dictateByText } = await import("@/lib/server/telephony/memos");
  const { settleCaptures } = await import("@/lib/server/capture");
  const { clearSim } = await import("@/lib/server/telephony/sms");
  const doc = await newMember(name);
  await repo.users.update(doc.id, { prefs: { ...doc.prefs, defaultTemplate: "vet_equine" } });
  await magic.verifyPhone(doc.id, phone);
  await setJurisdiction(doc, "veterinary");
  const u = (await repo.actorFor(doc.id, doc.orgId))!;
  await dictateByText(u, phone, "mms", NOTE);
  await settleCaptures();
  const ids = (await repo.encounters.list(u, {})).map((e) => e.id);
  clearSim(phone);
  return { u, ids };
}

describe("memo ready texts decide content at send time", () => {
  it("sends the record inline while the encounter's practice is veterinary", async () => {
    const { notifyReady } = await import("@/lib/server/telephony/memos");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const { u, ids } = await vetWithNote("Dr. Inline Vet", "+15550170001");
    await notifyReady(u, "+15550170001", "mms", null, { ok: true, encounterIds: ids }, "text");
    expect(simMessages("+15550170001").map((m: { body: string }) => m.body).join("\n")).toContain("Biscuit");
  });

  it("sends only a PHI-free link once the encounter's practice is a US human practice, even over WhatsApp", async () => {
    const { notifyReady } = await import("@/lib/server/telephony/memos");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const { setJurisdiction } = await import("@/lib/server/jurisdiction");
    const { simWhatsApp, touchSession } = await import("@/lib/server/telephony/whatsapp");
    const { u, ids } = await vetWithNote("Dr. Flipped Vet", "+15550170002");
    await setJurisdiction(u, "us_hipaa");
    await notifyReady(u, "+15550170002", "mms", null, { ok: true, encounterIds: ids }, "text");
    const sms = simMessages("+15550170002").map((m: { body: string }) => m.body);
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatch(/^Chartside: your note from the text is ready\. Review and sign: https:\/\/line\.test\/m\//);
    expect(sms[0]).not.toMatch(/Biscuit|abscess|lame/i);
    await touchSession("+15550170002", "whatsapp");
    await notifyReady(u, "+15550170002", "whatsapp", null, { ok: true, encounterIds: ids }, "text");
    const wa = simWhatsApp("+15550170002").map((m: { body: string }) => m.body);
    expect(wa).toHaveLength(1);
    expect(wa[0]).not.toMatch(/Biscuit|abscess|lame/i);
  });

  it("sends nothing when the actor's practice is not the encounter's practice", async () => {
    const { notifyReady } = await import("@/lib/server/telephony/memos");
    const { simMessages } = await import("@/lib/server/telephony/sms");
    const { ids } = await vetWithNote("Dr. Owner Of Note", "+15550170003");
    const other = await newMember("Dr. Someone Else");
    await notifyReady(other, "+15550170004", "mms", null, { ok: true, encounterIds: ids }, "text");
    expect(simMessages("+15550170004")).toHaveLength(0);
  });
});
