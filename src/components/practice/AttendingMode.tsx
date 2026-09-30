"use client";

import { useEffect, useRef, useState } from "react";
import { Dictation, type DictationStatus } from "@/lib/audio/dictation";
import type { PimpResult, PresentationGrade } from "@/lib/engine/practice/attending";
import { Check, Mic, X } from "@/components/icons";

interface Saved {
  text: string;
  seconds: number;
  grade: PresentationGrade;
  pimp: PimpResult[] | null;
}

async function post<T>(url: string, data: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Something went wrong. Try again.");
  return j as T;
}

export default function AttendingMode({ id, questions, initial }: { id: string; questions: string[]; initial: Saved | null }) {
  const [saved, setSaved] = useState<Saved | null>(initial);
  const [open, setOpen] = useState(!!initial);
  const [text, setText] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mic, setMic] = useState<DictationStatus>("idle");
  const [interim, setInterim] = useState("");
  const dict = useRef<Dictation | null>(null);

  useEffect(() => () => dict.current?.stop(), []);

  const began = () => setStartedAt((s) => s ?? Date.now());

  const toggleMic = async () => {
    if (dict.current) {
      dict.current.stop();
      dict.current = null;
      return;
    }
    setError(null);
    try {
      const cfg = await post<{ provider: "deepgram" | "browser"; url: string | null; token: string | null }>("/api/practice/speech", { session: id, purpose: "present" });
      began();
      const d = new Dictation(cfg, {
        onFinal: (t) => setText((x) => `${x.trim()}${x.trim() ? " " : ""}${t.trim()}`),
        onInterim: setInterim,
        onStatus: (st, msg) => {
          setMic(st);
          if (st === "error") {
            setError(msg ?? "The microphone stopped. You can type instead.");
            dict.current = null;
          }
          if (st === "idle") dict.current = null;
        },
      });
      dict.current = d;
      await d.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The microphone isn't available. You can type instead.");
    }
  };

  const present = async () => {
    dict.current?.stop();
    dict.current = null;
    setBusy(true);
    setError(null);
    try {
      const seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined;
      const r = await post<{ presentation: Saved }>(`/api/practice/${id}/present`, { text, seconds });
      setSaved(r.presentation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't grade your presentation");
    } finally {
      setBusy(false);
    }
  };

  const pimp = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ presentation: Saved }>(`/api/practice/${id}/pimp`, { answers });
      setSaved(r.presentation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't grade your answers");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <section className="card p-5" data-testid="attending">
        <h2 className="font-serif text-2xl">Present to the attending</h2>
        <p className="mt-1 text-sm text-ink-2">Give your oral presentation like you would on rounds. You&apos;ll be graded on order, pertinent positives and negatives, and your assessment and plan. Then the attending asks you 3 questions.</p>
        <button className="btn-primary mt-4" onClick={() => setOpen(true)} data-testid="attending-open">Start presenting</button>
      </section>
    );
  }

  const listening = mic === "listening" || mic === "starting";

  return (
    <section className="card p-5" data-testid="attending">
      <h2 className="font-serif text-2xl">Present to the attending</h2>
      {!saved ? (
        <>
          <p className="mt-1 text-sm text-ink-2">Start with one line: age, key history, and why they came in. Then the story, pertinent negatives, exam, your leading diagnosis, and your plan. Aim for 2 to 3 minutes.</p>
          <label className="sr-only" htmlFor="presentation">Your presentation</label>
          <textarea id="presentation" className="input mt-3 min-h-[200px] text-[15px] leading-relaxed" value={text} onChange={(e) => { began(); setText(e.target.value); }} placeholder="Mr. Alvarez is a 58-year-old man with..." data-testid="attending-text" />
          {interim && <p className="mt-1 text-sm italic text-ink-3">{interim}</p>}
          {error && <p role="alert" className="mt-2 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-primary" onClick={present} disabled={busy || text.trim().split(/\s+/).length < 8} data-testid="attending-submit">{busy ? "Listening to you…" : "I'm done presenting"}</button>
            <button className={`btn-outline ${listening ? "border-rec text-rec" : ""}`} onClick={toggleMic} data-testid="attending-mic">
              <Mic size={14} /> {listening ? "Stop" : "Present out loud"}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-5">
          <div className="flex items-center gap-4">
            <p className="font-serif text-5xl text-brand" data-testid="attending-score">{saved.grade.score}<span className="text-2xl text-ink-3">/10</span></p>
            <p className="text-sm text-ink-2">{saved.grade.words} words{saved.grade.seconds ? ` · ${Math.floor(saved.grade.seconds / 60)}:${String(saved.grade.seconds % 60).padStart(2, "0")}` : ""}</p>
          </div>
          <ul className="space-y-2" data-testid="attending-items">
            {saved.grade.items.map((i) => (
              <li key={i.key} className="flex items-start gap-2 text-sm">
                {i.points >= i.max && i.max > 0 ? <Check size={16} className="mt-0.5 shrink-0 text-ok" /> : <X size={16} className="mt-0.5 shrink-0 text-rec" />}
                <span><span className="font-medium">{i.label}</span> <span className="text-ink-3">({i.points}/{i.max})</span><span className="block text-ink-2">{i.detail}</span></span>
              </li>
            ))}
          </ul>
          <div className="rounded-xl border border-line bg-paper p-4">
            <h3 className="font-semibold">The attending asks</h3>
            {!saved.pimp ? (
              <div className="mt-2 space-y-3">
                {questions.map((q, i) => (
                  <label key={q} className="block text-sm">
                    <span className="font-medium text-ink">{i + 1}. {q}</span>
                    <input className="input mt-1" value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} data-testid={`pimp-${i}`} />
                  </label>
                ))}
                {error && <p role="alert" className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec">{error}</p>}
                <button className="btn-primary" onClick={pimp} disabled={busy} data-testid="pimp-submit">Answer</button>
              </div>
            ) : (
              <ol className="mt-2 space-y-3" data-testid="pimp-results">
                {saved.pimp.map((p, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-medium">{i + 1}. {p.q}</p>
                    <p className={p.ok ? "text-ok" : "text-rec"} data-testid="pimp-verdict">{p.ok ? "Correct." : p.given ? "Not quite." : "No answer."} {p.given && <span className="text-ink-3">You said: {p.given}</span>}</p>
                    <p className="text-ink-2">Attending: {p.answer}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <button className="btn-ghost px-0 text-brand" onClick={() => { setSaved(null); setText(""); setStartedAt(null); setAnswers(["", "", ""]); }} data-testid="attending-again">Present again</button>
        </div>
      )}
    </section>
  );
}
