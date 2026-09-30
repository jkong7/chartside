"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dictation, type DictationStatus } from "@/lib/audio/dictation";
import { mulawDecode } from "@/lib/server/telephony/mulaw";
import type { DoorCard } from "@/lib/engine/practice/cases";
import type { Turn } from "@/lib/engine/practice/types";
import { Mic, Send, Stop } from "@/components/icons";

type Phase = "door" | "encounter" | "note" | "grading";

export interface Resume {
  id: string;
  status: "active" | "noting" | "graded";
  turns: Turn[];
  timeLimitS: number;
  elapsed: number;
  note: string | null;
}

const NOTE_TEMPLATE = "S: \n\nO: \n\nA: \n\nP: ";

function clock(s: number) {
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

async function post<T>(url: string, data: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data ?? {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || "Something went wrong. Try again.");
  return j as T;
}

export default function PracticeRoom({ card, challenge, resume, classCode, defaultName }: { card: DoorCard; challenge: { id: string; name: string | null; score: number } | null; resume: Resume | null; classCode: string; defaultName: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(resume ? (resume.status === "active" ? "encounter" : "note") : "door");
  const [id, setId] = useState<string | null>(resume?.id ?? null);
  const [turns, setTurns] = useState<Turn[]>(resume?.turns ?? []);
  const [limit, setLimit] = useState(resume?.timeLimitS ?? 720);
  const [minutes, setMinutes] = useState(12);
  const [name, setName] = useState(defaultName);
  const [cohort, setCohort] = useState(classCode);
  const [startedAt, setStartedAt] = useState(() => (resume ? Date.now() - resume.elapsed * 1000 : 0));
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [interim, setInterim] = useState("");
  const [micStatus, setMicStatus] = useState<DictationStatus>("idle");
  const [noteMic, setNoteMic] = useState<DictationStatus>("idle");
  const [speakAloud, setSpeakAloud] = useState(false);
  const [note, setNote] = useState(resume?.note || NOTE_TEMPLATE);
  const dict = useRef<Dictation | null>(null);
  const noteDict = useRef<Dictation | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const listRef = useRef<HTMLDivElement | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const audioAt = useRef(0);
  const speakRef = useRef(speakAloud);
  speakRef.current = speakAloud;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const ending = useRef(false);

  const remaining = phase === "encounter" ? limit - (now - startedAt) / 1000 : limit;

  useEffect(() => {
    if (phase !== "encounter") return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [phase]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
    return () => window.cancelAnimationFrame(id);
  }, [turns.length, interim, pending]);

  useEffect(
    () => () => {
      dict.current?.stop();
      noteDict.current?.stop();
      void audioCtx.current?.close().catch(() => {});
    },
    [],
  );

  const speak = useCallback(async (sid: string, turn: Turn) => {
    if (!speakRef.current) return;
    try {
      const r = await fetch(`/api/practice/${sid}/speak?turn=${encodeURIComponent(turn.id)}`);
      if (!r.ok) return;
      const pcm = mulawDecode(new Uint8Array(await r.arrayBuffer()));
      const ctx = (audioCtx.current ??= new AudioContext());
      await ctx.resume();
      const buf = ctx.createBuffer(1, pcm.length || 1, 8000);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      const at = Math.max(ctx.currentTime + 0.05, audioAt.current);
      src.start(at);
      audioAt.current = at + buf.duration;
    } catch {
      return;
    }
  }, []);

  const stopMic = useCallback(() => {
    dict.current?.stop();
    dict.current = null;
  }, []);

  const toNote = useCallback(() => {
    stopMic();
    setInterim("");
    setPhase("note");
  }, [stopMic]);

  const end = useCallback(async () => {
    if (!id || ending.current) return;
    ending.current = true;
    stopMic();
    await chain.current.catch(() => {});
    try {
      await post(`/api/practice/${id}/end`, {});
      toNote();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't end the encounter");
      ending.current = false;
    }
  }, [id, stopMic, toNote]);

  useEffect(() => {
    if (phase === "encounter" && remaining <= 0) void end();
  }, [phase, remaining, end]);

  const send = useCallback(
    (payload: { text?: string; exam?: string }) => {
      if (!id) return;
      setPending((n) => n + 1);
      setError(null);
      chain.current = chain.current
        .then(async () => {
          if (phaseRef.current !== "encounter") return;
          const r = await post<{ added: Turn[]; ended: boolean }>(`/api/practice/${id}/turn`, payload);
          setTurns((ts) => [...ts, ...r.added]);
          const said = r.added.filter((t) => t.role === "patient");
          for (const t of said) void speak(id, t);
          if (r.ended) toNote();
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't reach the patient"))
        .finally(() => setPending((n) => n - 1));
    },
    [id, speak, toNote],
  );

  const start = async () => {
    setError(null);
    try {
      const r = await post<{ id: string; timeLimitS: number }>("/api/practice", { caseId: card.id, name, cohort, minutes, challenge: challenge?.id });
      setId(r.id);
      setLimit(r.timeLimitS);
      setStartedAt(Date.now());
      setNow(Date.now());
      setTurns([]);
      setPhase("encounter");
      window.history.replaceState(null, "", `/practice/${card.id}?s=${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the case");
    }
  };

  const ask = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    send({ text });
  };

  const speechConfig = async (purpose: "encounter" | "note") => post<{ provider: "deepgram" | "browser"; url: string | null; token: string | null }>("/api/practice/speech", { session: id, purpose });

  const toggleMic = async () => {
    if (dict.current) return stopMic();
    setError(null);
    try {
      const cfg = await speechConfig("encounter");
      setSpeakAloud(cfg.provider === "deepgram");
      const d = new Dictation(cfg, {
        onFinal: (t) => {
          if (t.trim()) send({ text: t.trim() });
        },
        onInterim: setInterim,
        onStatus: (st, msg) => {
          setMicStatus(st);
          if (st === "error") {
            setError(msg ?? "The microphone stopped. You can keep typing.");
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

  const toggleNoteMic = async () => {
    if (noteDict.current) {
      noteDict.current.stop();
      noteDict.current = null;
      return;
    }
    try {
      const cfg = await speechConfig("note");
      const d = new Dictation(cfg, {
        onFinal: (t) => setNote((n) => `${n.replace(/\s+$/, "")}${n.trim() ? " " : ""}${t.trim()}`),
        onInterim: () => {},
        onStatus: (st, msg) => {
          setNoteMic(st);
          if (st === "error") {
            setError(msg ?? "Dictation stopped. You can keep typing.");
            noteDict.current = null;
          }
          if (st === "idle") noteDict.current = null;
        },
      });
      noteDict.current = d;
      await d.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dictation isn't available. You can type instead.");
    }
  };

  const grade = async (withNote: boolean) => {
    if (!id) return;
    noteDict.current?.stop();
    noteDict.current = null;
    setPhase("grading");
    setError(null);
    try {
      await post(`/api/practice/${id}/note`, { note: withNote && note.replace(/^[SOAP]:\s*$/gm, "").trim() ? note : "" });
      router.push(`/practice/s/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't grade your note");
      setPhase("note");
    }
  };

  const who = card.patient.speaker ? card.patient.speaker.split(",")[0] : card.patient.name.split(" ")[0];
  const listening = micStatus === "listening" || micStatus === "starting";
  const low = remaining < 60;

  if (phase === "door") {
    return (
      <div className="mx-auto w-full max-w-2xl" data-testid="practice-door">
        {challenge && (
          <p className="mb-4 rounded-xl border border-brand/30 bg-brand-50 px-4 py-3 text-sm text-ink" data-testid="practice-challenge">
            <span className="font-semibold">{challenge.name ?? "A friend"}</span> scored <span className="font-semibold">{challenge.score}</span> on this case. Can you beat it?
          </p>
        )}
        <article className="card overflow-hidden">
          <div className="border-b border-line bg-sunken px-5 py-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Door information · {card.door.setting}</div>
          <div className="space-y-4 p-5">
            <div>
              <h1 className="font-serif text-3xl leading-tight">{card.patient.name}, {card.patient.age}</h1>
              {card.patient.speaker && <p className="mt-1 text-sm text-ink-2">You&apos;ll be talking with {card.patient.speaker}.</p>}
              <p className="mt-2 text-ink-2">{card.patient.affect}</p>
            </div>
            <div className="rounded-lg bg-paper px-4 py-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Vitals</p>
              <p className="mt-1 text-ink">{card.door.vitals}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Your task</p>
              <p className="mt-1 text-ink-2">{card.door.task}</p>
            </div>
          </div>
        </article>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="label">First name (optional)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="For your scorecard" maxLength={20} data-testid="practice-name" />
          </label>
          <label className="block text-sm">
            <span className="label">Class code (optional)</span>
            <input className="input uppercase" value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="e.g. NU-M3" maxLength={24} data-testid="practice-cohort" />
          </label>
          <label className="block text-sm">
            <span className="label">Time</span>
            <select className="input" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} data-testid="practice-minutes">
              <option value={8}>8 minutes</option>
              <option value={12}>12 minutes</option>
              <option value={15}>15 minutes</option>
            </select>
          </label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec">{error}</p>}
        <button className="btn-primary mt-6 w-full py-3 text-base" onClick={start} data-testid="practice-start">Knock and go in</button>
        <p className="mt-3 text-center text-xs text-ink-3">The patient is fictional. Type your questions, or tap the mic and talk.</p>
      </div>
    );
  }

  const transcript = (
    <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite" data-testid="practice-transcript">
      <p className="mx-auto max-w-md rounded-lg bg-sunken px-3 py-2 text-center text-xs text-ink-3">{card.patient.affect}</p>
      {turns.map((t) => (
        <div key={t.id} id={`turn-${t.id}`} data-role={t.role} data-testid="practice-turn" className={t.role === "student" ? "flex justify-end" : "flex justify-start"}>
          {t.role === "exam" ? (
            <div className="w-full rounded-xl border border-info/30 bg-info-50 px-3 py-2 text-sm text-ink" data-testid="practice-finding">
              <span className="text-xs font-semibold uppercase tracking-wide text-info">Exam finding · {clock(t.t)}</span>
              <p className="mt-0.5">{t.text}</p>
            </div>
          ) : (
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${t.role === "student" ? "rounded-br-sm bg-brand text-white" : "rounded-bl-sm border border-line bg-surface text-ink"}`}>
              {t.role === "patient" && <span className="mb-0.5 block text-xs font-semibold text-ink-3">{who}</span>}
              {t.text}
            </div>
          )}
        </div>
      ))}
      {pending > 0 && phase === "encounter" && <p className="text-sm italic text-ink-3" data-testid="practice-thinking">{who} is answering…</p>}
      {interim && <p className="text-right text-sm italic text-ink-3" data-testid="practice-interim">{interim}</p>}
    </div>
  );

  if (phase === "encounter") {
    return (
      <div className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-none border-line bg-paper sm:h-[calc(100dvh-7rem)] sm:rounded-2xl sm:border" data-testid="practice-encounter">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-semibold"><span className="sm:hidden">{card.patient.name.split(" ")[0]}</span><span className="hidden sm:inline">{card.patient.name}</span>, {card.patient.age}</p>
            <p className="truncate text-xs text-ink-3">{card.title} · {card.door.setting}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-3 py-1 font-mono text-sm tabular-nums ${low ? "bg-rec-50 text-rec" : "bg-sunken text-ink"}`} role="timer" aria-label={`${clock(remaining)} left`} data-testid="practice-timer">{clock(remaining)}</span>
            <button className="btn-outline px-3 py-1.5 text-sm" onClick={end} data-testid="practice-end">End<span className="hidden sm:inline">&nbsp;encounter</span></button>
          </div>
        </div>
        {transcript}
        <div className="border-t border-line bg-surface px-3 pb-3 pt-2">
          <details className="mb-2" open>
            <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-ink-3">Examine</summary>
            <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {card.exam.map((e) => (
                <button key={e.key} className="shrink-0 whitespace-nowrap rounded-full border border-line-strong bg-paper px-3 py-1 text-sm text-ink hover:border-brand hover:text-brand" onClick={() => send({ exam: e.key })} data-testid={`practice-exam-${e.key}`}>
                  {e.label}
                </button>
              ))}
            </div>
          </details>
          {error && <p role="alert" className="mb-2 rounded-lg bg-rec-50 px-3 py-1.5 text-sm text-rec">{error}</p>}
          <form onSubmit={ask} className="flex items-center gap-2">
            <button type="button" onClick={toggleMic} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${listening ? "border-rec bg-rec text-white" : "border-line-strong bg-paper text-ink"}`} aria-pressed={listening} aria-label={listening ? "Stop talking" : "Talk to the patient"} data-testid="practice-mic">
              {listening ? <Stop size={18} /> : <Mic size={18} />}
            </button>
            <label className="sr-only" htmlFor="practice-q">Ask {who} a question</label>
            <input id="practice-q" className="input h-11 flex-1 text-base" value={input} onChange={(e) => setInput(e.target.value)} placeholder={listening ? "Listening. Just talk." : `Ask ${who} a question`} autoComplete="off" data-testid="practice-ask-input" />
            <button type="submit" className="btn-primary h-11 px-4" disabled={!input.trim()} aria-label="Ask" data-testid="practice-ask">
              <Send size={16} />
            </button>
          </form>
          <p className="mt-1.5 text-xs text-ink-3">{listening ? "Talk naturally. Each question goes to the patient when you pause." : "Tip: say or type “end encounter” when you're done."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="practice-note-step">
      <div className="card p-5">
        <h1 className="font-serif text-2xl">Write your note</h1>
        <p className="mt-1 text-sm text-ink-2">Chart only what you asked about or examined. You&apos;ll be graded on accuracy, your differential, and your plan, then see how Chartside would chart the same encounter.</p>
        <label className="sr-only" htmlFor="practice-note">Your note</label>
        <textarea id="practice-note" className="input mt-4 min-h-[320px] font-mono text-[14px] leading-relaxed" value={note} onChange={(e) => setNote(e.target.value)} data-testid="practice-note" disabled={phase === "grading"} />
        {error && <p role="alert" className="mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn-primary px-5" onClick={() => grade(true)} disabled={phase === "grading"} data-testid="practice-grade">{phase === "grading" ? "Grading…" : "Grade my encounter and note"}</button>
          <button className={`btn-outline ${noteMic === "listening" ? "border-rec text-rec" : ""}`} onClick={toggleNoteMic} disabled={phase === "grading"} data-testid="practice-note-dictate">
            <Mic size={14} /> {noteMic === "listening" ? "Stop dictating" : "Dictate"}
          </button>
          <button className="btn-ghost" onClick={() => grade(false)} disabled={phase === "grading"} data-testid="practice-skip">Skip the note</button>
        </div>
      </div>
      <details className="card mt-4 overflow-hidden">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Look back at the encounter ({turns.filter((t) => t.role === "student").length} questions)</summary>
        <div className="max-h-96 overflow-y-auto border-t border-line">{transcript}</div>
      </details>
    </div>
  );
}
