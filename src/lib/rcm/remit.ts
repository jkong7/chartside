import type { Claim } from "../engine/billing";

export type AdjGroup = "CO" | "PR" | "OA" | "PI" | "CR";

export interface Adjustment {
  group: AdjGroup;
  carc: string;
  amount: number;
}

export interface RemitLine {
  lineId: string;
  cpt: string;
  billed: number;
  allowed: number;
  paid: number;
  patientResp: number;
  adjustments: Adjustment[];
  remark?: string;
}

export interface Remit {
  id: string;
  at: string;
  source: "clearinghouse" | "manual" | "appeal";
  payerClaimId: string;
  lines: RemitLine[];
  totals: { billed: number; allowed: number; paid: number; patientResp: number; contractual: number; denied: number };
}

export type DenialCategory = "eligibility" | "authorization" | "coding" | "bundling" | "medical_necessity" | "non_covered" | "timely_filing" | "duplicate" | "documentation" | "other";

export const GROUP_LABEL: Record<AdjGroup, string> = {
  CO: "Contractual obligation (provider write-off)",
  PR: "Patient responsibility",
  OA: "Other adjustment",
  PI: "Payer-initiated reduction",
  CR: "Correction or reversal",
};

export const CARC_CATEGORY: Record<string, { category: DenialCategory | "contractual" | "patient"; summary: string; action: string }> = {
  "1": { category: "patient", summary: "Deductible", action: "Bill the patient." },
  "2": { category: "patient", summary: "Coinsurance", action: "Bill the patient or secondary payer." },
  "3": { category: "patient", summary: "Copay", action: "Collect at check-in." },
  "4": { category: "coding", summary: "Modifier inconsistent with the procedure or missing", action: "Correct the modifier and resubmit a corrected claim (frequency 7)." },
  "11": { category: "coding", summary: "Diagnosis inconsistent with the procedure", action: "Link the supporting diagnosis or correct the diagnosis code." },
  "16": { category: "documentation", summary: "Claim lacks information needed for adjudication", action: "Add the missing data (see remark code) and resubmit." },
  "18": { category: "duplicate", summary: "Exact duplicate claim or service", action: "Verify the original claim's status; do not resubmit." },
  "22": { category: "eligibility", summary: "May be covered by another payer (coordination of benefits)", action: "Update coordination of benefits and bill the primary payer." },
  "27": { category: "eligibility", summary: "Expenses incurred after coverage terminated", action: "Verify eligibility; bill the correct payer or the patient." },
  "29": { category: "timely_filing", summary: "Time limit for filing has expired", action: "Appeal only with proof of timely filing." },
  "45": { category: "contractual", summary: "Charge exceeds the fee schedule or contracted amount", action: "Contractual write-off; no action." },
  "50": { category: "medical_necessity", summary: "Not deemed a medical necessity by the payer", action: "Review the LCD/NCD covered diagnoses; appeal with documentation or correct the diagnosis." },
  "96": { category: "non_covered", summary: "Non-covered charge", action: "Bill the patient only with a valid ABN (GA modifier); otherwise write off." },
  "97": { category: "bundling", summary: "Payment is included in another service (bundled)", action: "Review NCCI edits; append a supported modifier or accept the bundle." },
  "109": { category: "non_covered", summary: "Not covered by this payer or contractor", action: "Bill the correct payer (for example Medicare Part D for Part D vaccines)." },
  "167": { category: "coding", summary: "Diagnosis is not covered", action: "Verify the diagnosis and its specificity; correct or appeal." },
  "197": { category: "authorization", summary: "Precertification or authorization absent", action: "Obtain retro-authorization if allowed, then appeal." },
  "236": { category: "bundling", summary: "Procedure or modifier combination not compatible (NCCI)", action: "Correct the code pair or modifier per NCCI." },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function totalsOf(lines: RemitLine[]): Remit["totals"] {
  const sum = (f: (l: RemitLine) => number) => r2(lines.reduce((s, l) => s + f(l), 0));
  return {
    billed: sum((l) => l.billed),
    allowed: sum((l) => l.allowed),
    paid: sum((l) => l.paid),
    patientResp: sum((l) => l.patientResp),
    contractual: sum((l) => l.adjustments.filter((a) => a.group === "CO" && a.carc === "45").reduce((s, a) => s + a.amount, 0)),
    denied: sum((l) => (l.paid === 0 && l.patientResp === 0 ? l.billed : 0)),
  };
}

export function denialOf(remit: Remit): { category: DenialCategory; carcs: string[]; lines: string[]; action: string } | null {
  const denied = remit.lines.filter((l) => l.paid === 0 && l.patientResp === 0 && l.adjustments.some((a) => a.carc !== "45"));
  if (!denied.length) return null;
  const carcs = [...new Set(denied.flatMap((l) => l.adjustments.map((a) => a.carc)).filter((c) => c !== "45"))];
  const primary = carcs.map((c) => CARC_CATEGORY[c]).find((x) => x && x.category !== "patient" && x.category !== "contractual");
  return { category: (primary?.category as DenialCategory) ?? "other", carcs, lines: denied.map((l) => l.cpt), action: primary?.action ?? "Review the remittance and payer policy." };
}

export interface Clearinghouse {
  name: string;
  submit(claim: Claim, meta: { claimId: string; npi?: string; tin?: string }): { accepted: boolean; controlNumber: string; errors: string[] };
  adjudicate(claim: Claim, meta: { claimId: string; at: string }): Remit;
}

const MEDICARE_PART_D = new Set(["90750"]);

export const sandboxClearinghouse: Clearinghouse = {
  name: "Chartside sandbox clearinghouse",
  submit(claim, meta) {
    const errors: string[] = [];
    if (!meta.npi || !/^\d{10}$/.test(meta.npi)) errors.push("Billing provider NPI is missing or not 10 digits (2010AA NM109).");
    if (!meta.tin) errors.push("Billing provider tax ID is missing (2010AA REF*EI).");
    if (!claim.dx.length) errors.push("No diagnosis codes (2300 HI).");
    for (const e of claim.edits.filter((x) => x.severity === "error")) errors.push(`Front-end edit: ${e.message}`);
    return { accepted: !errors.length, controlNumber: `TRN${meta.claimId.replace(/\W/g, "").slice(-8).toUpperCase()}`, errors };
  },
  adjudicate(claim, meta) {
    const medicare = claim.payer === "Medicare" || claim.payer === "Medicare Advantage";
    const lines: RemitLine[] = claim.lines.map((l) => {
      const billed = r2(l.charge);
      const deny = (carc: string, group: AdjGroup = "CO"): RemitLine => ({ lineId: l.id, cpt: l.cpt, billed, allowed: 0, paid: 0, patientResp: 0, adjustments: [{ group, carc, amount: billed }] });
      if (medicare && MEDICARE_PART_D.has(l.cpt)) return deny("109");
      if (medicare && l.pricing?.status === "N") return deny("96");
      if (medicare && l.pricing?.status === "I") return deny("4");
      if (l.pricing?.allowed === null || l.pricing === undefined) return deny("16");
      const allowed = r2(Math.min(billed, (l.pricing.allowed ?? 0) * l.units));
      const coins = medicare ? (l.pricing.coinsurance ?? 20) / 100 : 0.2;
      const patientResp = r2(allowed * coins);
      const paid = r2(allowed - patientResp);
      const adjustments: Adjustment[] = [];
      if (billed > allowed) adjustments.push({ group: "CO", carc: "45", amount: r2(billed - allowed) });
      if (patientResp > 0) adjustments.push({ group: "PR", carc: "2", amount: patientResp });
      return { lineId: l.id, cpt: l.cpt, billed, allowed, paid, patientResp, adjustments };
    });
    return { id: `rm_${meta.claimId}_${Date.parse(meta.at).toString(36)}`, at: meta.at, source: "clearinghouse", payerClaimId: `${claim.payer === "Medicare" ? "MCR" : "PYR"}${meta.claimId.replace(/\W/g, "").slice(-10).toUpperCase()}`, lines, totals: totalsOf(lines) };
  },
};

export function buildAppealLetter(input: { claim: Claim; remit: Remit; patient: { name: string; dob: string; memberId?: string }; clinician: string; dos: string; noteExcerpt: string[]; payer: string }) {
  const d = denialOf(input.remit);
  const deniedLines = input.remit.lines.filter((l) => l.paid === 0 && l.patientResp === 0);
  const codes = deniedLines.map((l) => `${l.cpt} (CARC ${l.adjustments.map((a) => `${a.group}-${a.carc}`).join(", ")})`).join("; ");
  return [
    `Re: Request for redetermination`,
    `Patient: ${input.patient.name} · DOB ${input.patient.dob}${input.patient.memberId ? ` · Member ID ${input.patient.memberId}` : ""}`,
    `Payer claim number: ${input.remit.payerClaimId} · Date of service: ${input.dos}`,
    `Denied services: ${codes}`,
    ``,
    `To the ${input.payer} appeals department:`,
    ``,
    `We request reconsideration of the services above, denied as ${d?.category.replace("_", " ") ?? "not payable"}. The services were medically necessary and were documented contemporaneously by ${input.clinician}. The diagnoses on the claim (${input.claim.dx.map((x) => x.code).join(", ")}) are reported to the highest specificity supported by the record under the ICD-10-CM Official Guidelines, and each service line is linked to the diagnosis it treats.`,
    ``,
    `Relevant documentation from the signed note:`,
    ...input.noteExcerpt.map((s) => `• ${s}`),
    ``,
    `The complete signed note, orders, and supporting results are enclosed. Please reprocess the denied lines.`,
    ``,
    `Sincerely,`,
    input.clinician,
  ].join("\n");
}
