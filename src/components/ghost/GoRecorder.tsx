"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Phase = "idle" | "consent" | "starting" | "recording" | "paused" | "finishing" | "ready" | "failed";

interface Pip {
  document: Document;
  close(): void;
  addEventListener(t: "pagehide", fn: () => void): void;
}

declare global {
  interface Window {
    documentPictureInPicture?: { requestWindow(o: { width: number; height: number }): Promise<Pip> };
  }
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function pickMime() {
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export default function GoRecorder({ signedIn, guest, waiting, maxMinutes = 120 }: { signedIn: boolean; guest: boolean; waiting: number; maxMinutes?: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [encId, setEncId] = useState<string | null>(null);
  const [pip, setPip] = useState<Pip | null>(null);
  const pipRef = useRef<Pip | null>(null);
  const [isGuest, setIsGuest] = useState(guest);
  const [notice, setNotice] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const pending = useRef(0);
  const cid = useRef("");
  const seqNo = useRef(0);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enc = useRef<string | null>(null);
  const mime = useRef("audio/webm");
  const lock = useRef<{ release(): Promise<void> } | null>(null);
  const meter = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const started = useRef(0);
  const pausedFor = useRef(0);
  const pausedAt = useRef(0);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = window.setInterval(() => setSecs(Math.floor((Date.now() - started.current - pausedFor.current) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [phase]);

  const upload = useCallback((blob: Blob, finish: boolean) => {
    queue.current = queue.current.then(async () => {
      const q = new URLSearchParams({ consent: "granted", finish: String(finish), channel: "go", cid: cid.current, durationS: String(Math.max(1, Math.round((Date.now() - started.current - pausedFor.current) / 1000))) });
      if (blob.size) q.set("seq", String(seqNo.current++));
      const url = enc.current ? `/api/capture/${enc.current}?${q}` : `/api/capture?${q}`;
      pending.current++;
      let serverErrors = 0;
      try {
        for (let attempt = 0; ; attempt++) {
          const target = enc.current ? `/api/capture/${enc.current}?${q}` : url;
          const r = await fetch(target, { method: "POST", headers: { "content-type": mime.current.split(";")[0] }, body: blob.size ? blob : null }).catch(() => null);
          if (r?.ok) {
            const j = await r.json();
            if (!enc.current) {
              enc.current = j.encounterId;
              setEncId(j.encounterId);
            }
            setOffline(false);
            return;
          }
          if (r && finish && r.status === 409) {
            setOffline(false);
            return;
          }
          if (r && r.status < 500 && r.status !== 408 && r.status !== 429) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || `Upload failed (${r.status})`);
          }
          if (r && r.status >= 500 && ++serverErrors > 12) throw new Error("Chartside couldn't save the recording. Try again in a minute.");
          if (attempt >= 1) setOffline(true);
          await new Promise((res) => setTimeout(res, Math.min(10_000, 800 * 2 ** Math.min(attempt, 4))));
        }
      } finally {
        pending.current--;
      }
    });
    queue.current.catch((err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
      setPhase("failed");
      const r = rec.current;
      if (r && r.state !== "inactive") {
        r.ondataavailable = null;
        r.onstop = null;
        r.stop();
      }
      releaseAllRef.current();
    });
  }, []);

  const releaseAllRef = useRef<() => void>(() => {});
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

  releaseAllRef.current = () => {
    releaseAll();
    pipRef.current?.close();
  };
  useEffect(() => () => releaseAll(), [releaseAll]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (rec.current?.state === "recording" || rec.current?.state === "paused" || pending.current > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const begin = async () => {
    setError(null);
    setPhase("starting");
    try {
      if (!signedIn) {
        const r = await fetch("/api/auth/try", { method: "POST" });
        if (!r.ok) throw new Error("Couldn't start a free visit");
        setIsGuest(!!(await r.json()).guest);
      }
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      mime.current = pickMime() || "audio/webm";
      const r = new MediaRecorder(s, { mimeType: mime.current, audioBitsPerSecond: 32000 });
      rec.current = r;
      r.ondataavailable = (e) => {
        if (e.data.size) upload(e.data, false);
      };
      enc.current = null;
      setEncId(null);
      queue.current = Promise.resolve();
      cid.current = crypto.randomUUID();
      seqNo.current = 0;
      started.current = Date.now();
      pausedFor.current = 0;
      setSecs(0);
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
      setError(err instanceof Error && /Permission|NotAllowed/i.test(err.name + err.message) ? "Allow the microphone to record the visit." : err instanceof Error ? err.message : "Couldn't start recording");
    }
  };

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
    if (!r) return;
    setPhase("finishing");
    r.onstop = () => {
      releaseAll();
      upload(new Blob([], { type: mime.current }), true);
      queue.current
        .then(async () => {
          const id = enc.current;
          if (!id) throw new Error("Nothing was recorded");
          for (let i = 0; i < 120; i++) {
            const s = await (await fetch(`/api/capture/${id}`)).json();
            if (s.status === "ready" || s.status === "signed") return setPhase("ready");
            if (s.status === "failed") throw new Error(s.error || "Drafting failed");
            await new Promise((res) => setTimeout(res, 1500));
          }
          throw new Error("This is taking a while. We'll keep working on it; check your stack in a minute.");
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Drafting failed");
          setPhase("failed");
        });
    };
    if (r.state === "paused") r.resume();
    r.stop();
    pip?.close();
  };

  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (phase === "recording" && secs >= maxMinutes * 60) {
      setNotice(`Recording stopped at the ${maxMinutes}-minute limit.`);
      finishRef.current();
    }
  }, [phase, secs, maxMinutes]);

  const popOut = async () => {
    if (!window.documentPictureInPicture) return;
    const w = await window.documentPictureInPicture.requestWindow({ width: 300, height: 150 });
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const style = w.document.createElement("style");
        style.textContent = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join("\n");
        w.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = w.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          w.document.head.appendChild(link);
        }
      }
    }
    w.document.body.className = "bg-[#0b0f16] text-white font-sans m-0";
    w.addEventListener("pagehide", () => {
      pipRef.current = null;
      setPip(null);
    });
    pipRef.current = w;
    setPip(w);
  };

  const live = phase === "recording" || phase === "paused";
  const mini = (
    <div className="flex h-full flex-col justify-between p-3" data-testid="go-pip">
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2.5 w-2.5 rounded-full ${phase === "recording" ? "animate-pulse bg-[#ff5a4f]" : "bg-white/40"}`} />
        <span>{phase === "recording" ? "Recording" : phase === "paused" ? "Paused" : "Chartside"}</span>
        <span className="ml-auto font-mono">{clock(secs)}</span>
      </div>
      <div className="flex gap-2">
        {phase === "recording" ? (
          <button onClick={pause} className="flex-1 rounded-lg bg-white/15 py-2 text-sm">Pause</button>
        ) : (
          <button onClick={resume} className="flex-1 rounded-lg bg-white/15 py-2 text-sm">Resume</button>
        )}
        <button onClick={finish} className="flex-1 rounded-lg bg-[#ff3b30] py-2 text-sm font-medium">End visit</button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 text-center" data-testid="go" data-phase={phase}>
      {phase === "idle" && (
        <>
          <button onClick={() => setPhase("consent")} className="group relative flex h-44 w-44 items-center justify-center rounded-full bg-rec text-white shadow-xl transition hover:scale-[1.03] active:scale-95" aria-label="Start a visit" data-testid="go-start">
            <span className="absolute inset-0 rounded-full bg-rec/40 pulse-ring" aria-hidden />
            <span className="relative text-xl font-semibold">Start visit</span>
          </button>
          <p className="mt-6 text-ink-2">One tap. Chartside listens and writes the note.</p>
          {!signedIn && <p className="mt-1 text-sm text-ink-3">No account needed for your first note.</p>}
          {waiting > 0 && (
            <Link href="/go/stack" className="mt-6 rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand" data-testid="go-stack-link">
              {waiting} waiting on your stack →
            </Link>
          )}
        </>
      )}

      {phase === "consent" && (
        <div className="card w-full p-6 text-left" role="dialog" aria-labelledby="go-consent-title" data-testid="go-consent">
          <h2 id="go-consent-title" className="font-serif text-2xl font-semibold text-ink">Did your patient agree?</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">You might say: “I use an AI assistant that listens and drafts my note so I can focus on you. I review everything, and the recording is deleted after. Is that okay?”</p>
          <div className="mt-5 flex flex-col gap-2">
            <button onClick={begin} className="btn-primary py-3 text-base" data-testid="go-consent-yes">They agreed, start recording</button>
            <button onClick={() => setPhase("idle")} className="btn-ghost" data-testid="go-consent-no">They declined</button>
          </div>
        </div>
      )}

      {phase === "starting" && <p className="text-ink-2">Starting…</p>}

      {live && (
        <div className="w-full" data-testid="go-live">
          <p className="flex items-center justify-center gap-2 text-sm font-medium text-ink-2">
            <span className={`h-2.5 w-2.5 rounded-full ${phase === "recording" ? "animate-pulse bg-rec" : "bg-ink-4"}`} />
            {phase === "recording" ? "Recording the visit" : "Paused, nothing is being recorded"}
          </p>
          <p className="mt-3 font-mono text-6xl font-medium text-ink" data-testid="go-timer">{clock(secs)}</p>
          <div className="mt-6 flex h-12 items-end justify-center gap-1.5" aria-hidden>
            {Array.from({ length: 11 }).map((_, i) => (
              <span key={i} className="w-2 rounded-full bg-brand/70 transition-all" style={{ height: `${6 + level * 44 * (1 - Math.abs(5 - i) / 6)}px` }} />
            ))}
          </div>
          <div className="mt-8 flex gap-3">
            {phase === "recording" ? (
              <button onClick={pause} className="btn-outline flex-1 py-3" data-testid="go-pause">Pause</button>
            ) : (
              <button onClick={resume} className="btn-outline flex-1 py-3" data-testid="go-resume">Resume</button>
            )}
            <button onClick={finish} className="btn-danger flex-1 py-3" data-testid="go-end">End visit</button>
          </div>
          {typeof window !== "undefined" && window.documentPictureInPicture && !pip && (
            <button onClick={popOut} className="mt-4 text-sm text-ink-3 underline" data-testid="go-popout">
              Pop out a floating recorder over your EHR
            </button>
          )}
          {offline ? (
            <p className="mt-6 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn" role="status" data-testid="go-offline">
              No connection. Keep recording: the audio is held on this device and uploads when you're back online.
            </p>
          ) : (
            <p className="mt-6 text-xs text-ink-3">Keep this screen on. Audio uploads as you go and is encrypted at rest.</p>
          )}
        </div>
      )}

      {phase === "finishing" && (
        <div data-testid="go-finishing">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand" aria-hidden />
          <p className="mt-4 text-lg text-ink">{offline ? "Waiting for a connection to finish uploading…" : "Writing your note…"}</p>
          <p className="text-sm text-ink-3">Usually under a minute.</p>
        </div>
      )}

      {phase === "ready" && encId && (
        <div className="card w-full p-6" data-testid="go-ready">
          <p className="text-sm font-medium uppercase tracking-wide text-ok">Note ready</p>
          <h2 className="mt-1 font-serif text-2xl font-semibold text-ink">Your {clock(secs)} visit is written.</h2>
          <div className="mt-5 flex flex-col gap-2">
            <Link href={`/go/stack?focus=${encodeURIComponent(encId)}`} className="btn-primary py-3 text-base" data-testid="go-review">
              {isGuest ? "Read it and save it" : "Review and sign"}
            </Link>
            <button onClick={() => { setPhase("idle"); setEncId(null); setSecs(0); }} className="btn-ghost">Next patient</button>
          </div>
        </div>
      )}

      {notice && (phase === "finishing" || phase === "ready") && (
        <p className="mt-4 text-sm text-ink-3" role="status" data-testid="go-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" data-testid="go-error">
          {error}
        </p>
      )}
      {phase === "failed" && (
        <button onClick={() => { setPhase("idle"); setError(null); }} className="btn-outline mt-3">Start over</button>
      )}

      {pip && live && createPortal(mini, pip.document.body)}
    </div>
  );
}
