"use client";

import { useEffect, useState } from "react";
import type { PatientSummary } from "@/lib/types";
import { Check, Logo } from "./icons";
import { Spinner } from "./ui";

interface Data {
  firstName: string | null;
  clinician: string;
  date: string;
  lang: string;
  summaries: Record<string, PatientSummary>;
  transcript: { id: string; speaker: string; text: string }[];
  flags: { item: string; comment: string; resolved: boolean }[];
}

const UI = {
  en: { ask: "Message your care team", askHint: "Questions about this visit, refills, or results. Not for emergencies: call 911 if you have chest pain, trouble breathing, or thoughts of harming yourself.", askSend: "Send message", asked: "Sent", reply: "Reply from", waiting: "Your care team usually replies within 2 business days.", urgent: "If this is an emergency, call 911 now. We also flagged your message for a call today.", visit: "Visit summary", wrong: "Something not right?", tell: "Tell us what's wrong", send: "Send to my care team", sent: "Thanks. Your care team will review this.", transcript: "Read the visit conversation", you: "You", clinician: "Clinician", private: "This page is private to you. Share it only with people you trust." },
  es: { ask: "Enviar un mensaje a su equipo de atención", askHint: "Preguntas sobre esta visita, recetas o resultados. No es para emergencias: llame al 911 si tiene dolor de pecho, dificultad para respirar o pensamientos de hacerse daño.", askSend: "Enviar mensaje", asked: "Enviado", reply: "Respuesta de", waiting: "Su equipo suele responder en 2 días hábiles.", urgent: "Si es una emergencia, llame al 911 ahora. También marcamos su mensaje para llamarle hoy.", visit: "Resumen de la visita", wrong: "¿Algo no está bien?", tell: "Díganos qué está mal", send: "Enviar a mi equipo de atención", sent: "Gracias. Su equipo de atención lo revisará.", transcript: "Leer la conversación de la visita", you: "Usted", clinician: "Clínico", private: "Esta página es privada. Compártala solo con personas de confianza." },
};

export default function ShareView({ token }: { token: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lang, setLang] = useState("en");
  const [open, setOpen] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/share/${token}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "Not found");
      else {
        setD(j);
        setLang(j.lang);
      }
    });
  }, [token]);

  if (err) return <main className="mx-auto max-w-xl px-6 py-20 text-center text-ink-2">{err}</main>;
  if (!d) return <main className="flex min-h-screen items-center justify-center text-brand"><Spinner /></main>;
  const s = d.summaries[lang] ?? d.summaries.en;
  const t = UI[(lang as "en") in UI ? (lang as "en") : "en"];

  async function flag(item: string) {
    if (!comment.trim()) return;
    setBusy(true);
    await fetch(`/api/share/${token}/flag`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ item, comment }) });
    setSent((x) => new Set(x).add(item));
    setOpen(null);
    setComment("");
    setBusy(false);
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10" lang={lang}>
      <div className="flex items-center gap-2.5"><Logo size={24} /><span className="font-serif text-lg">Chartside</span></div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-ink-3">{t.visit} · {new Date(d.date).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "long", day: "numeric", year: "numeric" })} · {d.clinician}</p>
        </div>
        {Object.keys(d.summaries).length > 1 && (
          <div className="flex gap-1">{Object.keys(d.summaries).map((l) => <button key={l} className={`pill ${l === lang ? "bg-brand text-white" : "bg-sunken"}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}</div>
        )}
      </div>
      {s && (
        <div className="card mt-4 space-y-5 p-6 text-[17px] leading-8" data-testid="share-summary">
          <p className="font-serif text-2xl leading-snug">{s.greeting}</p>
          {s.sections.map((sec) => (
            <section key={sec.title}>
              <h2 className="font-semibold">{sec.title}</h2>
              <ul className="mt-1 space-y-1">
                {sec.items.map((i) => (
                  <li key={i} className="group">
                    <div className="flex items-start gap-2">
                      <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span className="flex-1">{i}</span>
                      {sent.has(i) ? <Check className="mt-2 text-ok" /> : <button className="mt-1 shrink-0 text-xs text-ink-3 underline opacity-70 hover:opacity-100" onClick={() => { setOpen(open === i ? null : i); setComment(""); }} data-testid="flag-item">{t.wrong}</button>}
                    </div>
                    {open === i && (
                      <div className="ml-4 mt-2 space-y-2 rounded-lg bg-sunken p-3">
                        <textarea className="input text-sm" placeholder={t.tell} value={comment} onChange={(e) => setComment(e.target.value)} aria-label={t.tell} data-testid="flag-comment" />
                        <button className="btn-primary text-sm" disabled={busy || !comment.trim()} onClick={() => flag(i)} data-testid="flag-send">{t.send}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {sent.size > 0 && <p className="rounded-lg bg-ok-50 px-3 py-2 text-sm text-ok" role="status">{t.sent}</p>}
        </div>
      )}
      <Ask token={token} t={t} clinician={d.clinician} lang={lang} />
      <details className="mt-6">
        <summary className="cursor-pointer text-sm font-medium text-brand">{t.transcript}</summary>
        <div className="mt-3 space-y-2 text-sm">
          {d.transcript.map((u) => (
            <p key={u.id}><span className="font-semibold text-ink-2">{u.speaker === "clinician" ? t.clinician : t.you}:</span> {u.text}</p>
          ))}
        </div>
      </details>
      <p className="mt-10 text-xs text-ink-3">{t.private}</p>
    </main>
  );
}

interface Thread {
  id: string;
  body: string;
  receivedAt: string;
  reply: string | null;
  repliedAt: string | null;
  urgency: string;
}

function Ask({ token, t, clinician, lang }: { token: string; t: (typeof UI)["en"]; clinician: string; lang: string }) {
  const [thread, setThread] = useState<Thread[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/share/${token}/messages`).then(async (r) => r.ok && setThread((await r.json()).messages));
  }, [token]);
  const when = (iso: string) => new Date(iso).toLocaleString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <section className="card mt-6 p-5" data-testid="patient-ask">
      <h2 className="font-semibold">{t.ask}</h2>
      <p className="mt-1 text-sm text-ink-3">{t.askHint}</p>
      <ul className="mt-3 space-y-3">
        {thread.map((m) => (
          <li key={m.id} className="space-y-2" data-testid="patient-thread-item">
            <div className="ml-8 rounded-lg bg-brand-50 px-3 py-2 text-sm"><p className="whitespace-pre-wrap">{m.body}</p><p className="mt-1 text-[11px] text-ink-4">{t.asked} · {when(m.receivedAt)}</p></div>
            {m.urgency === "emergency" && !m.reply && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{t.urgent}</p>}
            {m.reply ? (
              <div className="mr-8 rounded-lg border border-line px-3 py-2 text-sm" data-testid="patient-reply"><p className="text-[11px] font-medium text-ink-3">{t.reply} {clinician} · {m.repliedAt ? when(m.repliedAt) : ""}</p><p className="mt-1 whitespace-pre-wrap">{m.reply}</p></div>
            ) : m.urgency !== "emergency" ? <p className="mr-8 text-xs text-ink-4">{t.waiting}</p> : null}
          </li>
        ))}
      </ul>
      <textarea className="input mt-3 min-h-[90px] text-base" value={text} onChange={(e) => setText(e.target.value)} aria-label={t.ask} data-testid="patient-message" />
      {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
      <button className="btn-primary mt-2" disabled={busy || text.trim().length < 2} data-testid="patient-send" onClick={async () => {
        setBusy(true);
        setErr(null);
        const r = await fetch(`/api/share/${token}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text }) });
        const j = await r.json();
        if (r.ok) {
          setThread((x) => [...x, j.message]);
          setText("");
        } else setErr(j.error ?? "Could not send");
        setBusy(false);
      }}>{t.askSend}</button>
    </section>
  );
}
