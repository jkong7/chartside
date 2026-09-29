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

export async function synthesize(text: string): Promise<Buffer> {
  const k = key();
  if (!k) throw new Error("Deepgram is not configured");
  const hit = cache.get(text);
  if (hit) return hit;
  const model = process.env.CHARTSIDE_PHONE_VOICE || "aura-2-thalia-en";
  const res = await fetch(`${base()}/v1/speak?model=${encodeURIComponent(model)}&encoding=mulaw&sample_rate=8000&container=none`, {
    method: "POST",
    headers: { Authorization: `Token ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Speech synthesis failed (${res.status})`);
  const audio = Buffer.from(await res.arrayBuffer());
  if (text.length < 400) {
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(text, audio);
  }
  return audio;
}

export function listenUrl() {
  const ws = (process.env.DEEPGRAM_WS_URL || "wss://api.deepgram.com/v1/listen").replace(/\/$/, "");
  const q = new URLSearchParams({ model: "nova-3", language: "en", encoding: "mulaw", sample_rate: "8000", channels: "1", punctuate: "true", smart_format: "true", interim_results: "false", endpointing: "500", utterance_end_ms: "1000", tag: "chartside-phone" });
  for (const term of ["Chartside", "pause", "resume", "end visit"]) q.append("keyterm", term);
  return `${ws}?${q}`;
}

export class LiveListener {
  private ws: WebSocket | null = null;
  private queue: Buffer[] = [];
  private keepAlive: NodeJS.Timeout | null = null;
  closed = false;

  constructor(private onFinal: (text: string) => void, private onError: (err: Error) => void = () => {}) {}

  open() {
    const k = key();
    if (!k) return;
    const ws = new WebSocket(listenUrl(), { headers: { Authorization: `Token ${k}` } });
    this.ws = ws;
    ws.on("open", () => {
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
