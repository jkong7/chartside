"use client";

import { useEffect, useState } from "react";
import { SYMPTOMS } from "@/lib/engine/intake";
import { Check, Logo } from "./icons";
import { Spinner } from "./ui";

interface Info { patientFirst: string; clinician: string; date: string; lang: "en" | "es"; meds: string[]; allergies: string[]; olderAdult: boolean; submitted: boolean }

const T = {
  en: { title: "Before your visit", intro: (n: string, c: string, d: string) => `Hi ${n}. A few questions before your visit with ${c} on ${d}. It takes about 3 minutes. Your answers go only to your care team.`, reason: "What would you like to talk about?", symptoms: "Are you having any of these?", duration: "How long has this been going on?", meds: "Are you still taking these medicines?", taking: "Taking", stopped: "Stopped", different: "Taking differently", notSure: "Not sure", howDifferent: "How are you taking it?", newMeds: "Any new medicines or supplements?", allergies: "Allergies we have on file", correct: "This list is correct", notCorrect: "Something is missing or wrong", newAllergies: "What should we add or fix?", mood: "Over the last 2 weeks, how often have you been bothered by…", phq: ["Little interest or pleasure in doing things", "Feeling down, depressed, or hopeless"], gad: ["Feeling nervous, anxious, or on edge", "Not being able to stop or control worrying"], freq: ["Not at all", "Several days", "More than half the days", "Nearly every day"], tobacco: "Do you smoke or use tobacco or vape?", tob: { never: "Never", former: "I used to", current: "Yes, now" }, alcohol: "Alcohol", auditQ: ["How often do you have a drink containing alcohol?", "How many drinks do you have on a typical day when drinking?", "How often do you have 6 or more drinks on one occasion?"], auditA: [["Never", "Monthly or less", "2 to 4 times a month", "2 to 3 times a week", "4 or more times a week"], ["1 or 2", "3 or 4", "5 or 6", "7 to 9", "10 or more"], ["Never", "Less than monthly", "Monthly", "Weekly", "Daily or almost daily"]], falls: "Have you fallen in the past year?", fallA: { none: "No", one: "Once", two_or_more: "Two or more times" }, needs: "In the past year, have you…", food: "Worried food would run out before you had money to buy more", housing: "Worried about losing your housing or had no steady place to live", transport: "Missed care because you didn't have a ride", questions: "Questions for your care team", submit: "Send to my care team", done: "Thank you. Your care team will see your answers before your visit.", emergency: "If you have chest pain or trouble breathing right now, call 911.", lang: "Español" },
  es: { title: "Antes de su visita", intro: (n: string, c: string, d: string) => `Hola ${n}. Unas preguntas antes de su visita con ${c} el ${d}. Toma unos 3 minutos. Sus respuestas solo las ve su equipo de atención.`, reason: "¿De qué quiere hablar?", symptoms: "¿Tiene alguno de estos?", duration: "¿Desde cuándo?", meds: "¿Sigue tomando estas medicinas?", taking: "Sí", stopped: "Dejé de tomarla", different: "La tomo diferente", notSure: "No sé", howDifferent: "¿Cómo la toma?", newMeds: "¿Medicinas o suplementos nuevos?", allergies: "Alergias registradas", correct: "La lista está bien", notCorrect: "Falta algo o hay un error", newAllergies: "¿Qué debemos agregar o corregir?", mood: "En las últimas 2 semanas, ¿con qué frecuencia le ha molestado…", phq: ["Poco interés o placer en hacer cosas", "Sentirse decaído(a), deprimido(a) o sin esperanza"], gad: ["Sentirse nervioso(a), ansioso(a) o muy alterado(a)", "No poder dejar de preocuparse"], freq: ["Nunca", "Varios días", "Más de la mitad de los días", "Casi todos los días"], tobacco: "¿Fuma, usa tabaco o vapea?", tob: { never: "Nunca", former: "Antes sí", current: "Sí, ahora" }, alcohol: "Alcohol", auditQ: ["¿Con qué frecuencia toma bebidas con alcohol?", "¿Cuántas bebidas toma en un día típico cuando bebe?", "¿Con qué frecuencia toma 6 o más bebidas en una ocasión?"], auditA: [["Nunca", "Una vez al mes o menos", "2 a 4 veces al mes", "2 a 3 veces por semana", "4 o más veces por semana"], ["1 o 2", "3 o 4", "5 o 6", "7 a 9", "10 o más"], ["Nunca", "Menos de una vez al mes", "Cada mes", "Cada semana", "Diario o casi diario"]], falls: "¿Se ha caído en el último año?", fallA: { none: "No", one: "Una vez", two_or_more: "Dos o más veces" }, needs: "En el último año, ¿usted…", food: "Se preocupó de que la comida se acabara antes de tener dinero para comprar más", housing: "Se preocupó por perder su vivienda o no tuvo un lugar fijo donde vivir", transport: "Faltó a una cita médica por no tener transporte", questions: "Preguntas para su equipo de atención", submit: "Enviar a mi equipo", done: "Gracias. Su equipo verá sus respuestas antes de la visita.", emergency: "Si tiene dolor de pecho o dificultad para respirar ahora, llame al 911.", lang: "English" },
};

export default function IntakeForm({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState<"en" | "es">("en");
  const [a, setA] = useState<Record<string, unknown>>({ symptoms: [], phq: [null, null], gad: [null, null], auditc: [null, null, null] });
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/intake/${token}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "Not found");
      else {
        setInfo(j);
        setLang(j.lang);
        setA((x) => ({ ...x, meds: (j.meds as string[]).map(() => ({ status: "taking" })) }));
      }
    });
  }, [token]);
  if (err) return <main className="mx-auto max-w-xl px-6 py-20 text-center text-ink-2">{err}</main>;
  if (!info) return <main className="flex min-h-screen items-center justify-center text-brand"><Spinner /></main>;
  const t = T[lang];
  const set = (k: string, v: unknown) => setA((x) => ({ ...x, [k]: v }));
  const setIdx = (k: string, i: number, v: number) => setA((x) => { const arr = [...(x[k] as (number | null)[])]; arr[i] = v; return { ...x, [k]: arr }; });
  if (done || info.submitted) return <main className="mx-auto max-w-xl px-6 py-20 text-center" data-testid="intake-done"><Check className="mx-auto text-ok" size={32} /><p className="mt-3 text-lg">{t.done}</p></main>;
  const radio = (name: string, opts: [string, string][], value: unknown, on: (v: string) => void) => (
    <div className="mt-1 flex flex-wrap gap-2">{opts.map(([v, l]) => <label key={v} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${value === v ? "border-brand bg-brand-50 text-brand" : "border-line"}`}><input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => on(v)} />{l}</label>)}</div>
  );
  return (
    <main className="mx-auto max-w-2xl px-5 py-8" lang={lang} data-testid="intake-form">
      <div className="flex items-center gap-2.5"><Logo size={24} /><span className="flex-1 font-serif text-lg">Chartside</span><button className="text-sm text-brand underline" onClick={() => setLang(lang === "en" ? "es" : "en")}>{t.lang}</button></div>
      <h1 className="mt-6 font-serif text-3xl">{t.title}</h1>
      <p className="mt-2 text-ink-2">{t.intro(info.patientFirst, info.clinician, new Date(info.date).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric" }))}</p>
      <p className="mt-2 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec">{t.emergency}</p>
      <form className="mt-6 space-y-6" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); const r = await fetch(`/api/intake/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a) }); const j = await r.json(); setBusy(false); if (r.ok) setDone(true); else setErr(j.error ?? "Could not send"); }}>
        <section className="card p-4"><label className="block"><span className="font-medium">{t.reason}</span><textarea className="input mt-2 text-base" rows={3} onChange={(e) => set("reason", e.target.value)} data-testid="intake-reason" /></label></section>
        <section className="card p-4">
          <p className="font-medium">{t.symptoms}</p>
          <div className="mt-2 flex flex-wrap gap-2">{SYMPTOMS.map((s) => { const on = (a.symptoms as string[]).includes(s); return <label key={s} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand-50 text-brand" : "border-line"}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => set("symptoms", on ? (a.symptoms as string[]).filter((x) => x !== s) : [...(a.symptoms as string[]), s])} />{s}</label>; })}</div>
          <label className="mt-3 block text-sm">{t.duration}<input className="input mt-1" onChange={(e) => set("duration", e.target.value)} /></label>
        </section>
        {info.meds.length > 0 && (
          <section className="card space-y-3 p-4" data-testid="intake-meds">
            <p className="font-medium">{t.meds}</p>
            {info.meds.map((m, i) => { const cur = (a.meds as { status: string; note?: string }[])?.[i]; return (
              <div key={m}><p className="text-sm">{m}</p>{radio(`med${i}`, [["taking", t.taking], ["stopped", t.stopped], ["different", t.different], ["not_sure", t.notSure]], cur?.status, (v) => set("meds", (a.meds as object[]).map((x, j) => (j === i ? { ...x, status: v } : x))))}{cur?.status === "different" && <input className="input mt-1 text-sm" placeholder={t.howDifferent} onChange={(e) => set("meds", (a.meds as object[]).map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />}</div>
            ); })}
            <label className="block text-sm">{t.newMeds}<input className="input mt-1" onChange={(e) => set("newMeds", e.target.value)} /></label>
          </section>
        )}
        <section className="card p-4">
          <p className="font-medium">{t.allergies}: <span className="font-normal">{info.allergies.join(", ") || (lang === "es" ? "ninguna" : "none on file")}</span></p>
          {radio("allergies", [["yes", t.correct], ["no", t.notCorrect]], a.allergiesConfirmed === undefined ? undefined : a.allergiesConfirmed ? "yes" : "no", (v) => set("allergiesConfirmed", v === "yes"))}
          {a.allergiesConfirmed === false && <input className="input mt-2" placeholder={t.newAllergies} onChange={(e) => set("newAllergies", e.target.value)} />}
        </section>
        <section className="card space-y-3 p-4" data-testid="intake-mood">
          <p className="font-medium">{t.mood}</p>
          {[...t.phq.map((q, i) => ["phq", i, q] as const), ...t.gad.map((q, i) => ["gad", i, q] as const)].map(([k, i, q]) => (
            <div key={`${k}${i}`}><p className="text-sm">{q}</p>{radio(`${k}${i}`, t.freq.map((f, v) => [String(v), f]), (a[k] as (number | null)[])[i] === null ? undefined : String((a[k] as number[])[i]), (v) => setIdx(k, i, Number(v)))}</div>
          ))}
        </section>
        <section className="card space-y-3 p-4">
          <div><p className="font-medium">{t.tobacco}</p>{radio("tobacco", Object.entries(t.tob), a.tobacco, (v) => set("tobacco", v))}</div>
          <div><p className="font-medium">{t.alcohol}</p>{t.auditQ.map((q, i) => <div key={q} className="mt-2"><p className="text-sm">{q}</p>{radio(`audit${i}`, t.auditA[i].map((l, v) => [String(v), l]), (a.auditc as (number | null)[])[i] === null ? undefined : String((a.auditc as number[])[i]), (v) => setIdx("auditc", i, Number(v)))}</div>)}</div>
          {info.olderAdult && <div><p className="font-medium">{t.falls}</p>{radio("falls", Object.entries(t.fallA), a.falls, (v) => set("falls", v))}</div>}
        </section>
        <section className="card space-y-2 p-4">
          <p className="font-medium">{t.needs}</p>
          {(["food", "housing", "transport"] as const).map((k) => <label key={k} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" onChange={(e) => set(k, e.target.checked)} data-testid={`need-${k}`} />{t[k]}</label>)}
        </section>
        <section className="card p-4"><label className="block"><span className="font-medium">{t.questions}</span><textarea className="input mt-2 text-base" rows={3} onChange={(e) => set("questions", e.target.value)} /></label></section>
        {err && <p className="text-sm text-rec" role="alert">{err}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy} data-testid="intake-submit">{busy ? <Spinner /> : null} {t.submit}</button>
      </form>
    </main>
  );
}
