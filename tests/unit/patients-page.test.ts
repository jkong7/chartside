import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newMember } from "./org-helpers";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-ppage-"));
beforeAll(() => {
  process.env.CHARTSIDE_DB = path.join(dir, "t.db");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("patient list at scale", () => {
  it("pages and searches by name or MRN with visit counts from SQL", async () => {
    const repo = await import("@/lib/server/repo");
    const doc = await newMember("Dr. Big Panel");
    for (let i = 0; i < 120; i++) await repo.patients.create(doc, { mrn: `M${String(i).padStart(4, "0")}`, name: `Patient ${String(i).padStart(3, "0")}`, dob: "1970-01-01", sex: "F", pronouns: "", language: "en", chart: { problems: [], medications: [], allergies: [] } });
    const p0 = (await repo.patients.page(doc, { q: "M0007" })).rows[0];
    await repo.encounters.create(doc, { patientId: p0.id, scheduledAt: "2026-09-01T10:00:00", reason: "a" });
    await repo.encounters.create(doc, { patientId: p0.id, scheduledAt: "2026-09-20T10:00:00", reason: "b" });
    const first = await repo.patients.page(doc, { limit: 50 });
    expect(first.total).toBe(120);
    expect(first.rows).toHaveLength(50);
    const third = await repo.patients.page(doc, { limit: 50, offset: 100 });
    expect(third.rows.map((r) => r.name)[0]).toBe("Patient 100");
    const hit = await repo.patients.page(doc, { q: "patient 007" });
    expect(hit).toMatchObject({ total: 1, rows: [{ name: "Patient 007", visits: 2, lastVisit: "2026-09-20T10:00:00" }] });
    const other = await newMember("Dr. Other Org");
    expect((await repo.patients.page(other, {})).total).toBe(0);
  });
});
