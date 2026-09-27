import { describe, expect, it } from "vitest";
import type { Claim, ClaimLine } from "@/lib/engine/billing";
import { validNpi } from "@/lib/rcm/npi";
import { buildAppealLetter, denialOf, sandboxClearinghouse, totalsOf } from "@/lib/rcm/remit";

const line = (cpt: string, charge: number, allowed: number | null, extra: Partial<ClaimLine> = {}): ClaimLine => ({ id: `l_${cpt}`, cpt, description: cpt, modifiers: [], pointers: ["A"], units: 1, charge, source: "procedure", rationale: "", evidence: [], pricing: { basis: allowed === null ? "none" : "MPFS", allowed, coinsurance: 20 }, ...extra });
const claim = (lines: ClaimLine[], payer: Claim["payer"] = "Medicare"): Claim => ({ placeOfService: "11", payer, dx: [{ pointer: "A", code: "J44.9", label: "COPD" }], lines, edits: [], opportunities: [], totals: { charges: lines.reduce((s, l) => s + l.charge, 0), lines: lines.length }, excludedOrders: [] });

describe("claim lifecycle", () => {
  it("front-end rejects claims without a valid billing NPI, tax ID, or with errors", () => {
    const ok = sandboxClearinghouse.submit(claim([line("99214", 300, 142.45)]), { claimId: "CS1", npi: "1234567893", tin: "12-3456789" });
    expect(ok).toMatchObject({ accepted: true, errors: [] });
    const bad = sandboxClearinghouse.submit({ ...claim([line("99214", 300, 142.45)]), edits: [{ id: "e", severity: "error", rule: "X", message: "Broken" }] }, { claimId: "CS1", npi: "12", tin: "" });
    expect(bad.accepted).toBe(false);
    expect(bad.errors).toHaveLength(3);
  });

  it("adjudicates at the allowed amount with CO-45 and PR-2, and denies non-covered services", () => {
    const r = sandboxClearinghouse.adjudicate(claim([line("99214", 300, 142.45), line("90750", 400, null, { source: "vaccine" }), line("99397", 270, null, { pricing: { basis: "none", allowed: null, status: "N" } })]), { claimId: "CS1", at: "2026-10-10T00:00:00Z" });
    const em = r.lines[0];
    expect(em).toMatchObject({ allowed: 142.45, patientResp: 28.49, paid: 113.96 });
    expect(em.adjustments).toEqual([{ group: "CO", carc: "45", amount: 157.55 }, { group: "PR", carc: "2", amount: 28.49 }]);
    expect(r.lines[1].adjustments[0]).toMatchObject({ group: "CO", carc: "109" });
    expect(r.lines[2].adjustments[0].carc).toBe("96");
    expect(r.totals).toMatchObject({ billed: 970, paid: 113.96, patientResp: 28.49, contractual: 157.55, denied: 670 });
    expect(denialOf(r)).toMatchObject({ category: "non_covered", carcs: ["109", "96"], lines: ["90750", "99397"] });
  });

  it("builds an appeal letter that cites the claim, denial, and signed documentation", () => {
    const c = claim([line("93000", 60, null)]);
    const remit = sandboxClearinghouse.adjudicate(c, { claimId: "CS9", at: "2026-10-10T00:00:00Z" });
    const letter = buildAppealLetter({ claim: c, remit, patient: { name: "Ana Morales", dob: "1954-10-12", memberId: "1EG4TE5MK03" }, clinician: "Dr. Avery Chen", dos: "2026-10-01", noteExcerpt: ["Worsening dyspnea; ECG performed in office."], payer: "Medicare" });
    expect(letter).toContain("Member ID 1EG4TE5MK03");
    expect(letter).toContain("93000 (CARC CO-16)");
    expect(letter).toContain("• Worsening dyspnea; ECG performed in office.");
  });

  it("validates NPIs with the Luhn check digit and sums remittance totals", () => {
    expect(validNpi("1234567893")).toBe(true);
    expect(validNpi("1234567890")).toBe(false);
    expect(totalsOf([])).toEqual({ billed: 0, allowed: 0, paid: 0, patientResp: 0, contractual: 0, denied: 0 });
  });
});
