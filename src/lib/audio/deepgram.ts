import { speakerScore } from "../engine/extract";
import type { Speaker } from "../types";

export interface DgWord {
  word: string;
  punctuated_word?: string;
  start: number;
  end: number;
  speaker?: number;
  language?: string;
  confidence?: number;
}

export interface DgResults {
  type: "Results";
  is_final?: boolean;
  speech_final?: boolean;
  start: number;
  duration: number;
  channel: { alternatives: { transcript: string; confidence: number; words: DgWord[] }[] };
}

export interface LiveSegment {
  speaker: number;
  text: string;
  start: number;
  end: number;
  lang?: string;
  confidence: number;
}

export function wordsToSegments(words: DgWord[]): LiveSegment[] {
  const out: LiveSegment[] = [];
  for (const w of words) {
    const spk = w.speaker ?? 0;
    const token = w.punctuated_word ?? w.word;
    const last = out[out.length - 1];
    if (last && last.speaker === spk) {
      last.text += ` ${token}`;
      last.end = w.end;
      last.confidence = Math.min(last.confidence, w.confidence ?? 1);
    } else {
      out.push({ speaker: spk, text: token, start: w.start, end: w.end, lang: w.language?.slice(0, 2), confidence: w.confidence ?? 1 });
    }
  }
  return out;
}

export class SpeakerRoles {
  private map = new Map<number, Speaker>();
  role(speaker: number, text: string): Speaker {
    const known = this.map.get(speaker);
    if (known) return known;
    const taken = new Set(this.map.values());
    let r: Speaker;
    if (!taken.has("clinician") && (speakerScore(text) > 0 || taken.has("patient"))) r = "clinician";
    else if (!taken.has("patient")) r = "patient";
    else r = "other";
    this.map.set(speaker, r);
    return r;
  }
}

export class DeepgramLive {
  private ws: WebSocket | null = null;
  private words: DgWord[] = [];
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private roles = new SpeakerRoles();
  status: "connecting" | "open" | "closed" | "error" = "connecting";

  constructor(
    private url: string,
    private token: string,
    private offset: number,
    private handlers: { onSegment: (s: LiveSegment & { role: Speaker }) => void; onInterim: (text: string) => void; onStatus: (s: DeepgramLive["status"]) => void },
  ) {}

  connect() {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.url, ["bearer", this.token]);
      this.ws = ws;
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        this.setStatus("open");
        this.keepAlive = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
        resolve();
      };
      ws.onerror = () => {
        this.setStatus("error");
        reject(new Error("Live transcription connection failed"));
      };
      ws.onclose = () => {
        this.flush();
        this.setStatus("closed");
        if (this.keepAlive) clearInterval(this.keepAlive);
      };
      ws.onmessage = (e) => this.onMessage(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data));
    });
  }

  private setStatus(s: DeepgramLive["status"]) {
    this.status = s;
    this.handlers.onStatus(s);
  }

  onMessage(raw: string) {
    let msg: { type?: string; is_final?: boolean; speech_final?: boolean; channel?: DgResults["channel"] };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "Results" && msg.channel) {
      const alt = msg.channel.alternatives[0];
      if (!alt) return;
      if (msg.is_final) {
        this.words.push(...alt.words);
        this.handlers.onInterim("");
        if (msg.speech_final) this.flush();
      } else {
        this.handlers.onInterim(alt.transcript);
      }
    } else if (msg.type === "UtteranceEnd") {
      this.flush();
    }
  }

  flush() {
    if (!this.words.length) return;
    const segs = wordsToSegments(this.words);
    this.words = [];
    for (const s of segs) {
      const text = s.text.trim();
      if (!text) continue;
      this.handlers.onSegment({ ...s, text, start: s.start + this.offset, end: s.end + this.offset, role: this.roles.role(s.speaker, text) });
    }
  }

  send(data: Blob | ArrayBuffer) {
    if (this.ws?.readyState === 1) this.ws.send(data);
  }

  close() {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "Finalize" }));
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
    }
    if (this.keepAlive) clearInterval(this.keepAlive);
  }
}
