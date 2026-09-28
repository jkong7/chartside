import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ccdaToText, extractRecords, pdfToText, recordsText } from "@/lib/engine/records";
import { textPdf } from "@/lib/pdf";

describe("outside records", () => {
  it("reads problems, meds, allergies, labs, vitals, and plan from a faxed discharge summary", () => {
    const text = `Riverside Hospital Discharge Summary
Discharge date: 09/20/2026
Diagnoses:
1. Community acquired pneumonia J18.9
2. Type 2 diabetes mellitus (E11.9)
Discharge Medications:
- Amoxicillin 875 mg BID x 5 more days
- Metformin 1000 mg twice daily
Allergies: Sulfa (rash); latex
Labs:
Hemoglobin A1c 8.9 % on 09/18/2026
Creatinine 1.3 mg/dL 2026-09-19
Vitals: BP 134/82, weight 82 kg
Follow-up:
Repeat chest x-ray in 6 weeks
`;
    const f = extractRecords(text);
    const by = (k: string) => f.filter((x) => x.kind === k);
    expect(by("problem").map((p) => [p.label, p.code])).toEqual([["Community acquired pneumonia", "J18.9"], ["Type 2 diabetes mellitus", "E11.9"]]);
    expect(by("medication").map((m) => [m.label, m.value, m.detail])).toEqual([["amoxicillin", "875 mg", "twice daily"], ["metformin", "1000 mg", "twice daily"]]);
    expect(by("allergy").map((a) => [a.label, a.detail])).toEqual([["sulfa", "rash"], ["latex", undefined]]);
    expect(by("lab").map((l) => [l.label, l.value, l.date])).toEqual([["Hemoglobin A1c", "8.9 %", "2026-09-18"], ["Creatinine", "1.3 mg/dL", "2026-09-19"]]);
    expect(by("vital").map((v) => [v.label, v.value])).toEqual([["BP", "134/82"], ["Weight", "82 kg"]]);
    expect(by("plan")[0].label).toBe("Repeat chest x-ray in 6 weeks");
    expect(by("medication")[0].source.line).toBe(7);
  });

  it("converts a C-CDA into findings", () => {
    const xml = readFileSync("tests/fixtures/outside-ccd.xml", "utf8");
    const r = recordsText("summary.xml", "application/xml", Buffer.from(xml));
    expect(r.format).toBe("ccda");
    const f = extractRecords(r.text);
    expect(f.filter((x) => x.kind === "problem").map((p) => p.code)).toEqual(["I48.0", "I10"]);
    expect(f.filter((x) => x.kind === "medication").map((m) => `${m.label} ${m.value} ${m.detail}`)).toEqual(["apixaban 5 mg twice daily", "metoprolol 25 mg daily"]);
    expect(f.find((x) => x.kind === "allergy")).toMatchObject({ label: "penicillin", detail: "hives" });
    expect(f.filter((x) => x.kind === "lab").map((l) => l.label)).toEqual(["Creatinine", "TSH"]);
    expect(ccdaToText("<ClinicalDocument/>")).toBe("");
  });

  it("extracts text from uncompressed and Flate-compressed PDFs", () => {
    const plain = textPdf({ title: "Outside note", body: "Medications\nLisinopril 20 mg daily\nAllergies: codeine (nausea)" });
    expect(pdfToText(plain)).toContain("Lisinopril 20 mg daily");
    const content = "BT /F1 11 Tf 72 700 Td (Problems) Tj ET\nBT /F1 11 Tf 72 685 Td [(Gout ) -20 (M10.9)] TJ ET";
    const z = deflateSync(Buffer.from(content, "latin1"));
    const pdf = Buffer.concat([Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), z, Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
    const t = recordsText("scan.pdf", "application/pdf", pdf);
    expect(t.format).toBe("pdf");
    expect(extractRecords(t.text).find((x) => x.kind === "problem")).toMatchObject({ code: "M10.9" });
  });
});

describe("outside record reconciliation", () => {
  it("imports a C-CDA, flags new and changed items, and adds only accepted findings to the chart", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const path = await import("node:path");
    process.env.CHARTSIDE_DB = path.join(mkdtempSync(path.join(tmpdir(), "chartside-rec-")), "t.db");
    const { newMember } = await import("./org-helpers");
    const repo = await import("@/lib/server/repo");
    const rec = await import("@/lib/server/records");
    const u = await newMember("Dr. Avery Chen");
    const p = await repo.patients.create(u, { mrn: "R1", name: "Harold Jensen", dob: "1952-04-18", sex: "M", pronouns: "he/him", language: "en", chart: { problems: [{ name: "Essential hypertension", icd10: "I10" }], medications: [{ name: "metoprolol succinate", dose: "50 mg", frequency: "daily" }], allergies: [] } });
    const r = await rec.importRecord(u, p.id, { name: "Lakeshore Cardiology CCD", mime: "application/xml", data: readFileSync("tests/fixtures/outside-ccd.xml") });
    const by = (label: string) => r.findings.findIndex((f) => f.label.toLowerCase().includes(label));
    expect(r.findings[by("atrial")]).toMatchObject({ change: "new", status: "pending" });
    expect(r.findings[by("hypertension")]).toMatchObject({ change: "same", status: "dismissed" });
    expect(r.findings[by("metoprolol")]).toMatchObject({ change: "update", current: "50 mg daily" });
    expect(r.findings[by("penicillin")]).toMatchObject({ kind: "allergy", change: "new" });
    const accept = [by("atrial"), by("metoprolol"), by("penicillin")];
    const out = await rec.reconcile(u, p.id, r.id, r.findings.map((f, i) => (f.status === "pending" ? { index: i, action: accept.includes(i) ? "accept" : "dismiss" } : null)).filter(Boolean) as { index: number; action: "accept" | "dismiss" }[]);
    expect(out.accepted).toBe(3);
    const chart = (await repo.patients.get(u, p.id))!.chart;
    expect(chart.problems.map((x) => x.icd10)).toEqual(["I10", "I48.0"]);
    expect(chart.medications).toEqual([{ name: "metoprolol succinate", dose: "25 mg", frequency: "daily", source: "outside:Lakeshore Cardiology CCD" }]);
    expect(chart.allergies[0]).toMatchObject({ substance: "penicillin", reaction: "hives" });
    expect(chart.labs ?? []).toEqual([]);
    await expect(rec.importRecord(u, p.id, { name: "blank.txt", mime: "text/plain", data: Buffer.from("   ") })).rejects.toThrow("empty");
  });
});
