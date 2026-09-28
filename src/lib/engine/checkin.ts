import type { Facts } from "./extract";

export interface CheckinQuestion {
  key: string;
  text: { en: string; es: string };
  options?: { value: string; en: string; es: string }[];
  free?: boolean;
}

export interface CheckinFlag {
  level: "urgent" | "same_day" | "routine";
  text: string;
}

const BSW = [{ value: "better", en: "Better", es: "Mejor" }, { value: "same", en: "About the same", es: "Igual" }, { value: "worse", en: "Worse", es: "Peor" }];

export function buildCheckin(facts: Facts): CheckinQuestion[] {
  const qs: CheckinQuestion[] = [{ key: "overall", text: { en: "How are you feeling since your visit?", es: "¿Cómo se siente desde su visita?" }, options: BSW }];
  const started = facts.meds.filter((m) => !m.cancelled && m.rx && ["start", "increase", "decrease", "change"].includes(m.action)).slice(0, 3);
  for (const m of started) {
    qs.push({ key: `taking:${m.name}`, text: { en: `Are you taking ${m.name}${m.dose ? ` ${m.dose}` : ""} as prescribed?`, es: `¿Está tomando ${m.name}${m.dose ? ` ${m.dose}` : ""} como se le indicó?` }, options: [{ value: "yes", en: "Yes", es: "Sí" }, { value: "stopped", en: "I stopped it", es: "Lo dejé" }, { value: "not_started", en: "Haven't started", es: "No lo he empezado" }] });
    qs.push({ key: `side:${m.name}`, text: { en: `Any side effects from ${m.name}?`, es: `¿Algún efecto secundario de ${m.name}?` }, options: [{ value: "none", en: "None", es: "Ninguno" }, { value: "mild", en: "Mild, I'm okay", es: "Leves, estoy bien" }, { value: "bothersome", en: "Bothersome", es: "Molestos" }] });
  }
  const acute = facts.problems.filter((p) => !p.chronic && !p.def?.sdoh && p.key !== "well").slice(0, 2);
  for (const p of acute) qs.push({ key: `improving:${p.key}`, text: { en: `Is your ${p.def?.plain.en ?? p.label.toLowerCase()} improving?`, es: `¿Está mejorando su ${p.def?.plain.es ?? p.label.toLowerCase()}?` }, options: BSW });
  if (facts.orders.some((o) => o.kind === "lab" || o.kind === "imaging")) qs.push({ key: "tests", text: { en: "Were you able to get your labs or imaging done?", es: "¿Pudo hacerse los análisis o estudios?" }, options: [{ value: "done", en: "Yes, done", es: "Sí" }, { value: "not_yet", en: "Not yet", es: "Todavía no" }, { value: "help", en: "I need help", es: "Necesito ayuda" }] });
  for (const o of facts.orders.filter((x) => x.kind === "referral").slice(0, 2)) qs.push({ key: `referral:${o.name}`, text: { en: `Have you scheduled your appointment (${o.name.replace(/^Referral to /, "")})?`, es: `¿Programó su cita (${o.name.replace(/^Referral to /, "")})?` }, options: [{ value: "done", en: "Yes", es: "Sí" }, { value: "not_yet", en: "Not yet", es: "Todavía no" }, { value: "help", en: "I need help", es: "Necesito ayuda" }] });
  qs.push({ key: "note", text: { en: "Anything else your care team should know?", es: "¿Algo más que su equipo de atención deba saber?" }, free: true });
  return qs;
}

export function scoreCheckin(qs: CheckinQuestion[], answers: Record<string, string>): { flags: CheckinFlag[]; summary: string } {
  const flags: CheckinFlag[] = [];
  const lines: string[] = [];
  for (const q of qs) {
    const a = answers[q.key];
    if (!a) continue;
    const label = q.options?.find((o) => o.value === a)?.en ?? a;
    lines.push(`${q.text.en} ${label}`);
    if (q.key === "overall" && a === "worse") flags.push({ level: "same_day", text: "Feeling worse since the visit" });
    if (q.key.startsWith("improving:") && a === "worse") flags.push({ level: "same_day", text: `${q.text.en.replace(/^Is your /, "").replace(/ improving\?$/, "")} is getting worse` });
    if (q.key.startsWith("side:") && a === "bothersome") flags.push({ level: "same_day", text: `Bothersome side effects from ${q.key.slice(5)}` });
    if (q.key.startsWith("taking:") && a !== "yes") flags.push({ level: "routine", text: `${a === "stopped" ? "Stopped" : "Hasn't started"} ${q.key.slice(7)}` });
    if ((q.key === "tests" || q.key.startsWith("referral:")) && a === "help") flags.push({ level: "routine", text: `Needs help ${q.key === "tests" ? "getting tests done" : `scheduling ${q.key.slice(9).replace(/^Referral to /, "")}`}` });
  }
  return { flags, summary: lines.join("\n") };
}
