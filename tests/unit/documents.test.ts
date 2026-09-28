import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { docDef, missingFields, requestedDocs, restrictionsFrom, returnDate } from "@/lib/engine/documents";
import { extractFacts } from "@/lib/engine/extract";
import { textPdf, wrap } from "@/lib/pdf";
import type { Utterance } from "@/lib/types";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-docs-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
  process.env.CHARTSIDE_ENGINE = "local";
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const u = (id: string, speaker: Utterance["speaker"], text: string): Utterance => ({ id, seq: Number(id.slice(1)), speaker, text, tStart: 0, tEnd: 1 });
const VISIT = new Date("2026-09-28T15:00:00");
const SCRIPT = [
  u("u0", "patient", "I hurt my back lifting boxes at work on Friday."),
  u("u1", "clinician", "This is a lumbar strain. No heavy lifting over 20 pounds for two weeks, and light duty."),
  u("u2", "patient", "Can I get a work note for today and tomorrow?"),
  u("u3", "clinician", "Sure. You can go back to work on Wednesday."),
];

describe("letters and forms", () => {
  it("finds return dates and restrictions in the conversation", () => {
    expect(returnDate(SCRIPT, VISIT)).toEqual({ date: "2026-09-30", evidence: ["u3"] });
    expect(returnDate([u("u0", "clinician", "Stay home for 3 days.")], VISIT)?.date).toBe("2026-10-01");
    expect(returnDate([u("u0", "clinician", "You can return to school tomorrow.")], VISIT)?.date).toBe("2026-09-29");
    expect(restrictionsFrom(SCRIPT)).toEqual(["No heavy lifting over 20 pounds", "Light duty"]);
    expect(requestedDocs(SCRIPT)).toEqual([{ type: "work_note", evidence: ["u2"] }]);
  });

  it("prefills and renders a work note, and reports missing required fields", () => {
    const def = docDef("work_note")!;
    const facts = extractFacts(SCRIPT, undefined, {});
    const ctx = { facts, utterances: SCRIPT, patient: { id: "p", mrn: "1", name: "Dana Lee", dob: "1990-02-03", sex: "F" as const, pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } }, clinician: { name: "Dr. Avery Chen", specialty: "Family Medicine", credential: "MD" }, org: { name: "Lakeside Family Medicine" }, visitDate: VISIT };
    const v = def.prefill(ctx);
    expect(v).toMatchObject({ from: "2026-09-28", return: "2026-09-30" });
    const r = def.render(v, ctx);
    expect(r.body).toContain("Lakeside Family Medicine");
    expect(r.body).toContain("Dana may return to work on September 30, 2026 with the following restrictions:");
    expect(r.body).toContain("• No heavy lifting over 20 pounds");
    expect(r.body).toContain("Dr. Avery Chen, MD");
    expect(r.body).not.toMatch(/lumbar/i);
    expect(missingFields(def, { ...v, return: "" })).toEqual(["May return on"]);
  });

  it("writes a valid PDF with a correct cross-reference table", () => {
    const pdf = textPdf({ title: "Work note (test)", letterhead: "Clínica Sol", body: "Line one • bullet\n\n" + "Long paragraph ".repeat(400), footer: "Signed" });
    const s = pdf.toString("latin1");
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(Number(/\/Count (\d+)/.exec(s)![1])).toBeGreaterThan(1);
    expect(s).toContain("(Work note \\(test\\))");
    expect(s).toContain("\\225 bullet");
    expect(wrap("a ".repeat(200), 100).every((l) => l.length < 60)).toBe(true);
  });

  it("drafts requested letters at note generation, signs, shares, and closes the matching task", async () => {
    const repo = await import("@/lib/server/repo");
    const pipeline = await import("@/lib/server/pipeline");
    const docs = await import("@/lib/server/documents");
    const inbox = await import("@/lib/server/inbox");
    const doc = await newMember("Dr. Avery Chen");
    const scribe = await newMember("Sam Scribe", { orgId: doc.orgId, role: "scribe" });
    const p = await repo.patients.create(doc, { mrn: "7", name: "Dana Lee", dob: "1990-02-03", sex: "F", pronouns: "she/her", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const enc = await repo.encounters.create(doc, { scheduledAt: VISIT.toISOString(), patientId: p.id, reason: "Back pain" });
    await pipeline.recordConsent(doc, enc, { decision: "granted", method: "verbal", state: "IL", othersPresent: false });
    await repo.utterances.append(enc.id, SCRIPT.map(({ speaker, text }, i) => ({ speaker, text, tStart: i * 3, tEnd: i * 3 + 2 })));
    await pipeline.processEncounter(doc, enc.id, { engine: "local" });
    const list = await docs.documents.list(enc.id);
    expect(list.map((d) => [d.type, d.source])).toEqual([["work_note", "requested"]]);
    const wn = list[0];
    expect(wn.missing).toEqual([]);
    expect((await inbox.tasks.forEncounter(enc.id)).find((t) => t.key === "doc:work note")?.status).toBe("open");

    await expect(docs.updateDocument(doc, enc.id, wn.id, { shared: true })).rejects.toThrow("Sign the document");
    const edited = await docs.updateDocument(doc, enc.id, wn.id, { fields: { employer: "Acme Logistics" } });
    expect(edited.body).toContain("To Acme Logistics:");
    await expect(docs.updateDocument(scribe, enc.id, wn.id, { action: "finalize" })).rejects.toThrow("Only the treating clinician");
    const signed = await docs.updateDocument(doc, enc.id, wn.id, { action: "finalize" });
    expect(signed).toMatchObject({ status: "final", signedBy: "Dr. Avery Chen" });
    await expect(docs.updateDocument(doc, enc.id, wn.id, { fields: { employer: "Other" } })).rejects.toThrow("locked");
    await docs.updateDocument(doc, enc.id, wn.id, { shared: true });
    expect((await docs.documents.shared(enc.id)).map((d) => d.id)).toEqual([wn.id]);
    expect((await inbox.tasks.forEncounter(enc.id)).find((t) => t.key === "doc:work note")?.status).toBe("done");

    const lmn = await docs.createDocument(doc, enc.id, "medical_necessity");
    expect(lmn.missing.length).toBeGreaterThan(0);
    await expect(docs.updateDocument(doc, enc.id, lmn.id, { action: "finalize" })).rejects.toThrow("Fill in");
    const custom = await docs.updateDocument(doc, enc.id, lmn.id, { body: "Custom text ***" });
    expect(custom.custom).toBe(true);
    await docs.deleteDocument(doc, enc.id, lmn.id);
    const pdf = await docs.documentPdf((await repo.encounters.get(doc, enc.id))!, signed);
    expect(pdf.toString("latin1")).toContain("Signed electronically by Dr. Avery Chen");
  });
});
