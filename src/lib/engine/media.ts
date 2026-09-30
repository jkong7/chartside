export interface MediaItem {
  index: number;
  url: string;
  contentType: string;
  audio: boolean;
}

const AUDIO_TYPES = /^(audio\/[\w.+-]+|video\/(3gpp2?|mp4|quicktime|webm))$/i;

export function mediaItems(params: Record<string, string>): MediaItem[] {
  const n = Math.min(10, Math.max(0, Number(params.NumMedia ?? 0) || 0));
  const out: MediaItem[] = [];
  for (let i = 0; i < n; i++) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    const contentType = (params[`MediaContentType${i}`] ?? "").split(";")[0].trim().toLowerCase();
    out.push({ index: i, url, contentType, audio: AUDIO_TYPES.test(contentType) });
  }
  return out;
}

export function mediaUrlAllowed(url: string, base: string) {
  try {
    const u = new URL(url);
    const b = new URL(base);
    if (u.protocol !== b.protocol || u.host !== b.host) return false;
    return /^\/2010-04-01\/Accounts\/AC[\w]+\/Messages\/(MM|SM)[\w]+\/Media\/ME[\w]+(\.json)?$/.test(u.pathname);
  } catch {
    return false;
  }
}

export function mediaResourceUrl(url: string) {
  const u = new URL(url);
  u.search = "";
  if (!u.pathname.endsWith(".json")) u.pathname += ".json";
  return u.toString();
}

function wavSeconds(buf: Buffer) {
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(off + 16);
    else if (id === "data") return byteRate ? Math.min(size, buf.length - off - 8) / byteRate : null;
    off += 8 + size + (size % 2);
  }
  return null;
}

function mp4Seconds(buf: Buffer) {
  const at = buf.indexOf("mvhd");
  if (at < 4 || at + 32 > buf.length) return null;
  const version = buf[at + 4];
  if (version === 1) {
    if (at + 44 > buf.length) return null;
    const scale = buf.readUInt32BE(at + 24);
    const dur = Number(buf.readBigUInt64BE(at + 28));
    return scale ? dur / scale : null;
  }
  const scale = buf.readUInt32BE(at + 16);
  const dur = buf.readUInt32BE(at + 20);
  return scale ? dur / scale : null;
}

function oggSeconds(buf: Buffer) {
  const last = buf.lastIndexOf("OggS");
  if (last < 0 || last + 14 > buf.length) return null;
  const granule = Number(buf.readBigUInt64LE(last + 6));
  const opus = buf.indexOf("OpusHead") >= 0;
  const rate = opus ? 48000 : buf.indexOf("vorbis") >= 0 && buf.indexOf("vorbis") + 16 < buf.length ? buf.readUInt32LE(buf.indexOf("vorbis") + 5) : 48000;
  return granule > 0 && rate ? granule / rate : null;
}

const AMR_NB_FRAME = [13, 14, 16, 18, 20, 21, 27, 32, 6, 1, 1, 1, 1, 1, 1, 1];

function amrSeconds(buf: Buffer) {
  const head = "#!AMR\n";
  if (buf.toString("ascii", 0, head.length) !== head) return null;
  let off = head.length;
  let frames = 0;
  while (off < buf.length) {
    const ft = (buf[off] >> 3) & 0x0f;
    off += AMR_NB_FRAME[ft];
    frames++;
  }
  return frames * 0.02;
}

export function audioSeconds(buf: Buffer, mime: string) {
  const m = mime.toLowerCase();
  try {
    if (m.includes("wav")) return wavSeconds(buf);
    if (m.includes("mp4") || m.includes("m4a") || m.includes("3gpp") || m.includes("aac") || m.includes("quicktime")) return mp4Seconds(buf);
    if (m.includes("ogg") || m.includes("opus")) return oggSeconds(buf);
    if (m.includes("amr")) return amrSeconds(buf);
  } catch {
    return null;
  }
  return null;
}
