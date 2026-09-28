import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-notify-"));
const PORT = 3390;
const got: { path: string; auth: string; body: string }[] = [];
let failSms = false;
let server: Server;

beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  server = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => {
      got.push({ path: req.url ?? "", auth: String(req.headers.authorization ?? ""), body: b });
      if (req.url?.includes("/Messages.json")) {
        if (failSms) return res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: "The 'To' number is not a valid phone number." }));
        return res.writeHead(201, { "content-type": "application/json" }).end(JSON.stringify({ sid: "SM123" }));
      }
      if (req.url === "/v3/mail/send") return res.writeHead(202, { "x-message-id": "SG456" }).end();
      res.writeHead(404).end();
    });
  });
  await new Promise<void>((r) => server.listen(PORT, r));
});

afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("patient notifications", () => {
  it("sends link-only texts and emails through providers, logs every attempt, and falls back when unconfigured", async () => {
    const repo = await import("@/lib/server/repo");
    const n = await import("@/lib/server/notify");
    const u = await newMember("Dr. Avery Chen");
    const viewer = await newMember("Val Viewer", { orgId: u.orgId, role: "viewer" });
    const p = await repo.patients.create(u, { mrn: "N1", name: "Maria Gonzalez", dob: "1968-03-14", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [{ name: "Type 2 diabetes mellitus", icd10: "E11.9" }], medications: [], allergies: [] } });
    expect(n.normalizePhone("(312) 555-0142")).toBe("+13125550142");
    expect(n.normalizePhone("12")).toBeNull();
    await expect(n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "summary", url: "https://x/s/abc" })).rejects.toThrow("no phone or email");
    await repo.patients.setContact(u, p.id, { phone: "+13125550142", email: "maria@example.com", pref: null });
    const none = await n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "summary", url: "https://x/s/abc" });
    expect(none).toMatchObject({ status: "unconfigured", channel: "sms", to: "+•••••••0142" });

    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "tok", TWILIO_FROM: "+15550000000", TWILIO_BASE_URL: `http://localhost:${PORT}`, SENDGRID_API_KEY: "SG.key", CHARTSIDE_EMAIL_FROM: "care@clinic.test", SENDGRID_BASE_URL: `http://localhost:${PORT}` });
    const sms = await n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "summary", url: "https://x/s/abc" });
    expect(sms.status).toBe("sent");
    const smsReq = got.find((g) => g.path.includes("/Accounts/AC1/Messages.json"))!;
    expect(smsReq.auth).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    const params = new URLSearchParams(smsReq.body);
    expect(params.get("To")).toBe("+13125550142");
    expect(params.get("Body")).toContain("https://x/s/abc");
    expect(params.get("Body")).not.toMatch(/diabetes/i);
    const mail = await n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "intake", url: "https://x/intake/t", channel: "email" });
    expect(mail).toMatchObject({ status: "sent", to: "m•••@example.com" });
    const mailReq = JSON.parse(got.find((g) => g.path === "/v3/mail/send")!.body);
    expect(mailReq.personalizations[0].to[0].email).toBe("maria@example.com");
    expect(mailReq.subject).toBe("Before your visit");
    failSms = true;
    expect((await n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "reply", url: "https://x/s/abc" })).error).toContain("not a valid phone number");
    await expect(n.notifyPatient(viewer, { orgId: u.orgId, patientId: p.id, kind: "summary", url: "x" })).rejects.toThrow("can't contact patients");
    await repo.patients.setContact(u, p.id, { phone: "+13125550142", email: null, pref: "none" });
    await expect(n.notifyPatient(u, { orgId: u.orgId, patientId: p.id, kind: "summary", url: "x" })).rejects.toThrow("opted out");
    expect((await n.outboxFor(u, p.id)).map((o) => o.status)).toEqual(["failed", "sent", "sent", "unconfigured"]);
  });
});
