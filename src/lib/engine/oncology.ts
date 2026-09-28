import type { NoteSentence, OncologyProfile, Utterance } from "../types";
import { wordToNumber } from "./text";

export interface Regimen {
  key: string;
  label: string;
  agents: string[];
  cytotoxic: boolean;
  match: RegExp;
}

export const REGIMENS: Regimen[] = [
  { key: "folfirinox", label: "FOLFIRINOX", agents: ["oxaliplatin", "irinotecan", "leucovorin", "fluorouracil"], cytotoxic: true, match: /\bfolfirinox\b/i },
  { key: "folfox", label: "FOLFOX", agents: ["oxaliplatin", "leucovorin", "fluorouracil"], cytotoxic: true, match: /\bfolfox\b|\bmfolfox ?6\b/i },
  { key: "folfiri", label: "FOLFIRI", agents: ["irinotecan", "leucovorin", "fluorouracil"], cytotoxic: true, match: /\bfolfiri\b/i },
  { key: "capox", label: "CAPOX", agents: ["capecitabine", "oxaliplatin"], cytotoxic: true, match: /\bcapox\b|\bxelox\b/i },
  { key: "ac_t", label: "AC-T", agents: ["doxorubicin", "cyclophosphamide", "paclitaxel"], cytotoxic: true, match: /\bAC[- ]?T\b|\bdose[- ]dense AC\b/i },
  { key: "tc", label: "TC", agents: ["docetaxel", "cyclophosphamide"], cytotoxic: true, match: /\bdocetaxel and cyclophosphamide\b|\bTC chemo/i },
  { key: "carbo_taxol", label: "Carboplatin and paclitaxel", agents: ["carboplatin", "paclitaxel"], cytotoxic: true, match: /\bcarbo(?:platin)?(?: and |\/| )(?:taxol|paclitaxel)\b/i },
  { key: "gem_nab", label: "Gemcitabine and nab-paclitaxel", agents: ["gemcitabine", "nab-paclitaxel"], cytotoxic: true, match: /\bgem(?:citabine)?(?: and |\/| )(?:abraxane|nab-?paclitaxel)\b/i },
  { key: "rchop", label: "R-CHOP", agents: ["rituximab", "cyclophosphamide", "doxorubicin", "vincristine", "prednisone"], cytotoxic: true, match: /\bR-?CHOP\b/i },
  { key: "pembro", label: "Pembrolizumab", agents: ["pembrolizumab"], cytotoxic: false, match: /\bpembrolizumab\b|\bkeytruda\b/i },
  { key: "nivo", label: "Nivolumab", agents: ["nivolumab"], cytotoxic: false, match: /\bnivolumab\b|\bopdivo\b/i },
  { key: "trastuzumab", label: "Trastuzumab", agents: ["trastuzumab"], cytotoxic: false, match: /\btrastuzumab\b|\bherceptin\b/i },
  { key: "capecitabine", label: "Capecitabine", agents: ["capecitabine"], cytotoxic: true, match: /\bcapecitabine\b|\bxeloda\b/i },
  { key: "letrozole", label: "Letrozole", agents: ["letrozole"], cytotoxic: false, match: /\bletrozole\b|\bfemara\b/i },
  { key: "anastrozole", label: "Anastrozole", agents: ["anastrozole"], cytotoxic: false, match: /\banastrozole\b|\barimidex\b/i },
  { key: "tamoxifen", label: "Tamoxifen", agents: ["tamoxifen"], cytotoxic: false, match: /\btamoxifen\b/i },
];

export const CANCERS: { key: string; label: string; icd10: string; match: RegExp }[] = [
  { key: "colon", label: "Malignant neoplasm of colon", icd10: "C18.9", match: /\bcolon cancer\b|\b(?:adeno)?carcinoma of the (?:sigmoid |ascending |descending |transverse )?colon\b|\bcolorectal cancer\b/i },
  { key: "rectal", label: "Malignant neoplasm of rectum", icd10: "C20", match: /\brectal cancer\b/i },
  { key: "breast", label: "Malignant neoplasm of breast", icd10: "C50.919", match: /\bbreast cancer\b|\bcarcinoma of the (?:left |right )?breast\b/i },
  { key: "lung", label: "Malignant neoplasm of bronchus or lung", icd10: "C34.90", match: /\blung cancer\b|\bnon-?small cell\b|\bNSCLC\b|\bsmall cell lung\b/i },
  { key: "pancreas", label: "Malignant neoplasm of pancreas", icd10: "C25.9", match: /\bpancreatic cancer\b|\bcancer of the pancreas\b/i },
  { key: "prostate", label: "Malignant neoplasm of prostate", icd10: "C61", match: /\bprostate cancer\b/i },
  { key: "dlbcl", label: "Diffuse large B-cell lymphoma", icd10: "C83.30", match: /\bdiffuse large B[- ]cell\b|\bDLBCL\b/i },
];

export interface Toxicity {
  term: string;
  grade: 1 | 2 | 3 | 4;
  basis: string;
  evidence: string[];
  confirm: boolean;
  icd10?: string;
}

export interface Decision {
  action: "proceed" | "hold" | "reduce" | "discontinue" | "growth_factor" | "switch";
  text: string;
  evidence: string[];
}

export interface OncologyFacts {
  cancer: { label: string; icd10: string; evidence: string[] } | null;
  stage: { group: string; tnm: string | null; evidence: string[] } | null;
  biomarkers: { text: string; evidence: string[] }[];
  regimen: { key: string; label: string; agents: string[]; cytotoxic: boolean; evidence: string[] } | null;
  cycle: { cycle: number; day: number | null; evidence: string[] } | null;
  intent: string | null;
  line: string | null;
  ecog: { score: number; inferred: boolean; basis: string; evidence: string[] } | null;
  toxicities: Toxicity[];
  decisions: Decision[];
  response: { text: string; evidence: string[] } | null;
}

const ROMAN: Record<string, string> = { "0": "0", "1": "I", "2": "II", "3": "III", "4": "IV", one: "I", two: "II", three: "III", four: "IV", i: "I", ii: "II", iii: "III", iv: "IV" };

const num = (s: string) => {
  const n = Number(s);
  return Number.isNaN(n) ? wordToNumber(s.toLowerCase()) : n;
};

const NUMW = "\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

function first<T>(utts: Utterance[], fn: (u: Utterance) => T | null | undefined): T | null {
  for (const u of utts) {
    const r = fn(u);
    if (r) return r;
  }
  return null;
}

function last<T>(utts: Utterance[], fn: (u: Utterance) => T | null | undefined): T | null {
  return first([...utts].reverse(), fn);
}

export function ancGrade(v: number) {
  const k = v > 50 ? v / 1000 : v;
  return k < 0.5 ? 4 : k < 1 ? 3 : k < 1.5 ? 2 : k < 2 ? 1 : 0;
}

export function plateletGrade(v: number) {
  const k = v > 2000 ? v / 1000 : v;
  return k < 25 ? 4 : k < 50 ? 3 : k < 75 ? 2 : k < 150 ? 1 : 0;
}

export function hemoglobinGrade(v: number) {
  return v < 8 ? 3 : v < 10 ? 2 : v < 12 ? 1 : 0;
}

type Detector = { term: string; icd10?: string; mention: RegExp; grades: [number, RegExp][]; basis: (g: number) => string; count?: (t: string) => number | null };

const DETECTORS: Detector[] = [
  {
    term: "Peripheral sensory neuropathy",
    icd10: "G62.0",
    mention: /\bnumb(?:ness)?\b|\btingl\w*|\bpins and needles\b|\bneuropathy\b/i,
    grades: [
      [3, /\b(?:can't|cannot|unable to) (?:button|get dressed|dress myself|feed myself|walk)\b|\bneed help (?:with )?(?:buttons|buttoning|dressing|getting dressed)\b/i],
      [2, /\b(?:trouble|hard time|difficulty|hard) (?:with )?(?:opening|typing|writing|holding|picking up|cooking|using)\w*|\bdrop(?:ping)? things\b|\bhard to (?:open|type|write|hold)\b/i],
      [1, /\b(?:doesn't|does not|don't|not) (?:stop|bother|affect|get in the way)\b|\bmild\b|\bcomes and goes\b/i],
    ],
    basis: (g) => (g === 3 ? "limiting self-care activities" : g === 2 ? "limiting instrumental activities of daily living" : "without functional limitation"),
  },
  {
    term: "Diarrhea",
    icd10: "K52.1",
    mention: /\bdiarrhea\b|\bloose (?:stools?|bowel movements?)\b|\bwatery stools?\b/i,
    grades: [],
    count: (t) => {
      const m = new RegExp(`\\b(${NUMW})(?: to (${NUMW}))? (?:loose |watery )?(?:stools|bowel movements|times) (?:a|per|each) day\\b`, "i").exec(t);
      return m ? num(m[2] ?? m[1]) : null;
    },
    basis: (g) => (g === 3 ? "7 or more stools per day over baseline" : g === 2 ? "4 to 6 stools per day over baseline" : "fewer than 4 stools per day over baseline"),
  },
  {
    term: "Nausea",
    icd10: "R11.0",
    mention: /\bnause\w*|\bqueasy\b/i,
    grades: [
      [3, /\bcan't keep (?:anything|food|liquids|fluids) down\b|\bbarely (?:eating|drinking)\b|\bIV fluids\b/i],
      [2, /\b(?:eating|eat) less\b|\bnot eating (?:as )?much\b|\bappetite (?:is )?(?:down|poor|not great)\b|\bskip(?:ping)? meals\b/i],
    ],
    basis: (g) => (g === 3 ? "inadequate oral intake" : g === 2 ? "oral intake decreased without significant weight loss" : "loss of appetite without change in eating habits"),
  },
  {
    term: "Vomiting",
    icd10: "R11.10",
    mention: /\bvomit\w*|\bthr(?:ew|ow(?:ing)?) up\b/i,
    grades: [],
    count: (t) => {
      const m = new RegExp(`\\b(${NUMW}|once|twice)(?: or (${NUMW}))? times?\\b`, "i").exec(t);
      if (!m) return null;
      const v = (s: string) => (/once/i.test(s) ? 1 : /twice/i.test(s) ? 2 : num(s));
      return v(m[2] ?? m[1]);
    },
    basis: (g) => (g === 3 ? "6 or more episodes in 24 hours" : g === 2 ? "3 to 5 episodes in 24 hours" : "1 to 2 episodes in 24 hours"),
  },
  {
    term: "Oral mucositis",
    icd10: "K12.31",
    mention: /\bmouth sores?\b|\bsores? in my mouth\b|\bmucositis\b/i,
    grades: [
      [3, /\bcan't eat\b|\bcan't swallow\b|\bonly (?:drinking|liquids)\b/i],
      [2, /\bhurts? to eat\b|\bpainful\b|\bsoft foods?\b/i],
    ],
    basis: (g) => (g === 3 ? "severe pain interfering with oral intake" : g === 2 ? "moderate pain, modified diet indicated" : "mild symptoms"),
  },
  {
    term: "Fatigue",
    mention: /\btired\b|\bfatigue\w*|\bexhausted\b|\bwiped out\b|\bno energy\b/i,
    grades: [
      [3, /\bin bed (?:most|all) (?:of )?(?:the )?day\b|\bcan't (?:shower|bathe|get dressed)\b/i],
      [2, /\bnot (?:better|relieved) (?:with|after|by) (?:rest|sleep|a nap)\b|\bnap(?:ping)? every (?:day|afternoon)\b|\bcan't (?:do|get to|keep up with) (?:my |the )?(?:housework|chores|groceries|shopping|errands)\b/i],
    ],
    basis: (g) => (g === 3 ? "not relieved by rest, limiting self-care" : g === 2 ? "not relieved by rest, limiting instrumental activities of daily living" : "relieved by rest"),
  },
  {
    term: "Palmar-plantar erythrodysesthesia syndrome",
    icd10: "L27.1",
    mention: /\bhand[- ]foot\b|\b(?:red|peeling|cracked|painful) (?:hands|palms|feet|soles)\b/i,
    grades: [
      [3, /\bcan't walk\b|\bblisters?\b/i],
      [2, /\bpainful\b|\bhurts?\b/i],
    ],
    basis: (g) => (g === 3 ? "severe skin changes with pain limiting self-care" : g === 2 ? "skin changes with pain" : "minimal skin changes without pain"),
  },
];

const countGrade: Record<string, (n: number) => 1 | 2 | 3> = {
  Diarrhea: (n) => (n >= 7 ? 3 : n >= 4 ? 2 : 1),
  Vomiting: (n) => (n >= 6 ? 3 : n >= 3 ? 2 : 1),
};

const NEGATED = /\b(?:no|not|denies|without|any)\b[^.,;]{0,20}$/i;

function toxicitiesFrom(utts: Utterance[]): Toxicity[] {
  const out: Toxicity[] = [];
  for (const d of DETECTORS) {
    const hits = utts.filter((u) => {
      const m = d.mention.exec(u.text);
      return m && !NEGATED.test(u.text.slice(0, m.index)) && !/\?\s*$/.test(u.text);
    });
    if (!hits.length) continue;
    const ctxUtts = utts.filter((u) => hits.some((h) => Math.abs(h.seq - u.seq) <= 1 && u.speaker !== "clinician"));
    const text = ctxUtts.map((u) => u.text).join(" ");
    let grade: 1 | 2 | 3 | 4 = 1;
    let confirm = true;
    const counted = d.count?.(text) ?? null;
    if (counted !== null && countGrade[d.term]) {
      grade = countGrade[d.term](counted);
      confirm = false;
    } else {
      for (const [g, re] of d.grades) {
        if (re.test(text)) {
          grade = g as 1 | 2 | 3;
          confirm = false;
          break;
        }
      }
    }
    const explicit = new RegExp(`\\bgrade (\\d|one|two|three|four)\\b[^.]{0,40}${d.term.split(" ").pop()}|${d.term.split(" ").pop()}[^.]{0,30}\\bgrade (\\d|one|two|three|four)\\b`, "i");
    const ex = last(utts.filter((u) => u.speaker === "clinician"), (u) => explicit.exec(u.text));
    if (ex) {
      grade = Math.min(4, Math.max(1, num(ex[1] ?? ex[2]) ?? grade)) as 1 | 2 | 3 | 4;
      confirm = false;
    }
    out.push({ term: d.term, grade, basis: d.basis(grade), evidence: Array.from(new Set(ctxUtts.concat(hits).map((u) => u.id))), confirm, icd10: d.icd10 });
  }
  return out;
}

function labToxicities(utts: Utterance[]): Toxicity[] {
  const out: Toxicity[] = [];
  const labs: [string, RegExp, (v: number) => number, string, string?][] = [
    ["Neutrophil count decreased", /\b(?:ANC|absolute neutrophil count|neutrophils?)\b[^\d.?]{0,25}(\d+(?:\.\d+)?)/i, ancGrade, "ANC", "D70.1"],
    ["Platelet count decreased", /\bplatelets?\b[^\d.?]{0,25}(\d+(?:,\d{3})?)/i, (v) => plateletGrade(v), "platelets", "D69.59"],
    ["Anemia", /\b(?:hemoglobin|hgb)\b(?! a1c)[^\d.?]{0,25}(\d+(?:\.\d)?)/i, hemoglobinGrade, "hemoglobin", "D64.81"],
  ];
  for (const [term, re, grade, name, icd] of labs) {
    const hit = first(utts, (u) => {
      const m = re.exec(u.text);
      return m ? { u, v: Number(m[1].replace(/,/g, "")), raw: m[1] } : null;
    });
    if (!hit) continue;
    const g = grade(hit.v);
    if (g > 0) out.push({ term, grade: g as 1 | 2 | 3 | 4, basis: `${name} ${hit.raw}`, evidence: [hit.u.id], confirm: false, icd10: icd });
  }
  if (utts.some((u) => /\bfebrile neutropenia\b/i.test(u.text) && !NEGATED.test(u.text.slice(0, u.text.search(/febrile neutropenia/i))))) {
    const u = utts.find((x) => /\bfebrile neutropenia\b/i.test(x.text))!;
    out.push({ term: "Febrile neutropenia", grade: 3, basis: "fever with neutropenia", evidence: [u.id], confirm: false, icd10: "D70.1" });
  }
  return out;
}

function ecogFrom(utts: Utterance[]): OncologyFacts["ecog"] {
  const explicit = last(utts, (u) => {
    const m = /\bECOG(?: performance status)?(?: is| of| score)?\s*(?:is\s*)?(\d|zero|one|two|three|four)\b/i.exec(u.text);
    return m ? { score: num(m[1]) ?? 0, u } : null;
  });
  if (explicit) return { score: explicit.score, inferred: false, basis: "stated", evidence: [explicit.u.id] };
  const cues: [number, RegExp, string][] = [
    [4, /\b(?:bed ?bound|can't get out of bed|in bed all day)\b/i, "confined to bed"],
    [3, /\bin bed (?:most|more than half) (?:of )?(?:the )?day\b|\bneed help (?:with )?(?:bathing|dressing|showering)\b/i, "in bed or chair more than half of waking hours"],
    [2, /\blying down (?:a lot|half|part)|\brest(?:ing)? (?:a lot|half the day|most afternoons)\b|\bcan(?:'t| not) work\b.*\btake care of myself\b/i, "ambulatory and capable of self-care, unable to work"],
    [1, /\b(?:can't|cannot|not able to) do (?:anything )?(?:heavy|strenuous)|\blight (?:housework|work|activity)\b|\bslower than (?:usual|before)\b|\bstill (?:working|walking)[^.]*\b(?:but|though)\b/i, "restricted in strenuous activity, ambulatory"],
    [0, /\b(?:doing|do|can do) (?:all|everything) (?:I|my) (?:normally|usual|used to)\b|\bfully active\b|\bback to (?:normal|my usual)\b/i, "fully active"],
  ];
  for (const [score, re, basis] of cues) {
    const u = utts.find((x) => x.speaker !== "clinician" && re.test(x.text));
    if (u) return { score, inferred: true, basis, evidence: [u.id] };
  }
  return null;
}

function decisionsFrom(utts: Utterance[], regimen: OncologyFacts["regimen"]): Decision[] {
  const out: Decision[] = [];
  const agents = Array.from(new Set([...(regimen?.agents ?? []), ...REGIMENS.flatMap((r) => r.agents), "5-FU", "fluorouracil", "the bolus"]));
  const agentRe = agents.map((a) => a.replace(/[-]/g, "[- ]?")).join("|");
  for (const u of utts.filter((x) => x.speaker === "clinician")) {
    const t = u.text;
    const red = new RegExp(`\\b(?:reduce|decrease|lower|drop|cut)\\s+(?:the\\s+)?(?:dose of\\s+)?(?:the\\s+)?(${agentRe})\\b[^.]*?\\b(?:by\\s+)?(\\d{1,2})\\s*(?:percent|%)`, "i").exec(t);
    if (red) out.push({ action: "reduce", text: `Dose reduce ${red[1].toLowerCase()} by ${red[2]}%`, evidence: [u.id] });
    const dropAgent = new RegExp(`\\b(?:drop|stop|omit|discontinue|leave out)\\s+(?:the\\s+)?(${agentRe})\\b(?![^.]*\\b(?:by|percent|%))`, "i").exec(t);
    if (dropAgent && !red) out.push({ action: "discontinue", text: `Discontinue ${dropAgent[1].toLowerCase()}`, evidence: [u.id] });
    if (/\b(?:hold|delay|postpone|skip)\s+(?:today's|this|the|this week's)?\s*(?:treatment|cycle|chemo(?:therapy)?|infusion|dose)\b|\bnot (?:going to )?treat today\b/i.test(t)) out.push({ action: "hold", text: /\bweek\b/i.test(t) ? `Hold treatment; ${/\bone week|a week|1 week/i.test(t) ? "reassess in 1 week" : "reassess"}` : "Hold treatment", evidence: [u.id] });
    else if (/\b(?:proceed|go ahead|move forward)\s+with\s+(?:cycle|treatment|today's|chemo|your)|\btreat(?:ing)? (?:you )?today\b|\bcleared (?:you )?for (?:treatment|cycle)/i.test(t)) out.push({ action: "proceed", text: "Proceed with treatment today", evidence: [u.id] });
    if (/\b(?:neulasta|pegfilgrastim|filgrastim|neupogen|G-?CSF|growth factor)\b/i.test(t) && /\b(?:add|start|give|with|need)\b/i.test(t)) out.push({ action: "growth_factor", text: "Add growth factor support (pegfilgrastim)", evidence: [u.id] });
    const sw = /\b(?:switch|change) (?:you )?(?:to|over to) ([A-Za-z-]+(?: and [A-Za-z-]+)?)\b/i.exec(t);
    if (sw && REGIMENS.some((r) => r.match.test(sw[1]))) out.push({ action: "switch", text: `Switch to ${REGIMENS.find((r) => r.match.test(sw[1]))!.label}`, evidence: [u.id] });
  }
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.text) ? false : (seen.add(d.text), true)));
}

export function extractOncology(utts: Utterance[], profile?: OncologyProfile | null): OncologyFacts {
  const cancer = first(utts, (u) => {
    const c = CANCERS.find((x) => x.match.test(u.text));
    if (!c) return null;
    const same = profile?.icd10 && profile.icd10.slice(0, 3) === c.icd10.slice(0, 3);
    return { label: same ? profile!.diagnosis : c.label, icd10: same ? profile!.icd10! : c.icd10, evidence: [u.id] };
  }) ?? (profile?.diagnosis ? { label: profile.diagnosis, icd10: profile.icd10 ?? "", evidence: ["chart"] } : null);
  const stage = last(utts, (u) => {
    const g = /\bstage\s+(0|iv|iii|ii|i|[1-4]|one|two|three|four)\s?([abc])?\b/i.exec(u.text);
    const t = /\b[cpy]?T([0-4][a-d]?|is|x)[\s,]*N([0-3][a-c]?|x)[\s,]*M([01][a-c]?|x)\b/i.exec(u.text);
    if (!g && !t) return null;
    return { group: g ? `${ROMAN[g[1].toLowerCase()] ?? g[1].toUpperCase()}${(g[2] ?? "").toUpperCase()}` : profile?.stage ?? "", tnm: t ? `T${t[1]} N${t[2]} M${t[3]}` : profile?.tnm ?? null, evidence: [u.id] };
  }) ?? (profile?.stage ? { group: profile.stage, tnm: profile.tnm ?? null, evidence: ["chart"] } : null);
  const biomarkers: OncologyFacts["biomarkers"] = [];
  const markers: [RegExp, (m: RegExpExecArray) => string][] = [
    [/\b(ER|PR|estrogen receptor|progesterone receptor|HER-?2)[- ](positive|negative|\+|-)/gi, (m) => `${m[1].replace(/estrogen receptor/i, "ER").replace(/progesterone receptor/i, "PR").toUpperCase().replace("HER-2", "HER2")} ${/pos|\+/i.test(m[2]) ? "positive" : "negative"}`],
    [/\b(KRAS|NRAS|BRAF|EGFR|ALK)\s+(wild[- ]type|mutant|mutated|positive|negative|mutation)/gi, (m) => `${m[1].toUpperCase()} ${/wild/i.test(m[2]) ? "wild type" : /neg/i.test(m[2]) ? "negative" : "mutated"}`],
    [/\b(MSI[- ]high|MSI[- ]H|microsatellite stable|MSS|mismatch repair (?:deficient|proficient)|dMMR|pMMR)\b/gi, (m) => (/high|MSI-H|deficient|dMMR/i.test(m[1]) ? "MSI-high (dMMR)" : "Microsatellite stable (pMMR)")],
    [/\bPD-?L1\b[^\d]{0,15}(\d{1,3})\s*(?:percent|%)/gi, (m) => `PD-L1 ${m[1]}%`],
  ];
  for (const u of utts) {
    for (const [re, fmt] of markers) {
      for (const m of u.text.matchAll(re)) {
        const text = fmt(m as RegExpExecArray);
        if (!biomarkers.some((b) => b.text === text)) biomarkers.push({ text, evidence: [u.id] });
      }
    }
  }
  for (const b of profile?.biomarkers ?? []) if (!biomarkers.some((x) => x.text.split(" ")[0] === b.split(" ")[0])) biomarkers.push({ text: b, evidence: ["chart"] });
  const current = profile?.regimens?.find((r) => !r.end);
  const regimen = first(utts, (u) => {
    const r = REGIMENS.find((x) => x.match.test(u.text) && !/\b(?:switch|change) (?:you )?(?:to|over to)\b/i.test(u.text));
    return r ? { key: r.key, label: r.label, agents: r.agents, cytotoxic: r.cytotoxic, evidence: [u.id] } : null;
  }) ?? (current ? (() => {
    const r = REGIMENS.find((x) => x.label === current.name || x.key === current.name);
    return { key: r?.key ?? current.name, label: current.name, agents: r?.agents ?? [], cytotoxic: r?.cytotoxic ?? true, evidence: ["chart"] };
  })() : null);
  const cycle = first(utts, (u) => {
    const m = new RegExp(`(?<!\\b(?:for|next|until|before|after)\\s)\\bcycle\\s+(${NUMW})(?:,?\\s+day\\s+(${NUMW}))?\\b|\\bC(\\d{1,2})D(\\d{1,2})\\b`, "i").exec(u.text);
    if (!m) return null;
    const c = num(m[1] ?? m[3]);
    return c ? { cycle: c, day: m[2] || m[4] ? num(m[2] ?? m[4]) : null, evidence: [u.id] } : null;
  }) ?? (current?.cycles ? { cycle: current.cycles + 1, day: 1, evidence: ["chart"] } : null);
  const intent = first(utts, (u) => /\b(adjuvant|neoadjuvant|palliative|curative|maintenance)\b/i.exec(u.text)?.[1].toLowerCase()) ?? current?.intent ?? null;
  const line = first(utts, (u) => /\b(first|second|third|fourth)[- ]line\b/i.exec(u.text)?.[1].toLowerCase()) ?? (current?.line ? String(current.line) : null);
  const response = last(utts, (u) => {
    const m = /\b(complete response|partial response|stable disease|progression|progressive disease|no evidence of disease|mixed response)\b/i.exec(u.text);
    return m && /\b(?:scan|ct|pet|mri|imaging)\b/i.test(u.text) ? { text: m[1].toLowerCase().replace("progression", "progressive disease"), evidence: [u.id] } : null;
  });
  const toxicities = [...toxicitiesFrom(utts), ...labToxicities(utts)];
  return { cancer, stage, biomarkers, regimen, cycle, intent, line, ecog: ecogFrom(utts), toxicities, decisions: decisionsFrom(utts, regimen), response };
}

const s = (key: string, i: number, text: string, evidence: string[], support: NoteSentence["support"] = "strong"): NoteSentence => ({ id: `${key}_${i}`, text, evidence: evidence.filter((e) => e !== "chart"), kind: evidence.every((e) => e === "chart") && evidence.length ? "carried" : "fact", support });

export function oncologyHistorySentences(f: OncologyFacts, profile: OncologyProfile | null | undefined, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  if (f.cancer) {
    const stage = f.stage ? `Stage ${f.stage.group}${f.stage.tnm ? ` (${f.stage.tnm})` : ""} ` : "";
    const markers = f.biomarkers.length ? `, ${f.biomarkers.map((b) => b.text).join(", ")}` : "";
    const dx = f.cancer.label.replace(/^Malignant neoplasm of /, "cancer of the ").replace(/^cancer of the bronchus or lung$/, "lung cancer");
    out.push(s(key, out.length + 1, `${stage}${stage ? dx : dx.charAt(0).toUpperCase() + dx.slice(1)}${markers}${profile?.diagnosedOn ? `, diagnosed ${profile.diagnosedOn}` : ""}.`, [...f.cancer.evidence, ...(f.stage?.evidence ?? []), ...f.biomarkers.flatMap((b) => b.evidence)]));
  } else {
    out.push({ id: `${key}_1`, text: "Diagnosis and stage: ***", evidence: [], kind: "system", support: "none" });
  }
  for (const r of profile?.regimens ?? []) {
    if (!r.end) continue;
    out.push(s(key, out.length + 1, `${r.name}${r.intent ? ` (${r.intent})` : ""}, ${r.start} to ${r.end}${r.cycles ? `, ${r.cycles} cycles` : ""}${r.reason ? `; stopped for ${r.reason}` : ""}.`, ["chart"]));
  }
  if (f.response) out.push(s(key, out.length + 1, `Most recent imaging: ${f.response.text}.`, f.response.evidence));
  return out;
}

export function treatmentSentences(f: OncologyFacts, key: string): NoteSentence[] {
  const out: NoteSentence[] = [];
  if (f.regimen) {
    const cyc = f.cycle ? `, cycle ${f.cycle.cycle}${f.cycle.day ? ` day ${f.cycle.day}` : ""}` : "";
    const ctx = [f.intent, f.line ? `${f.line} line` : null].filter(Boolean).join(", ");
    out.push(s(key, out.length + 1, `Current regimen: ${f.regimen.label}${f.regimen.agents.length > 1 ? ` (${f.regimen.agents.join(", ")})` : ""}${ctx ? `, ${ctx}` : ""}${cyc}.`, [...f.regimen.evidence, ...(f.cycle?.evidence ?? [])]));
  }
  if (f.ecog) out.push(s(key, out.length + 1, f.ecog.inferred ? `ECOG performance status ${f.ecog.score} (${f.ecog.basis}; inferred from the conversation, confirm).` : `ECOG performance status ${f.ecog.score}.`, f.ecog.evidence, f.ecog.inferred ? "partial" : "strong"));
  const grade2 = f.toxicities.filter((t) => t.grade >= 2).map((t) => `grade ${t.grade} ${t.term.toLowerCase()}`);
  for (const d of f.decisions) {
    const why = (d.action === "reduce" || d.action === "hold" || d.action === "discontinue") && grade2.length ? ` for ${grade2.join(" and ")}` : "";
    out.push(s(key, out.length + 1, `${d.text}${why}.`, d.evidence));
  }
  if (f.regimen && !f.decisions.some((d) => d.action === "proceed" || d.action === "hold")) out.push({ id: `${key}_${out.length + 1}`, text: "Treatment decision today: ***", evidence: [], kind: "system", support: "none" });
  return out;
}

export function toxicitySentences(f: OncologyFacts, key: string): NoteSentence[] {
  if (!f.toxicities.length) return [{ id: `${key}_1`, text: "No treatment-related toxicities identified in the conversation. Confirm review of systems. ***", evidence: [], kind: "system", support: "none" }];
  return f.toxicities.map((t, i) => s(key, i + 1, `${t.term}: grade ${t.grade} (CTCAE v5.0), ${t.basis}${t.confirm ? "; grade inferred, confirm" : ""}.`, t.evidence, t.confirm ? "partial" : "strong"));
}

export function needsToxicityMonitoring(f: OncologyFacts) {
  return !!f.regimen?.cytotoxic || f.toxicities.some((t) => t.grade >= 2);
}

export function updateProfile(profile: OncologyProfile | null | undefined, f: OncologyFacts, at: string): OncologyProfile | null {
  if (!f.cancer && !profile) return null;
  const p: OncologyProfile = { ...(profile ?? { diagnosis: f.cancer!.label, regimens: [] }), regimens: [...(profile?.regimens ?? [])], toxicityHistory: [...(profile?.toxicityHistory ?? [])], ecogHistory: [...(profile?.ecogHistory ?? [])] };
  if (f.cancer && f.cancer.evidence[0] !== "chart") {
    p.diagnosis = f.cancer.label;
    p.icd10 = f.cancer.icd10;
  }
  if (f.stage && f.stage.evidence[0] !== "chart") {
    p.stage = f.stage.group || p.stage;
    p.tnm = f.stage.tnm ?? p.tnm;
  }
  const bm = f.biomarkers.filter((b) => b.evidence[0] !== "chart").map((b) => b.text);
  if (bm.length) p.biomarkers = Array.from(new Set([...(p.biomarkers ?? []).filter((x) => !bm.some((y) => y.split(" ")[0] === x.split(" ")[0])), ...bm]));
  const date = at.slice(0, 10);
  const switched = f.decisions.find((d) => d.action === "switch");
  const cur = p.regimens.find((r) => !r.end);
  if (f.regimen && f.regimen.evidence[0] !== "chart" && (!cur || cur.name !== f.regimen.label)) {
    if (cur) cur.end = date;
    p.regimens.push({ name: f.regimen.label, start: date, cycles: f.cycle ? f.cycle.cycle - (f.decisions.some((d) => d.action === "hold") ? 1 : 0) : 0, intent: f.intent ?? undefined, line: f.line ?? undefined });
  } else if (cur && f.cycle && !switched && (f.cycle.evidence[0] !== "chart" || f.decisions.some((d) => d.action === "proceed"))) {
    cur.cycles = Math.max(cur.cycles ?? 0, f.cycle.cycle - (f.decisions.some((d) => d.action === "hold") ? 1 : 0));
    if (f.intent) cur.intent = f.intent;
  }
  if (switched) {
    const c = p.regimens.find((r) => !r.end);
    if (c) {
      c.end = date;
      c.reason = f.response?.text === "progressive disease" ? "progression" : f.toxicities.some((t) => t.grade >= 3) ? "toxicity" : undefined;
    }
    p.regimens.push({ name: switched.text.replace(/^Switch to /, ""), start: date, cycles: 0 });
  }
  const cycleNo = f.cycle?.cycle;
  for (const t of f.toxicities) p.toxicityHistory!.push({ date, cycle: cycleNo, term: t.term, grade: t.grade });
  if (f.ecog && !f.ecog.inferred) p.ecogHistory!.push({ date, score: f.ecog.score });
  return p;
}
