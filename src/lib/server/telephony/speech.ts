import WebSocket from "ws";

function key() {
  return process.env.DEEPGRAM_API_KEY || null;
}

function base() {
  return (process.env.DEEPGRAM_BASE_URL || "https://api.deepgram.com").replace(/\/$/, "");
}

export function phoneSpeechReady() {
  return !!key();
}

const cache = new Map<string, Buffer>();
const cacheable = new Set<string>();

export function allowCache(lines: string[]) {
  for (const l of lines) cacheable.add(l);
}

export function voiceFor(lang: "en" | "es" = "en") {
  return lang === "es" ? process.env.CHARTSIDE_PHONE_VOICE_ES || "aura-2-celeste-es" : process.env.CHARTSIDE_PHONE_VOICE || "aura-2-thalia-en";
}

export async function synthesize(text: string, onChunk?: (audio: Buffer) => void, lang: "en" | "es" = "en", voice?: string): Promise<Buffer> {
  const k = key();
  if (!k) throw new Error("Deepgram is not configured");
  const model = voice || voiceFor(lang);
  const ck = `${model}:${text}`;
  const hit = cache.get(ck);
  if (hit) {
    onChunk?.(hit);
    return hit;
  }
  const res = await fetch(`${base()}/v1/speak?model=${encodeURIComponent(model)}&encoding=mulaw&sample_rate=8000&container=none&mip_opt_out=true`, {
    method: "POST",
    headers: { Authorization: `Token ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok || !res.body) throw new Error(`Speech synthesis failed (${res.status})`);
  const parts: Buffer[] = [];
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    const b = Buffer.from(chunk);
    parts.push(b);
    onChunk?.(b);
  }
  const audio = Buffer.concat(parts);
  if (cacheable.has(text)) cache.set(ck, audio);
  return audio;
}

export async function warmPhrases(lines: string[]) {
  allowCache(lines);
  for (const l of lines) await synthesize(l, undefined, /[¿¡ñáéíóú]/.test(l) ? "es" : "en").catch(() => null);
}

export function listenUrl(callTag?: string) {
  const ws = (process.env.DEEPGRAM_WS_URL || "wss://api.deepgram.com/v1/listen").replace(/\/$/, "");
  const q = new URLSearchParams({ model: "nova-3", language: "multi", encoding: "mulaw", sample_rate: "8000", channels: "1", punctuate: "true", smart_format: "true", interim_results: "false", endpointing: "500", tag: "chartside-phone", mip_opt_out: "true" });
  for (const term of ["Chartside", "pause", "resume", "end visit"]) q.append("keyterm", term);
  if (callTag) q.append("tag", callTag.slice(0, 120));
  return `${ws}?${q}`;
}

export class LiveListener {
  private ws: WebSocket | null = null;
  private queue: Buffer[] = [];
  private keepAlive: NodeJS.Timeout | null = null;
  closed = false;
  onOpen: (() => void) | null = null;

  constructor(private onFinal: (text: string) => void, private onError: (err: Error) => void = () => {}, private callTag?: string) {}

  open() {
    const k = key();
    if (!k) return;
    const ws = new WebSocket(listenUrl(this.callTag), { headers: { Authorization: `Token ${k}` } });
    this.ws = ws;
    ws.on("open", () => {
      this.onOpen?.();
      for (const b of this.queue) ws.send(b);
      this.queue = [];
      this.keepAlive = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "KeepAlive" })), 8000);
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; is_final?: boolean; channel?: { alternatives?: { transcript?: string }[] } };
        if (msg.type !== "Results" || !msg.is_final) return;
        const text = msg.channel?.alternatives?.[0]?.transcript?.trim();
        if (text) this.onFinal(text);
      } catch {
        return;
      }
    });
    ws.on("unexpected-response", (_req, res) => this.onError(new Error(`Deepgram listen refused (${res.statusCode}): ${res.headers["dg-error"] ?? ""}`)));
    ws.on("error", (err) => this.onError(err));
    ws.on("close", () => this.keepAlive && clearInterval(this.keepAlive));
  }

  send(mulaw: Buffer) {
    if (this.closed || !this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(mulaw);
    else if (this.ws.readyState === WebSocket.CONNECTING && this.queue.length < 500) this.queue.push(mulaw);
  }

  close() {
    this.closed = true;
    if (this.keepAlive) clearInterval(this.keepAlive);
    const ws = this.ws;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => ws.close(), 500);
    } else ws.terminate();
  }
}
