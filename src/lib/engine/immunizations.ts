export interface VaccineSeries {
  key: string;
  label: string;
  match: RegExp;
  doses: [number, number][];
  maxAgeMonths?: number;
}

export const CHILD_SCHEDULE: VaccineSeries[] = [
  { key: "hepb", label: "Hepatitis B", match: /hep(?:atitis)?[\s-]?b|hepb|engerix|recombivax/i, doses: [[0, 2], [1, 4], [6, 19]] },
  { key: "rv", label: "Rotavirus", match: /rota/i, doses: [[2, 3], [4, 5]], maxAgeMonths: 8 },
  { key: "dtap", label: "DTaP", match: /\bdtap\b|daptacel|infanrix|pediarix|pentacel|vaxelis|kinrix|quadracel/i, doses: [[2, 3], [4, 5], [6, 7], [15, 19], [48, 84]] },
  { key: "hib", label: "Hib", match: /\bhib\b|haemophilus|acthib|pedvax|pentacel|vaxelis/i, doses: [[2, 3], [4, 5], [12, 16]], maxAgeMonths: 59 },
  { key: "pcv", label: "Pneumococcal conjugate (PCV)", match: /\bpcv\d*|prevnar|vaxneuvance|pneumococcal conjugate/i, doses: [[2, 3], [4, 5], [6, 7], [12, 16]], maxAgeMonths: 59 },
  { key: "ipv", label: "Polio (IPV)", match: /\bipv\b|polio|pediarix|pentacel|vaxelis|kinrix|quadracel/i, doses: [[2, 3], [4, 5], [6, 19], [48, 84]] },
  { key: "mmr", label: "MMR", match: /\bmmr|measles|proquad/i, doses: [[12, 16], [48, 84]] },
  { key: "var", label: "Varicella", match: /varicella|varivax|proquad|chickenpox/i, doses: [[12, 16], [48, 84]] },
  { key: "hepa", label: "Hepatitis A", match: /hep(?:atitis)?[\s-]?a\b|hepa\b|havrix|vaqta/i, doses: [[12, 24], [18, 36]] },
  { key: "tdap", label: "Tdap", match: /\btdap\b|boostrix|adacel/i, doses: [[132, 156]] },
  { key: "hpv", label: "HPV", match: /\bhpv\b|gardasil/i, doses: [[132, 156], [138, 162]] },
  { key: "menacwy", label: "Meningococcal ACWY", match: /menacwy|menactra|menveo|menquadfi|meningococcal (?:conjugate|acwy)/i, doses: [[132, 156], [192, 204]] },
];

export interface ImmunizationGap {
  key: string;
  label: string;
  dose: number;
  have: number;
  dueByMonths: number;
  overdue: boolean;
}

export function ageInMonths(dob: string, at: Date) {
  const d = new Date(`${dob}T12:00:00`);
  return (at.getFullYear() - d.getFullYear()) * 12 + (at.getMonth() - d.getMonth()) - (at.getDate() < d.getDate() ? 1 : 0);
}

function fmtAge(m: number) {
  return m < 24 ? `${m} months` : `${Math.floor(m / 12)} years`;
}

export function dueLabel(g: ImmunizationGap) {
  return `${g.label} dose ${g.dose} (${g.overdue ? "overdue since" : "due now, by"} ${fmtAge(g.dueByMonths)})`;
}

export function immunizationGaps(dob: string, history: { name: string; date: string }[], at: Date): ImmunizationGap[] {
  const age = ageInMonths(dob, at);
  if (age >= 19 * 12) return [];
  const out: ImmunizationGap[] = [];
  for (const v of CHILD_SCHEDULE) {
    if (v.maxAgeMonths !== undefined && age > v.maxAgeMonths) continue;
    const have = history.filter((h) => v.match.test(h.name) && new Date(h.date) <= at).length;
    const next = v.doses[have];
    if (next && age >= next[0]) out.push({ key: v.key, label: v.label, dose: have + 1, have, dueByMonths: next[1], overdue: age >= next[1] });
  }
  return out;
}

export function cms117(dob: string, history: { name: string; date: string }[], at: Date) {
  const age = ageInMonths(dob, at);
  if (age < 24 || age >= 36) return null;
  const second = new Date(`${dob}T12:00:00`);
  second.setFullYear(second.getFullYear() + 2);
  const by = history.filter((h) => new Date(h.date) <= second);
  const count = (re: RegExp) => by.filter((h) => re.test(h.name)).length;
  const need: [string, RegExp, number][] = [
    ["DTaP", CHILD_SCHEDULE.find((v) => v.key === "dtap")!.match, 4],
    ["IPV", CHILD_SCHEDULE.find((v) => v.key === "ipv")!.match, 3],
    ["MMR", CHILD_SCHEDULE.find((v) => v.key === "mmr")!.match, 1],
    ["Hib", CHILD_SCHEDULE.find((v) => v.key === "hib")!.match, 3],
    ["Hepatitis B", CHILD_SCHEDULE.find((v) => v.key === "hepb")!.match, 3],
    ["Varicella", CHILD_SCHEDULE.find((v) => v.key === "var")!.match, 1],
    ["PCV", CHILD_SCHEDULE.find((v) => v.key === "pcv")!.match, 4],
    ["Hepatitis A", CHILD_SCHEDULE.find((v) => v.key === "hepa")!.match, 1],
    ["Rotavirus", CHILD_SCHEDULE.find((v) => v.key === "rv")!.match, 2],
    ["Influenza", /influenza|flu/i, 2],
  ];
  const missing = need.filter(([, re, n]) => count(re) < n).map(([label, re, n]) => `${label} (${count(re)} of ${n})`);
  return { met: !missing.length, missing };
}
