export type DictationStatus = "idle" | "starting" | "listening" | "error";

export interface DictationConfig {
  provider: "deepgram" | "browser";
  url: string | null;
}

interface Handlers {
  onFinal: (text: string) => void;
  onInterim: (text: string) => void;
  onStatus: (s: DictationStatus, message?: string) => void;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}

export function browserDictationAvailable() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class Dictation {
  private ws: WebSocket | null = null;
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private sr: SpeechRecognitionLike | null = null;
  private parts: string[] = [];
  private active = false;
  private keepAlive: ReturnType<typeof setInterval> | null = null;

  constructor(private cfg: DictationConfig, private h: Handlers) {}

  async start() {
    this.active = true;
    this.h.onStatus("starting");
    try {
      if (this.cfg.provider === "deepgram" && this.cfg.url) await this.startDeepgram(this.cfg.url);
      else this.startBrowser();
    } catch (err) {
      this.active = false;
      this.cleanup();
      this.h.onStatus("error", err instanceof Error ? err.message : "Could not start dictation");
    }
  }

  private async startDeepgram(url: string) {
    const r = await fetch("/api/speech/token", { method: "POST" });
    if (!r.ok) throw new Error("Speech service unavailable");
    const { token } = (await r.json()) as { token: string };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const ws = new WebSocket(url, ["bearer", token]);
    this.ws = ws;
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Could not connect to speech service"));
    });
    ws.onmessage = (e) => this.onDeepgram(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data));
    ws.onclose = () => {
      this.flush();
      if (this.active) this.h.onStatus("idle");
      this.active = false;
    };
    this.keepAlive = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.rec.ondataavailable = (e) => {
      if (e.data.size && ws.readyState === 1) ws.send(e.data);
    };
    this.rec.start(250);
    this.h.onStatus("listening");
  }

  private onDeepgram(raw: string) {
    let msg: { type?: string; is_final?: boolean; speech_final?: boolean; channel?: { alternatives: { transcript: string }[] } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "Results" && msg.channel) {
      const t = msg.channel.alternatives[0]?.transcript ?? "";
      if (msg.is_final) {
        if (t.trim()) this.parts.push(t.trim());
        this.h.onInterim("");
        if (msg.speech_final) this.flush();
      } else this.h.onInterim([...this.parts, t].join(" "));
    } else if (msg.type === "UtteranceEnd") this.flush();
  }

  private flush() {
    const text = this.parts.join(" ").trim();
    this.parts = [];
    if (text) this.h.onFinal(text);
  }

  private startBrowser() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) throw new Error("This browser has no speech recognition. Configure Deepgram or use Chrome.");
    const sr = new Ctor();
    this.sr = sr;
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "en-US";
    sr.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.h.onFinal(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      this.h.onInterim(interim);
    };
    sr.onerror = (e) => {
      if (e.error === "no-speech") return;
      this.active = false;
      this.h.onStatus("error", e.error === "not-allowed" ? "Microphone permission was denied" : `Speech recognition error: ${e.error}`);
    };
    sr.onend = () => {
      if (this.active) sr.start();
    };
    sr.start();
    this.h.onStatus("listening");
  }

  stop() {
    this.active = false;
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "Finalize" }));
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
    }
    this.cleanup();
    this.flush();
    this.h.onInterim("");
    this.h.onStatus("idle");
  }

  private cleanup() {
    if (this.keepAlive) clearInterval(this.keepAlive);
    if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.sr?.stop();
    this.rec = null;
    this.stream = null;
    this.sr = null;
  }
}
