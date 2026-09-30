import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-memo-"));
let server: Server;
let base = "";
const media = new Map<string, { body: Buffer; type: string }>();
const log = { gets: [] as string[], deletes: [] as string[], badAuth: 0 };
let transcript: string[] = ["Follow up for knee pain, doing better with therapy.", "Knee exam shows no swelling.", "Continue physical therapy and recheck in six weeks."];
const auth = `Basic ${Buffer.from("ACunit:unit-token").toString("base64")}`;
let n = 0;
let sids = 0;

function addMedia(opts: { file?: string; bytes?: number; type?: string } = {}) {
  const sid = `ME${String(++n).padStart(8, "0")}`;
  media.set(sid, { body: opts.bytes ? Buffer.alloc(opts.bytes) : readFileSync(`tests/e2e/fixtures/${opts.file ?? "visit.wav"}`), type: opts.type ?? "audio/wav" });
  return { url: `${base}/2010-04-01/Accounts/ACunit/Messages/MM${n}/Media/${sid}`, sid };
}

function mms(from: string, items: { url: string }[], type = "audio/wav", body = "") {
  const p: Record<string, string> = { From: from, To: "+13125550199", Body: body, MessageSid: `MM${n}S${++sids}`, NumMedia: String(items.length) };
  items.forEach((it, i) => {
    p[`MediaUrl${i}`] = it.url;
    p[`MediaContentType${i}`] = type;
  });
  return p;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (u.pathname === "/v1/listen") {
        const utterances = transcript.map((t, i) => ({ start: i * 4, end: i * 4 + 3, transcript: t, confidence: 0.95, speaker: 0, words: [] }));
        return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ results: { utterances } }));
      }
      const m = /\/Media\/(ME\w+?)(\.json)?$/.exec(u.pathname);
      if (!m) return res.writeHead(404).end();
      if (req.headers.authorization !== auth) {
        log.badAuth++;
        return res.writeHead(401).end();
      }
      if (req.method === "DELETE") {
        log.deletes.push(m[1]);
        media.delete(m[1]);
        return res.writeHead(204).end();
      }
      const item = media.get(m[1]);
      if (!item) return res.writeHead(404).end();
      log.gets.push(m[1]);
      res.writeHead(200, { "content-type": item.type, "content-length": item.body.length }).end(item.body);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CHARTSIDE_DB = path.join(dir, "m.db");
  process.env.CHARTSIDE_DATA = dir;
  process.env.CHARTSIDE_SECRET = "unit-test-secret";
  process.env.CHARTSIDE_ENGINE = "local";
  process.env.CHARTSIDE_PUBLIC_URL = "https://line.test";
  process.env.TWILIO_ACCOUNT_SID = "ACunit";
  process.env.TWILIO_AUTH_TOKEN = "unit-token";
  process.env.TWILIO_BASE_URL = base;
  process.env.DEEPGRAM_API_KEY = "unit-dg";
  process.env.DEEPGRAM_BASE_URL = base;
  process.env.CHARTSIDE_MEMO_MAX_MB = "2";
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const PHI = /(knee|therapy|swelling|Biscuit|lame|bute|Banamine)/i;

async function settle() {
  const { settleCaptures } = await import("@/lib/server/capture");
  await settleCaptures();
}

async function texts(phone: string) {
  const { simMessages } = await import("@/lib/server/telephony/sms");
  return simMessages(phone).map((m: { body: string }) => m.body);
}

async function clinician(name: string, phone: string) {
  const magic = await import("@/lib/server/magic");
  const doc = await newMember(name);
  await magic.verifyPhone(doc.id, phone);
  return doc;
}

describe("text a voice memo to the line", () => {
  it("holds a memo until YES, deletes Twilio's copy, and texts a PHI-free link when the note is ready", async () => {
    const { inboundSms, inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const doc = await clinician("Dr. Memo Moss", "+15550140001");
    const m = addMedia();
    const reply = await inboundSms(mms("+15550140001", [m]), "https://line.test");
    expect(reply).toMatch(/^Got your 0:22 recording\. Reply YES if your patient agreed to be recorded/);
    expect(log.gets).toContain(m.sid);
    expect(log.deletes).toContain(m.sid);
    expect(media.has(m.sid)).toBe(false);
    expect(readdirSync(path.join(dir, "memo-holds")).length).toBeGreaterThan(0);
    expect(readFileSync(path.join(dir, "memo-holds", readdirSync(path.join(dir, "memo-holds"))[0])).subarray(0, 4).toString()).not.toBe("RIFF");
    expect((await repo.encounters.list(doc, {})).length).toBe(0);
    const yes = await inboundText("+15550140001", "YES", "https://line.test");
    expect(yes).toContain("Writing the note from your 0:22 recording");
    expect(yes).toContain("reply ALWAYS");
    await settle();
    const list = await repo.encounters.list(doc, {});
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe("review");
    const consent = await repo.consents.latest(list[0].id);
    expect(consent?.method).toBe("text-confirmed");
    const sent = await texts("+15550140001");
    expect(sent.at(-1)).toMatch(/^Chartside: your note from the 0:22 recording is ready\. Review and sign: https:\/\/line\.test\/m\//);
    expect(sent.join(" ")).not.toMatch(PHI);
    expect(readdirSync(path.join(dir, "memo-holds"))).toHaveLength(0);
  });

  it("discards the audio on NO and keeps nothing", async () => {
    const { inboundSms, inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const doc = await clinician("Dr. No Nash", "+15550140002");
    await inboundSms(mms("+15550140002", [addMedia({ file: "memo.m4a", type: "audio/mp4" })], "audio/mp4"), "https://line.test");
    expect(await inboundText("+15550140002", "no", "https://line.test")).toContain("Deleted. Nothing from that recording was kept.");
    await settle();
    expect(await repo.encounters.list(doc, {})).toHaveLength(0);
    expect(readdirSync(path.join(dir, "memo-holds"))).toHaveLength(0);
  });

  it("drops an unconfirmed memo once the hold times out", async () => {
    const { inboundSms } = await import("@/lib/server/telephony/texting");
    const { purgeMemoHolds, heldMemos } = await import("@/lib/server/telephony/memos");
    await clinician("Dr. Late Lee", "+15550140003");
    await inboundSms(mms("+15550140003", [addMedia()]), "https://line.test");
    expect(await heldMemos("+15550140003")).toHaveLength(1);
    await purgeMemoHolds(new Date(Date.now() + 25 * 3600_000));
    expect(await heldMemos("+15550140003")).toHaveLength(0);
    expect(readdirSync(path.join(dir, "memo-holds"))).toHaveLength(0);
  });

  it("lets a verified clinician turn on standing consent once, then writes memos right away", async () => {
    const { inboundSms, inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const doc = await clinician("Dr. Always Ames", "+15550140004");
    await inboundSms(mms("+15550140004", [addMedia()]), "https://line.test");
    expect(await inboundText("+15550140004", "ALWAYS", "https://line.test")).toContain("You won't be asked again");
    expect((await repo.users.byId(doc.id))!.prefs.memoStandingConsent).toBeTruthy();
    const second = await inboundSms(mms("+15550140004", [addMedia()]), "https://line.test");
    expect(second).toBe("Got your 0:22 recording. Writing the note.");
    await settle();
    const list = await repo.encounters.list(doc, {});
    expect(list).toHaveLength(2);
    const methods = await Promise.all(list.map(async (e) => (await repo.consents.latest(e.id))?.method));
    expect(methods.sort()).toEqual(["standing", "standing"]);
    expect(await inboundText("+15550140004", "always off", "https://line.test")).toContain("Standing consent is off");
    expect((await repo.users.byId(doc.id))!.prefs.memoStandingConsent).toBeNull();
    expect(await inboundSms(mms("+15550140004", [addMedia()]), "https://line.test")).toContain("Reply YES");
  });

  it("gives an unknown number a guest note it can claim", async () => {
    const { inboundSms, inboundText } = await import("@/lib/server/telephony/texting");
    const reply = await inboundSms(mms("+15550140005", [addMedia()]), "https://line.test");
    expect(reply).toContain("Reply YES");
    const yes = await inboundText("+15550140005", "yes", "https://line.test");
    expect(yes).toContain("Writing the note");
    expect(yes).not.toContain("ALWAYS");
    await settle();
    expect((await texts("+15550140005")).at(-1)).toMatch(/Tap to save it \(free\): https:\/\/line\.test\/m\//);
  });

  it("answers an oversized memo with a single-use upload link and still deletes Twilio's copy", async () => {
    const { inboundSms } = await import("@/lib/server/telephony/texting");
    await clinician("Dr. Big Bo", "+15550140006");
    const big = addMedia({ bytes: 3 * 1024 * 1024 });
    const reply = await inboundSms(mms("+15550140006", [big]), "https://line.test");
    expect(reply).toMatch(/over 2 MB\. Too big to text\? Upload it here\. The link works once, for 30 minutes: https:\/\/line\.test\/go\/upload#t=cs_cap_[\w-]+&c=patient$/);
    expect(log.deletes).toContain(big.sid);
  });

  it("refuses media hosted anywhere but Twilio and deletes pictures unread", async () => {
    const { inboundSms } = await import("@/lib/server/telephony/texting");
    await clinician("Dr. Pic Poe", "+15550140007");
    const bad = await inboundSms(mms("+15550140007", [{ url: "http://169.254.169.254/latest/meta-data" }]), "https://line.test");
    expect(bad).toContain("couldn't open that recording");
    const pic = addMedia({ type: "image/jpeg" });
    const r = await inboundSms(mms("+15550140007", [pic], "image/jpeg"), "https://line.test");
    expect(r).toContain("I can only take voice recordings");
    expect(log.gets).not.toContain(pic.sid);
    expect(log.deletes).toContain(pic.sid);
  });

  it("turns a text starting with NOTE into a dictated note", async () => {
    const { inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const doc = await clinician("Dr. Type Tam", "+15550140008");
    const r = await inboundText("+15550140008", "Note: follow up for knee pain, doing better. Exam shows no swelling. Continue physical therapy and recheck in six weeks.", "https://line.test");
    expect(r).toContain("Writing the note from your text");
    await settle();
    const [enc] = await repo.encounters.list(doc, {});
    expect(enc.status).toBe("review");
    const note = await repo.notes.latest(enc.id);
    expect(JSON.stringify(note!.content)).toMatch(/physical therapy/i);
    expect((await texts("+15550140008")).at(-1)).toMatch(/^Chartside: your note from the text is ready\. Review and sign:/);
  });

  it("confirms each hold under its own clinician and drops a hold whose user is gone", async () => {
    const { inboundSms, inboundText } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const db = await import("@/lib/db");
    const doc = await clinician("Dr. Merge Mira", "+15550140011");
    expect(await inboundSms(mms("+15550140011", [addMedia()]), "https://line.test")).toContain("Reply YES");
    const old = new Date(Date.now() - 3600_000).toISOString();
    await db.run("INSERT INTO memo_holds (id, phone, channel, user_id, org_id, status, mime, bytes, duration_s, path, message_sid, created_at, expires_at) VALUES ('memo_orphan', '+15550140011', 'mms', 'usr_gone', 'org_gone', 'held', 'audio/wav', 10, 5, NULL, NULL, ?, ?)", old, new Date(Date.now() + 3600_000).toISOString());
    const yes = await inboundText("+15550140011", "YES", "https://line.test");
    expect(yes).toContain("Writing the note from your 0:22 recording");
    await settle();
    expect(await repo.encounters.list(doc, {})).toHaveLength(1);
    expect((await db.get<{ status: string }>("SELECT status FROM memo_holds WHERE id = 'memo_orphan'"))!.status).toBe("discarded");
  });

  it("ignores a retried webhook for a memo or a YES it already handled", async () => {
    const { inboundSms } = await import("@/lib/server/telephony/texting");
    const repo = await import("@/lib/server/repo");
    const db = await import("@/lib/db");
    const doc = await clinician("Dr. Retry Rae", "+15550140012");
    const memo = mms("+15550140012", [addMedia()]);
    expect(await inboundSms(memo, "https://line.test")).toContain("Reply YES");
    expect(await inboundSms(memo, "https://line.test")).toBe("");
    expect(Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM memo_holds WHERE phone = '+15550140012'"))!.n)).toBe(1);
    const yes = { From: "+15550140012", To: "+13125550199", Body: "YES", MessageSid: "SMretry0001", NumMedia: "0" };
    expect(await inboundSms(yes, "https://line.test")).toContain("Writing the note");
    expect(await inboundSms(yes, "https://line.test")).toBe("");
    await settle();
    expect(await repo.encounters.list(doc, {})).toHaveLength(1);
  });
});

