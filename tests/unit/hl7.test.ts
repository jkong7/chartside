import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAck, buildMdmT02, frame, parseAck, unframe } from "@/lib/engine/hl7";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-hl7-"));
const received: string[] = [];
let mode: "AA" | "AE" = "AA";
let server: Server;
let port = 0;
beforeAll(async () => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
  server = createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const m = unframe(buf);
      if (!m) return;
      received.push(m);
      sock.write(frame(buildAck(m, mode)));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("HL7 v2 MDM interface", () => {
  it("builds an escaped MDM^T02 with PID, TXA, and one OBX per line", () => {
    const m = buildMdmT02({ controlId: "C1", sendingApp: "CHARTSIDE", sendingFacility: "Main | Clinic", receivingApp: "EHR", receivingFacility: "HOSP", at: new Date("2026-09-28T10:00:00"), patient: { mrn: "100482", name: "Maria Gonzalez", dob: "1968-03-14", sex: "F" }, visitNumber: "V1", clinician: { id: "u1", name: "Dr. Avery Chen" }, documentId: "enc1-v2", documentType: "PN", signedAt: new Date("2026-09-28T10:05:00"), lines: ["Subjective", "A1c 8.4^ up from 7.9"] });
    const segs = m.split("\r");
    expect(segs[0]).toBe("MSH|^~\\&|CHARTSIDE|Main \\F\\ Clinic|EHR|HOSP|20260928100000||MDM^T02^MDM_T02|C1|P|2.5.1");
    expect(segs.find((s) => s.startsWith("PID"))).toBe("PID|1||100482^^^Main \\F\\ Clinic^MR||Gonzalez^Maria||19680314|F");
    expect(segs.filter((s) => s.startsWith("OBX"))).toEqual(["OBX|1|TX|PN^Clinical note^L||Subjective||||||F", "OBX|2|TX|PN^Clinical note^L||A1c 8.4\\S\\ up from 7.9||||||F"]);
    expect(parseAck(buildAck(m))).toMatchObject({ code: "AA", controlId: "C1" });
  });

  it("sends signed notes over MLLP, records ACKs and NAKs, and skips restricted notes", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const h = await import("@/lib/server/hl7");
    const doc = await newMember("Dr. Interface");
    await expect(h.saveHl7Config(doc, { enabled: true, host: "bad host!", port: 70000 })).rejects.toThrow("host");
    await h.saveHl7Config(doc, { enabled: true, host: "127.0.0.1", port, receivingApp: "EPIC", receivingFacility: "MAIN" });
    const p = await repo.patients.create(doc, { mrn: "55501", name: "Iris Park", dob: "1970-01-01", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const visit = async (template: string) => {
      const enc = await repo.encounters.create(doc, { patientId: p.id, scheduledAt: new Date().toISOString(), visitType: "follow-up", reason: "Follow-up", templateId: template });
      await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
      await repo.utterances.append(enc.id, [{ speaker: "clinician", text: "Your blood pressure is 150 over 94, so let's start lisinopril 10 milligrams daily for hypertension.", tStart: 0, tEnd: 4 }]);
      await repo.encounters.update(doc, enc.id, { status: "processing", durationS: 600 });
      await pipeline.processEncounter(doc, enc.id, { engine: "local" });
      await pipeline.signEncounter(doc, enc.id, { force: true });
      return enc.id;
    };
    const e1 = await visit("soap");
    expect(received).toHaveLength(1);
    expect(received[0]).toContain("MDM^T02");
    expect(received[0]).toContain("lisinopril");
    expect((await h.hl7Log(doc, e1))[0]).toMatchObject({ status: "accepted", detail: "ACK AA" });
    mode = "AE";
    expect(await h.sendNoteHl7(doc, e1, { manual: true })).toMatchObject({ status: "rejected", detail: "ACK AE" });
    mode = "AA";
    const bh = await visit("bh_psychotherapy");
    expect((await h.hl7Log(doc, bh))).toHaveLength(0);
    expect(received).toHaveLength(2);
    await h.saveHl7Config(doc, { enabled: true, host: "127.0.0.1", port: 1 });
    expect(await h.sendNoteHl7(doc, e1, { manual: true })).toMatchObject({ status: "failed" });
  });
});
