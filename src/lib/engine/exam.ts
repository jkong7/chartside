import type { NoteSentence, Utterance } from "../types";

const TESTS: [string, RegExp][] = [
  ["Lachman", /\blachman'?s?\b/i],
  ["Anterior drawer", /\banterior drawer\b/i],
  ["Posterior drawer", /\bposterior drawer\b/i],
  ["McMurray", /\bmcmurray'?s?\b/i],
  ["Valgus stress", /\bvalgus stress\b/i],
  ["Varus stress", /\bvarus stress\b/i],
  ["Neer", /\bneer'?s?\b/i],
  ["Hawkins-Kennedy", /\bhawkins(?:[- ]kennedy)?\b/i],
  ["Empty can (Jobe)", /\bempty can\b|\bjobe'?s?\b/i],
  ["Drop arm", /\bdrop arm\b/i],
  ["Speed", /\bspeed'?s? test\b/i],
  ["Spurling", /\bspurling'?s?\b/i],
  ["Straight leg raise", /\bstraight leg raise\b|\bSLR\b/i],
  ["FABER", /\bFABER\b|\bpatrick'?s? test\b/i],
  ["FADIR", /\bFADIR\b/i],
  ["Finkelstein", /\bfinkelstein'?s?\b/i],
  ["Phalen", /\bphalen'?s?\b/i],
  ["Tinel", /\btinel'?s?\b/i],
  ["Thompson", /\bthompson'?s?\b/i],
];

const POS = /\b(?:positive|pos|reproduces?|reproducing|painful)\b/i;
const NEGW = /\b(?:negative|neg|normal|stable|no pain|firm endpoint)\b/i;

function side(t: string) {
  return /\bbilateral(?:ly)?\b/i.test(t) ? "bilateral" : /\bright\b/i.test(t) ? "right" : /\bleft\b/i.test(t) ? "left" : null;
}

export interface MskExam {
  tests: { name: string; result: "positive" | "negative"; side: string | null; evidence: string[] }[];
  rom: { text: string; evidence: string[] }[];
  strength: { text: string; evidence: string[] }[];
  neurovascular: { text: string; evidence: string[] } | null;
}

export function extractMsk(utts: Utterance[]): MskExam {
  const tests: MskExam["tests"] = [];
  const rom: MskExam["rom"] = [];
  const strength: MskExam["strength"] = [];
  let nv: MskExam["neurovascular"] = null;
  for (const u of utts.filter((x) => x.speaker === "clinician")) {
    for (const clause of u.text.split(/(?<=[.;])\s+|,\s*(?:and|but)\s+/)) {
      for (const [name, re] of TESTS) {
        const m = re.exec(clause);
        if (!m) continue;
        const around = clause.slice(Math.max(0, m.index - 30), m.index + m[0].length + 30);
        const result = POS.test(around) && !/\bnegative\b/i.test(around) ? "positive" : NEGW.test(around) ? "negative" : null;
        if (!result) continue;
        if (!tests.some((t) => t.name === name)) tests.push({ name, result, side: side(u.text), evidence: [u.id] });
      }
      const r = /\b(?:flexion|extension|abduction|adduction|internal rotation|external rotation|dorsiflexion|plantarflexion)\b[^.;,]{0,25}?\b(\d{1,3})\s*degrees\b|\b(?:full|limited|decreased|reduced) (?:range of motion|ROM)\b[^.;]*/i.exec(clause);
      if (r) rom.push({ text: r[0].replace(/\byour\b/gi, "").trim(), evidence: [u.id] });
      const s = /\b(?:strength|quad(?:ricep)?s?|hamstrings?|grip|deltoid|rotator cuff|hip flexors?)\b[^.;]{0,30}?\b[0-5](?:\+|-)?\s*(?:out of|\/)\s*5\b/i.exec(clause);
      if (s) strength.push({ text: s[0].replace(/\byour\b/gi, "").trim(), evidence: [u.id] });
      if (/\bneurovascular(?:ly)? intact\b|\bpulses (?:are )?(?:intact|2\+|normal)\b|\bsensation (?:is )?intact\b/i.test(clause) && !nv) nv = { text: "Neurovascularly intact distally", evidence: [u.id] };
    }
  }
  return { tests, rom, strength, neurovascular: nv };
}

export function mskSentences(x: MskExam, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  const add = (text: string, evidence: string[]) => out.push({ id: `${key}_${out.length + 1}`, text, evidence, kind: "fact", support: "strong" });
  for (const r of x.rom) add(`Range of motion: ${r.text}.`, r.evidence);
  for (const s of x.strength) add(`Strength: ${s.text}.`, s.evidence);
  const pos = x.tests.filter((t) => t.result === "positive");
  const neg = x.tests.filter((t) => t.result === "negative");
  if (pos.length) add(`Positive: ${pos.map((t) => `${t.name}${t.side && t.side !== "bilateral" ? ` (${t.side})` : ""}`).join(", ")}.`, pos.flatMap((t) => t.evidence));
  if (neg.length) add(`Negative: ${neg.map((t) => t.name).join(", ")}.`, neg.flatMap((t) => t.evidence));
  if (x.neurovascular) add(`${x.neurovascular.text}.`, x.neurovascular.evidence);
  if (!out.length) out.push({ id: `${key}_1`, text: "Musculoskeletal exam: ***", evidence: [], kind: "system", support: "none" });
  return out;
}

const MORPH = /\b(macules?|papules?|plaques?|nodules?|vesicles?|bullae|pustules?|patch(?:es)?|cysts?|erosions?|ulcers?|scales?|wheals?|lesions?|moles?|growths?|spots?)\b/i;
const COLOR = /\b(pink|red|erythematous|brown|dark brown|black|tan|skin-colored|flesh-colored|pearly|violaceous|white|yellow|blue|multicolored|variegated)\b/i;
const SURFACE = /\b(scaly|crusted|ulcerated|rolled borders?|telangiectasias?|irregular borders?|well[- ]demarcated|smooth|verrucous|umbilicated|stuck-on)\b/i;

export interface Lesion {
  count: number | null;
  size: string | null;
  color: string | null;
  morphology: string;
  surface: string[];
  location: string | null;
  abcde: string[];
  evidence: string[];
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, several: 3, multiple: 3 };

export function extractLesions(utts: Utterance[]): Lesion[] {
  const out: Lesion[] = [];
  for (const u of utts.filter((x) => x.speaker === "clinician")) {
    for (const clause of u.text.split(/(?<=[.;])\s+/)) {
      const m = MORPH.exec(clause);
      if (!m || !(/\b\d+(?:\.\d+)?\s*(?:mm|millimeters?|cm|centimeters?)\b/i.test(clause) || COLOR.test(clause) || SURFACE.test(clause))) continue;
      const size = /\b(\d+(?:\.\d+)?)\s*(?:by|x)?\s*(\d+(?:\.\d+)?)?\s*(mm|millimeters?|cm|centimeters?)\b/i.exec(clause);
      const cnt = /\b(\d+|one|two|three|four|five|six|several|multiple)\s+(?:\w+\s+){0,2}(?:macules?|papules?|plaques?|nodules?|lesions?|moles?|spots?)\b/i.exec(clause);
      const loc = /\bon (?:the|your|his|her) ((?:left |right )?[a-z]+(?: [a-z]+)?)\b/i.exec(clause) ?? /\b(?:over|at) (?:the|your) ((?:left |right )?[a-z]+(?: [a-z]+)?)\b/i.exec(clause);
      const unit = size ? (/^c/i.test(size[3]) ? "cm" : "mm") : "";
      const abcde: string[] = [];
      if (/\basymmetr/i.test(clause)) abcde.push("asymmetry");
      if (/\birregular border/i.test(clause)) abcde.push("irregular border");
      if (/\b(?:multicolored|variegated|multiple colors)\b/i.test(clause)) abcde.push("color variation");
      if (size && Number(size[1]) * (unit === "cm" ? 10 : 1) > 6) abcde.push("diameter over 6 mm");
      if (/\b(?:changing|grown|getting bigger|new)\b/i.test(clause)) abcde.push("evolving");
      out.push({
        count: cnt ? NUM[cnt[1].toLowerCase()] ?? Number(cnt[1]) : null,
        size: size ? `${size[1]}${size[2] ? ` x ${size[2]}` : ""} ${unit}` : null,
        color: COLOR.exec(clause)?.[1].toLowerCase() ?? null,
        morphology: m[1].toLowerCase().replace(/s$/, "").replace(/^(?:mole|growth|spot)$/, "lesion"),
        surface: [...clause.matchAll(new RegExp(SURFACE.source, "gi"))].map((x) => x[1].toLowerCase()),
        location: loc?.[1]?.toLowerCase() ?? null,
        abcde: /\b(?:brown|black|dark|mole|pigmented|multicolored)\b/i.test(clause) ? abcde : [],
        evidence: [u.id],
      });
    }
  }
  return out;
}

export function lesionSentences(ls: Lesion[], key: string): NoteSentence[] {
  if (!ls.length) return [{ id: `${key}_1`, text: "Skin exam: ***", evidence: [], kind: "system", support: "none" }];
  return ls.map((l, i) => {
    const adj = l.surface.filter((x) => !/border|telangiect/.test(x));
    const feat = l.surface.filter((x) => /border|telangiect/.test(x));
    const parts = [l.count && l.count > 1 ? `${l.count}` : null, l.size, l.color, adj.join(", ") || null, `${l.morphology}${l.count && l.count > 1 ? "s" : ""}`].filter(Boolean).join(" ");
    const flag = l.abcde.length ? ` Concerning features: ${l.abcde.join(", ")}.` : "";
    return { id: `${key}_${i + 1}`, text: `${parts.charAt(0).toUpperCase()}${parts.slice(1)}${feat.length ? ` with ${feat.join(" and ")}` : ""}${l.location ? ` on the ${l.location}` : ""}.${flag}`, evidence: l.evidence, kind: "fact" as const, support: "strong" as const };
  });
}
