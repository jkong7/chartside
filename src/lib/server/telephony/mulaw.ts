const BIAS = 0x84;
const CLIP = 32635;

const DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  DECODE[i] = sign ? -sample : sample;
}

export function mulawDecode(input: Uint8Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = DECODE[input[i]];
  return out;
}

function encodeSample(s: number) {
  let sample = Math.max(-32768, Math.min(32767, Math.round(s)));
  const sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawEncode(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = encodeSample(pcm[i]);
  return out;
}

export function resample(pcm: Int16Array, from: number, to: number): Int16Array {
  if (from === to) return pcm;
  const ratio = from / to;
  const n = Math.floor(pcm.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, pcm.length - 1);
    const frac = pos - i0;
    if (ratio > 1) {
      const end = Math.min(pcm.length, Math.floor(pos + ratio));
      let sum = 0;
      let count = 0;
      for (let k = i0; k < end; k++) {
        sum += pcm[k];
        count++;
      }
      out[i] = count ? Math.round(sum / count) : pcm[i0];
    } else {
      out[i] = Math.round(pcm[i0] * (1 - frac) + pcm[i1] * frac);
    }
  }
  return out;
}

export function wavFromPcm(pcm: Int16Array, sampleRate: number, channels = 1): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function interleave(left: Int16Array, right: Int16Array): Int16Array {
  const n = Math.max(left.length, right.length);
  const out = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) {
    out[i * 2] = left[i] ?? 0;
    out[i * 2 + 1] = right[i] ?? 0;
  }
  return out;
}

export function pcmFromWav(buf: Buffer): { pcm: Int16Array; sampleRate: number; channels: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let off = 12;
  let sampleRate = 16000;
  let channels = 1;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      if (bits !== 16) throw new Error("Only 16-bit WAV is supported");
      const end = Math.min(buf.length, off + 8 + size);
      const slice = Buffer.from(buf.subarray(off + 8, end));
      const pcm = new Int16Array(slice.buffer, slice.byteOffset, Math.floor(slice.length / 2));
      if (channels === 1) return { pcm, sampleRate, channels };
      const mono = new Int16Array(Math.floor(pcm.length / channels));
      for (let i = 0; i < mono.length; i++) {
        let s = 0;
        for (let c = 0; c < channels; c++) s += pcm[i * channels + c];
        mono[i] = Math.round(s / channels);
      }
      return { pcm: mono, sampleRate, channels: 1 };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}
