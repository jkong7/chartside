"use client";

import { useCallback, useMemo, useEffect, useRef, useState } from "react";
import { AudioCapture, type CaptureStatus } from "@/lib/audio/capture";
import type { QueueState } from "@/lib/audio/queue";
import { api, fmtClock } from "@/lib/client";
import { DEMO_PATIENTS, INPATIENT_DEMO } from "@/lib/demo/scripts";
import type { Coverage, Speaker, Utterance, VoiceFeatures } from "@/lib/types";
import { Alert, Check, Keyboard, Mic, Pause, Play, Sparkle, Stop } from "../icons";
import { Spinner } from "../ui";
import Transcript from "./Transcript";
import type { Bundle } from "./types";

type Mode = "mic" | "simulate" | "type";
type LiveState = "connecting" | "open" | "closed" | "error" | "off" | "browser" | "unavailable";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const LANG_TAG: Record<string, string> = { en: "en-US", es: "es-US", zh: "zh-CN", vi: "vi-VN" };

interface Snapshot {
  chiefComplaint: string | null;
  problems: { label: string; icd10: string; status: string | null }[];
  meds: string[];
  orders: string[];
  allergies: string[];
}

interface Incoming {
  text: string;
  speaker?: Speaker | "auto";
  tStart?: number;
  tEnd?: number;
  lang?: string;
  voice?: VoiceFeatures | null;
  confidence?: number;
}

export default function Capture({ b, initialMode, onFinished }: { b: Bundle; initialMode: Mode; onFinished: () => void }) {
  const enc = b.encounter;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [utts, setUtts] = useState<Utterance[]>(b.utterances);
  const [status, setStatus] = useState(enc.status);
  const [elapsed, setElapsed] = useState(enc.durationS || (b.utterances.at(-1)?.tEnd ?? 0));
  const [interim, setInterim] = useState("");
  const [speakerMode, setSpeakerMode] = useState<Speaker | "auto">("auto");
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [silentFor, setSilentFor] = useState(0);
  const [simIndex, setSimIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [typed, setTyped] = useState("");
  const [typedSpeaker, setTypedSpeaker] = useState<Speaker>("clinician");
  const [paste, setPaste] = useState("");
  const [cap, setCap] = useState<CaptureStatus | null>(null);
  const [capDetail, setCapDetail] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueState>({ uploaded: b.audio.chunks, pending: 0, online: true, lastError: null });
  const [live, setLive] = useState<LiveState>("off");
  const captureRef = useRef<AudioCapture | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const elapsedRef = useRef(elapsed);
  const speakerModeRef = useRef(speakerMode);
  const covTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quiet = useRef(0);
  const recording = status === "recording";
  const demo = useMemo(() => {
    const outpatient = DEMO_PATIENTS.find((d) => d.mrn === b.patient?.mrn);
    if (outpatient) return outpatient;
    if (b.patient?.mrn !== INPATIENT_DEMO.mrn) return undefined;
    const v = b.encounter.visitType;
    return { script: v === "inpatient" ? INPATIENT_DEMO.scripts.hp : v === "discharge" ? INPATIENT_DEMO.scripts.discharge : (b.admission?.day ?? 3) <= 2 ? INPATIENT_DEMO.scripts.day2 : INPATIENT_DEMO.scripts.day3 };
  }, [b.patient?.mrn, b.encounter.visitType, b.admission?.day]);

  elapsedRef.current = elapsed;
  speakerModeRef.current = speakerMode;

  useEffect(() => {
    setStatus(enc.status);
  }, [enc.status]);

  const refreshCoverage = useCallback(() => {
    if (covTimer.current) clearTimeout(covTimer.current);
    covTimer.current = setTimeout(async () => {
      const r = await api<{ coverage: Coverage; snapshot: Snapshot }>(`/encounters/${enc.id}/coverage`);
      setCoverage(r.coverage);
      setSnap(r.snapshot);
    }, 250);
  }, [enc.id]);

  useEffect(() => {
    refreshCoverage();
  }, [refreshCoverage]);

  useEffect(() => {
    if (!recording || mode === "mic") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording, mode]);

  useEffect(() => {
    if (mode !== "mic" || !recording) return;
    const t = setInterval(() => {
      const c = captureRef.current;
      if (c) setElapsed(c.clock());
    }, 250);
    return () => clearInterval(t);
  }, [mode, recording]);

  const post = useCallback(
    async (items: Incoming[]) => {
      try {
        const r = await api<{ utterances: Utterance[] }>(`/encounters/${enc.id}/utterances`, { body: { utterances: items } });
        setUtts((u) => [...u, ...r.utterances]);
        refreshCoverage();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save transcript");
      }
    },
    [enc.id, refreshCoverage],
  );

  const stopCaptions = useCallback(() => {
    const r = recRef.current;
    recRef.current = null;
    r?.stop();
    setInterim("");
  }, []);

  const startBrowserCaptions = useCallback(() => {
    const Ctor = speechCtor();
    if (!Ctor) {
      setLive("unavailable");
      return;
    }
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = LANG_TAG[enc.inputLang] ?? "en-US";
    let segStart = captureRef.current?.clock() ?? elapsedRef.current;
    let failed = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript.trim();
        if (r.isFinal && t) {
          const now = captureRef.current?.clock() ?? elapsedRef.current;
          post([{ text: t.charAt(0).toUpperCase() + t.slice(1) + (/[.?!]$/.test(t) ? "" : "."), speaker: speakerModeRef.current, tStart: segStart, tEnd: now, voice: captureRef.current?.voiceFor(segStart, now) ?? null }]);
          segStart = now;
        } else text += t + " ";
      }
      setInterim(text.trim());
    };
    rec.onerror = (e) => {
      if (["not-allowed", "service-not-allowed", "network", "audio-capture", "language-not-supported"].includes(e.error)) {
        failed = true;
        setLive("unavailable");
      }
    };
    rec.onend = () => {
      if (recRef.current === rec && !failed) {
        try {
          rec.start();
        } catch {
          recRef.current = null;
        }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setLive("browser");
    } catch {
      setLive("unavailable");
    }
  }, [enc.inputLang, post]);

  const setCapture = useCallback(
    async (action: "pause" | "resume") => {
      const r = await api<{ encounter: { status: typeof status } }>(`/encounters/${enc.id}`, { method: "PATCH", body: { action } });
      setStatus(r.encounter.status);
      if (action === "pause") {
        captureRef.current?.pause();
        stopCaptions();
      } else {
        captureRef.current?.resume();
        if (mode === "mic" && live !== "open" && live !== "connecting") startBrowserCaptions();
      }
    },
    [enc.id, live, mode, startBrowserCaptions, stopCaptions],
  );

  const setCaptureRef = useRef(setCapture);
  setCaptureRef.current = setCapture;
  const finishRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (mode !== "mic" || status !== "recording" || captureRef.current) return;
    let cancelled = false;
    (async () => {
      let liveCfg: { url: string; token: string } | null = null;
      if (b.speech.live && b.speech.wsUrl) {
        try {
          const t = await api<{ token: string }>("/speech/token", { method: "POST" });
          liveCfg = { url: b.speech.wsUrl, token: t.token };
        } catch {
          liveCfg = null;
        }
      }
      if (cancelled) return;
      const c = new AudioCapture(
        { encounterId: enc.id, offset: elapsedRef.current, live: liveCfg, patientName: b.patient?.name },
        {
          onStatus: (s, detail) => {
            setCap(s);
            setCapDetail(detail ?? null);
            if (s === "error") setError(detail ?? "Recording failed");
          },
          onLevel: (lv) => {
            setLevel(lv);
            quiet.current = lv < 0.03 ? quiet.current + 1 : 0;
            setSilentFor(Math.floor((quiet.current * 60) / 1000));
          },
          onQueue: setQueue,
          onLive: (s) => setLive(s),
          onInterim: setInterim,
          onSegment: (s) => post([{ text: s.text, speaker: speakerModeRef.current === "auto" ? s.speaker : speakerModeRef.current, tStart: s.start, tEnd: s.end, lang: s.lang, confidence: s.confidence, voice: s.voice }]),
          onMediaAction: (a) => (a === "pause" ? setCaptureRef.current("pause") : a === "play" ? setCaptureRef.current("resume") : finishRef.current()),
        },
      );
      captureRef.current = c;
      const ok = await c.start();
      if (!ok) {
        captureRef.current = null;
        setMode("type");
        return;
      }
      if (!liveCfg) startBrowserCaptions();
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, status, b.speech, b.patient, enc.id, post, startBrowserCaptions]);

  useEffect(() => {
    return () => {
      stopCaptions();
      captureRef.current?.dispose();
      captureRef.current = null;
    };
  }, [stopCaptions]);

  useEffect(() => {
    if (mode !== "simulate" || !recording || !demo) return;
    if (simIndex >= demo.script.length) return;
    const line = demo.script[simIndex];
    const words = line.t.split(/\s+/).length;
    const delay = Math.max(250, (400 + words * 90) / speed);
    const t = setTimeout(() => {
      const dur = Math.max(2, words * 0.42);
      const start = elapsedRef.current;
      setElapsed((e) => e + dur);
      post([{ text: line.t, speaker: line.s, tStart: start, tEnd: start + dur, lang: line.lang }]);
      setSimIndex((i) => i + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [mode, recording, simIndex, demo, speed, post]);

  async function finish() {
    stopCaptions();
    setFinishing(true);
    setError(null);
    try {
      const c = captureRef.current;
      if (c) {
        const drained = await c.stop();
        captureRef.current = null;
        if (!drained) throw new Error("Some audio is still uploading. Check your connection and try again.");
      }
      await api(`/encounters/${enc.id}/finish`, { body: { durationS: elapsedRef.current } });
      onFinished();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the note");
      setFinishing(false);
      setStatus("paused");
    }
  }
  finishRef.current = finish;

  async function addTyped(e: React.FormEvent) {
    e.preventDefault();
    if (!typed.trim()) return;
    const start = elapsedRef.current;
    await post([{ text: typed.trim(), speaker: typedSpeaker, tStart: start, tEnd: start + 3 }]);
    setElapsed((x) => x + 3);
    setTyped("");
    setTypedSpeaker((s) => (s === "clinician" ? "patient" : "clinician"));
  }

  async function addPaste() {
    const lines = paste.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    let t = elapsedRef.current;
    const items = lines.map((l) => {
      const m = /^(dr|doctor|clinician|provider|md|np|pa|patient|pt|parent|mom|dad|interpreter)\s*[:\-]\s*(.+)$/i.exec(l);
      const speaker: Speaker | "auto" = m ? (/^(patient|pt|parent|mom|dad)$/i.test(m[1]) ? "patient" : /^interpreter$/i.test(m[1]) ? "other" : "clinician") : "auto";
      const text = m ? m[2] : l;
      const dur = Math.max(2, text.split(/\s+/).length * 0.42);
      const item = { text, speaker, tStart: t, tEnd: t + dur };
      t += dur;
      return item;
    });
    await post(items);
    setElapsed(t);
    setPaste("");
  }

  async function changeSpeaker(id: string, speaker: Speaker) {
    const r = await api<{ utterance: Utterance }>(`/encounters/${enc.id}/utterances/${id}`, { method: "PATCH", body: { speaker } });
    setUtts((u) => u.map((x) => (x.id === id ? r.utterance : x)));
    refreshCoverage();
  }

  async function redact(id: string, redacted: boolean) {
    const r = await api<{ utterance: Utterance }>(`/encounters/${enc.id}/utterances/${id}`, { method: "PATCH", body: { redacted } });
    setUtts((u) => u.map((x) => (x.id === id ? r.utterance : x)));
    refreshCoverage();
  }

  const groups = coverage ? (["hpi", "safety", "history", "closing"] as const).map((g) => ({ g, items: coverage.items.filter((i) => i.group === g) })).filter((x) => x.items.length) : [];
  const missing = coverage?.items.filter((i) => !i.met && i.hint) ?? [];
  const simDone = mode === "simulate" && demo && simIndex >= demo.script.length;
  const canFinish = utts.length > 0 || queue.uploaded > 0 || queue.pending > 0;

  if (finishing) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-center" data-testid="drafting">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand">
          <Sparkle size={28} />
          <span className="pulse-ring absolute inset-0 rounded-full border-2 border-brand" />
        </div>
        <div>
          <p className="font-serif text-2xl">Drafting your note</p>
          <p className="mt-1 text-sm text-ink-3">{mode === "mic" && b.speech.finalPass ? "Re-transcribing the full recording with speaker separation, then " : ""}linking every sentence to the conversation, checking for omissions, coding, and staging orders…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-73px)] grid-cols-1 lg:h-[calc(100vh-73px)] lg:grid-cols-[1fr_340px]">
      <div className="flex h-[75vh] flex-col border-line lg:h-auto lg:min-h-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              {recording && cap !== "interrupted" && <span className="pulse-ring absolute inset-0 rounded-full bg-rec" />}
              <span className={`relative h-3 w-3 rounded-full ${recording && cap !== "interrupted" ? "bg-rec" : "bg-warn"}`} />
            </span>
            <span className="font-mono text-lg tabular-nums" data-testid="timer">{fmtClock(elapsed)}</span>
            <span className="text-sm text-ink-3">{!recording ? "Paused" : cap === "interrupted" ? "Interrupted" : mode === "simulate" ? "Playing demo conversation" : mode === "type" ? "Typing" : "Listening"}</span>
          </div>
          {mode === "mic" && recording && (
            <div className="flex h-5 items-end gap-0.5" aria-label="Microphone level" data-testid="mic-level">
              {Array.from({ length: 10 }).map((_, i) => (
                <span key={i} className={`w-1 rounded-sm ${level * 10 > i ? "bg-brand" : "bg-line"}`} style={{ height: `${30 + i * 7}%` }} />
              ))}
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {mode === "mic" && (
              <select className="input w-auto py-1.5" value={speakerMode} onChange={(e) => setSpeakerMode(e.target.value as Speaker | "auto")} aria-label="Who is speaking">
                <option value="auto">Speaker: auto-detect</option>
                <option value="clinician">Speaker: clinician</option>
                <option value="patient">Speaker: patient</option>
              </select>
            )}
            {mode === "simulate" && (
              <select className="input w-auto py-1.5" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Playback speed">
                <option value={1}>1×</option>
                <option value={3}>3×</option>
                <option value={10}>10×</option>
              </select>
            )}
            {recording ? (
              <button className="btn-outline" onClick={() => setCapture("pause")}><Pause /> Pause</button>
            ) : (
              <button className="btn-outline" onClick={() => setCapture("resume")} data-testid="resume"><Play /> Resume</button>
            )}
            <button className="btn-primary" onClick={finish} disabled={!canFinish} data-testid="finish">
              <Stop /> End visit &amp; draft note
            </button>
          </div>
        </div>
        {mode === "mic" && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-paper px-5 py-2 text-xs text-ink-3" data-testid="recording-health">
            <span className="flex items-center gap-1.5"><Mic size={12} /> {cap === "recording" ? "Recording audio" : cap === "paused" ? "Audio paused" : cap === "interrupted" ? "Audio interrupted" : cap === "starting" ? "Starting microphone…" : cap === "stopped" ? "Audio saved" : "Microphone"}</span>
            <span data-testid="chunks-saved">{queue.uploaded} chunk{queue.uploaded === 1 ? "" : "s"} saved{queue.pending ? ` · ${queue.pending} waiting to upload` : ""}</span>
            {!queue.online && <span className="font-medium text-warn">Offline: audio is buffered on this device</span>}
            {queue.lastError && queue.online && <span className="text-warn">Retrying upload…</span>}
            <span className="ml-auto" data-testid="live-status">
              {live === "open" ? "Live captions: Deepgram (speaker-separated)" : live === "connecting" ? "Connecting live captions…" : live === "browser" ? "Live captions: browser speech" : live === "error" || live === "closed" ? "Live captions dropped; audio still recording" : live === "unavailable" ? "Live captions unavailable" : ""}
            </span>
          </div>
        )}
        {mode === "mic" && recording && live === "unavailable" && (
          <p className="border-b border-info/30 bg-info-50 px-5 py-2 text-sm text-info" role="status" data-testid="captions-unavailable">
            {b.speech.finalPass ? "Live captions aren't available in this browser. Audio is being recorded and will be transcribed with speaker separation when you end the visit." : "Live captions aren't available in this browser and no server transcription is configured. Audio is still recorded for playback; type key points below or add DEEPGRAM_API_KEY."}
          </p>
        )}
        {mode === "mic" && cap === "interrupted" && (
          <p className="flex items-center gap-2 border-b border-warn/30 bg-warn-50 px-5 py-2 text-sm text-warn" role="alert" data-testid="interrupted"><Alert size={15} /> {capDetail ?? "Recording was interrupted."} Chartside will continue automatically when the microphone returns.</p>
        )}
        {mode === "mic" && recording && cap === "recording" && silentFor >= 10 && (
          <p className="flex items-center gap-2 border-b border-warn/30 bg-warn-50 px-5 py-2 text-sm text-warn" role="alert"><Alert size={15} /> No audio for {silentFor}s. Check that your microphone isn&apos;t muted.</p>
        )}
        {error && <p className="border-b border-rec/30 bg-rec-50 px-5 py-2 text-sm text-rec" role="alert">{error}</p>}
        <div className="min-h-0 flex-1">
          <Transcript utterances={utts} editable interim={interim} onSpeaker={changeSpeaker} onRedact={redact} follow />
        </div>
        {simDone && <p className="border-t border-line bg-brand-50 px-5 py-2 text-sm text-brand" data-testid="sim-done">Demo conversation finished. End the visit to draft the note.</p>}
        {(mode === "type" || (mode === "mic" && live === "unavailable" && !b.speech.finalPass)) && (
          <div className="space-y-2 border-t border-line bg-surface p-3">
            <form onSubmit={addTyped} className="flex gap-2">
              <select className="input w-36" value={typedSpeaker} onChange={(e) => setTypedSpeaker(e.target.value as Speaker)} aria-label="Speaker">
                <option value="clinician">Clinician</option>
                <option value="patient">Patient</option>
                <option value="other">Other</option>
              </select>
              <input className="input" placeholder="Type what was said and press Enter" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Utterance" data-testid="type-input" />
              <button className="btn-outline" type="submit"><Keyboard /> Add</button>
            </form>
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-3">Paste a whole transcript</summary>
              <textarea className="input mt-2 h-28 font-mono text-xs" placeholder={"Dr: What brings you in?\nPatient: I've had a cough for a week.\nInterpreter: Tengo tos desde hace una semana."} value={paste} onChange={(e) => setPaste(e.target.value)} data-testid="paste-input" />
              <button className="btn-outline mt-2" onClick={addPaste} type="button" data-testid="paste-add">Add transcript</button>
            </details>
          </div>
        )}
      </div>

      <aside className="min-h-0 overflow-y-auto border-t border-line bg-paper p-4 lg:border-t-0" data-testid="coverage">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Live coverage</h3>
          <span className="font-serif text-xl text-brand" data-testid="coverage-score">{coverage?.score ?? 0}%</span>
        </div>
        <p className="mt-1 text-xs text-ink-3">{coverage?.chiefComplaint ? `Chief complaint: ${coverage.chiefComplaint}` : "Listening for the chief complaint…"}</p>
        {missing.length > 0 && recording && (
          <div className="mt-3 rounded-lg border border-brand/20 bg-brand-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-brand">Before they leave</p>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-2">{missing.slice(0, 3).map((m) => <li key={m.key}>• {m.hint}</li>)}</ul>
          </div>
        )}
        <div className="mt-4 space-y-4">
          {groups.map(({ g, items }) => (
            <div key={g}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-4">{{ hpi: "History of present illness", safety: "Red flags", history: "History", closing: "Closing" }[g]}</p>
              <ul className="space-y-1">
                {items.map((i) => (
                  <li key={i.key} className="flex items-center gap-2 text-sm" data-met={i.met}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i.met ? "bg-ok text-white" : "border border-line-strong"}`}>{i.met && <Check size={11} />}</span>
                    <span className={i.met ? "text-ink" : "text-ink-3"}>{i.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {snap && (snap.problems.length > 0 || snap.meds.length > 0 || snap.orders.length > 0) && (
          <div className="mt-6 space-y-2 border-t border-line pt-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-4">Heard so far</p>
            {snap.problems.map((p) => <p key={p.icd10}><span className="font-mono text-xs text-ink-3">{p.icd10}</span> {p.label}</p>)}
            {snap.meds.map((m) => <p key={m} className="text-ink-2"><span className="pill mr-1.5 bg-sunken text-[10px]">Rx</span>{m}</p>)}
            {snap.orders.map((o) => <p key={o} className="text-ink-2"><span className="pill mr-1.5 bg-sunken text-[10px]">Order</span>{o}</p>)}
            {snap.allergies.length > 0 && <p className="text-rec">Allergy: {snap.allergies.join(", ")}</p>}
          </div>
        )}
        {!recording && (
          <p className="mt-6 flex items-center gap-1.5 text-xs text-ink-3"><Mic size={12} /> Capture paused. Nothing is recorded or transcribed.</p>
        )}
        {utts.length === 0 && mode !== "type" && <div className="mt-6 flex items-center gap-2 text-xs text-ink-3"><Spinner /> Waiting for conversation…</div>}
      </aside>
    </div>
  );
}
