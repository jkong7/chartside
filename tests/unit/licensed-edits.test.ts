import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ClaimLine } from "@/lib/engine/billing";

const dir = mkdtempSync(path.join(tmpdir(), "chartside-licensed-"));

beforeAll(() => {
  process.env.CHARTSIDE_LICENSED_DIR = dir;
  const db = new DatabaseSync(path.join(dir, "licensed.db"));
  db.exec(readFileSync("codesets/licensed-schema.sql", "utf8"));
  const ptp = db.prepare("INSERT INTO ptp (col1, col2, eff, del, modifier, rationale) VALUES (?, ?, ?, ?, ?, ?)");
  ptp.run("93000", "93010", "19960101", null, 0, "Misuse of column two code with column one code");
  ptp.run("97140", "97530", "20200101", null, 1, "Mutually exclusive procedures");
  ptp.run("11102", "11104", "20190101", "20251231", 0, "Deleted edit");
  db.prepare("INSERT INTO mue (code, value, mai, rationale) VALUES (?, ?, ?, ?)").run("36415", 2, 2, "CMS Policy");
  db.prepare("INSERT INTO article (id, version, display_id, title, eff, end_date) VALUES (?, ?, ?, ?, ?, ?)").run("57326", "12", "A57326", "Billing and Coding: Electrocardiographic Services", "2025-01-01", null);
  db.prepare("INSERT INTO article_contractor (article_id, contractor_number, contractor_name) VALUES (?, ?, ?)").run("57326", "06102", "National Government Services, Inc.");
  db.prepare("INSERT INTO article_hcpc (article_id, code, grp) VALUES (?, ?, ?)").run("57326", "93000", "1");
  for (const c of ["R079", "I480", "R001"]) db.prepare("INSERT INTO article_icd (article_id, code, grp) VALUES (?, ?, ?)").run("57326", c, "1");
  db.prepare("INSERT INTO meta (id, content) VALUES ('manifest', ?)").run(JSON.stringify({ acceptedAt: "2026-09-27T12:00:00Z", acceptedBy: "test", terms: [], sources: { ptp: { name: "Medicare NCCI procedure-to-procedure edits, practitioner, 2026 Q4 (v32.3)", version: "2026-Q4-v32.3", effective: { from: "2026-10-01", to: "2026-12-31" }, files: {} }, mue: { name: "Medicare NCCI medically unlikely edits, practitioner services, 2026 Q4", version: "2026-Q4", effective: { from: "2026-10-01", to: "2026-12-31" }, files: {} } } }));
  db.close();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const line = (cpt: string, extra: Partial<ClaimLine> = {}): ClaimLine => ({ id: `l_${cpt}`, cpt, description: cpt, modifiers: [], pointers: ["A"], units: 1, charge: 0, source: "procedure", rationale: "", evidence: [], ...extra });

async function review(lines: ClaimLine[], dx = "R07.9") {
  const { makeClaimReference } = await import("@/lib/rcm/reference");
  const ref = makeClaimReference({ dos: "2026-10-05" });
  return ref.review({ placeOfService: "11", payer: "Medicare", dx: [{ pointer: "A", code: dx, label: "dx" }], lines, edits: [], opportunities: [], totals: { charges: 0, lines: lines.length }, excludedOrders: [], dos: "2026-10-05" }, { age: 70, sex: "F", minutes: 20, facts: null });
}

describe("operator-loaded NCCI, MUE, and LCD edits", () => {
  it("applies PTP edits by modifier indicator and effective dates", async () => {
    const hard = await review([line("93000"), line("93010")]);
    expect(hard.find((e) => e.rule === "NCCI.PTP")).toMatchObject({ lineId: "l_93010", source: { set: "NCCI PTP (practitioner)", version: "2026-Q4-v32.3" } });
    expect((await review([line("97140"), line("97530")])).some((e) => e.rule === "NCCI.PTP")).toBe(true);
    expect((await review([line("97140"), line("97530", { modifiers: ["59"] })])).some((e) => e.rule === "NCCI.PTP")).toBe(false);
    expect((await review([line("11102"), line("11104")])).some((e) => e.rule === "NCCI.PTP")).toBe(false);
  });

  it("applies MUE unit limits with the adjudication indicator", async () => {
    const e = (await review([line("36415", { units: 3 })])).find((x) => x.rule === "NCCI.MUE");
    expect(e?.message).toContain("the practitioner MUE is 2 (date-of-service policy edit, not appealable)");
  });

  it("checks the MAC's LCD article covered-diagnosis list instead of the built-in rule", async () => {
    const miss = (await review([line("93000")], "I10")).find((x) => x.rule === "LCD.COVERAGE");
    expect(miss?.message).toContain('A57326 "Billing and Coding: Electrocardiographic Services"');
    expect(miss?.source).toMatchObject({ set: "Medicare Coverage Database", ref: "A57326" });
    expect((await review([line("93000")], "R07.9")).some((x) => x.rule === "LCD.COVERAGE" || x.rule === "NECESSITY.CHARTSIDE")).toBe(false);
  });

  it("reports the loaded licensed versions", async () => {
    const { makeClaimReference } = await import("@/lib/rcm/reference");
    expect(makeClaimReference({ dos: "2026-10-05" }).versions().map((v) => v.version)).toEqual(expect.arrayContaining(["2026-Q4-v32.3", "2026-Q4"]));
  });
});
