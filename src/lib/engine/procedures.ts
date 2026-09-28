import type { NoteSentence, Utterance } from "../types";
import { wordToNumber } from "./text";

export interface ProcedureLine {
  key: string;
  cpt: string;
  units: number;
  label: string;
  site: string | null;
  laterality: "RT" | "LT" | "50" | null;
  addOn?: { cpt: string; units: number; label: string };
  evidence: string[];
  detail: string[];
}

export interface DrugLine {
  hcpcs: string;
  label: string;
  dose: string;
  units: number;
  evidence: string[];
}

export interface ProcedureFacts {
  procedures: ProcedureLine[];
  drugs: DrugLine[];
  consent: { documented: boolean; evidence: string[] };
  timeOut: boolean;
  prep: string | null;
  complications: string | null;
  evidence: string[];
}

const NUM = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty";
const n = (s: string | undefined, d = 1) => {
  if (!s) return d;
  const v = Number(s);
  return Number.isNaN(v) ? wordToNumber(s.toLowerCase()) ?? d : v;
};

const MAJOR = /\b(knee|shoulder|hip|subacromial)\b/i;
const INTERMEDIATE = /\b(wrist|elbow|ankle|olecranon bursa|trochanteric bursa|pes anserine)\b/i;
const SMALL = /\b(finger|toe|thumb|mcp|pip|dip|trigger finger|interphalangeal)\b/i;

function side(t: string): ProcedureLine["laterality"] {
  if (/\b(both|bilateral(?:ly)?)\b/i.test(t)) return "50";
  if (/\bright\b/i.test(t)) return "RT";
  if (/\bleft\b/i.test(t)) return "LT";
  return null;
}

const DRUGS: { re: RegExp; hcpcs: string; label: string; per: number; unit: string }[] = [
  { re: /\b(\d+(?:\.\d+)?)\s*(?:mg|milligrams?)\s+(?:of\s+)?(?:triamcinolone|kenalog)\b|\b(?:triamcinolone|kenalog)\s+(\d+(?:\.\d+)?)\s*(?:mg|milligrams?)\b/i, hcpcs: "J3301", label: "Triamcinolone acetonide", per: 10, unit: "mg" },
  { re: /\b(\d+)\s*(?:mg|milligrams?)\s+(?:of\s+)?(?:methylprednisolone|depo-?medrol)\b|\b(?:methylprednisolone|depo-?medrol)\s+(\d+)\s*(?:mg|milligrams?)\b/i, hcpcs: "J1030", label: "Methylprednisolone acetate", per: 40, unit: "mg" },
  { re: /\b(\d+)\s*(?:mg|milligrams?)\s+(?:of\s+)?(?:ketorolac|toradol)\b|\b(?:ketorolac|toradol)\s+(\d+)\s*(?:mg|milligrams?)\b/i, hcpcs: "J1885", label: "Ketorolac", per: 15, unit: "mg" },
  { re: /\b(\d+)\s*(?:mg|milligrams?)\s+(?:of\s+)?(?:ceftriaxone|rocephin)\b|\b(?:ceftriaxone|rocephin)\s+(\d+)\s*(?:mg|milligrams?)\b/i, hcpcs: "J0696", label: "Ceftriaxone", per: 250, unit: "mg" },
  { re: /\b(\d+)\s*(?:mcg|micrograms?)\s+(?:of\s+)?(?:b-?12|vitamin b-?12|cyanocobalamin)\b|\b(?:b-?12|cyanocobalamin)\s+(\d+)\s*(?:mcg|micrograms?)\b|\b(?:b-?12|cyanocobalamin) (?:shot|injection)\b/i, hcpcs: "J3420", label: "Cyanocobalamin", per: 1000, unit: "mcg" },
  { re: /\b(\d+(?:\.\d+)?)\s*(?:mg|milligrams?)\s+(?:of\s+)?(?:dexamethasone|decadron)\b|\b(?:dexamethasone|decadron)\s+(\d+(?:\.\d+)?)\s*(?:mg|milligrams?)\b/i, hcpcs: "J1100", label: "Dexamethasone sodium phosphate", per: 1, unit: "mg" },
];

const IM = /\b(?:IM|intramuscular(?:ly)?|in (?:the|your) (?:arm|deltoid|glute|buttock|hip))\b|\b(?:shot|injection) of (?:toradol|ketorolac|ceftriaxone|rocephin|b-?12|dexamethasone|decadron)\b/i;

const REPAIR: { re: RegExp; bands: [number, string][] }[] = [
  { re: /\b(face|forehead|cheek|chin|eyebrow|eyelid|ear|nose|lip)\b/i, bands: [[2.5, "12011"], [5, "12013"], [7.5, "12014"], [12.5, "12015"]] },
  { re: /./, bands: [[2.5, "12001"], [7.5, "12002"], [12.5, "12004"], [20, "12005"]] },
];

export function extractProcedures(utts: Utterance[]): ProcedureFacts {
  const procedures: ProcedureLine[] = [];
  const drugs: DrugLine[] = [];
  const evidence: string[] = [];
  const add = (p: ProcedureLine) => {
    if (!procedures.some((x) => x.key === p.key)) procedures.push(p);
    for (const e of p.evidence) if (!evidence.includes(e)) evidence.push(e);
  };
  const clin = utts.filter((u) => u.speaker === "clinician");
  for (const u of clin) {
    const t = u.text;
    if (/\b(?:next time|next visit|if (?:it|this) doesn't|we could|we can|option|consider|would you like|do you want)\b/i.test(t) && !/\b(?:I (?:injected|did|performed|removed|froze|repaired|drained|took)|we (?:injected|did|performed|removed|froze|repaired|drained|took))\b/i.test(t)) continue;
    if (/\b(?:inject(?:ed|ing|ion)?|aspirat(?:ed|ing|ion)|arthrocentesis|drained? (?:the )?(?:knee|joint))\b/i.test(t) && (MAJOR.test(t) || INTERMEDIATE.test(t) || SMALL.test(t))) {
      const us = /\bultrasound(?:[- ]guid(?:ed|ance))\b|\bunder ultrasound\b/i.test(t);
      const [cpt, label, site] = MAJOR.test(t) ? [us ? "20611" : "20610", "Arthrocentesis, aspiration and/or injection, major joint or bursa", MAJOR.exec(t)![1]] : INTERMEDIATE.test(t) ? [us ? "20606" : "20605", "Arthrocentesis, aspiration and/or injection, intermediate joint or bursa", INTERMEDIATE.exec(t)![1]] : [us ? "20604" : "20600", "Arthrocentesis, aspiration and/or injection, small joint or bursa", SMALL.exec(t)![1]];
      add({ key: `joint:${site.toLowerCase()}:${side(t) ?? ""}`, cpt, units: 1, label, site: site.toLowerCase(), laterality: side(t), evidence: [u.id], detail: [us ? "Ultrasound guidance with permanent image recorded" : ""].filter(Boolean) });
    }
    const bx = new RegExp(`\\b(?:(${NUM}|a)\\s+)?(?:(shave|tangential|punch|incisional)\\s+)?biops(?:y|ies)\\b`, "i").exec(t);
    if (bx && /\b(?:took|did|performed|biopsied|biopsy (?:of|from))\b/i.test(t)) {
      const count = bx[1] && bx[1].toLowerCase() !== "a" ? n(bx[1]) : 1;
      const kind = (bx[2] ?? "shave").toLowerCase();
      const [first, extra, lbl] = kind === "punch" ? ["11104", "11105", "Punch biopsy of skin"] : kind === "incisional" ? ["11106", "11107", "Incisional biopsy of skin"] : ["11102", "11103", "Tangential (shave) biopsy of skin"];
      add({ key: `bx:${kind}`, cpt: first, units: 1, label: `${lbl}, single lesion`, site: /\bon (?:the|his|her|your) ([a-z ]{3,30}?)(?:[,.]|$| and)/i.exec(t)?.[1] ?? null, laterality: side(t), addOn: count > 1 ? { cpt: extra, units: count - 1, label: `${lbl}, each additional lesion` } : undefined, evidence: [u.id], detail: [`${count} lesion${count === 1 ? "" : "s"}`] });
    }
    const ak = new RegExp(`\\b(?:froze|frozen|freez(?:e|ing)|cryo(?:therapy)?|liquid nitrogen)\\b[^.]*?\\b(${NUM})\\s+(?:actinic keratos[ei]s|AKs?|pre-?cancer)`, "i").exec(t) ?? new RegExp(`\\b(${NUM})\\s+(?:actinic keratos[ei]s|AKs?)\\b[^.]*\\b(?:froze|frozen|liquid nitrogen|cryo)`, "i").exec(t);
    if (ak) {
      const count = n(ak[1]);
      add({ key: "ak", cpt: count >= 15 ? "17004" : "17000", units: 1, label: count >= 15 ? "Destruction of premalignant lesions, 15 or more" : "Destruction of premalignant lesion, first", site: null, laterality: null, addOn: count > 1 && count < 15 ? { cpt: "17003", units: count - 1, label: "Destruction of premalignant lesions, second through 14th, each" } : undefined, evidence: [u.id], detail: [`${count} actinic keratoses treated with liquid nitrogen`] });
    }
    const wart = new RegExp(`\\b(?:froze|frozen|freez(?:e|ing)|cryo|liquid nitrogen|destroy(?:ed)?)\\b[^.]*?\\b(?:(${NUM})\\s+)?(?:warts?|verrucae?|skin tags?|molluscum)`, "i").exec(t);
    if (wart && !ak) {
      const count = n(wart[1]);
      add({ key: "benign", cpt: count >= 15 ? "17111" : "17110", units: 1, label: count >= 15 ? "Destruction of benign lesions, 15 or more" : "Destruction of benign lesions, up to 14", site: null, laterality: null, evidence: [u.id], detail: [`${count} lesion${count === 1 ? "" : "s"}`] });
    }
    const lac = /\b(\d+(?:\.\d+)?)\s*(?:cm|centimeters?)\b[^.]*\b(?:laceration|cut)\b|\b(?:laceration|cut)\b[^.]*?\b(\d+(?:\.\d+)?)\s*(?:cm|centimeters?)\b/i.exec(t);
    const repairSaid = /\b(?:repair(?:ed)?|sutur(?:e|es|ed|ing)|stitch(?:es|ed)?|closed (?:it|the wound))\b/i;
    if (lac && (repairSaid.test(t) || clin.some((x) => x.seq > u.seq && x.seq <= u.seq + 3 && repairSaid.test(x.text)))) {
      const cm = Number(lac[1] ?? lac[2]);
      const table = REPAIR.find((r) => r.re.test(t))!;
      const face = table !== REPAIR[1];
      const layered = /\b(?:layered|deep sutures?|subcutaneous|intermediate)\b/i.test(t);
      const code = table.bands.find(([max]) => cm <= max)?.[1] ?? table.bands.at(-1)![1];
      add({ key: "lac", cpt: code, units: 1, label: `Simple repair of ${face ? "face, ears, eyelids, nose, or lips" : "scalp, neck, trunk, or extremities"}, ${cm} cm`, site: table.re.exec(t)?.[1] ?? /\b(?:on|to) (?:the|his|her|your) ([a-z]+)\b/i.exec(t)?.[1] ?? null, laterality: side(t), evidence: [u.id], detail: [layered ? "Layered closure mentioned: an intermediate repair (1203x-1205x) may apply; confirm" : "Single-layer closure"] });
    }
    if (/\b(?:incis(?:ed|ion) and drain(?:ed|age)|I (?:and|&) D|drained (?:the|that|your) (?:abscess|boil|cyst))\b/i.test(t)) add({ key: "ind", cpt: /\b(?:complicated|multiple|packing|loculat)/i.test(t) ? "10061" : "10060", units: 1, label: "Incision and drainage of abscess", site: null, laterality: side(t), evidence: [u.id], detail: /\bpack(?:ed|ing)\b/i.test(t) ? ["Packed"] : [] });
    if (/\b(?:removed|irrigat(?:ed|ion)|cleaned out|curette(?:d)?)\b[^.]*\b(?:ear ?wax|cerumen)\b|\b(?:ear ?wax|cerumen)\b[^.]*\b(?:removed|irrigat(?:ed|ion)|curette(?:d)?)\b/i.test(t)) {
      const instr = /\b(?:curette|curetted|instrument|forceps|suction|loop)\b/i.test(t);
      add({ key: "cerumen", cpt: instr ? "69210" : "69209", units: 1, label: instr ? "Removal of impacted cerumen with instrumentation" : "Removal of impacted cerumen by irrigation", site: "ear", laterality: side(t), evidence: [u.id], detail: [] });
    }
    for (const d of DRUGS) {
      const m = d.re.exec(t);
      if (!m || !/\b(?:inject|injected|injection|gave|give|giving|shot|administer)/i.test(t)) continue;
      const dose = Number(m[1] ?? m[2] ?? d.per);
      if (!drugs.some((x) => x.hcpcs === d.hcpcs)) drugs.push({ hcpcs: d.hcpcs, label: d.label, dose: `${dose} ${d.unit}`, units: Math.max(1, Math.ceil(dose / d.per)), evidence: [u.id] });
      if (!procedures.some((p) => /^206/.test(p.cpt)) && IM.test(t) && !procedures.some((p) => p.cpt === "96372")) add({ key: "im", cpt: "96372", units: 1, label: "Therapeutic injection, subcutaneous or intramuscular", site: /\b(deltoid|glute|buttock|arm|hip)\b/i.exec(t)?.[1] ?? null, laterality: side(t), evidence: [u.id], detail: [] });
    }
  }
  const all = utts.map((u) => u.text).join(" ");
  const consentU = utts.filter((u) => /\b(?:risks?|bleeding|infection|consent|okay to proceed|agree to|sign(?:ed)? the (?:form|consent))\b/i.test(u.text));
  const agreed = utts.some((u) => u.speaker !== "clinician" && /\b(?:yes|okay|sure|go ahead|let's do it|that's fine|I agree)\b/i.test(u.text));
  return {
    procedures,
    drugs,
    consent: { documented: consentU.some((u) => u.speaker === "clinician") && (agreed || /\bconsent (?:was )?(?:obtained|signed)\b/i.test(all)), evidence: consentU.map((u) => u.id) },
    timeOut: /\btime[- ]?out\b|\bconfirm(?:ed|ing)? (?:the )?(?:site|side)\b/i.test(all),
    prep: /\bchlorhexidine\b/i.test(all) ? "chlorhexidine" : /\bbetadine|povidone\b/i.test(all) ? "povidone-iodine" : /\balcohol (?:pad|swab|prep)\b/i.test(all) ? "alcohol" : null,
    complications: /\b(?:no complications|tolerated (?:it |the procedure )?well|minimal bleeding|hemostasis)\b/i.test(all) ? "None; tolerated well" : null,
    evidence,
  };
}

const LAT: Record<string, string> = { RT: "right", LT: "left", "50": "bilateral" };

export function procedureSentences(f: ProcedureFacts, key: string): NoteSentence[] {
  if (!f.procedures.length) return [{ id: `${key}_1`, text: "No procedure documented.", evidence: [], kind: "system", support: "strong" }];
  const out: NoteSentence[] = [];
  const s = (text: string, evidence: string[], support: NoteSentence["support"] = "strong", kind: NoteSentence["kind"] = "fact") => out.push({ id: `${key}_${out.length + 1}`, text, evidence, kind, support });
  for (const p of f.procedures) s(`Procedure: ${p.label}${p.site ? `, ${p.laterality ? `${LAT[p.laterality]} ` : ""}${p.site}` : ""} (${p.cpt}${p.addOn ? ` + ${p.addOn.cpt} x${p.addOn.units}` : ""})${p.detail.length ? `. ${p.detail.join(". ")}` : ""}.`, p.evidence);
  s(f.consent.documented ? "Consent: risks including bleeding, infection, and pain were discussed, and the patient agreed to proceed." : "Consent: ***", f.consent.evidence, f.consent.documented ? "strong" : "none", f.consent.documented ? "fact" : "system");
  if (f.timeOut) s("Time-out performed confirming patient, procedure, and site.", []);
  if (f.prep) s(`Site prepped with ${f.prep}.`, []);
  for (const d of f.drugs) s(`Medication: ${d.label} ${d.dose} (${d.hcpcs} x${d.units}).`, d.evidence);
  s(`Complications: ${f.complications ?? "***"}.`, [], f.complications ? "strong" : "none", f.complications ? "fact" : "system");
  return out;
}
