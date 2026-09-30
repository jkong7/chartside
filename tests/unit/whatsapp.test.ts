import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-wa-"));
let server: Server;
let base = "";
const media = new Map<string, Buffer>();
const log = { gets: [] as string[], deletes: [] as string[] };
let n = 0;

function voiceNote() {
  const sid = `ME${String(++n).padStart(8, "0")}`;
  media.set(sid, readFileSync("tests/e2e/fixtures/voice.ogg"));
  return { url: `${base}/2010-04-01/Accounts/ACwa/Messages/MM${n}/Media/${sid}`, sid };
}

const wa = (from: string, extra: Record<string, string>) => ({ From: `whatsapp:${from}`, To: "whatsapp:+13125550199", WaId: from.slice(1), ProfileName: "Doc", MessageSid: `MM${n}`, NumMedia: "0", Body: "", ...extra });

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    req.resume();
    req.on("end", () => {
      if (u.pathname === "/v1/listen") {
        const lines = ["Farm call at Miller's barn.", "First horse is Biscuit, a 12 year old Quarter Horse gelding.", "Temperature 100.4, heart rate 40.", "Gave 5 cc Banamine IV.", "Stall rest for 3 days and hand walk twice a day."];
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ results: { utterances: lines.map((t, i) => ({ start: i * 3, end: i * 3 + 2, transcript: t, confidence: 0.9, speaker: 0, words: [] })) } }));
      }
      const m = /\/Media\/(ME\w+?)(\.json)?$/.exec(u.pathname);
      if (!m) return res.writeHead(404).end();
      if (req.method === "DELETE") {
        log.deletes.push(m[1]);
        media.delete(m[1]);
        return res.writeHead(204).end();
      }
      const b = media.get(m[1]);
      if (!b) return res.writeHead(404).end();
      log.gets.push(m[1]);
      res.writeHead(200, { "content-type": "audio/ogg", "content-length": b.length }).end(b);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CHARTSIDE_DB = path.join(dir, "w.db");
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  process.env.TWILIO_ACCOUNT_SID = "ACwa";
  process.env.TWILIO_AUTH_TOKEN = "wa-token";
  process.env.TWILIO_BASE_URL = base;
  process.env.DEEPGRAM_API_KEY = "unit-dg";
  process.env.DEEPGRAM_BASE_URL = base;
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

async function vet(name: string, phone: string, jurisdiction: "veterinary" | "us_hipaa" | "non_us" = "veterinary") {
  const magic = await import("@/lib/server/magic");
  const { setJurisdiction } = await import("@/lib/server/jurisdiction");
  const repo = await import("@/lib/server/repo");
  const doc = await newMember(name);
  await repo.users.update(doc.id, { prefs: { ...doc.prefs, defaultTemplate: "vet_equine", memoStandingConsent: new Date().toISOString() } });
  await magic.verifyPhone(doc.id, phone);
  if (jurisdiction !== "us_hipaa") await setJurisdiction(doc, jurisdiction);
  return (await repo.actorFor(doc.id, doc.orgId))!;
}

describe("whatsapp eligibility", () => {
  it("allows only verified clinicians in orgs HIPAA does not cover", async () => {
    const { whatsappAllowed } = await import("@/lib/server/jurisdiction");
    expect(whatsappAllowed("veterinary", true)).toBe(true);
    expect(whatsappAllowed("non_us", true)).toBe(true);
    expect(whatsappAllowed("us_hipaa", true)).toBe(false);
    expect(whatsappAllowed("veterinary", false)).toBe(false);
    expect(whatsappAllowed(null, true)).toBe(false);
  });

  it("lets only the owner change jurisdiction, and audits it", async () => {
    const { setJurisdiction, orgJurisdiction } = await import("@/lib/server/jurisdiction");
    const repo = await import("@/lib/server/repo");
    const owner = await newMember("Dr. Owner Oak");
    const staff = await newMember("Dr. Staff Sy", { orgId: owner.orgId, role: "admin" });
    await expect(setJurisdiction(staff, "veterinary")).rejects.toThrow(/owner/);
    await expect(setJurisdiction(owner, "martian")).rejects.toThrow();
    await setJurisdiction(owner, "veterinary");
    expect(await orgJurisdiction(owner.orgId)).toBe("veterinary");
    const { all } = await import("@/lib/db");
    const rows = await all<{ detail: string }>("SELECT detail FROM audit WHERE org_id = ? AND action = 'org.jurisdiction'", owner.orgId);
    expect(rows.map((r) => JSON.parse(r.detail))).toEqual([{ from: "us_hipaa", to: "veterinary" }]);
    expect(repo).toBeTruthy();
  });
});

describe("whatsapp lane", () => {
  it("refuses a US medical practice and deletes the voice note unread", async () => {
    const { inboundWhatsApp } = await import("@/lib/server/telephony/whatsappInbound");
    await vet("Dr. Human Hu", "+15550150001", "us_hipaa");
    const v = voiceNote();
    const r = await inboundWhatsApp(wa("+15550150001", { NumMedia: "1", MediaUrl0: v.url, MediaContentType0: "audio/ogg" }), "https://line.test");
    expect(r).toContain("can't take patient recordings over WhatsApp");
    expect(log.gets).not.toContain(v.sid);
    expect(log.deletes).toContain(v.sid);
  });

  it("refuses an unknown sender", async () => {
    const { inboundWhatsApp } = await import("@/lib/server/telephony/whatsappInbound");
    const v = voiceNote();
    const r = await inboundWhatsApp(wa("+15550150002", { NumMedia: "1", MediaUrl0: v.url, MediaContentType0: "audio/ogg" }), "https://line.test");
    expect(r).toContain("only for veterinary practices");
    expect(log.deletes).toContain(v.sid);
  });

  it("writes a vet's voice note and replies inline with the record and a link", async () => {
    const { inboundWhatsApp } = await import("@/lib/server/telephony/whatsappInbound");
    const { simWhatsApp } = await import("@/lib/server/telephony/whatsapp");
    const { settleCaptures } = await import("@/lib/server/capture");
    await vet("Dr. Barn Bea", "+15550150003");
    const v = voiceNote();
    const r = await inboundWhatsApp(wa("+15550150003", { NumMedia: "1", MediaUrl0: v.url, MediaContentType0: "audio/ogg" }), "https://line.test");
    expect(r).toBe("Got your 0:14 recording. Writing the note.");
    expect(log.deletes).toContain(v.sid);
    await settleCaptures();
    const msgs = simWhatsApp("+15550150003").map((m: { body: string }) => m.body);
    const all = msgs.join("\n");
    expect(all).toContain("Biscuit");
    expect(all).toMatch(/Banamine/);
    expect(all).toMatch(/Edit and sign: https:\/\/line\.test\/m\//);
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(1600);
  });

  it("skips replies outside the 24-hour window", async () => {
    const { sendWhatsApp, touchSession, inWindow } = await import("@/lib/server/telephony/whatsapp");
    expect(await sendWhatsApp("+15550150009", "hello")).toEqual({ sent: 0, skipped: "outside_window" });
    await touchSession("+15550150009", "whatsapp", new Date(Date.now() - 25 * 3600_000));
    expect((await sendWhatsApp("+15550150009", "hello")).skipped).toBe("outside_window");
    await touchSession("+15550150009", "whatsapp");
    expect(await sendWhatsApp("+15550150009", "hello")).toEqual({ sent: 1, skipped: null });
    expect(inWindow(new Date(Date.now() - 3600_000).toISOString())).toBe(true);
    expect(inWindow(null)).toBe(false);
  });
});
