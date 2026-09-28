import type { Speaker, VoiceFeatures } from "../types";
import { DeepgramLive, type LiveSegment } from "./deepgram";
import { VoiceMeter } from "./features";
import { UploadQueue, type QueueState } from "./queue";

export type CaptureStatus = "starting" | "recording" | "paused" | "interrupted" | "stopped" | "error";

export interface CaptureHandlers {
  onStatus: (s: CaptureStatus, detail?: string) => void;
  onLevel: (level: number) => void;
  onQueue: (q: QueueState) => void;
  onLive: (s: "connecting" | "open" | "closed" | "error" | "off") => void;
  onInterim: (text: string) => void;
  onSegment: (seg: { text: string; start: number; end: number; speaker: Speaker | "auto"; lang?: string; confidence?: number; voice: VoiceFeatures | null }) => void;
  onMediaAction?: (a: "pause" | "play" | "stop") => void;
}

export interface CaptureOptions {
  encounterId: string;
  offset: number;
  live: { url: string; token: string } | null;
  patientName?: string;
  telehealth?: boolean;
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

export class AudioCapture {
  private stream: MediaStream | null = null;
  private tab: MediaStream | null = null;
  private record: MediaStream | null = null;
  dualChannel = false;
  private recorder: MediaRecorder | null = null;
  private liveRecorder: MediaRecorder | null = null;
  private ctx: AudioContext | null = null;
  private meter: VoiceMeter | null = null;
  private queue: UploadQueue;
  private live: DeepgramLive | null = null;
  private seq = 0;
  private startedAt = 0;
  private pausedTotal = 0;
  private pausedAt = 0;
  private status: CaptureStatus = "starting";
  mime = "";

  constructor(private opts: CaptureOptions, private h: CaptureHandlers) {
    this.queue = new UploadQueue(opts.encounterId, h.onQueue, async (c) => {
      const res = await fetch(`/api/encounters/${opts.encounterId}/audio?seq=${c.seq}&t=${c.tMs}`, { method: "POST", headers: { "content-type": c.mime }, body: c.blob });
      if (!res.ok && res.status !== 409) throw new Error(`Upload failed (${res.status})`);
    });
  }

  clock = () => {
    if (!this.startedAt) return this.opts.offset;
    const now = this.status === "paused" ? this.pausedAt : performance.now();
    return this.opts.offset + (now - this.startedAt - this.pausedTotal) / 1000;
  };

  private set(s: CaptureStatus, detail?: string) {
    this.status = s;
    this.h.onStatus(s, detail);
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      navigator.mediaSession.playbackState = s === "recording" ? "playing" : s === "paused" || s === "interrupted" ? "paused" : "none";
    }
  }

  async start() {
    await this.queue.restore();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch {
      this.set("error", "Microphone permission was denied.");
      return false;
    }
    if (this.opts.telehealth) {
      try {
        this.tab = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false } as MediaTrackConstraints, preferCurrentTab: false } as DisplayMediaStreamOptions);
      } catch {
        this.tab = null;
      }
      this.tab?.getVideoTracks().forEach((t) => t.stop());
      if (this.tab && !this.tab.getAudioTracks().length) {
        this.tab.getTracks().forEach((t) => t.stop());
        this.tab = null;
        this.h.onStatus("starting", "The shared tab had no audio. Recording your microphone only; turn on Share tab audio to separate speakers.");
      }
    }
    this.mime = pickMime();
    if (!this.mime) {
      this.set("error", "This browser can't record audio.");
      return false;
    }
    this.seq = await this.nextSeq();
    this.startedAt = performance.now();
    const track = this.stream.getAudioTracks()[0];
    track.onmute = () => this.set("interrupted", "The microphone was muted or taken by another app (for example a phone call).");
    track.onunmute = () => this.status === "interrupted" && this.set("recording");
    track.onended = () => this.set("interrupted", "The microphone disconnected.");

    this.ctx = new AudioContext();
    this.meter = new VoiceMeter(this.ctx, this.stream, this.clock);
    this.meter.start(this.h.onLevel);
    this.record = this.stream;
    if (this.tab) {
      const merger = this.ctx.createChannelMerger(2);
      this.ctx.createMediaStreamSource(this.stream).connect(merger, 0, 0);
      this.ctx.createMediaStreamSource(this.tab).connect(merger, 0, 1);
      const dest = this.ctx.createMediaStreamDestination();
      dest.channelCount = 2;
      merger.connect(dest);
      this.record = dest.stream;
      this.dualChannel = true;
      this.tab.getAudioTracks()[0].onended = () => this.set("interrupted", "Tab sharing ended. The patient's side is no longer being captured.");
    }

    this.recorder = new MediaRecorder(this.record, { mimeType: this.mime, audioBitsPerSecond: this.dualChannel ? 64000 : 32000 });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.queue.enqueue({ seq: this.seq++, tMs: Math.round(this.clock() * 1000), mime: this.mime.split(";")[0], blob: e.data });
    };
    this.recorder.onerror = () => this.set("interrupted", "Recording stopped unexpectedly.");
    this.recorder.start(4000);

    if (this.opts.live) await this.startLive(this.opts.live);
    else this.h.onLive("off");
    this.setupMediaSession();
    this.set("recording");
    return true;
  }

  private async nextSeq() {
    try {
      const res = await fetch(`/api/encounters/${this.opts.encounterId}`, { cache: "no-store" });
      const j = (await res.json()) as { audio?: { chunks: number } };
      return j.audio?.chunks ?? 0;
    } catch {
      return 0;
    }
  }

  private async startLive(cfg: { url: string; token: string }) {
    if (!this.stream) return;
    this.h.onLive("connecting");
    const live = new DeepgramLive(this.dualChannel ? `${cfg.url}&multichannel=true` : cfg.url, cfg.token, this.clock(), {
      onStatus: (s) => this.h.onLive(s),
      onInterim: this.h.onInterim,
      onSegment: (s: LiveSegment & { role: Speaker }) => this.h.onSegment({ text: s.text, start: s.start, end: s.end, speaker: s.role, lang: s.lang, confidence: s.confidence, voice: this.meter?.summarize(s.start, s.end) ?? null }),
    }, this.dualChannel ? ["clinician", "patient"] : null);
    try {
      await live.connect();
    } catch {
      this.h.onLive("error");
      return;
    }
    this.live = live;
    this.liveRecorder = new MediaRecorder(this.record ?? this.stream, { mimeType: this.mime });
    this.liveRecorder.ondataavailable = (e) => e.data.size && live.send(e.data);
    this.liveRecorder.start(250);
  }

  private setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Chartside is recording", artist: this.opts.patientName ?? "Visit in progress", album: "Chartside" });
      navigator.mediaSession.setActionHandler("pause", () => this.h.onMediaAction?.("pause"));
      navigator.mediaSession.setActionHandler("play", () => this.h.onMediaAction?.("play"));
      navigator.mediaSession.setActionHandler("stop", () => this.h.onMediaAction?.("stop"));
    } catch {
      return;
    }
  }

  voiceFor(tStart: number, tEnd: number) {
    return this.meter?.summarize(tStart, tEnd) ?? null;
  }

  pause() {
    if (this.status !== "recording" && this.status !== "interrupted") return;
    this.recorder?.state === "recording" && this.recorder.pause();
    this.liveRecorder?.state === "recording" && this.liveRecorder.pause();
    this.pausedAt = performance.now();
    this.set("paused");
  }

  resume() {
    if (this.status !== "paused") return;
    this.pausedTotal += performance.now() - this.pausedAt;
    this.recorder?.state === "paused" && this.recorder.resume();
    this.liveRecorder?.state === "paused" && this.liveRecorder.resume();
    this.set("recording");
  }

  async stop() {
    const done = new Promise<void>((resolve) => {
      if (!this.recorder || this.recorder.state === "inactive") return resolve();
      this.recorder.addEventListener("stop", () => setTimeout(resolve, 50), { once: true });
      this.recorder.stop();
    });
    await done;
    if (this.liveRecorder && this.liveRecorder.state !== "inactive") this.liveRecorder.stop();
    this.live?.close();
    this.meter?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.tab?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
    const drained = await this.queue.drain();
    this.set("stopped");
    return drained;
  }

  dispose() {
    this.meter?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.tab?.getTracks().forEach((t) => t.stop());
    this.live?.close();
    this.queue.dispose();
    if ("mediaSession" in navigator) {
      for (const a of ["pause", "play", "stop"] as const) {
        try {
          navigator.mediaSession.setActionHandler(a, null);
        } catch {
          continue;
        }
      }
    }
  }
}
