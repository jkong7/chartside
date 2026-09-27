const ES = new Set("el la los las un una unos de del que y en por para con es está están estoy estaba tengo tiene tienen me mi mis su sus se lo le les hace hay muy más pero como cuando dolor días día semanas semana meses desde ella él usted ustedes gracias sí bien ya también porque hoy ayer cada horas veces fiebre tos oído garganta pecho cabeza estómago medicina pastilla pastillas tomar toma tomando doctor doctora ahora dice dijo".split(" "));
const EN = new Set("the a an of and to in for with is are was were i you he she it my your have has had this that not do does did what when how any on at be been there here take taking pain days weeks doctor now says said".split(" "));

export function detectLang(text: string): "en" | "es" | "und" {
  const words = text.toLowerCase().normalize("NFC").match(/[a-záéíóúñü']+/g) ?? [];
  let es = /[áéíóúñ¿¡]/.test(text.toLowerCase()) ? 2 : 0;
  let en = 0;
  for (const w of words) {
    if (ES.has(w)) es++;
    if (EN.has(w)) en++;
  }
  if (!words.length) return "und";
  if (es > en && es >= 2) return "es";
  if (en >= es && en >= 1) return "en";
  return words.length <= 2 ? "und" : es > en ? "es" : "en";
}

const NUM_ES: Record<string, number> = { uno: 1, una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100 };
const NUM_EN: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100, once: 1, twice: 2 };

export function numbersIn(text: string, lang: string): number[] {
  const out: number[] = [];
  const t = text.toLowerCase();
  for (const m of t.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  const dict = lang === "es" ? NUM_ES : NUM_EN;
  for (const w of t.match(/[a-záéíóúñ]+/g) ?? []) {
    if (lang === "es" && (w === "un" || w === "una")) continue;
    if (lang === "en" && w === "once" && !/\bonce (?:a|per|daily)\b/.test(t)) continue;
    if (w in dict) out.push(dict[w]);
  }
  if (lang === "es" && /\bdos veces\b/.test(t) && !out.includes(2)) out.push(2);
  if (lang === "es" && /\buna vez\b/.test(t)) out.push(1);
  return out.sort((a, b) => a - b);
}

export const NEGATION: Record<string, RegExp> = {
  en: /\b(no|not|never|don't|doesn't|didn't|denies|none|nothing)\b/i,
  es: /\b(no|nunca|nada|ningún|ninguna|niega|tampoco)\b/i,
};

export const LATERALITY: Record<string, { left: RegExp; right: RegExp }> = {
  en: { left: /\bleft\b/i, right: /\bright\b/i },
  es: { left: /\bizquierd[oa]s?\b/i, right: /\bderech[oa]s?\b/i },
};
