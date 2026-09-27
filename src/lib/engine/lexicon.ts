export type RosSystem =
  | "Constitutional"
  | "Eyes"
  | "ENT"
  | "Cardiovascular"
  | "Respiratory"
  | "Gastrointestinal"
  | "Genitourinary"
  | "Musculoskeletal"
  | "Skin"
  | "Neurological"
  | "Psychiatric"
  | "Endocrine"
  | "Hematologic";

export interface SymptomDef {
  key: string;
  label: string;
  patterns: RegExp[];
  system: RosSystem;
  plain: { en: string; es: string };
}

const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, "i");

export const SYMPTOMS: SymptomDef[] = [
  { key: "headache", label: "headache", patterns: [w("headaches?|head (?:is )?(?:hurting|pounding)|migraines?")], system: "Neurological", plain: { en: "headache", es: "dolor de cabeza" } },
  { key: "chest_pain", label: "chest pain", patterns: [w("chest (?:pain|pressure|tightness|discomfort)|pain in (?:my|the) chest|tightness in (?:my|the) chest")], system: "Cardiovascular", plain: { en: "chest pain", es: "dolor de pecho" } },
  { key: "dyspnea", label: "shortness of breath", patterns: [w("short(?:ness)? of breath|can't catch (?:my|her|his) breath|winded|breathless|trouble breathing|hard to breathe|out of breath")], system: "Respiratory", plain: { en: "shortness of breath", es: "falta de aire" } },
  { key: "cough", label: "cough", patterns: [w("cough(?:ing|s)?")], system: "Respiratory", plain: { en: "cough", es: "tos" } },
  { key: "wheezing", label: "wheezing", patterns: [w("wheez(?:e|ing|y)")], system: "Respiratory", plain: { en: "wheezing", es: "silbido al respirar" } },
  { key: "fever", label: "fever", patterns: [w("fevers?|febrile|temperature of|running a temp")], system: "Constitutional", plain: { en: "fever", es: "fiebre" } },
  { key: "chills", label: "chills", patterns: [w("chills")], system: "Constitutional", plain: { en: "chills", es: "escalofríos" } },
  { key: "night_sweats", label: "night sweats", patterns: [w("night sweats|sweating at night")], system: "Constitutional", plain: { en: "night sweats", es: "sudores nocturnos" } },
  { key: "fatigue", label: "fatigue", patterns: [w("fatigue|tired(?:ness)?|exhausted|no energy|low energy|worn out|wiped out")], system: "Constitutional", plain: { en: "tiredness", es: "cansancio" } },
  { key: "weight_loss", label: "unintentional weight loss", patterns: [w("lost (?:some |a lot of )?weight|weight loss|losing weight")], system: "Constitutional", plain: { en: "weight loss", es: "pérdida de peso" } },
  { key: "weight_gain", label: "weight gain", patterns: [w("gained (?:some |a lot of )?weight|weight gain|putting on weight")], system: "Constitutional", plain: { en: "weight gain", es: "aumento de peso" } },
  { key: "sore_throat", label: "sore throat", patterns: [w("sore throat|throat (?:has been |is |feels |was )?(?:sore|hurts|hurting|scratchy|killing me)|(?:pain|hurts) (?:when|with|to) swallow(?:ing)?")], system: "ENT", plain: { en: "sore throat", es: "dolor de garganta" } },
  { key: "congestion", label: "nasal congestion", patterns: [w("congest(?:ed|ion)|stuffy nose|stuffed up|runny nose|rhinorrhea|sinus pressure")], system: "ENT", plain: { en: "stuffy or runny nose", es: "congestión nasal" } },
  { key: "ear_pain", label: "ear pain", patterns: [w("ear ?ache|ear (?:pain|hurts)|pulling (?:at )?(?:his|her|their) ear|(?:my|her|his|the) (?:right |left )?ear (?:has been |is |keeps |was )?(?:hurting|bothering (?:me|her|him)|sore|killing me|aching)")], system: "ENT", plain: { en: "ear pain", es: "dolor de oído" } },
  { key: "vision_change", label: "vision changes", patterns: [w("blurry vision|blurred vision|vision (?:changes|problems)|seeing spots|double vision")], system: "Eyes", plain: { en: "vision changes", es: "cambios en la visión" } },
  { key: "palpitations", label: "palpitations", patterns: [w("palpitations|heart (?:is |was |keeps |starts )?(?:racing|pounding|fluttering|skipping)|racing heart")], system: "Cardiovascular", plain: { en: "heart racing", es: "palpitaciones" } },
  { key: "edema", label: "lower extremity edema", patterns: [w("swelling in (?:my|her|his|the) (?:legs|ankles|feet)|swollen (?:legs|ankles|feet)|ankle swelling|leg swelling|edema")], system: "Cardiovascular", plain: { en: "leg swelling", es: "hinchazón de piernas" } },
  { key: "orthopnea", label: "orthopnea", patterns: [w("(?:can't|cannot) lie flat|sleep (?:on|with) (?:extra|more|two|three) pillows|orthopnea")], system: "Cardiovascular", plain: { en: "trouble breathing lying flat", es: "dificultad para respirar acostado" } },
  { key: "syncope", label: "syncope", patterns: [w("passed out|fainted|fainting|blacked out|syncope")], system: "Cardiovascular", plain: { en: "fainting", es: "desmayo" } },
  { key: "dizziness", label: "dizziness", patterns: [w("dizz(?:y|iness)|lightheaded(?:ness)?|room (?:is )?spinning|vertigo")], system: "Neurological", plain: { en: "dizziness", es: "mareo" } },
  { key: "nausea", label: "nausea", patterns: [w("nause(?:a|ous)|queasy|sick to (?:my|her|his) stomach")], system: "Gastrointestinal", plain: { en: "nausea", es: "náuseas" } },
  { key: "vomiting", label: "vomiting", patterns: [w("vomit(?:ing|ed)?|throwing up|threw up")], system: "Gastrointestinal", plain: { en: "vomiting", es: "vómito" } },
  { key: "diarrhea", label: "diarrhea", patterns: [w("diarrh(?:ea|oea)|loose stools?|watery stools?")], system: "Gastrointestinal", plain: { en: "diarrhea", es: "diarrea" } },
  { key: "constipation", label: "constipation", patterns: [w("constipat(?:ed|ion)|hard stools?|can't go to the bathroom")], system: "Gastrointestinal", plain: { en: "constipation", es: "estreñimiento" } },
  { key: "abdominal_pain", label: "abdominal pain", patterns: [w("(?:stomach|belly|abdominal|tummy) (?:pain|ache|cramps?|hurts)|stomachache|pain in (?:my|her|his|the) (?:stomach|belly|abdomen)")], system: "Gastrointestinal", plain: { en: "belly pain", es: "dolor de estómago" } },
  { key: "heartburn", label: "heartburn", patterns: [w("heartburn|acid reflux|reflux|burning in (?:my|her|his) chest after eating|sour taste")], system: "Gastrointestinal", plain: { en: "heartburn", es: "acidez" } },
  { key: "melena", label: "blood in stool", patterns: [w("blood in (?:my|her|his|the) stool|black(?:,)? tarry stools?|bloody stools?|rectal bleeding")], system: "Gastrointestinal", plain: { en: "blood in stool", es: "sangre en las heces" } },
  { key: "dysuria", label: "dysuria", patterns: [w("burn(?:s|ing)? (?:when|with) (?:I |she |he )?(?:pee|urinat)|painful urination|dysuria|hurts to pee")], system: "Genitourinary", plain: { en: "burning with urination", es: "ardor al orinar" } },
  { key: "bowel_bladder", label: "bowel or bladder dysfunction", patterns: [w("trouble (?:controlling )?(?:your |my |her |his )?(?:bladder|bowels)|(?:bladder|bowel) (?:or|and) (?:bladder|bowel)s?|incontinence|trouble with (?:your|my|the) bladder|saddle numbness")], system: "Genitourinary", plain: { en: "loss of bladder or bowel control", es: "pérdida del control de la vejiga o intestino" } },
  { key: "frequency", label: "urinary frequency", patterns: [w("peeing (?:a lot|all the time|more)|going to the bathroom (?:a lot|more)|urinary frequency|urinating frequently|frequent urination")], system: "Genitourinary", plain: { en: "peeing often", es: "orinar con frecuencia" } },
  { key: "polydipsia", label: "increased thirst", patterns: [w("thirsty all the time|really thirsty|increased thirst|always thirsty")], system: "Endocrine", plain: { en: "thirst", es: "sed" } },
  { key: "back_pain", label: "low back pain", patterns: [w("(?:low(?:er)? )?back (?:pain|hurts|is killing|spasms?)|pain in (?:my|her|his|the) (?:low(?:er)? )?back|(?:my|her|his|the) (?:low(?:er)? )?back (?:has been |is |keeps |was )?(?:hurting|bothering (?:me|her|him)|sore|killing me|aching)")], system: "Musculoskeletal", plain: { en: "back pain", es: "dolor de espalda" } },
  { key: "knee_pain", label: "knee pain", patterns: [w("knee (?:pain|hurts|is swollen)|pain in (?:my|her|his|the) knee|(?:my|her|his|the) knee (?:has been |is |keeps |was )?(?:hurting|bothering (?:me|her|him)|sore|killing me|aching)")], system: "Musculoskeletal", plain: { en: "knee pain", es: "dolor de rodilla" } },
  { key: "joint_pain", label: "joint pain", patterns: [w("joint pain|joints (?:hurt|ache)|arthralgia")], system: "Musculoskeletal", plain: { en: "joint pain", es: "dolor de articulaciones" } },
  { key: "shoulder_pain", label: "shoulder pain", patterns: [w("shoulder (?:pain|hurts)|pain in (?:my|her|his|the) shoulder|(?:my|her|his|the) shoulder (?:has been |is |keeps |was )?(?:hurting|bothering (?:me|her|him)|sore|killing me|aching)")], system: "Musculoskeletal", plain: { en: "shoulder pain", es: "dolor de hombro" } },
  { key: "neck_pain", label: "neck pain", patterns: [w("neck (?:pain|hurts)|stiff neck")], system: "Musculoskeletal", plain: { en: "neck pain", es: "dolor de cuello" } },
  { key: "rash", label: "rash", patterns: [w("rash(?:es)?|hives|itchy (?:spots|skin|patches)|red (?:spots|bumps)")], system: "Skin", plain: { en: "rash", es: "sarpullido" } },
  { key: "numbness", label: "numbness or tingling", patterns: [w("numb(?:ness)?|tingl(?:ing|y)|pins and needles")], system: "Neurological", plain: { en: "numbness or tingling", es: "entumecimiento u hormigueo" } },
  { key: "weakness", label: "focal weakness", patterns: [w("weakness in (?:my|her|his|your|the) (?:arms?|legs?|hands?|face)|(?:arm|leg) weakness|one side (?:is )?weak|facial droop|numbness or weakness|weakness or numbness")], system: "Neurological", plain: { en: "weakness", es: "debilidad" } },
  { key: "anxiety", label: "anxiety", patterns: [w("anxi(?:ous|ety)|panic attacks?|on edge|worr(?:y|ied|ying) all the time|nervous all the time")], system: "Psychiatric", plain: { en: "anxiety", es: "ansiedad" } },
  { key: "depressed_mood", label: "depressed mood", patterns: [w("depress(?:ed|ion)|feeling down|feel(?:ing)? hopeless|no interest|don't enjoy|low mood|sad all the time")], system: "Psychiatric", plain: { en: "low mood", es: "ánimo bajo" } },
  { key: "insomnia", label: "insomnia", patterns: [w("can't sleep|trouble (?:sleeping|falling asleep|staying asleep)|insomnia|wak(?:e|ing) up (?:at|in the middle of the night)|not sleeping")], system: "Psychiatric", plain: { en: "trouble sleeping", es: "dificultad para dormir" } },
  { key: "si", label: "suicidal ideation", patterns: [w("thoughts of (?:hurting|killing) (?:myself|yourself)|suicid(?:al|e)|want to die|better off dead")], system: "Psychiatric", plain: { en: "thoughts of self-harm", es: "pensamientos de hacerse daño" } },
];

export interface ConditionDef {
  key: string;
  label: string;
  icd10: string;
  patterns: RegExp[];
  chronic: boolean;
  systemic?: boolean;
  hcc?: string;
  cdi?: string;
  plain: { en: string; es: string };
  precautions?: { en: string[]; es: string[] };
  specific?: { when: RegExp; icd10: string; label: string }[];
}

export const CONDITIONS: ConditionDef[] = [
  {
    key: "htn", label: "Essential hypertension", icd10: "I10", chronic: true,
    patterns: [w("hypertension|high blood pressure|blood pressure (?:is |was |has been |still |remains )*(?:high|elevated|up|not at goal|above goal)|HTN")],
    plain: { en: "high blood pressure", es: "presión arterial alta" },
    precautions: { en: ["Severe headache, chest pain, or vision changes"], es: ["Dolor de cabeza fuerte, dolor de pecho o cambios en la visión"] },
    specific: [{ when: w("kidney disease|CKD"), icd10: "I12.9", label: "Hypertensive chronic kidney disease" }],
  },
  {
    key: "t2dm", label: "Type 2 diabetes mellitus", icd10: "E11.9", chronic: true, hcc: "HCC 38",
    patterns: [w("(?:type 2 |type two )?diabetes|diabetic|sugars? (?:have been|are|is) (?:high|running high|up)|A1c|T2DM|DM2")],
    cdi: "Specify complications (neuropathy, CKD, retinopathy) and control status; E11.9 does not risk-adjust as specifically as E11.65/E11.22/E11.40.",
    plain: { en: "type 2 diabetes", es: "diabetes tipo 2" },
    precautions: { en: ["Blood sugar over 300 or under 70 with symptoms", "Extreme thirst, confusion, or vomiting"], es: ["Azúcar en sangre mayor de 300 o menor de 70 con síntomas", "Sed extrema, confusión o vómito"] },
    specific: [
      { when: w("A1c (?:is|was|came back|of) (?:[89]|1[0-4])(?:\\.\\d)?|uncontrolled|not at goal|above goal|hyperglycemia"), icd10: "E11.65", label: "Type 2 diabetes mellitus with hyperglycemia" },
      { when: w("neuropathy|numbness in (?:my|her|his) feet|tingling in (?:my|her|his) feet"), icd10: "E11.40", label: "Type 2 diabetes mellitus with diabetic neuropathy, unspecified" },
      { when: w("kidney disease|CKD|protein in (?:the|your) urine|microalbumin"), icd10: "E11.22", label: "Type 2 diabetes mellitus with diabetic chronic kidney disease" },
    ],
  },
  { key: "prediabetes", label: "Prediabetes", icd10: "R73.03", chronic: true, patterns: [w("prediabet(?:es|ic)|borderline diabetes")], plain: { en: "prediabetes", es: "prediabetes" } },
  { key: "hld", label: "Hyperlipidemia", icd10: "E78.5", chronic: true, patterns: [w("hyperlipidemia|high cholesterol|cholesterol (?:is |was )?(?:high|elevated)|LDL (?:is |was )?(?:high|elevated)|dyslipidemia")], plain: { en: "high cholesterol", es: "colesterol alto" } },
  { key: "obesity", label: "Obesity", icd10: "E66.9", chronic: true, patterns: [w("obes(?:e|ity)|BMI (?:is |of )?(?:3\\d|4\\d)")], cdi: "Document BMI and class of obesity; BMI ≥40 (Z68.41) or ≥35 with comorbidity supports E66.01 (HCC).", plain: { en: "weight", es: "peso" } },
  { key: "gerd", label: "Gastro-esophageal reflux disease without esophagitis", icd10: "K21.9", chronic: true, patterns: [w("GERD|reflux disease|acid reflux|heartburn (?:is|has been) (?:bad|worse|every day)")], plain: { en: "acid reflux", es: "reflujo ácido" }, precautions: { en: ["Trouble swallowing, vomiting blood, or black stools"], es: ["Dificultad para tragar, vómito con sangre o heces negras"] } },
  { key: "asthma", label: "Asthma, unspecified", icd10: "J45.909", chronic: true, patterns: [w("asthma(?:tic)?")], plain: { en: "asthma", es: "asma" }, precautions: { en: ["Trouble breathing not relieved by your inhaler", "Lips or fingertips turning blue"], es: ["Dificultad para respirar que no mejora con el inhalador", "Labios o dedos azulados"] } },
  { key: "copd", label: "Chronic obstructive pulmonary disease, unspecified", icd10: "J44.9", chronic: true, hcc: "HCC 280", patterns: [w("COPD|emphysema|chronic bronchitis")], plain: { en: "COPD", es: "EPOC" } },
  { key: "uri", label: "Acute upper respiratory infection", icd10: "J06.9", chronic: false, patterns: [w("upper respiratory infection|URI|common cold|viral (?:infection|illness|syndrome)|a cold")], plain: { en: "a cold (viral infection)", es: "un resfriado (infección viral)" }, precautions: { en: ["Fever over 102°F for more than 3 days", "Trouble breathing or chest pain", "Symptoms lasting more than 10 days"], es: ["Fiebre mayor de 102°F por más de 3 días", "Dificultad para respirar o dolor de pecho", "Síntomas por más de 10 días"] } },
  { key: "bronchitis", label: "Acute bronchitis, unspecified", icd10: "J20.9", chronic: false, patterns: [w("bronchitis")], plain: { en: "a chest cold (bronchitis)", es: "bronquitis" }, precautions: { en: ["Trouble breathing or coughing up blood", "Fever that lasts more than 3 days"], es: ["Dificultad para respirar o tos con sangre", "Fiebre por más de 3 días"] } },
  { key: "pneumonia", label: "Pneumonia, unspecified organism", icd10: "J18.9", chronic: false, systemic: true, patterns: [w("pneumonia")], plain: { en: "pneumonia", es: "neumonía" } },
  { key: "sinusitis", label: "Acute sinusitis, unspecified", icd10: "J01.90", chronic: false, patterns: [w("sinusitis|sinus infection")], plain: { en: "a sinus infection", es: "sinusitis" } },
  { key: "strep", label: "Streptococcal pharyngitis", icd10: "J02.0", chronic: false, patterns: [w("strep throat|strep (?:test )?(?:is |was |came back )?positive|positive (?:rapid )?strep")], plain: { en: "strep throat", es: "faringitis estreptocócica" } },
  { key: "pharyngitis", label: "Acute pharyngitis, unspecified", icd10: "J02.9", chronic: false, patterns: [w("pharyngitis")], plain: { en: "a throat infection", es: "faringitis" } },
  { key: "aom", label: "Acute otitis media, unspecified ear", icd10: "H66.90", chronic: false, patterns: [w("(?:middle )?ear infection|otitis media|eardrum (?:is |looks )?(?:red|bulging)")], plain: { en: "an ear infection", es: "una infección de oído" }, specific: [{ when: w("right (?:middle )?ear"), icd10: "H66.91", label: "Otitis media, unspecified, right ear" }, { when: w("left (?:middle )?ear"), icd10: "H66.92", label: "Otitis media, unspecified, left ear" }], precautions: { en: ["Fever over 102°F or fever lasting more than 2 more days", "Swelling or redness behind the ear", "Stiff neck or unusual sleepiness"], es: ["Fiebre mayor de 102°F o que dure más de 2 días", "Hinchazón o enrojecimiento detrás de la oreja", "Cuello rígido o somnolencia inusual"] } },
  { key: "uti", label: "Urinary tract infection, site not specified", icd10: "N39.0", chronic: false, patterns: [w("urinary tract infection|UTI|bladder infection|cystitis")], plain: { en: "a bladder infection", es: "una infección urinaria" }, precautions: { en: ["Fever, back or side pain, or vomiting"], es: ["Fiebre, dolor de espalda o costado, o vómito"] } },
  { key: "lbp", label: "Low back pain, unspecified", icd10: "M54.50", chronic: false, patterns: [w("(?:low(?:er)? )?back (?:pain|strain)|lumbar strain|mechanical back pain")], plain: { en: "low back pain", es: "dolor de espalda baja" }, precautions: { en: ["New weakness or numbness in your legs", "Loss of bladder or bowel control", "Fever with back pain"], es: ["Debilidad o entumecimiento nuevo en las piernas", "Pérdida de control de la vejiga o intestino", "Fiebre con dolor de espalda"] }, specific: [{ when: w("sciatica|radiat\\w* down (?:my|her|his|the) leg|shooting down"), icd10: "M54.40", label: "Lumbago with sciatica, unspecified side" }] },
  { key: "knee_oa", label: "Osteoarthritis of knee, unspecified", icd10: "M17.9", chronic: true, patterns: [w("(?:osteo)?arthritis (?:in|of) (?:the |her |his |my |your )?knees?|knee (?:osteo)?arthritis|wear and tear (?:in|of) (?:the |your )?knee")], plain: { en: "knee arthritis", es: "artritis de rodilla" } },
  { key: "migraine", label: "Migraine, unspecified, not intractable, without status migrainosus", icd10: "G43.909", chronic: true, patterns: [w("migraines?")], plain: { en: "migraine", es: "migraña" }, precautions: { en: ["The worst headache of your life or a sudden 'thunderclap' headache", "Weakness, numbness, confusion, or trouble speaking"], es: ["El peor dolor de cabeza de su vida o uno repentino", "Debilidad, entumecimiento, confusión o dificultad para hablar"] } },
  { key: "tth", label: "Tension-type headache, unspecified, not intractable", icd10: "G44.209", chronic: false, patterns: [w("tension(?:-type)? headaches?")], plain: { en: "tension headache", es: "dolor de cabeza por tensión" } },
  { key: "gad", label: "Generalized anxiety disorder", icd10: "F41.1", chronic: true, patterns: [w("generalized anxiety|GAD|anxiety disorder")], plain: { en: "anxiety", es: "ansiedad" }, precautions: { en: ["Thoughts of hurting yourself — call or text 988 anytime"], es: ["Pensamientos de hacerse daño — llame o envíe un mensaje al 988"] } },
  { key: "anxiety", label: "Anxiety disorder, unspecified", icd10: "F41.9", chronic: true, patterns: [w("anxiety")], plain: { en: "anxiety", es: "ansiedad" } },
  { key: "mdd", label: "Major depressive disorder, single episode, unspecified", icd10: "F32.9", chronic: true, hcc: "HCC 155", patterns: [w("depression|major depressive|MDD|depressive disorder")], cdi: "Specify severity (mild/moderate/severe) and episode (single/recurrent); unspecified depression (F32.A) does not risk-adjust.", plain: { en: "depression", es: "depresión" }, precautions: { en: ["Thoughts of hurting yourself — call or text 988 anytime"], es: ["Pensamientos de hacerse daño — llame o envíe un mensaje al 988"] } },
  { key: "insomnia", label: "Insomnia, unspecified", icd10: "G47.00", chronic: false, patterns: [w("insomnia")], plain: { en: "trouble sleeping", es: "insomnio" } },
  { key: "hypothyroid", label: "Hypothyroidism, unspecified", icd10: "E03.9", chronic: true, patterns: [w("hypothyroid(?:ism)?|underactive thyroid|low thyroid")], plain: { en: "underactive thyroid", es: "hipotiroidismo" } },
  { key: "ckd", label: "Chronic kidney disease, unspecified", icd10: "N18.9", chronic: true, hcc: "HCC 329", patterns: [w("chronic kidney disease|CKD|kidney function (?:is |has been )?(?:low|down|reduced)")], cdi: "Document CKD stage (e.g., N18.31 stage 3a); stage drives risk adjustment and renal dosing.", plain: { en: "kidney disease", es: "enfermedad renal" }, specific: [{ when: w("stage 3a|3A"), icd10: "N18.31", label: "Chronic kidney disease, stage 3a" }, { when: w("stage 3b|3B"), icd10: "N18.32", label: "Chronic kidney disease, stage 3b" }, { when: w("stage 4"), icd10: "N18.4", label: "Chronic kidney disease, stage 4" }] },
  { key: "afib", label: "Unspecified atrial fibrillation", icd10: "I48.91", chronic: true, hcc: "HCC 238", patterns: [w("a-?fib|atrial fibrillation")], plain: { en: "atrial fibrillation (irregular heartbeat)", es: "fibrilación auricular" } },
  { key: "hf", label: "Heart failure, unspecified", icd10: "I50.9", chronic: true, hcc: "HCC 226", patterns: [w("heart failure|CHF|congestive")], cdi: "Specify type (HFrEF/HFpEF) and acuity; I50.9 lacks specificity.", plain: { en: "heart failure", es: "insuficiencia cardíaca" } },
  { key: "chest_pain_dx", label: "Chest pain, unspecified", icd10: "R07.9", chronic: false, patterns: [w("atypical chest pain|chest pain (?:is )?(?:likely|probably|most likely) (?:musculoskeletal|non-cardiac)")], plain: { en: "chest pain", es: "dolor de pecho" }, specific: [{ when: w("musculoskeletal|chest wall|costochondritis"), icd10: "R07.89", label: "Other chest pain" }] },
  { key: "allergic_rhinitis", label: "Allergic rhinitis, unspecified", icd10: "J30.9", chronic: true, patterns: [w("allergic rhinitis|seasonal allergies|hay fever|allergies (?:are|have been) (?:acting up|bad)")], plain: { en: "seasonal allergies", es: "alergias estacionales" } },
  { key: "eczema", label: "Atopic dermatitis, unspecified", icd10: "L20.9", chronic: true, patterns: [w("eczema|atopic dermatitis")], plain: { en: "eczema", es: "eczema" } },
  { key: "contact_derm", label: "Contact dermatitis, unspecified cause", icd10: "L25.9", chronic: false, patterns: [w("contact dermatitis|poison ivy")], plain: { en: "skin irritation (contact dermatitis)", es: "dermatitis de contacto" } },
  { key: "gout", label: "Gout, unspecified", icd10: "M10.9", chronic: true, patterns: [w("gout(?:y)?")], plain: { en: "gout", es: "gota" } },
  { key: "vitd", label: "Vitamin D deficiency, unspecified", icd10: "E55.9", chronic: true, patterns: [w("vitamin D (?:deficiency|is low|was low|level (?:is|was) low)|low vitamin D")], plain: { en: "low vitamin D", es: "vitamina D baja" } },
  { key: "ida", label: "Iron deficiency anemia, unspecified", icd10: "D50.9", chronic: true, patterns: [w("iron deficiency|low iron|anemi(?:a|c)")], plain: { en: "low iron (anemia)", es: "anemia por falta de hierro" } },
  { key: "tobacco", label: "Nicotine dependence, cigarettes, uncomplicated", icd10: "F17.210", chronic: true, patterns: [w("smok(?:e|es|er|ing) (?:a pack|cigarettes|half a pack|\\d+ cigarettes)|pack(?:s)? (?:a|per) day|current smoker")], plain: { en: "smoking", es: "tabaquismo" } },
  { key: "ankle_sprain", label: "Sprain of unspecified ligament of ankle, initial encounter", icd10: "S93.409A", chronic: false, patterns: [w("(?:ankle )?sprain(?:ed)?(?: (?:my|her|his|the) ankle)?|rolled (?:my|her|his|the) ankle")], plain: { en: "ankle sprain", es: "esguince de tobillo" } },
  { key: "covid", label: "COVID-19", icd10: "U07.1", chronic: false, systemic: true, patterns: [w("covid(?:-19)? (?:is |was |test )?(?:positive)|positive (?:for )?covid|has covid")], plain: { en: "COVID-19", es: "COVID-19" } },
  { key: "flu", label: "Influenza due to unidentified influenza virus with other respiratory manifestations", icd10: "J11.1", chronic: false, systemic: true, patterns: [w("(?:the )?flu(?! shot| vaccine)|influenza(?! vaccine)")], plain: { en: "the flu", es: "influenza (gripe)" } },
  { key: "well", label: "Encounter for general adult medical examination without abnormal findings", icd10: "Z00.00", chronic: false, patterns: [w("annual (?:physical|exam|visit)|wellness (?:visit|exam)|routine physical|check-?up")], plain: { en: "yearly check-up", es: "chequeo anual" } },
];

export interface MedDef {
  name: string;
  patterns: RegExp[];
  cls: string;
  rx: boolean;
  renalCaution?: number;
  allergyGroups?: string[];
}

export const MEDICATIONS: MedDef[] = [
  { name: "lisinopril", patterns: [w("lisinopril|prinivil|zestril")], cls: "ACE inhibitor", rx: true, allergyGroups: ["ace inhibitor"] },
  { name: "losartan", patterns: [w("losartan|cozaar")], cls: "ARB", rx: true },
  { name: "amlodipine", patterns: [w("amlodipine|norvasc")], cls: "calcium channel blocker", rx: true },
  { name: "hydrochlorothiazide", patterns: [w("hydrochlorothiazide|HCTZ")], cls: "thiazide diuretic", rx: true, allergyGroups: ["sulfa"] },
  { name: "chlorthalidone", patterns: [w("chlorthalidone")], cls: "thiazide-like diuretic", rx: true, allergyGroups: ["sulfa"] },
  { name: "metoprolol", patterns: [w("metoprolol|toprol|lopressor")], cls: "beta blocker", rx: true },
  { name: "carvedilol", patterns: [w("carvedilol|coreg")], cls: "beta blocker", rx: true },
  { name: "furosemide", patterns: [w("furosemide|lasix")], cls: "loop diuretic", rx: true, allergyGroups: ["sulfa"] },
  { name: "spironolactone", patterns: [w("spironolactone|aldactone")], cls: "mineralocorticoid antagonist", rx: true, renalCaution: 30 },
  { name: "metformin", patterns: [w("metformin|glucophage")], cls: "biguanide", rx: true, renalCaution: 30 },
  { name: "glipizide", patterns: [w("glipizide")], cls: "sulfonylurea", rx: true, allergyGroups: ["sulfa"] },
  { name: "empagliflozin", patterns: [w("empagliflozin|jardiance")], cls: "SGLT2 inhibitor", rx: true, renalCaution: 20 },
  { name: "semaglutide", patterns: [w("semaglutide|ozempic|wegovy|rybelsus")], cls: "GLP-1 receptor agonist", rx: true },
  { name: "tirzepatide", patterns: [w("tirzepatide|mounjaro|zepbound")], cls: "GIP/GLP-1 receptor agonist", rx: true },
  { name: "insulin glargine", patterns: [w("glargine|lantus|basaglar|long-acting insulin")], cls: "basal insulin", rx: true },
  { name: "atorvastatin", patterns: [w("atorvastatin|lipitor")], cls: "statin", rx: true },
  { name: "rosuvastatin", patterns: [w("rosuvastatin|crestor")], cls: "statin", rx: true },
  { name: "simvastatin", patterns: [w("simvastatin|zocor")], cls: "statin", rx: true },
  { name: "aspirin", patterns: [w("aspirin|baby aspirin")], cls: "antiplatelet", rx: false, allergyGroups: ["nsaid"] },
  { name: "apixaban", patterns: [w("apixaban|eliquis")], cls: "anticoagulant", rx: true },
  { name: "warfarin", patterns: [w("warfarin|coumadin")], cls: "anticoagulant", rx: true },
  { name: "levothyroxine", patterns: [w("levothyroxine|synthroid")], cls: "thyroid hormone", rx: true },
  { name: "omeprazole", patterns: [w("omeprazole|prilosec")], cls: "proton pump inhibitor", rx: false },
  { name: "pantoprazole", patterns: [w("pantoprazole|protonix")], cls: "proton pump inhibitor", rx: true },
  { name: "famotidine", patterns: [w("famotidine|pepcid")], cls: "H2 blocker", rx: false },
  { name: "albuterol", patterns: [w("albuterol|proair|ventolin|rescue inhaler")], cls: "short-acting bronchodilator", rx: true },
  { name: "fluticasone", patterns: [w("fluticasone|flonase|flovent")], cls: "corticosteroid", rx: false },
  { name: "budesonide-formoterol", patterns: [w("symbicort|budesonide")], cls: "ICS/LABA", rx: true },
  { name: "montelukast", patterns: [w("montelukast|singulair")], cls: "leukotriene antagonist", rx: true },
  { name: "cetirizine", patterns: [w("cetirizine|zyrtec")], cls: "antihistamine", rx: false },
  { name: "loratadine", patterns: [w("loratadine|claritin")], cls: "antihistamine", rx: false },
  { name: "amoxicillin", patterns: [w("amoxicillin|amoxil")], cls: "penicillin antibiotic", rx: true, allergyGroups: ["penicillin"] },
  { name: "amoxicillin-clavulanate", patterns: [w("augmentin|amoxicillin[- ]clavulanate")], cls: "penicillin antibiotic", rx: true, allergyGroups: ["penicillin"] },
  { name: "azithromycin", patterns: [w("azithromycin|z-?pak|zithromax")], cls: "macrolide antibiotic", rx: true },
  { name: "doxycycline", patterns: [w("doxycycline")], cls: "tetracycline antibiotic", rx: true },
  { name: "cephalexin", patterns: [w("cephalexin|keflex")], cls: "cephalosporin antibiotic", rx: true, allergyGroups: ["cephalosporin"] },
  { name: "nitrofurantoin", patterns: [w("nitrofurantoin|macrobid")], cls: "urinary antibiotic", rx: true, renalCaution: 30 },
  { name: "sulfamethoxazole-trimethoprim", patterns: [w("bactrim|sulfamethoxazole|septra")], cls: "sulfonamide antibiotic", rx: true, allergyGroups: ["sulfa"], renalCaution: 30 },
  { name: "ciprofloxacin", patterns: [w("ciprofloxacin|cipro")], cls: "fluoroquinolone antibiotic", rx: true },
  { name: "prednisone", patterns: [w("prednisone|steroid taper|oral steroids")], cls: "corticosteroid", rx: true },
  { name: "ibuprofen", patterns: [w("ibuprofen|advil|motrin")], cls: "NSAID", rx: false, allergyGroups: ["nsaid"], renalCaution: 30 },
  { name: "naproxen", patterns: [w("naproxen|aleve")], cls: "NSAID", rx: false, allergyGroups: ["nsaid"], renalCaution: 30 },
  { name: "meloxicam", patterns: [w("meloxicam|mobic")], cls: "NSAID", rx: true, allergyGroups: ["nsaid"], renalCaution: 30 },
  { name: "acetaminophen", patterns: [w("acetaminophen|tylenol")], cls: "analgesic", rx: false },
  { name: "cyclobenzaprine", patterns: [w("cyclobenzaprine|flexeril|muscle relaxer")], cls: "muscle relaxant", rx: true },
  { name: "gabapentin", patterns: [w("gabapentin|neurontin")], cls: "gabapentinoid", rx: true, renalCaution: 60 },
  { name: "sertraline", patterns: [w("sertraline|zoloft")], cls: "SSRI", rx: true },
  { name: "escitalopram", patterns: [w("escitalopram|lexapro")], cls: "SSRI", rx: true },
  { name: "fluoxetine", patterns: [w("fluoxetine|prozac")], cls: "SSRI", rx: true },
  { name: "bupropion", patterns: [w("bupropion|wellbutrin")], cls: "NDRI", rx: true },
  { name: "trazodone", patterns: [w("trazodone")], cls: "sedating antidepressant", rx: true },
  { name: "hydroxyzine", patterns: [w("hydroxyzine|vistaril|atarax")], cls: "antihistamine anxiolytic", rx: true },
  { name: "melatonin", patterns: [w("melatonin")], cls: "supplement", rx: false },
  { name: "sumatriptan", patterns: [w("sumatriptan|imitrex")], cls: "triptan", rx: true },
  { name: "allopurinol", patterns: [w("allopurinol")], cls: "xanthine oxidase inhibitor", rx: true },
  { name: "colchicine", patterns: [w("colchicine")], cls: "antigout", rx: true, renalCaution: 30 },
  { name: "vitamin D3", patterns: [w("vitamin D(?:3)? (?:supplement|\\d)|cholecalciferol")], cls: "supplement", rx: false },
  { name: "ferrous sulfate", patterns: [w("ferrous sulfate|iron (?:pills?|supplement|tablets?)")], cls: "supplement", rx: false },
  { name: "ondansetron", patterns: [w("ondansetron|zofran")], cls: "antiemetic", rx: true },
  { name: "benzonatate", patterns: [w("benzonatate|tessalon")], cls: "antitussive", rx: true },
  { name: "guaifenesin", patterns: [w("guaifenesin|mucinex")], cls: "expectorant", rx: false },
  { name: "oseltamivir", patterns: [w("oseltamivir|tamiflu")], cls: "antiviral", rx: true, renalCaution: 30 },
];

export const ALLERGY_GROUPS: Record<string, RegExp> = {
  penicillin: w("penicillin|amoxicillin|augmentin|PCN"),
  sulfa: w("sulfa|bactrim|sulfonamide"),
  nsaid: w("NSAIDs?|ibuprofen|aspirin|naproxen|advil|motrin"),
  cephalosporin: w("cephalosporins?|keflex|cephalexin"),
  "ace inhibitor": w("ACE inhibitors?|lisinopril"),
  codeine: w("codeine|opioids?"),
  latex: w("latex"),
  shellfish: w("shellfish"),
  peanut: w("peanuts?"),
};

export interface OrderDef {
  kind: "lab" | "imaging" | "referral" | "vaccine" | "procedure";
  name: string;
  patterns: RegExp[];
  cpt?: string;
}

export const ORDERABLES: OrderDef[] = [
  { kind: "lab", name: "Hemoglobin A1c", patterns: [w("A1c|hemoglobin a1c|a one c")], cpt: "83036" },
  { kind: "lab", name: "Lipid panel", patterns: [w("lipid panel|cholesterol (?:panel|check|labs?)|check (?:your )?cholesterol")], cpt: "80061" },
  { kind: "lab", name: "Comprehensive metabolic panel", patterns: [w("CMP|comprehensive metabolic(?: panel)?|liver function")], cpt: "80053" },
  { kind: "lab", name: "Basic metabolic panel", patterns: [w("BMP|basic metabolic|electrolytes|potassium")], cpt: "80048" },
  { kind: "lab", name: "Complete blood count", patterns: [w("CBC|complete blood count|blood count")], cpt: "85025" },
  { kind: "lab", name: "TSH", patterns: [w("TSH|thyroid (?:test|labs?|level|function)")], cpt: "84443" },
  { kind: "lab", name: "Urinalysis", patterns: [w("urinalysis|urine (?:test|sample|dip)|UA")], cpt: "81003" },
  { kind: "lab", name: "Urine culture", patterns: [w("urine culture")], cpt: "87086" },
  { kind: "lab", name: "Urine microalbumin/creatinine ratio", patterns: [w("microalbumin|urine albumin|protein in (?:the|your) urine")], cpt: "82043" },
  { kind: "lab", name: "Rapid strep antigen", patterns: [w("(?:rapid )?strep (?:test|swab)|swab (?:your|the|her|his) throat")], cpt: "87880" },
  { kind: "lab", name: "Influenza A/B antigen", patterns: [w("flu (?:test|swab)")], cpt: "87804" },
  { kind: "lab", name: "SARS-CoV-2 antigen", patterns: [w("covid (?:test|swab)")], cpt: "87811" },
  { kind: "lab", name: "Vitamin D, 25-hydroxy", patterns: [w("vitamin D (?:level|test|check)|check (?:your )?vitamin D")], cpt: "82306" },
  { kind: "lab", name: "Vitamin B12", patterns: [w("B12")], cpt: "82607" },
  { kind: "lab", name: "Iron studies", patterns: [w("iron (?:studies|panel|levels?)|ferritin")], cpt: "83540" },
  { kind: "lab", name: "PSA", patterns: [w("PSA|prostate (?:test|screening)")], cpt: "84153" },
  { kind: "lab", name: "Uric acid", patterns: [w("uric acid")], cpt: "84550" },
  { kind: "imaging", name: "Chest X-ray, 2 views", patterns: [w("chest x-?ray|CXR|x-?ray of (?:your|the|her|his) chest")], cpt: "71046" },
  { kind: "imaging", name: "X-ray, lumbar spine", patterns: [w("x-?ray of (?:your|the|her|his) (?:low(?:er)? )?back|lumbar (?:spine )?x-?ray|back x-?ray")], cpt: "72100" },
  { kind: "imaging", name: "X-ray, knee", patterns: [w("x-?ray of (?:your|the|her|his) knee|knee x-?ray")], cpt: "73562" },
  { kind: "imaging", name: "X-ray, ankle", patterns: [w("x-?ray of (?:your|the|her|his) ankle|ankle x-?ray")], cpt: "73610" },
  { kind: "imaging", name: "MRI, lumbar spine", patterns: [w("MRI of (?:your|the|her|his) (?:low(?:er)? )?back|lumbar MRI|MRI of the lumbar")], cpt: "72148" },
  { kind: "imaging", name: "CT head without contrast", patterns: [w("CT (?:scan )?of (?:your|the|her|his) head|head CT")], cpt: "70450" },
  { kind: "imaging", name: "Abdominal ultrasound", patterns: [w("(?:abdominal |belly )ultrasound|ultrasound of (?:your|the|her|his) (?:belly|abdomen|gallbladder)")], cpt: "76700" },
  { kind: "imaging", name: "Echocardiogram", patterns: [w("echo(?:cardiogram)?|ultrasound of (?:your|the|her|his) heart")], cpt: "93306" },
  { kind: "procedure", name: "12-lead ECG", patterns: [w("EKG|ECG|electrocardiogram")], cpt: "93000" },
  { kind: "imaging", name: "Screening mammogram", patterns: [w("mammogram")], cpt: "77067" },
  { kind: "procedure", name: "Colonoscopy", patterns: [w("colonoscopy")], cpt: "45378" },
  { kind: "vaccine", name: "Influenza vaccine", patterns: [w("flu (?:shot|vaccine)|influenza vaccine")], cpt: "90686" },
  { kind: "vaccine", name: "Tdap vaccine", patterns: [w("tdap|tetanus (?:shot|booster)")], cpt: "90715" },
  { kind: "vaccine", name: "Zoster recombinant vaccine", patterns: [w("shingles (?:shot|vaccine)|shingrix")], cpt: "90750" },
  { kind: "vaccine", name: "Pneumococcal vaccine", patterns: [w("pneumonia (?:shot|vaccine)|pneumococcal|prevnar")], cpt: "90677" },
  { kind: "vaccine", name: "COVID-19 vaccine", patterns: [w("covid (?:shot|vaccine|booster)")], cpt: "91320" },
];

export const REFERRALS: { name: string; pattern: RegExp }[] = [
  { name: "Cardiology", pattern: w("cardiolog(?:y|ist)|heart (?:doctor|specialist)") },
  { name: "Endocrinology", pattern: w("endocrinolog(?:y|ist)") },
  { name: "Gastroenterology", pattern: w("gastroenterolog(?:y|ist)|GI (?:doctor|specialist)") },
  { name: "Dermatology", pattern: w("dermatolog(?:y|ist)|skin (?:doctor|specialist)") },
  { name: "Orthopedics", pattern: w("orthop(?:a)?edic(?:s)?|orthopedist|bone (?:doctor|specialist)") },
  { name: "Physical therapy", pattern: w("physical therap(?:y|ist)|PT(?! is)") },
  { name: "Neurology", pattern: w("neurolog(?:y|ist)") },
  { name: "Behavioral health", pattern: w("therap(?:y|ist) for|counsel(?:or|ing)|psychiatr(?:y|ist)|psycholog(?:y|ist)|behavioral health|talk therapy") },
  { name: "Nephrology", pattern: w("nephrolog(?:y|ist)|kidney (?:doctor|specialist)") },
  { name: "Pulmonology", pattern: w("pulmonolog(?:y|ist)|lung (?:doctor|specialist)") },
  { name: "ENT", pattern: w("ENT|ear,? nose,? and throat") },
  { name: "Ophthalmology", pattern: w("ophthalmolog(?:y|ist)|eye (?:doctor|exam)") },
  { name: "Podiatry", pattern: w("podiatr(?:y|ist)|foot (?:doctor|exam)") },
  { name: "Diabetes education", pattern: w("diabetes educat(?:or|ion)|diabetes self-management") },
  { name: "Nutrition", pattern: w("nutritionist|dietitian") },
  { name: "Sleep medicine", pattern: w("sleep (?:study|medicine|specialist)") },
];

export const EXAM_SYSTEMS: { system: string; pattern: RegExp }[] = [
  { system: "Extremities", pattern: w("feet|foot|monofilament|ankles?") },
  { system: "General", pattern: w("no (?:acute )?distress|appears (?:well|comfortable|tired|uncomfortable)|well-appearing|alert and oriented") },
  { system: "HEENT", pattern: w("ears?|eardrums?|tympanic|throat|tonsils?|pharynx|sinuses|nose|nasal|pupils|eyes?|mouth") },
  { system: "Neck", pattern: w("neck|lymph nodes?|thyroid (?:feels|is)|glands") },
  { system: "Cardiovascular", pattern: w("heart (?:sounds?|rate|rhythm)|murmurs?|regular rhythm|regular rate|irregular(?:ly irregular)?|pulses") },
  { system: "Respiratory", pattern: w("lungs?|breath sounds|wheez(?:e|es|ing)|crackles|rales|rhonchi|clear to auscultation|air movement") },
  { system: "Abdomen", pattern: w("abdomen|belly (?:is|feels)|bowel sounds|(?:no )?guarding|rebound") },
  { system: "Musculoskeletal", pattern: w("range of motion|tender(?:ness)? (?:to palpation|over|along)|straight leg raise|strength (?:is )?(?:5|full|normal)|spine|paraspinal|joint line|effusion|McMurray|drawer") },
  { system: "Extremities", pattern: w("edema|swelling in (?:the|your) (?:legs|ankles)|pitting") },
  { system: "Skin", pattern: w("rash|lesions?|skin (?:is|looks)|erythema|warm to touch") },
  { system: "Neurological", pattern: w("reflexes|sensation|cranial nerves|gait|neuro exam|strength and sensation") },
  { system: "Psychiatric", pattern: w("mood (?:is|seems)|affect|thought process|eye contact") },
];

export const NORMAL_EXAM: Record<string, string> = {
  General: "Alert, well-appearing, in no acute distress.",
  HEENT: "Normocephalic, atraumatic. Oropharynx clear. Tympanic membranes normal bilaterally.",
  Neck: "Supple, no lymphadenopathy or thyromegaly.",
  Cardiovascular: "Regular rate and rhythm, no murmurs, rubs, or gallops.",
  Respiratory: "Clear to auscultation bilaterally, no wheezes, rales, or rhonchi.",
  Abdomen: "Soft, non-tender, non-distended, normal bowel sounds.",
  Musculoskeletal: "Normal range of motion, no tenderness.",
  Extremities: "No edema.",
  Skin: "Warm and dry, no rashes.",
  Neurological: "Alert and oriented, cranial nerves grossly intact, normal gait.",
  Psychiatric: "Normal mood and affect.",
};

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export const ALL_PARTY_STATES = new Set(["CA", "CT", "DE", "FL", "IL", "MD", "MA", "MI", "MT", "NV", "NH", "OR", "PA", "WA"]);

export const DISCLOSURE_STATES: Record<string, string> = {
  RI: "Rhode Island requires ambient AI disclosure and an opt-out offer (2026).",
  ME: "Maine requires consent for ambient listening in behavioral health visits.",
  IL: "Illinois restricts AI use in therapeutic communications.",
  CO: "Colorado AI Act disclosure obligations apply.",
  AZ: "Arizona behavioral health informed consent applies from Jan 1, 2027.",
  LA: "Louisiana requires disclosure of AI documentation tools.",
};
