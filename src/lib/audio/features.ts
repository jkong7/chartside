import type { VoiceFeatures } from "../types";

interface Frame {
  t: number;
  rms: number;
  pitch: number;
  centroid: number;
}

export function estimatePitch(buf: Float32Array, sampleRate: number) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return 0;
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.floor(sampleRate / 70);
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag && lag < n / 2; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += buf[i] * buf[i + lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  let energy = 0;
  for (let i = 0; i < n; i++) energy += buf[i] * buf[i];
  if (!bestLag || best / energy < 0.3) return 0;
  return sampleRate / bestLag;
}

export function spectralCentroid(freq: Float32Array, sampleRate: number) {
  let num = 0;
  let den = 0;
  const binHz = sampleRate / 2 / freq.length;
  for (let i = 1; i < freq.length; i++) {
    const mag = Math.pow(10, freq[i] / 20);
    num += mag * i * binHz;
    den += mag;
  }
  return den ? num / den : 0;
}

export class VoiceMeter {
  private frames: Frame[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private analyser: AnalyserNode;
  private time: Float32Array<ArrayBuffer>;
  private freq: Float32Array<ArrayBuffer>;
  level = 0;

  constructor(private ctx: AudioContext, stream: MediaStream, private clock: () => number) {
    const src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.time = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
  }

  start(onLevel: (level: number) => void) {
    this.timer = setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.time);
      this.analyser.getFloatFrequencyData(this.freq);
      let rms = 0;
      for (const v of this.time) rms += v * v;
      rms = Math.sqrt(rms / this.time.length);
      this.level = Math.min(1, rms * 8);
      onLevel(this.level);
      const pitch = estimatePitch(this.time, this.ctx.sampleRate);
      const centroid = spectralCentroid(this.freq, this.ctx.sampleRate);
      this.frames.push({ t: this.clock(), rms, pitch, centroid });
      if (this.frames.length > 20000) this.frames.splice(0, 5000);
    }, 60);
  }

  summarize(tStart: number, tEnd: number): VoiceFeatures | null {
    const xs = this.frames.filter((f) => f.t >= tStart - 0.2 && f.t <= tEnd + 0.2 && f.pitch > 0 && f.rms > 0.01);
    if (xs.length < 3) return null;
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return { pitch: med(xs.map((f) => f.pitch)), centroid: med(xs.map((f) => f.centroid)), energy: med(xs.map((f) => f.rms)), frames: xs.length };
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
