const EM_LEVEL: Record<string, string> = { "99212": "level 2", "99213": "level 3", "99214": "level 4", "99215": "level 5", "99202": "new patient level 2", "99203": "new patient level 3", "99204": "new patient level 4", "99205": "new patient level 5" };

export function speakable(text: string) {
  return text
    .replace(/\*\*\*/g, "blank")
    .replace(/\s*&\s*/g, " and ")
    .replace(/\s+—\s+/g, ", ")
    .replace(/[#*_`>|]/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\(([A-Z]\d{2}(\.\d+)?)\)/g, "")
    .replace(/\bq(\d)h\b/gi, "every $1 hours")
    .replace(/\bPRN\b/g, "as needed")
    .replace(/\bBID\b/g, "twice daily")
    .replace(/\bTID\b/g, "three times daily")
    .replace(/\bQD\b|\bdaily\b/gi, "daily")
    .replace(/\bf\/u\b/gi, "follow up")
    .replace(/(^|\n)\s*(\d+[.)]|[-•])\s+/g, "$1")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\.\s*\./g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function firstSentences(text: string, max: number, maxWords: number) {
  const parts = speakable(text).split(/(?<=[.!?])\s+/).filter(Boolean);
  const out: string[] = [];
  let words = 0;
  for (const p of parts) {
    const n = p.split(/\s+/).length;
    if (out.length >= max || (out.length && words + n > maxWords)) break;
    out.push(p);
    words += n;
  }
  return out.join(" ");
}

export interface NoteForBrief {
  sections: { key: string; title: string; text: string }[];
  codes: { em: string | null; diagnoses: { code: string; label: string }[] } | null;
}

export function spokenBrief(note: NoteForBrief, minutes?: number | null) {
  const find = (re: RegExp) => note.sections.find((s) => re.test(s.key) || re.test(s.title.toLowerCase()));
  const ap = find(/assessment.?(and|&|_)?.?plan|^ap$/);
  const assessment = ap ? null : find(/assessment|impression|diagnos/);
  const plan = ap ? null : find(/^plan|plan$|recommend/);
  const lines: string[] = ["Here's your note."];
  if (minutes && minutes > 0) lines.push(`${minutes}-minute visit.`);
  if (ap) lines.push(`Assessment and plan: ${firstSentences(ap.text, 3, 40)}`);
  else {
    if (assessment) lines.push(`Assessment: ${firstSentences(assessment.text, 2, 22)}`);
    if (plan) lines.push(`Plan: ${firstSentences(plan.text, 2, 25)}`);
  }
  if (!ap && !assessment && !plan && note.sections[0]) lines.push(firstSentences(note.sections[0].text, 2, 40));
  const em = note.codes?.em;
  if (em) lines.push(`Coding suggests a ${EM_LEVEL[em] ?? em} visit.`);
  const dx = note.codes?.diagnoses.length ?? 0;
  if (dx) lines.push(`${dx} diagnos${dx === 1 ? "is" : "es"} coded. The full note is in your link.`);
  return lines.join(" ").replace(/\s+/g, " ").replace(/\.\./g, ".");
}
