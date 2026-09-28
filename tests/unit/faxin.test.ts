import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { textPdf } from "@/lib/pdf";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-faxin-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("inbound fax", () => {
  it("authenticates the webhook, suggests the patient, and files the fax as an outside record that closes the referral", async () => {
    const repo = await import("@/lib/server/repo");
    const fx = await import("@/lib/server/faxin");
    const { tasks } = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Fax Inbox");
    const p = await repo.patients.create(doc, { mrn: "883311", name: "Walter Price", dob: "1952-04-04", sex: "M", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    await repo.patients.create(doc, { mrn: "883312", name: "Grace Price", dob: "1990-01-01", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    await tasks.create({ orgId: doc.orgId, patientId: p.id, assigneeId: doc.id, kind: "referral", key: "referral:cards", title: "Confirm Referral to Cardiology appointment was scheduled", source: "auto" });
    const secret = await fx.rotateInboundSecret(doc);
    const pdf = Buffer.from(textPdf({ title: "Cardiology Consultation", body: "Patient: Walter Price  DOB: 04/04/1952\nThank you for the referral.\nAssessment: stable angina. Plan: start metoprolol succinate 25 mg daily." }));
    await expect(fx.receiveFax(doc.orgId, "wrong", { pdf })).rejects.toThrow("Unauthorized");
    const id = await fx.receiveFax(doc.orgId, secret, { from: "+13125550100", pages: 1, pdf });
    const [item] = await fx.faxInbox(doc);
    expect(item).toMatchObject({ id, status: "new" });
    expect(item.suggestions[0]).toMatchObject({ name: "Walter Price", why: ["last name", "first name", "date of birth"] });
    const rec = await fx.fileFax(doc, id, p.id);
    expect(rec.closedReferrals).toEqual(["Confirm Referral to Cardiology appointment was scheduled"]);
    await expect(fx.fileFax(doc, id, p.id)).rejects.toThrow("already filed");
  });
});
