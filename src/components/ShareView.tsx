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
  en: { visit: "Visit summary", wrong: "Something not right?", tell: "Tell us what's wrong", send: "Send to my care team", sent: "Thanks. Your care team will review this.", transcript: "Read the visit conversation", you: "You", clinician: "Clinician", private: "This page is private to you. Share it only with people you trust." },
  es: { visit: "Resumen de la visita", wrong: "¿Algo no está bien?", tell: "Díganos qué está mal", send: "Enviar a mi equipo de atención", sent: "Gracias. Su equipo de atención lo revisará.", transcript: "Leer la conversación de la visita", you: "Usted", clinician: "Clínico", private: "Esta página es privada. Compártala solo con personas de confianza." },
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
