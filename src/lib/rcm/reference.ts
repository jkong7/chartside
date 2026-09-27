import { clfs, hcpcs, hcc, icdReleaseFor, ncci, partB, pfs, pos, STATUS_CODES } from "../codesets";
import { MEDICARE_ADMIN, NECESSITY, PROLONGED, SERVICE_SUMMARY, type Claim, type ClaimEdit, type ClaimLine, type ClaimReference, type LinePricing, type Payer } from "../engine/billing";
import { reviewDiagnoses } from "./dx";

export interface BillingSettings {
  locality: string;
  chargeMultiplier: number;
  qualifyingApm: boolean;
  commercialMultiplier: number;
  medicaidMultiplier: number;
  npi?: string;
  tin?: string;
  taxonomy?: string;
}

export const DEFAULT_BILLING: BillingSettings = { locality: "06102:16", chargeMultiplier: 2, qualifyingApm: false, commercialMultiplier: 1.3, medicaidMultiplier: 0.75 };

const LEVEL_II = /^[A-CEGHJ-MP-V]\d{4}$/;
const NO_COST_SHARE = new Set(["G0438", "G0439", "G0008", "G0009", "G0010", "90480", "G0402"]);
const NCCI_MODIFIERS = new Set(["59", "XE", "XS", "XP", "XU", "91", "24", "25", "27", "57", "58", "78", "79", "LT", "RT", "E1", "E2", "E3", "E4", "FA", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "TA", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "LC", "LD", "LM", "RC", "RI"]);
const G2211_BASE = /^(9920[2-5]|9921[1-5]|9934[1245]|9934[7-9]|99350)$/;
const G2211_25_OK = /^(G043[89]|G000[89]|G0010|90480|G0402|G0403|G0404|G0405)$/;
const MEDICARE_REPLACEMENT: Record<string, string> = { "99417": "G2212", "99395": "G0438/G0439 (annual wellness visit)", "99396": "G0438/G0439 (annual wellness visit)", "99397": "G0438/G0439 (annual wellness visit)", "90471": "G0008/G0009/G0010 for influenza, pneumococcal, or hepatitis B vaccines" };

const isMedicareLike = (p: Payer) => p === "Medicare" || p === "Medicare Advantage";

function payerFactor(payer: Payer, s: BillingSettings) {
  if (payer === "Commercial") return { factor: s.commercialMultiplier, note: `Estimate: Medicare rate × ${s.commercialMultiplier} (Admin → Billing)` };
  if (payer === "Medicaid") return { factor: s.medicaidMultiplier, note: `Estimate: Medicare rate × ${s.medicaidMultiplier} (Admin → Billing)` };
  if (payer === "Self-pay") return { factor: 0, note: "Self-pay: no payer allowance" };
  return { factor: 1, note: undefined };
}

export function medicareUnitPrice(code: string, modifiers: string[], placeOfService: string, s: BillingSettings, locality = s.locality): LinePricing | null {
  const mod = modifiers.find((m) => ["26", "TC"].includes(m)) ?? null;
  const row = pfs.row(code, mod);
  if (row && ["A", "R", "T", "C"].includes(row.s) && !row.nm) {
    const price = pfs.price(code, { modifier: mod, pos: placeOfService, locality, qualifyingApm: s.qualifyingApm })!;
    return { basis: "MPFS", allowed: row.s === "C" ? null : price.allowed, status: row.s, rvu: price.rvu.total, coinsurance: NO_COST_SHARE.has(code) ? 0 : 20, note: row.s === "C" ? "Carrier-priced: the MAC sets the payment" : `${price.facility ? "Facility" : "Non-facility"} rate · ${price.gpci.name} · CF $${price.conversionFactor}`, source: { set: "MPFS", version: pfs.meta().version, ref: `${code}${mod ? `-${mod}` : ""} status ${row.s}` } };
  }
  const lab = clfs.rate(code, modifiers.includes("QW") ? "QW" : null);
  if (lab) return { basis: "CLFS", allowed: lab.rate, coinsurance: 0, note: "Clinical Laboratory Fee Schedule (national limit)", source: { set: "CLFS", version: clfs.meta().version, ref: code } };
  const drug = partB.limit(code);
  if (drug) return { basis: "ASP", allowed: Math.round(drug.limit * 100) / 100, coinsurance: drug.coinsurance, note: drug.vaccine ? `Part B vaccine payment limit (${drug.dosage ?? "per dose"})` : `Part B drug payment limit (${drug.dosage ?? "per unit"})`, source: { set: "Medicare Part B payment limits", version: partB.meta().version, ref: code } };
  if (/^G00(08|09|10)$/.test(code)) return { basis: "none", allowed: null, status: row?.s, coinsurance: 0, note: "Paid at the locality-adjusted Medicare vaccine administration rate published on the CMS Vaccine Pricing page", source: { set: "CMS Vaccine Pricing", version: "2026" } };
  return row ? { basis: "none", allowed: null, status: row.s, note: STATUS_CODES[row.s] ?? `Status ${row.s}`, source: { set: "MPFS", version: pfs.meta().version, ref: `${code} status ${row.s}` } } : null;
}

export function makeClaimReference(input: { dos: string; settings?: Partial<BillingSettings> }): ClaimReference {
  const s: BillingSettings = { ...DEFAULT_BILLING, ...(input.settings ?? {}) };
  const dos = input.dos.slice(0, 10);
  const release = icdReleaseFor(dos);
  const mac = s.locality.split(":")[0];

  const describe = (code: string) => {
    if (LEVEL_II.test(code)) {
      const h = hcpcs.lookup(code);
      if (h) return h.long.length > 90 ? h.short : h.long;
    }
    return SERVICE_SUMMARY[code] ?? null;
  };

  const unit = (code: string, modifiers: string[], claim: Pick<Claim, "placeOfService" | "payer">): LinePricing | null => {
    const base = medicareUnitPrice(code, modifiers, claim.placeOfService, s);
    if (!base) return null;
    const { factor, note } = payerFactor(claim.payer, s);
    if (factor === 1 || base.allowed === null) return base;
    return { ...base, allowed: Math.round(base.allowed * factor * 100) / 100, coinsurance: undefined, note };
  };

  const chargeFor = (code: string, modifiers: string[]) => {
    const national = medicareUnitPrice(code, modifiers, "11", s, "00000:00");
    return national?.allowed ? Math.ceil(national.allowed * s.chargeMultiplier) : null;
  };

  const review = (claim: Claim, ctx: Parameters<ClaimReference["review"]>[1]): ClaimEdit[] => {
    const out: ClaimEdit[] = [];
    let k = 0;
    const add = (e: Omit<ClaimEdit, "id">) => out.push({ id: `rf_${++k}`, ...e });
    const medicare = isMedicareLike(claim.payer);
    const traditional = claim.payer === "Medicare";
    const meds = (ctx.chart?.medications ?? []).map((m) => `${m.name} ${m.dose ?? ""}`);
    const age = ctx.age;
    const { issues, details } = reviewDiagnoses(claim.dx.map((d) => ({ code: d.code, label: d.label })), { dos, age, sex: ctx.sex, meds });
    for (const d of details) for (const i of d.issues) add({ severity: i.severity, rule: i.rule, message: i.message, source: i.source });
    for (const i of issues) add({ severity: i.severity, rule: i.rule, message: i.message, source: i.source });
    const dxBy = new Map(claim.dx.map((d) => [d.pointer, d.code]));
    const em = claim.lines.find((l) => /^992\d\d$/.test(l.cpt));

    for (const l of claim.lines) {
      if (LEVEL_II.test(l.cpt)) {
        if (!hcpcs.lookup(l.cpt)) add({ severity: "error", rule: "HCPCS.UNKNOWN", message: `${l.cpt} is not in the HCPCS Level II file.`, lineId: l.id, source: { set: "HCPCS Level II", version: hcpcs.meta().version } });
        else if (!hcpcs.activeOn(l.cpt, dos)) add({ severity: "error", rule: "HCPCS.INACTIVE", message: `${l.cpt} is not active on ${dos}.`, lineId: l.id, source: { set: "HCPCS Level II", version: hcpcs.meta().version, ref: `${l.cpt} added/termination dates` } });
      }
      for (const m of l.modifiers) if (!/^\d\d$/.test(m) && !hcpcs.modifier(m)) add({ severity: "error", rule: "HCPCS.MODIFIER", message: `Modifier ${m} on ${l.cpt} is not a valid HCPCS modifier.`, lineId: l.id, source: { set: "HCPCS Level II", version: hcpcs.meta().version } });

      if (medicare) {
        const row = pfs.row(l.cpt);
        const replacement = MEDICARE_REPLACEMENT[l.cpt];
        if (row && ["I", "N", "E", "X"].includes(row.s) && !clfs.rate(l.cpt) && !partB.limit(l.cpt) && !/^G00(08|09|10)$/.test(l.cpt) && l.cpt !== "90480") {
          const why = STATUS_CODES[row.s];
          add({ severity: "error", rule: "MPFS.STATUS", message: `${l.cpt} has Medicare status ${row.s} (${why.toLowerCase()}).${replacement ? ` Use ${replacement}.` : row.s === "N" ? " Bill the patient only with a signed ABN (modifier GA) or report GY." : ""}`, lineId: l.id, source: { set: "MPFS", version: pfs.meta().version, ref: `${l.cpt} status ${row.s}` } });
        } else if (row?.s === "B") add({ severity: "warning", rule: "MPFS.BUNDLED", message: `${l.cpt} is bundled (status B); Medicare does not pay it separately.`, lineId: l.id, source: { set: "MPFS", version: pfs.meta().version, ref: `${l.cpt} status B` } });
        if (traditional && l.cpt === "90471") {
          const flu = claim.lines.some((x) => MEDICARE_ADMIN.some(([re, code]) => re.test(x.cpt) && code !== "90480"));
          if (flu) add({ severity: "error", rule: "MEDICARE.VACCINE_ADMIN", message: "Medicare pays influenza, pneumococcal, and hepatitis B vaccine administration only with G0008, G0009, or G0010, not 90471.", lineId: l.id, source: { set: "CMS", version: "Medicare Claims Processing Manual Ch. 18 §10.2.2" } });
        }
        if (traditional && (l.cpt === "90750" || (l.cpt === "90715" && !claim.dx.some((d) => /^[ST]/.test(d.code))))) add({ severity: "error", rule: "MEDICARE.PART_D_VACCINE", message: `${l.cpt === "90750" ? "Recombinant zoster vaccine" : "Routine Tdap"} is a Medicare Part D benefit; a Part B claim will deny. Bill the Part D plan.`, lineId: l.id, source: { set: "CMS", version: "Medicare Part D vaccine coverage; Claims Processing Manual Ch. 18" } });
        if (l.source === "vaccine" && !partB.limit(l.cpt) && !["90750", "90715"].includes(l.cpt)) add({ severity: "error", rule: "ASP.NO_LIMIT", message: `${l.cpt} has no Medicare Part B payment limit for ${dos}. The product may be discontinued (for example, quadrivalent influenza vaccines were replaced by trivalent vaccines); confirm the product and code.`, lineId: l.id, source: { set: "Medicare Part B payment limits", version: partB.meta().version } });
      }

      if (l.cpt === "G2211") {
        const base = claim.lines.find((x) => G2211_BASE.test(x.cpt));
        if (!base) add({ severity: "error", rule: "G2211.BASE", message: "G2211 must be billed with an office/outpatient (99202-99215) or home/residence (99341-99350) E/M visit.", lineId: l.id, source: { set: "CMS", version: "CY2026 PFS final rule (MLN MM14315)" } });
        else if (base.modifiers.includes("25") && !claim.lines.some((x) => G2211_25_OK.test(x.cpt))) add({ severity: "error", rule: "G2211.MODIFIER_25", message: "G2211 is not payable when the E/M carries modifier 25, unless the other same-day service is an annual wellness visit, vaccine administration, or a Part B preventive service.", lineId: l.id, source: { set: "CMS", version: "CY2025/2026 PFS final rules (MLN MM14315)" } });
        if (!medicare) add({ severity: "warning", rule: "G2211.PAYER", message: `G2211 is a Medicare code; confirm ${claim.payer.toLowerCase()} payer policy before submitting.`, lineId: l.id, source: { set: "CMS", version: "HCPCS G2211" } });
      }
      if (l.cpt === "99417" && medicare) add({ severity: "error", rule: "PROLONGED.MEDICARE", message: "Medicare does not recognize 99417 (status I). Report G2212, which starts 15 minutes beyond the maximum time of the base code (99205: 89 min; 99215: 69 min).", lineId: l.id, source: { set: "MPFS", version: pfs.meta().version, ref: "99417 status I; G2212 status A" } });
      if (l.cpt === "G2212" && !medicare) add({ severity: "warning", rule: "PROLONGED.PAYER", message: "G2212 is Medicare-specific; most other payers expect CPT 99417.", lineId: l.id, source: { set: "CMS", version: "HCPCS G2212" } });
      if ((l.cpt === "G2212" || l.cpt === "99417") && em) {
        const rule = l.cpt === "G2212" ? PROLONGED.medicare : PROLONGED.cpt;
        const base = rule.base[em.cpt];
        if (!base) add({ severity: "error", rule: "PROLONGED.BASE", message: `${l.cpt} may only be reported with ${Object.keys(rule.base).join(" or ")}.`, lineId: l.id, source: { set: l.cpt === "G2212" ? "CMS" : "AMA CPT", version: "2026" } });
        else if (ctx.minutes && ctx.minutes < base + (l.units - 1) * 15) add({ severity: "error", rule: "PROLONGED.TIME", message: `${l.units} unit(s) of ${l.cpt} with ${em.cpt} need at least ${base + (l.units - 1) * 15} minutes of total time; ${ctx.minutes} were documented.`, lineId: l.id, source: { set: l.cpt === "G2212" ? "CMS" : "AMA CPT", version: "2026" } });
      }
    }

    if (ncci.loaded()) {
      const m = ncci.manifest();
      const ptpVersion = Object.values(m?.sources ?? {}).find((x) => x.name.includes("procedure-to-procedure"))?.version ?? "loaded";
      for (let i = 0; i < claim.lines.length; i++) {
        for (let j = i + 1; j < claim.lines.length; j++) {
          const a = claim.lines[i];
          const b = claim.lines[j];
          const edit = ncci.ptp(a.cpt, b.cpt, dos);
          if (!edit || edit.modifierIndicator === 9) continue;
          const col2 = edit.column2 === a.cpt ? a : b;
          const col1 = col2 === a ? b : a;
          const bypass = [...col1.modifiers, ...col2.modifiers].some((x) => NCCI_MODIFIERS.has(x));
          if (edit.modifierIndicator === 0) add({ severity: "error", rule: "NCCI.PTP", message: `NCCI bundles ${col2.cpt} into ${col1.cpt} (modifier indicator 0: no modifier allowed). ${col2.cpt} will not be paid.`, lineId: col2.id, source: { set: "NCCI PTP (practitioner)", version: ptpVersion, ref: `${edit.column1}/${edit.column2} eff ${edit.effective}${edit.rationale ? ` · ${edit.rationale}` : ""}` } });
          else if (!bypass) add({ severity: "error", rule: "NCCI.PTP", message: `NCCI bundles ${col2.cpt} into ${col1.cpt}. If the services were distinct, append an NCCI-associated modifier (for example 59/XU, or 25 on the E/M) supported by documentation.`, lineId: col2.id, source: { set: "NCCI PTP (practitioner)", version: ptpVersion, ref: `${edit.column1}/${edit.column2} modifier indicator 1${edit.rationale ? ` · ${edit.rationale}` : ""}` } });
        }
      }
      const totals = new Map<string, number>();
      for (const l of claim.lines) totals.set(l.cpt, (totals.get(l.cpt) ?? 0) + l.units);
      for (const [code, units] of totals) {
        const mue = ncci.mue(code);
        if (mue && units > mue.value) add({ severity: "error", rule: "NCCI.MUE", message: `${code} is billed for ${units} units; the practitioner MUE is ${mue.value} (${mue.mai === 1 ? "claim-line edit" : mue.mai === 2 ? "date-of-service policy edit, not appealable" : "date-of-service clinical edit"}).`, lineId: claim.lines.find((l) => l.cpt === code)?.id, source: { set: "NCCI MUE (practitioner)", version: Object.values(m?.sources ?? {}).find((x) => x.name.includes("unlikely"))?.version ?? "loaded", ref: `${code} MAI ${mue.mai}${mue.rationale ? ` · ${mue.rationale}` : ""}` } });
      }
    }

    for (const l of claim.lines) {
      const linked = l.pointers.map((p) => dxBy.get(p)).filter((x): x is string => !!x);
      if (!linked.length) continue;
      const articles = medicare && ncci.loaded() ? ncci.coverageArticles(l.cpt, mac, dos) : [];
      if (articles.length) {
        const covering = articles.filter((a) => linked.some((c) => ncci.articleCovers(a.id, a.grp, c)));
        if (!covering.length) add({ severity: "error", rule: "LCD.COVERAGE", message: `${l.cpt}: none of the linked diagnoses (${linked.join(", ")}) is on the covered list in ${articles.map((a) => `${a.display_id} "${a.title}"`).join("; ")}.`, lineId: l.id, source: { set: "Medicare Coverage Database", version: `${articles[0].contractor_name} (MAC ${mac})`, ref: articles.map((a) => a.display_id).join(", ") } });
        continue;
      }
      const rule = NECESSITY[l.cpt];
      if (rule && !linked.some((c) => rule.test(c))) add({ severity: "error", rule: "NECESSITY.CHARTSIDE", message: `${l.cpt} (${l.description}) is not supported by the linked diagnosis ${linked.join(", ")}; it is likely to deny for medical necessity.`, lineId: l.id, source: { set: "Chartside clinical-necessity rule", version: "2026.3", ref: medicare ? "Load the Medicare Coverage Database for MAC-specific LCD articles" : "Commercial payer policies vary" } });
    }

    if (!pos.get(claim.placeOfService)) add({ severity: "error", rule: "POS.INVALID", message: `Place of service ${claim.placeOfService} is not a valid CMS POS code.`, source: { set: "CMS Place of Service code set", version: pos.meta().retrieved } });
    if (!release) add({ severity: "error", rule: "ICD.RELEASE", message: `No ICD-10-CM release is loaded for ${dos}.`, source: { set: "ICD-10-CM", version: "none" } });
    return out;
  };

  return {
    dos,
    describe,
    price(l: Pick<ClaimLine, "cpt" | "modifiers" | "units">, claim) {
      const p = unit(l.cpt, l.modifiers, claim);
      const charge = chargeFor(l.cpt, l.modifiers);
      if (!p && charge === null) return null;
      return { charge: Math.round((charge ?? 0) * l.units * 100) / 100, pricing: p ?? { basis: "none", allowed: null, note: "No Medicare pricing found for this code" } };
    },
    expected(code, claim) {
      return unit(code, [], claim)?.allowed ?? null;
    },
    review,
    versions() {
      const v = [
        { label: "ICD-10-CM", version: release?.meta.version ?? "not loaded" },
        { label: "HCPCS Level II", version: hcpcs.meta().version },
        { label: "Physician fee schedule", version: `${pfs.meta().version} · CF $${pfs.conversionFactor(s.qualifyingApm)}` },
        { label: "Clinical lab fee schedule", version: clfs.meta().version },
        { label: "Part B drug/vaccine limits", version: partB.meta().version },
        { label: "CMS-HCC", version: hcc.meta().version },
        { label: "Locality", version: (() => { const l = pfs.locality(s.locality); return `${l.name} (MAC ${l.mac}, locality ${l.locality})`; })() },
      ];
      const lic = ncci.manifest();
      if (lic) for (const src of Object.values(lic.sources)) v.push({ label: src.name.replace(/,.*$/, ""), version: src.version });
      else v.push({ label: "NCCI / LCD edits", version: "not loaded (operator must accept the CMS/AMA license)" });
      return v;
    },
  };
}
