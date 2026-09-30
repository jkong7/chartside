import type { Note, NoteSentence, Template, Utterance } from "../types";

export interface AnimalProfile {
  species: string;
  breed?: string | null;
  sex?: string | null;
  sexWord?: string | null;
  ageYears?: number | null;
  weight?: string | null;
  tag?: string | null;
  owner?: string | null;
  ownerPhone?: string | null;
  ownerPhoneConfirmedAt?: string | null;
  herd?: string | null;
}

export interface AnimalSegment {
  name: string;
  profile: AnimalProfile;
  utterances: Utterance[];
}

const SPECIES: [RegExp, string, ("F" | "M" | "X")?][] = [
  [/\b(mares?|fill(?:y|ies))\b/i, "Equine", "F"],
  [/\b(stallions?|colts?)\b/i, "Equine", "M"],
  [/\b(geldings?)\b/i, "Equine", "M"],
  [/\b(horses?|equine|foals?|ponies|pony|donkeys?|mules?|yearlings?)\b/i, "Equine"],
  [/\b(heifers?|cows?)\b/i, "Bovine", "F"],
  [/\b(bulls?|steers?)\b/i, "Bovine", "M"],
  [/\b(calf|calves|cattle|bovine|beef|dairy)\b/i, "Bovine"],
  [/\b(does|nann(?:y|ies))\b/i, "Caprine", "F"],
  [/\b(goats?|caprine|kids)\b/i, "Caprine"],
  [/\b(ewes?)\b/i, "Ovine", "F"],
  [/\b(rams?)\b/i, "Ovine", "M"],
  [/\b(sheep|lambs?|ovine)\b/i, "Ovine"],
  [/\b(sows?|gilts?)\b/i, "Porcine", "F"],
  [/\b(boars?|barrows?)\b/i, "Porcine", "M"],
  [/\b(pigs?|piglets?|hogs?|swine|porcine)\b/i, "Porcine"],
  [/\b(alpacas?|llamas?|camelids?)\b/i, "Camelid"],
  [/\b(dogs?|pupp(?:y|ies)|canine|bitch)\b/i, "Canine"],
  [/\b(cats?|kittens?|feline|queen)\b/i, "Feline"],
];

export const BREEDS = ["Quarter Horse", "Thoroughbred", "Arabian", "Warmblood", "Paint", "Appaloosa", "Morgan", "Standardbred", "Tennessee Walker", "Friesian", "Clydesdale", "Percheron", "Belgian", "Mustang", "Haflinger", "Holstein", "Angus", "Black Angus", "Hereford", "Jersey", "Simmental", "Charolais", "Brahman", "Guernsey", "Boer", "Nubian", "LaMancha", "Alpine", "Suffolk", "Dorper", "Katahdin", "Labrador", "Golden Retriever", "German Shepherd", "Border Collie", "Australian Shepherd", "Beagle", "Dachshund", "Poodle", "Bulldog", "Domestic Shorthair", "Maine Coon", "Siamese"];

export const VET_DRUGS: Record<string, string> = {
  xylazine: "sedative",
  rompun: "sedative",
  detomidine: "sedative",
  dormosedan: "sedative",
  romifidine: "sedative",
  butorphanol: "sedative",
  torbugesic: "sedative",
  acepromazine: "sedative",
  ace: "sedative",
  ketamine: "anesthetic",
  banamine: "anti-inflammatory",
  flunixin: "anti-inflammatory",
  bute: "anti-inflammatory",
  phenylbutazone: "anti-inflammatory",
  equioxx: "anti-inflammatory",
  firocoxib: "anti-inflammatory",
  meloxicam: "anti-inflammatory",
  carprofen: "anti-inflammatory",
  rimadyl: "anti-inflammatory",
  dexamethasone: "steroid",
  triamcinolone: "steroid",
  gentamicin: "antibiotic",
  penicillin: "antibiotic",
  excede: "antibiotic",
  naxcel: "antibiotic",
  ceftiofur: "antibiotic",
  oxytetracycline: "antibiotic",
  "la-200": "antibiotic",
  draxxin: "antibiotic",
  tulathromycin: "antibiotic",
  "sms": "antibiotic",
  ivermectin: "dewormer",
  moxidectin: "dewormer",
  quest: "dewormer",
  fenbendazole: "dewormer",
  safeguard: "dewormer",
  pyrantel: "dewormer",
  gastrogard: "stomach protectant",
  omeprazole: "stomach protectant",
  sucralfate: "stomach protectant",
  "regu-mate": "hormone",
  altrenogest: "hormone",
  lutalyse: "hormone",
  dinoprost: "hormone",
  cloprostenol: "hormone",
  estrumate: "hormone",
  oxytocin: "hormone",
  deslorelin: "hormone",
  gnrh: "hormone",
  mepivacaine: "local anesthetic",
  carbocaine: "local anesthetic",
  lidocaine: "local anesthetic",
  "mineral oil": "laxative",
  gabapentin: "pain reliever",
  cefazolin: "antibiotic",
  adequan: "joint therapy",
  legend: "joint therapy",
};

const SOUND_ALIKES: [RegExp, string][] = [
  [/\bbanana ?mean\b/gi, "Banamine"],
  [/\bbanamin\b/gi, "Banamine"],
  [/\bbutte\b/gi, "bute"],
  [/\bbeaut\b/gi, "bute"],
  [/\bzylazine\b/gi, "xylazine"],
  [/\bxylazene\b/gi, "xylazine"],
  [/\bdoormat? sedan\b/gi, "Dormosedan"],
  [/\bdrax(?:en|in)\b/gi, "Draxxin"],
  [/\bexceed\b/gi, "Excede"],
  [/\bequi ?ox\b/gi, "Equioxx"],
  [/\bgastro ?guard\b/gi, "GastroGard"],
  [/\bregimate\b/gi, "Regu-Mate"],
  [/\bloot ?a ?lease\b/gi, "Lutalyse"],
  [/\bcarbo ?cane\b/gi, "Carbocaine"],
];

export function normalizeVetTerms(text: string) {
  return SOUND_ALIKES.reduce((s, [re, to]) => s.replace(re, to), text);
}

export function vetTerms(text: string) {
  const lower = text.toLowerCase();
  return Object.keys(VET_DRUGS).filter((d) => new RegExp(`\\b${d.replace(/[-]/g, "\\-")}\\b`, "i").test(lower));
}

export function speciesOf(text: string): { species: string; sex: "F" | "M" | "X"; word?: string } | null {
  for (const [re, species, sex] of SPECIES) {
    const m = re.exec(text);
    if (m) return { species, sex: sex ?? "X", ...(sex ? { word: m[1].toLowerCase().replace(/s$/, "") } : {}) };
  }
  return null;
}

const NOT_NAMES = new Set(["The", "She", "He", "It", "Her", "His", "We", "I", "They", "This", "That", "Then", "One", "Next", "Now", "And", "So", "Left", "Right", "Grade", "Owner", "Farm", "Barn", "Moving", "On", "Last", "First", "Second", "Third", "Up", "Cow", "Horse", "Mare", "Gelding", "Heifer", "Calf", "Dog", "Cat", "Goat", "Number", "Tag"]);

const KIND = "horse|mare|gelding|stallion|filly|colt|foal|pony|donkey|mule|cow|heifer|steer|bull|calf|goat|doe|buck|ewe|ram|lamb|pig|sow|gilt|boar|alpaca|llama|dog|puppy|cat|kitten|animal|patient|one";
const MARKER = new RegExp(`\\b(?:(?:first|next|second|third|fourth|fifth|last|another)\\b(?:\\s+up)?(?:\\s+(${KIND})\\b)?|moving on to|on to|over to|now for|now on to)\\b`, "i");
const LEAD = new RegExp(`^[\\s,:-]*(?:(?:is|was|up)\\s+)?(?:(?:the|a|an)\\s+)?(?:(${KIND})\\b\\s*,?\\s*)?((?:number|tag|ear tag|#)\\s*)?`, "i");

export function animalMarker(text: string): { name: string; kind: string | null } | null {
  const m = MARKER.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const lead = LEAD.exec(rest)!;
  const kind = (m[1] ?? lead[1] ?? null)?.toLowerCase() ?? null;
  const after = rest.slice(lead[0].length);
  const word = /^([A-Z][a-z]+)\b/.exec(after);
  if (word && !NOT_NAMES.has(word[1])) return { name: word[1], kind };
  const num = /^(\d{1,6})\b/.exec(after);
  if (num && (kind || lead[2])) return { name: `${kind && kind !== "one" && kind !== "animal" ? kind[0].toUpperCase() + kind.slice(1) : "Animal"} ${num[1]}`, kind };
  return null;
}

function sentences(u: Utterance): Utterance[] {
  const parts = u.text.split(/(?<=[.!?])\s+/).map((t) => t.trim()).filter(Boolean);
  if (parts.length < 2) return [u];
  const span = (u.tEnd - u.tStart) / parts.length;
  return parts.map((t, i) => ({ ...u, id: `${u.id}_${i}`, text: t, tStart: u.tStart + i * span, tEnd: u.tStart + (i + 1) * span }));
}

export function splitAnimals(utts: Utterance[]): { shared: Utterance[]; animals: AnimalSegment[] } {
  const flat = utts.flatMap(sentences).map((u) => ({ ...u, text: normalizeVetTerms(u.text) }));
  const shared: Utterance[] = [];
  const segs: { name: string; kind: string | null; utterances: Utterance[] }[] = [];
  for (const u of flat) {
    const mk = animalMarker(u.text);
    if (mk && !segs.some((s) => s.name.toLowerCase() === mk.name.toLowerCase())) {
      segs.push({ name: mk.name, kind: mk.kind, utterances: [u] });
      continue;
    }
    if (mk) {
      const back = segs.find((s) => s.name.toLowerCase() === mk.name.toLowerCase())!;
      segs.splice(segs.indexOf(back), 1);
      segs.push(back);
      back.utterances.push(u);
      continue;
    }
    if (segs.length) segs.at(-1)!.utterances.push(u);
    else shared.push(u);
  }
  const sharedText = shared.map((u) => u.text).join(" ");
  if (segs.length < 2) {
    const all = [...shared, ...(segs[0]?.utterances ?? [])];
    const text = all.map((u) => u.text).join(" ");
    const name = segs[0]?.name ?? introName(text) ?? "Unnamed animal";
    return { shared: [], animals: [{ name, profile: profileFrom(text, sharedText, segs[0]?.kind ?? null), utterances: all }] };
  }
  return { shared, animals: segs.map((s) => ({ name: s.name, profile: profileFrom(s.utterances.map((u) => u.text).join(" "), sharedText, s.kind), utterances: [...shared, ...s.utterances] })) };
}

function introName(text: string) {
  const m = /\b(?:this is|patient is|seeing|saw|examined|checked)\s+([A-Z][a-z]+)\b/.exec(text) ?? /^([A-Z][a-z]+),\s+(?:a\s+|an\s+)?\d{1,2}[- ]year/.exec(text) ?? /\b([A-Z][a-z]+),\s+(?:a\s+|an\s+)?\d{1,2}[- ]year[- ]old\b/.exec(text);
  return m && !NOT_NAMES.has(m[1]) ? m[1] : null;
}

const cap = (s: string) => s.replace(/(^|\s)(\w)/g, (_, a: string, c: string) => a + c.toUpperCase());

export function profileFrom(text: string, shared = "", kind: string | null = null): AnimalProfile {
  const byKind = speciesOf(kind ?? "");
  const byText = speciesOf(text);
  const base = byKind ?? byText ?? speciesOf(shared);
  const fromText = byText && byText.species === base?.species && byText.sex !== "X";
  const sp = base ? { species: base.species, sex: fromText ? byText!.sex : base.sex, word: fromText ? byText!.word : base.word } : null;
  const breed = BREEDS.find((b) => new RegExp(`\\b${b}\\b`, "i").test(text)) ?? null;
  const age = /\b(\d{1,2})[- ](?:year|yr)s?[- ]old\b/i.exec(text) ?? /\b(\d{1,2})\s*(?:years?|yo)\b/i.exec(text);
  const weight = /\b(\d{2,4})\s*(pounds|lbs?|kilos|kg)\b/i.exec(text);
  const tag = /\b(?:ear tag|tag|number|#)\s*(\d{1,6})\b/i.exec(text);
  const both = `${shared} ${text}`;
  const owner = /\b(?i:owner(?:'s name)? is) ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/.exec(both) ?? /\b(?i:for|client is) ([A-Z][a-z]+ [A-Z][a-z]+)\b/.exec(both);
  const phone = /\b(?:owner'?s?|client'?s?)(?: cell| phone)? (?:number|phone|cell)(?: is)?[:\s]+(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i.exec(both) ?? /\btext (?:the )?(?:owner|client) at (\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i.exec(both);
  const herd = /\b(?:at|at the)\s+([A-Z][a-z]+(?:'s)?(?:\s(?:barn|farm|ranch|stables?|dairy))?)/.exec(both) ?? /\b([A-Z][a-z]+ (?:barn|farm|ranch|stables|dairy))\b/i.exec(both);
  return {
    species: sp?.species ?? "Unknown",
    breed,
    sex: sp && sp.sex !== "X" ? (sp.sex === "F" ? "Female" : "Male") : null,
    sexWord: sp?.word ?? null,
    ageYears: age ? Number(age[1]) : null,
    weight: weight ? `${weight[1]} ${/k/i.test(weight[2]) ? "kg" : "lb"}` : null,
    tag: tag ? tag[1] : null,
    owner: owner ? owner[1] : null,
    ownerPhone: phone ? phone[1].replace(/[^\d+]/g, "") : null,
    herd: herd ? cap(herd[1]) : null,
  };
}

const RE = {
  exam: /\b(temp(?:erature)?|heart rate|\bhr\b|resp(?:iratory)?(?: rate)?|\brr\b|pulse|mucous membranes?|\bmm\b|crt|cap(?:illary)? refill|gut sounds|borborygmi|auscult|palpat|ultrasound|body condition|\bbcs\b|weigh|lame|lameness|grade \d|\d (?:out )?of 5|flexion|block|hoof tester|digital pulse|heat|swelling|effusion|radiograph|x-?ray|follicle|corpus luteum|\bcl\b|pregnan|in foal|open|days (?:bred|pregnant)|rectal|teeth|hooks|points|murmur|lungs|eyes|nasal|discharge|dehydrat|skin tent|score)\b/i,
  assess: /\b(likely|consistent with|suspect|suspicion|diagnos|impression|looks like|rule out|abscess|colic|laminitis|founder|navicular|arthritis|osteoarthritis|tendon|suspensory|choke|pneumonia|scours|mastitis|pinkeye|foot rot|bloat|ketosis|milk fever|metritis|retained placenta|sole bruise|cellulitis|laceration|otitis|dermatitis|healthy|normal exam|sound)\b/i,
  plan: /\b(gave|given|administered|injected|dispensed|dispense|start(?:ed)?|continue|recheck|re-check|stall rest|hand walk|cold hose|wrap|bandage|poultice|shoe|farrier|withdrawal|withhold|vaccinat|deworm|float|pull|sedat|nerve block|inject|tube(?:d)?|oil|radiograph|ultrasound again|bred|breed|short cycle|follow up|follow-up|call me|call if|twice (?:a|per) day|once (?:a|per) day|daily|\bbid\b|\bsid\b|\btid\b|\bpo\b|\biv\b|\bim\b|\bsq\b|days?\b.*\b(?:off|rest))/i,
  owner: /\b(stall rest|hand walk|cold hose|wrap|bandage|poultice|turn ?out|call (?:me|us|the clinic|if)|recheck|re-check|give|keep|watch for|monitor|feed|water|withdrawal|do not (?:milk|sell|slaughter|ride)|don't (?:ride|milk|sell)|no riding|owner should|tell (?:the )?(?:owner|client)|farrier|next week|days?)\b/i,
  history: /\b(owner (?:reports|says|noticed|states)|client (?:reports|says|noticed)|since|for (?:the last|about|two|three|\d+) (?:days?|weeks?)|been (?:off|lame|down|coughing|off feed)|history|off feed|not eating|reported|noticed|started)\b/i,
};

const PLAIN: [RegExp, string][] = [
  [/\bBID\b/g, "twice a day"],
  [/\bSID\b/g, "once a day"],
  [/\bTID\b/g, "three times a day"],
  [/\bPO\b/g, "by mouth"],
  [/\bIV\b/g, "into the vein"],
  [/\bIM\b/g, "into the muscle"],
  [/\bSQ\b/g, "under the skin"],
  [/\bq(\d+)h\b/gi, "every $1 hours"],
  [/\bLF\b/g, "left front leg"],
  [/\bRF\b/g, "right front leg"],
  [/\bLH\b/g, "left hind leg"],
  [/\bRH\b/g, "right hind leg"],
  [/\bleft fore\b/gi, "left front leg"],
  [/\bright fore\b/gi, "right front leg"],
  [/\btell (?:the )?(?:owner|client) (?:to |that )?/gi, ""],
  [/\bowner should\b/gi, "Please"],
  [/\bthe owner\b/gi, "you"],
];

export function plainLanguage(text: string) {
  const out = PLAIN.reduce((s, [re, to]) => s.replace(re, to), text).trim();
  return out ? out[0].toUpperCase() + out.slice(1) : out;
}

function tidy(text: string) {
  const t = text.trim().replace(/^(?:and|so|okay|ok|alright|um|uh)[,\s]+/i, "");
  if (!t) return t;
  const c = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(c) ? c : `${c}.`;
}

type Bucket = "history" | "exam" | "assessment" | "plan";

export function bucketOf(text: string): Bucket {
  if (RE.plan.test(text) && !/\b(temp|heart rate|grade \d|\d (?:out )?of 5)\b/i.test(text)) return "plan";
  if (RE.assess.test(text) && !RE.exam.test(text)) return "assessment";
  if (RE.exam.test(text)) return "exam";
  if (RE.assess.test(text)) return "assessment";
  return "history";
}

export function lamenessGrade(text: string) {
  const m = /\bgrade\s*(\d)(?:\s*(?:\/|out of|of)\s*5)?\b|\b(\d)\s*(?:\/|out of|of)\s*5\b/i.exec(text);
  const g = m ? Number(m[1] ?? m[2]) : null;
  if (g === null || g < 0 || g > 5) return null;
  const limb = /\b(left|right)\s+(fore|front|hind)\b/i.exec(text) ?? /\b(LF|RF|LH|RH)\b/.exec(text);
  return { grade: g, limb: limb ? (limb[2] ? `${limb[1].toLowerCase()} ${/fore|front/i.test(limb[2]) ? "fore" : "hind"}` : ({ LF: "left fore", RF: "right fore", LH: "left hind", RH: "right hind" } as Record<string, string>)[limb[1]]) : null };
}

export function pickVetTemplate(text: string, fallback: string) {
  if (/\b(palpat\w*|follicle|corpus luteum|\bcl\b|in foal|pregnancy check|preg check|days bred|bred on|ovar\w*|uterus|short cycle)\b/i.test(text)) return "vet_repro";
  const sp = speciesOf(text);
  if (sp && ["Canine", "Feline"].includes(sp.species)) return "vet_small_soap";
  if (/\b(lame|lameness|flexion|nerve block|hoof tester|\d (?:out )?of 5)\b/i.test(text) && (!sp || sp.species === "Equine")) return "vet_lameness";
  if (sp && ["Bovine", "Caprine", "Ovine", "Porcine", "Camelid"].includes(sp.species)) return "vet_herd";
  return fallback.startsWith("vet_") ? fallback : "vet_equine";
}

const SECTION_BUCKETS: Record<string, Bucket | "instructions" | "signalment" | "lameness"> = {
  signalment: "signalment",
  history: "history",
  subjective: "history",
  exam: "exam",
  objective: "exam",
  lameness: "lameness",
  repro: "exam",
  animals: "exam",
  assessment: "assessment",
  plan: "plan",
  treatments: "plan",
  instructions: "instructions",
};

export function signalment(name: string, p: AnimalProfile) {
  const bits = [p.ageYears ? `${p.ageYears}-year-old` : null, p.breed, p.sexWord ?? (p.sex ? p.sex.toLowerCase() : null), p.sexWord ? null : p.species !== "Unknown" ? p.species.toLowerCase() : null].filter(Boolean).join(" ");
  const extras = [p.tag ? `tag ${p.tag}` : null, p.weight ? `weight ${p.weight}` : null, p.owner ? `owner ${p.owner}` : null, p.herd ? p.herd : null].filter(Boolean).join(", ");
  return `${name}${bits ? `, ${bits}` : ""}${extras ? `. ${extras[0].toUpperCase()}${extras.slice(1)}` : ""}.`;
}

export function buildVetNote(template: Template, seg: AnimalSegment, at = new Date()): Note {
  const intro = (t: string) => !!animalMarker(t) || /\b(?:owner(?:'s)? (?:name|number|phone|cell) is|owner is [A-Z])/.test(t) || new RegExp(`^${seg.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s+(?:a|an)\\s+\\d`).test(t);
  const lines = seg.utterances.map((u) => ({ u, text: tidy(u.text) })).filter((l) => l.text.length > 1 && !intro(l.u.text));
  const byBucket: Record<Bucket, { u: Utterance; text: string }[]> = { history: [], exam: [], assessment: [], plan: [] };
  for (const l of lines) byBucket[bucketOf(l.text)].push(l);
  const sent = (key: string, i: number, text: string, evidence: string[], kind: NoteSentence["kind"] = "fact"): NoteSentence => ({ id: `${key}_${i + 1}`, text, evidence, kind, support: evidence.length ? "strong" : "partial" });
  const sections = template.sections.map((ts) => {
    const b = SECTION_BUCKETS[ts.key] ?? (ts.kind === "patient_instructions" ? "instructions" : ts.kind === "assessment" ? "assessment" : ts.kind === "plan" ? "plan" : ts.kind === "objective" || ts.kind === "exam" ? "exam" : "history");
    let sentences: NoteSentence[] = [];
    if (b === "signalment") sentences = [sent(ts.key, 0, signalment(seg.name, seg.profile), [], "system")];
    else if (b === "lameness") {
      const lame = lines.filter((l) => /\b(lame|lameness|grade|of 5|flexion|block|hoof tester|digital pulse|trot|lunge|circle|straight line|head bob|hip hike)\b/i.test(l.text));
      const g = lamenessGrade(lame.map((l) => l.text).join(" "));
      sentences = [...(g ? [sent(ts.key, 99, `AAEP lameness grade ${g.grade}/5${g.limb ? `, ${g.limb}` : ""}.`, [], "system")] : []), ...lame.map((l, i) => sent(ts.key, i, l.text, [l.u.id]))];
    } else if (b === "instructions") {
      const owner = byBucket.plan.filter((l) => RE.owner.test(l.text) || /\b(give|days?)\b/i.test(l.text));
      sentences = owner.map((l, i) => sent(ts.key, i, plainLanguage(l.text), [l.u.id]));
    } else {
      const pool = ts.key === "lameness" ? [] : byBucket[b];
      sentences = pool.filter((l) => !(template.sections.some((s) => s.key === "lameness") && b === "exam" && /\b(lame|lameness|grade \d|of 5|flexion|block|hoof tester)\b/i.test(l.text))).map((l, i) => sent(ts.key, i, l.text, [l.u.id]));
    }
    return { key: ts.key, title: ts.title, format: ts.format, sentences };
  });
  return { sections, meta: { engine: "local", templateId: template.id, generatedAt: at.toISOString() } };
}

export function ownerInstructions(note: Note) {
  const sec = note.sections.find((s) => s.key === "instructions");
  return (sec?.sentences ?? []).filter((s) => !s.pending).map((s) => s.text).filter(Boolean);
}

export function ownerText(opts: { animal: string; vet: string; lines: string[] }) {
  if (!opts.lines.length) return null;
  return `Care instructions for ${opts.animal} from ${opts.vet}:\n${opts.lines.map((l) => `- ${l}`).join("\n")}\n\nQuestions? Call your vet.\nPrepared with Chartside. Reply STOP to opt out.`;
}

const VET_SPOKEN: [RegExp, string][] = [
  [/I'll text your patient their visit summary/g, "I'll text the owner their care instructions"],
  [/you can send their summary/g, "you can send the owner's care instructions"],
  [/match this visit to a patient/g, "match this visit to an animal"],
  [/between you and your patient/g, "between you and the animal"],
  [/your patient agrees/g, "the owner agrees"],
  [/match the patient afterward/g, "match the animal afterward"],
  [/next patient to keep going/g, "next animal to keep going"],
  [/Next patient\./g, "Next animal."],
  [/helps your clinician write the visit note/g, "helps your vet write the visit record"],
  [/ayuda a su médico a escribir la nota de la visita\. Su médico/g, "ayuda a su veterinario a escribir el registro de la visita. Su veterinario"],
];

export function vetSpoken(text: string) {
  return VET_SPOKEN.reduce((t, [re, to]) => t.replace(re, to), text);
}
