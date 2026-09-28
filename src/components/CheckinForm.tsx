"use client";

import { useState } from "react";
import type { CheckinQuestion } from "@/lib/engine/checkin";
import { Spinner } from "./ui";

export default function CheckinForm({ token, data }: { token: string; data: { first: string; clinician: string; org: string; lang: "en" | "es"; questions: CheckinQuestion[]; submitted: boolean } }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(data.submitted);
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const es = data.lang === "es";
  if (done) return <div className="card p-6" data-testid="checkin-done"><p className="font-serif text-2xl">{es ? "Gracias" : "Thank you"}</p><p className="mt-2 text-sm text-ink-2">{urgent ? (es ? "Su equipo de atención le llamará hoy. Si empeora o es una emergencia, llame al 911." : "Your care team will call you today. If you feel much worse or it's an emergency, call 911.") : es ? "Su equipo de atención revisará sus respuestas." : "Your care team will review your answers."}</p></div>;
  return (
    <form className="card space-y-5 p-6" data-testid="checkin-form" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      const r = await fetch(`/api/c/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(answers) });
      const j = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return setErr(j.error ?? "Something went wrong");
      setUrgent((j.flags ?? []).some((f: { level: string }) => f.level !== "routine"));
      setDone(true);
    }}>
      <div><p className="font-serif text-2xl">{es ? `Hola ${data.first}` : `Hi ${data.first}`}</p><p className="mt-1 text-sm text-ink-2">{es ? `${data.clinician} quiere saber cómo sigue después de su visita.` : `${data.clinician} would like to know how you're doing since your visit.`}</p></div>
      {data.questions.map((q) => (
        <fieldset key={q.key} data-testid="checkin-q">
          <legend className="text-sm font-medium">{es ? q.text.es : q.text.en}</legend>
          {q.free ? <textarea aria-label={es ? q.text.es : q.text.en} className="input mt-2 text-sm" rows={3} value={answers[q.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })} data-testid={`checkin-${q.key}`} /> : (
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options!.map((o) => (
                <label key={o.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${answers[q.key] === o.value ? "border-brand bg-brand text-white" : "border-line"}`}>
                  <input type="radio" className="sr-only" name={q.key} value={o.value} checked={answers[q.key] === o.value} onChange={() => setAnswers({ ...answers, [q.key]: o.value })} data-testid={`checkin-${q.key}-${o.value}`} />
                  {es ? o.es : o.en}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ))}
      <p className="text-xs text-ink-3">{es ? "Si es una emergencia, llame al 911." : "If this is an emergency, call 911."}</p>
      {err && <p className="text-sm text-rec" role="alert">{err}</p>}
      <button className="btn-primary w-full justify-center" disabled={busy} data-testid="checkin-submit">{busy ? <Spinner /> : null} {es ? "Enviar" : "Send"}</button>
    </form>
  );
}
