"use client";

import { mulawDecode, mulawEncode } from "@/lib/server/telephony/mulaw";

const WORKLET = `
class Mic8k extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 8000; this.acc = 0; this.sum = 0; this.n = 0; this.buf = new Int16Array(160); this.i = 0; this.peak = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let k = 0; k < ch.length; k++) {
      this.sum += ch[k]; this.n++; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        const v = this.sum / this.n; this.sum = 0; this.n = 0;
        const s = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
        this.peak = Math.max(this.peak, Math.abs(s));
        this.buf[this.i++] = s;
        if (this.i === 160) { this.port.postMessage({ frame: this.buf.slice(), peak: this.peak }); this.i = 0; this.peak = 0; }
      }
    }
    return true;
  }
}
registerProcessor("mic-8k", Mic8k);
`;

export function toB64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export class PhoneAudio {
  ctx: AudioContext;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  muted = false;
  micBlocked = false;

  constructor(private onFrame: (mulaw: Uint8Array) => void, private onLevel: (level: number) => void) {
    this.ctx = new AudioContext();
  }

  async start() {
    await this.ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "mic-8k");
    this.node.port.onmessage = (e: MessageEvent<{ frame: Int16Array; peak: number }>) => {
      this.onLevel(this.muted || this.micBlocked ? 0 : Math.min(1, e.data.peak / 12000));
      if (this.muted || this.micBlocked) this.onFrame(new Uint8Array(160).fill(0xff));
      else this.onFrame(mulawEncode(e.data.frame));
    };
    src.connect(this.node);
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink).connect(this.ctx.destination);
  }

  play(mulaw: Uint8Array, gain = 1) {
    const pcm = mulawDecode(mulaw);
    const buf = this.ctx.createBuffer(1, pcm.length, 8000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.ctx.destination);
    const at = Math.max(this.ctx.currentTime + 0.05, this.nextTime);
    src.start(at);
    this.nextTime = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  whenPlayed(cb: () => void) {
    const ms = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
    setTimeout(cb, ms + 30);
  }

  clear() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  get speaking() {
    return this.nextTime > this.ctx.currentTime;
  }

  stop() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {}
    }
    this.sources.clear();
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx.close().catch(() => {});
  }
}
