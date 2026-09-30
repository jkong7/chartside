"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "starting" | "recording" | "paused" | "finishing";

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export default function PatientRecorder({ token, autoStart, resumeFrom, priorSeconds, maxMinutes = 120, onFinished }: { token: string; autoStart: boolean; resumeFrom: number; priorSeconds: number; maxMinutes?: number; onFinished: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(priorSeconds);
  const [level, setLevel] = useState(0);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const seq = useRef(resumeFrom);
  const mime = useRef("audio/webm");
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const meter = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const started = useRef(0);
  const pausedFor = useRef(0);
  const pausedAt = useRef(0);
  const pending = useRef(0);
  const auto = useRef(false);


  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => setSecs(priorSeconds + Math.floor((Date.now() - started.current - pausedFor.current) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [phase, priorSeconds]);

  const releaseAll = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (meter.current) {
      cancelAnimationFrame(meter.current.raf);
      void meter.current.ctx.close().catch(() => {});
      meter.current = null;
    }
    void lock.current?.release().catch(() => {});
    lock.current = null;
    setLevel(0);
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (rec.current?.state === "recording" || rec.current?.state === "paused" || pending.current > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    const again = async () => {
      if (document.visibilityState === "visible" && rec.current && rec.current.state !== "inactive" && !lock.current) {
        const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
        lock.current = (await wl?.request("screen").catch(() => null)) ?? null;
      }
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);

  const upload = useCallback((blob: Blob, finish: boolean) => {
    queue.current = queue.current.then(async () => {
      const q = new URLSearchParams({ finish: String(finish), durationS: String(priorSeconds + Math.max(1, Math.round((Date.now() - started.current - pausedFor.current) / 1000))) });
      if (blob.size) q.set("seq", String(seq.current++));
      pending.current++;
      let serverErrors = 0;
      try {
        for (let attempt = 0; ; attempt++) {
          const r = await fetch(`/api/visit/${token}/audio?${q}`, { method: "POST", headers: { "content-type": mime.current.split(";")[0] }, body: blob.size ? blob : null }).catch(() => null);
          if (r?.ok) {
            setOffline(false);
            return;
          }
          if (r && finish && r.status === 409) {
            setOffline(false);
            return;
          }
          if (r && r.status < 500 && r.status !== 408 && r.status !== 429) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || "We couldn't save the recording");
          }
          if (r && r.status >= 500 && ++serverErrors > 12) throw new Error("We couldn't save the recording. Try again in a minute.");
          if (attempt >= 1) setOffline(true);
          await new Promise((res) => setTimeout(res, Math.min(10_000, 800 * 2 ** Math.min(attempt, 4))));
        }
      } finally {
        pending.current--;
      }
    });
    queue.current.catch((err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
      const r = rec.current;
      if (r && r.state !== "inactive") {
        r.ondataavailable = null;
        r.onstop = null;
        r.stop();
      }
      releaseAll();
      setPhase("idle");
    });
  }, [token, releaseAll, priorSeconds]);

  const begin = useCallback(async () => {
    setError(null);
    setPhase("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      mime.current = pickMime() || "audio/webm";
      const r = new MediaRecorder(s, { mimeType: mime.current, audioBitsPerSecond: 32000 });
      rec.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) upload(e.data, false);
      };
      queue.current = Promise.resolve();
      started.current = Date.now();
      pausedFor.current = 0;
      r.start(5000);
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        if (meter.current) meter.current.raf = requestAnimationFrame(tick);
      };
      meter.current = { ctx, raf: requestAnimationFrame(tick) };
      const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
      lock.current = (await wl?.request("screen").catch(() => null)) ?? null;
      setPhase("recording");
    } catch (err) {
      releaseAll();
      setPhase("idle");
      setError(err instanceof Error && /Permission|NotAllowed/i.test(err.name + err.message) ? "Allow the microphone so Chartside can hear the visit. Check your browser's settings, then tap Start recording." : "Couldn't start the microphone. Tap Start recording to try again.");
    }
  }, [upload, releaseAll]);

  useEffect(() => {
    if (autoStart && !auto.current) {
      auto.current = true;
      void begin();
    }
  }, [autoStart, begin]);

  const pause = () => {
    rec.current?.pause();
    pausedAt.current = Date.now();
    setPhase("paused");
  };

  const resume = () => {
    rec.current?.resume();
    pausedFor.current += Date.now() - pausedAt.current;
    setPhase("recording");
  };

  const finish = () => {
    const r = rec.current;
    setPhase("finishing");
    const done = () => {
      releaseAll();
      upload(new Blob([], { type: mime.current }), true);
      queue.current.then(onFinished).catch(() => undefined);
    };
    if (!r || r.state === "inactive") return done();
    r.onstop = done;
    if (r.state === "paused") r.resume();
    r.stop();
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (phase === "recording" && secs >= maxMinutes * 60) finishRef.current();
  }, [phase, secs, maxMinutes]);

  const live = phase === "recording" || phase === "paused";
  return (
    <div className="w-full text-center" data-testid="pv-recorder" data-phase={phase}>
      {phase === "idle" && (
        <div className="card p-6">
          <p className="font-serif text-2xl text-ink">{resumeFrom > 0 ? "Your recording stopped" : "Ready to record"}</p>
          <p className="mt-2 text-ink-2">{resumeFrom > 0 ? `We saved ${clock(priorSeconds)} of your visit before the page closed. We'll write your recap from that.` : "Your clinician agreed. Tap to start."}</p>
          <div className="mt-5 flex flex-col gap-2">
            {resumeFrom > 0 ? <button className="btn-primary py-3 text-base" onClick={finish} data-testid="pv-finish-saved">Write my recap</button> : <button className="btn-primary py-3 text-base" onClick={begin} data-testid="pv-start">Start recording</button>}
          </div>
        </div>
      )}
      {phase === "starting" && <p className="py-10 text-ink-2">Starting the microphone…</p>}
      {live && (
        <div data-testid="pv-live">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink-2">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "recording" ? "animate-pulse bg-rec" : "bg-ink-4"}`} />
            {phase === "recording" ? "Recording your visit" : "Paused. Nothing is being recorded."}
          </p>
          <p className="mt-3 font-mono text-6xl font-medium text-ink" data-testid="pv-timer">{clock(secs)}</p>
          <div className="mt-6 flex h-12 items-end justify-center gap-1.5" aria-hidden>
            {Array.from({ length: 11 }).map((_, i) => <span key={i} className="w-2 rounded-full bg-brand/70 transition-all" style={{ height: `${6 + level * 44 * (1 - Math.abs(5 - i) / 6)}px` }} />)}
          </div>
          <div className="mt-8 flex gap-3">
            {phase === "recording" ? <button onClick={pause} className="btn-outline flex-1 py-3 text-base" data-testid="pv-pause">Pause</button> : <button onClick={resume} className="btn-outline flex-1 py-3 text-base" data-testid="pv-resume">Resume</button>}
            <button onClick={finish} className="btn-danger flex-1 py-3 text-base" data-testid="pv-end">Visit is over</button>
          </div>
          {offline ? (
            <p className="mt-6 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn" role="status" data-testid="pv-offline">No connection. Keep going: the sound is held on your phone and uploads when you&apos;re back online.</p>
          ) : (
            <p className="mt-6 text-sm text-ink-3">Put your phone face up on the table and keep this page open. The sound is saved as you go and locked with encryption.</p>
          )}
        </div>
      )}
      {phase === "finishing" && (
        <div className="py-8" data-testid="pv-finishing">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand" aria-hidden />
          <p className="mt-4 text-lg text-ink">{offline ? "Waiting for a connection to finish saving…" : "Saving your recording…"}</p>
        </div>
      )}
      {error && <p role="alert" className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" data-testid="pv-error">{error}</p>}
    </div>
  );
}
