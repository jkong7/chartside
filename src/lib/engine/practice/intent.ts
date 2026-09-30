import type { ExamManeuver, PracticeCase } from "./types";

export function normalize(s: string) {
  return ` ${s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export const COMMUNICATION = ["greet", "intro", "open", "empathy", "concerns", "summary", "next_steps"] as const;

export const ROS_TOPICS = new Set(["fever", "weight", "appetite", "fatigue", "night_sweats", "sweating", "sob", "cough", "chest_pain", "palpitations", "nausea", "bowel", "urinary", "vision", "dizziness", "neuro", "rash", "swelling", "sleep", "mood", "anhedonia", "suicide", "trauma", "headache", "bleeding"]);

const LEXICON: [string, RegExp][] = [
  ["greet", /^ (hi|hello|hey|good (morning|afternoon|evening))\b/],
  ["intro", /\b(my name is|medical student|med student|student doctor|third year|fourth year|i'm dr|i am dr|i'm doctor|i am doctor|i'm the doctor|i'm your doctor|i'll be seeing you|i'll be your|i'm one of the)\b/],
  ["open", /\b(what brings you|what brought you|brings you in|brought you in|what can i (do|help)|how can i help|what's going on|whats going on|what is going on|what seems to be|tell me (more|about|what)|what happened|what's been going on|what has been going on|how are you feeling|how have you been|walk me through|what's the problem|what is the problem|what's wrong|in your own words|anything else you can tell)\b/],
  ["empathy", /\b(i'm sorry|i am sorry|sorry to hear|sorry you|sounds (really |very |so )?(hard|difficult|scary|frightening|painful|tough|awful|stressful|frustrating|uncomfortable|terrible|worrying|rough)|that must be|must be (really |very |so )?(hard|difficult|scary|frightening|tough|awful|stressful|frustrating|worrying|painful)|i (can )?understand|i can imagine|i can see (why|that|how)|understandable|that's (really )?(hard|difficult|scary|tough|a lot|rough)|we'll (take care|figure|get to the bottom)|we're going to (take care|figure|help)|we will (take care|figure|help)|you're in the right place|thank you for (sharing|telling)|thanks for (sharing|telling)|you did the right thing)\b/],
  ["concerns", /\b(worr\w*|concern\w*|afraid|scared|what do you think (is|it)|what are you hoping|anything else (you|i|we)|any (other )?questions|questions for me|expectations|what would you like)\b/],
  ["summary", /\b(summari[sz]\w*|to recap|let me (make sure|recap|repeat|go over|see if)|just to (make sure|recap|confirm|review)|so to (recap|review)|if i understand|if i have this right|did i get (that|everything|this) right|does that sound right|let me see if i got|so what i'm hearing)\b/],
  ["next_steps", /\b(next steps?|the plan (is|will)|we('ll| will| are going to|'re going to) (do|order|get|run|check|start|send|give|draw|admit|need)|i('d| would) (like|recommend|suggest) (to )?(order|get|run|check|start|admit|do|give|send)|i('m| am) going to (order|get|run|check|start|admit|give|send|prescribe)|run some tests|some tests|blood work|bloodwork|my (impression|concern|thought) is|i think (this|it|you) (is|might|could|may)|i'm worried (this|it) (is|might|could)|we should (get|start|check|do))\b/],
  ["id", /\b(how old|your age|what's your name|what is your name|date of birth|your birthday|full name)\b/],
  ["onset", /\b(when did (it|this|that|the|all this|all of this|you first|you start (feeling|having|to feel|noticing)|you notice)|how long ago|how long have you (had|been)|when (was|did) (it|this) (start|begin)|come on|came on|sudden(ly)?|gradual(ly)?|how did (it|this) (start|begin)|when did .{0,30}(start|begin)|what were you doing|when it (started|began|hit|came on))\b/],
  ["duration", /\b(how long (does|did|do|has)|how long|how many (days|weeks|months|hours|minutes)|each (time|episode))\b/],
  ["location", /\b(where (is|does|do|exactly|in|on)|where's|point to|which (part|side)|located|location|show me where)\b/],
  ["radiation", /\b(radiat\w*|spread\w*|go(es)? anywhere|move(s)? anywhere|travel\w*|shoot\w*|anywhere else|(go|goes|move|moves) (to|into|down|up) (your|the)|arm|arms|jaw|shoulder|down (your|the) leg|down the back of)\b/],
  ["character", /\b(describe|what (does|did) (it|the pain|the headache) feel|feel like|kind of pain|type of pain|sharp|dull|(?<!blood )pressure|squeez\w*|burn\w*|stab\w*|ach(e|ing|y)|throbb\w*|pounding|crampy|tight\w*|heavy|quality)\b/],
  ["severity", /\b(scale|how (bad|severe|strong|intense)|out of (10|ten)|rate (it|the|your)|severity|worst)\b/],
  ["timing", /\b(constant|comes? and goes?|all the time|intermittent|how often|frequency|episodes?|time of day|pattern|every day|steady)\b/],
  ["aggravating", /\b(worse|aggravat\w*|bring(s)? (it )?on|trigger\w*|makes? (it|the pain) (worse|bad)|exert\w*|walking|stairs|activity|exercis\w*|after eating|with eating|when you eat|lying (down|flat)|lay (down|flat)|deep breath|bending|moving|movement|how far can you walk|how far)\b/],
  ["relieving", /\b(better|reliev\w*|help(s|ed)? (it|the)|anything help|tried (anything|taking)|resting|rest|alleviat\w*|ease|taken anything|take anything for|tried anything)\b/],
  ["associated", /\b(other symptoms|anything else (with|along)|along with|associated|accompan\w*|any other (problems|symptoms|changes)|anything else going on)\b/],
  ["prior", /\b(ever (had|felt|experienced) (this|anything like|something like|that|one like)|happened before|(had|felt) (this|anything like this|something like this|one like this) before|first time|like this before|similar|in the past)\b/],
  ["pmh", /\b(medical (history|problems|conditions|issues)|health (problems|conditions|issues)|any (medical|health) |past (medical )?history|other conditions|chronic|diagnosed with|been diagnosed|do you have any (conditions|illnesses|diseases|medical)|high blood pressure|hypertension|blood pressure|cholesterol|heart (disease|problems|attack)|history of|any illnesses|other problems)\b/],
  ["psh", /\b(surger\w*|operation\w*|procedure\w*|operated)\b/],
  ["hospital", /\b(hospitali[sz]\w*|been in the hospital|admitted)\b/],
  ["meds", /\b(medication\w*|medicine\w*|meds|pills?|prescri\w*|taking anything|take anything|drugs? (do|are) you (take|taking)|supplements?|vitamins?|over the counter|given (him|her|them)|give (him|her|them)|taken for|take for it|tried for|tylenol|advil|ibuprofen|acetaminophen|insulin|inhaler|aspirin)\b/],
  ["allergies", /\b(allerg\w*)\b/],
  ["smoking", /\b(smok\w*|cigar\w*|tobacco|vap(e|ing)|nicotine|packs?)\b/],
  ["alcohol", /\b(alcohol|beers?|wine|liquor|drinks? (a|per|each) (day|week|night)|do you drink|how much do you drink|drinking alcohol|how much (beer|wine))\b/],
  ["drugs", /\b(recreational|street drugs|illicit|marijuana|cannabis|weed|cocaine|heroin|opioids?|any drugs|use drugs|drug use|iv drugs?|inject\w*)\b/],
  ["occupation", /\b(kind of work|what work|work do you do|for work|your work|at work|work as|do you work|where do you work|working|job|occupation|for a living|employ\w*|retired)\b/],
  ["living", /\b(live with|living situation|who do you live|at home with|home situation|live alone|support|married|family at home|who's at home|who is at home)\b/],
  ["sexual", /\b(sexual\w*|sex|partners?|condoms?|protection|std|sti|birth control|contracepti\w*)\b/],
  ["diet", /\b(diet|what do you eat|foods?|meals?|salt\w*|soda|sugary|drinks? like|eating)\b/],
  ["exercise_hx", /\b(do you exercise|physical activity|how active|gym)\b/],
  ["family", /\b(family|mother|father|mom|dad|parents|brother|sister|siblings|runs? in|relatives)\b/],
  ["fever", /\b(fevers?|temperature|febrile|chills?|feel hot)\b/],
  ["weight", /\b(weight|lost weight|losing weight|gain\w* weight|pounds)\b/],
  ["appetite", /\b(appetite|hungry|eating (less|more))\b/],
  ["fatigue", /\b(tired|fatigue\w*|energy|exhausted)\b/],
  ["night_sweats", /\b(night sweats?|sweat(ing)? at night)\b/],
  ["sweating", /\b(sweat(y|ing|s)?|diaphore\w*|clammy)\b/],
  ["sob", /\b(short(ness)? of breath|breath(e|ing|less)?|trouble breathing|winded|dyspnea|catch your breath|air)\b/],
  ["cough", /\b(cough\w*|phlegm|sputum|mucus)\b/],
  ["chest_pain", /\b(chest (pain|pressure|tightness|discomfort))\b/],
  ["palpitations", /\b(palpitation\w*|heart (racing|pounding|fluttering|skipping)|racing heart|flutter\w*)\b/],
  ["nausea", /\b(nause\w*|sick to your stomach|queasy|throw(n|ing)? up|threw up|vomit\w*|puk\w*)\b/],
  ["bowel", /\b(bowel\w*|stools?|poop\w*|diarrhea|constipat\w*|black|tarry|bathroom)\b/],
  ["urinary", /\b(urin\w*|pee\w*|bladder|burning when|dysuria)\b/],
  ["vision", /\b(vision|blurr\w*|eyesight|double vision|eyes?|seeing)\b/],
  ["dizziness", /\b(dizz\w*|lightheaded|light headed|faint\w*|pass(ed)? out|syncope|vertigo)\b/],
  ["neuro", /\b(weak(ness)?|numb\w*|tingl\w*|confus\w*|slurr\w*|speech|trouble (walking|talking)|balance|pins and needles)\b/],
  ["rash", /\b(rash\w*|skin|spots)\b/],
  ["swelling", /\b(swell\w*|swollen|edema|puffy)\b/],
  ["sleep", /\b(sleep\w*|insomnia|waking up|wake up)\b/],
  ["mood", /\b(mood|sad(ness)?|feeling down|feel down|depress\w*|hopeless\w*|feeling low|anxious|anxiety|nervous|stress\w*)\b/],
  ["anhedonia", /\b(enjoy\w*|interest\w*|pleasure|fun|hobb(y|ies)|things you (used to|like|love))\b/],
  ["suicide", /\b(suicid\w*|kill (yourself|myself)|hurt(ing)? yourself|harm(ing)? yourself|end (your|my) life|better off dead|not (being )?alive|thoughts of death|self harm|wish you (were|weren't)|not wake up|wouldn't wake up)\b/],
  ["trauma", /\b(injur\w*|fall|fell|trauma|accident|hit your head|lift(ed|ing)? (anything|something|heavy)|twist\w*)\b/],
  ["lmp", /\b(period|periods|menstrua\w*|pregnan\w*|lmp)\b/],
  ["feeding", /\b(eat(ing)?|drink(ing)?|feed(ing)?|bottle|breastfe\w*|formula|fluids|nursing)\b/],
  ["diapers", /\b(diapers?|wet diapers|urinat\w*)\b/],
  ["immunizations", /\b(vaccin\w*|shots|immuni[sz]\w*)\b/],
  ["contacts", /\b(daycare|day care|sick contacts|anyone (else )?(sick|at home sick)|anybody (else )?sick|around anyone|siblings sick|others sick)\b/],
  ["behavior", /\b(playful|playing|acting (like|himself|herself)|behav\w*|fussy|irritable|letharg\w*|consolabl\w*|alert|floppy|himself|herself)\b/],
  ["birth", /\b(born|birth|premature|full term|preemie)\b/],
];

export const TOPIC_KEYS = LEXICON.map(([k]) => k);

function phraseRegex(phrases: string[]) {
  const esc = phrases.map((p) => normalize(p).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${esc.join("|")})`);
}

const caseRegex = new Map<string, [string, RegExp][]>();

function caseLexicon(c: PracticeCase) {
  let r = caseRegex.get(c.id);
  if (!r) {
    r = Object.entries(c.topics ?? {}).map(([k, phrases]) => [k, phraseRegex(phrases)] as [string, RegExp]);
    caseRegex.set(c.id, r);
  }
  return r;
}

export function matchTopics(text: string, c?: PracticeCase): string[] {
  const t = normalize(text);
  if (!t.trim()) return [];
  const out: string[] = [];
  for (const [k, re] of LEXICON) if (re.test(t)) out.push(k);
  if (c) for (const [k, re] of caseLexicon(c)) if (re.test(t) && !out.includes(k)) out.push(k);
  if (out.includes("pmh") && out.includes("family") && !/\b(you|your) (have|had|ever)\b/.test(t)) out.splice(out.indexOf("pmh"), 1);
  return out;
}

const EXAM_VERB = /\b(listen|auscultat\w*|examin\w*|exam|look (at|in|into)|check\w*|feel|press(ing)? (on|down|here|your|the|along)|palpat\w*|test\w*|take (your|a look)|percuss\w*|measure|straight leg|raise (your|each|the) leg|tap\w* (on|over)|walk across|walk for me|watch you walk|note how|mental status)\b/;

export function examRequest(text: string, c: PracticeCase): ExamManeuver[] {
  const t = normalize(text);
  if (!EXAM_VERB.test(t) && !/\b(vitals|vital signs)\b/.test(t)) return [];
  return c.exam.filter((e) => phraseRegex(e.match).test(t));
}

export function endCommand(text: string) {
  const t = normalize(text);
  return /\b(end (the |this )?(encounter|case|practice|session|interview)|finish (the |this )?(encounter|case|interview)|i'm (all )?done with (the |this )?(encounter|case|interview)|that's (the end of|all for) (the |this )?(encounter|case|interview))\b/.test(t);
}

export function isQuestionLike(text: string) {
  const t = normalize(text);
  return /\?/.test(text) || /^ (do|does|did|is|are|was|were|have|has|had|can|could|would|will|any|how|what|when|where|why|who|which|tell|describe)\b/.test(t);
}
