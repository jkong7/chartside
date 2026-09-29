import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import WebSocket from "ws";

const BIAS = 0x84;
function mulawSample(s) {
  let v = Math.max(-32768, Math.min(32767, Math.round(s)));
  const sign = v < 0 ? 0x80 : 0;
  if (sign) v = -v;
  if (v > 32635) v = 32635;
  v += BIAS;
  let exp = 7;
  for (let mask = 0x4000; (v & mask) === 0 && exp > 0; mask >>= 1) exp--;
  return ~(sign | (exp << 4) | ((v >> (exp + 3)) & 0x0f)) & 0xff;
}

export function wavToMulaw8k(file) {
  const buf = readFileSync(file);
  let off = 12;
  let rate = 16000;
  let channels = 1;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      rate = buf.readUInt32LE(off + 12);
    } else if (id === "data") {
      const n = Math.floor(Math.min(size, buf.length - off - 8) / 2 / channels);
      const ratio = rate / 8000;
      const out = Buffer.alloc(Math.floor(n / ratio));
      for (let i = 0; i < out.length; i++) {
        const k = Math.floor(i * ratio);
        let s = 0;
        for (let c = 0; c < channels; c++) s += buf.readInt16LE(off + 8 + (k * channels + c) * 2);
        out[i] = mulawSample(s / channels);
      }
      return out;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

export function twilioSignature(token, url, params) {
  const data = Object.keys(params).sort().reduce((a, k) => a + k + params[k], url);
  return createHmac("sha1", token).update(data).digest("base64");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function dial({ base, from = "+15550100000", sim = false, cookie, twilioToken, steps = [], mockDeepgram, deepgramKey, frameMs = 20, log = () => {} }) {
  const callSid = `CA${randomBytes(16).toString("hex")}`;
  let callToken;
  let streamUrl;
  let phone = from;
  let inboxKey = null;
  if (sim) {
    const r = await fetch(`${base}/api/voice/sim/start`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ phone: /^\+1555\d{7}$/.test(from) ? from : undefined }) });
    const j = await r.json();
    if (!r.ok) throw new Error(`sim start failed: ${j.error}`);
    callToken = j.callToken;
    phone = j.phone;
    inboxKey = j.inboxKey;
    streamUrl = `${base.replace(/^http/, "ws")}${j.streamPath}`;
    return run(j.callSid);
  }
  const params = { AccountSid: "ACtest", CallSid: callSid, From: from, To: "+13125550199", Direction: "inbound", CallStatus: "ringing" };
  const url = `${base}/api/voice/incoming`;
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (twilioToken) headers["x-twilio-signature"] = twilioSignature(twilioToken, url, params);
  const res = await fetch(url, { method: "POST", headers, body: new URLSearchParams(params).toString() });
  const xml = await res.text();
  if (!res.ok) throw new Error(`incoming webhook ${res.status}: ${xml}`);
  const stream = /<Stream url="([^"]+)"/.exec(xml);
  const tok = /<Parameter name="callToken" value="([^"]+)"/.exec(xml);
  if (!stream || !tok) return { twiml: xml, connected: false };
  streamUrl = stream[1].replace(/&amp;/g, "&");
  callToken = tok[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
  return run(callSid);

  async function run(sid) {
    const ws = new WebSocket(streamUrl);
    const streamSid = `MZ${randomBytes(16).toString("hex")}`;
    let prompts = 0;
    let outboundBytes = 0;
    let closed = false;
    let closeCode = null;
    const waiters = [];
    ws.on("message", (data) => {
      const m = JSON.parse(data.toString());
      if (m.event === "media") outboundBytes += Buffer.from(m.media.payload, "base64").length;
      if (m.event === "chartside.heard") log(`heard: ${m.text}`);
      if (m.event === "chartside.caption") log(`said: ${m.text.slice(0, 90)}`);
      if (m.event === "chartside.state") log(`state: ${m.state}`);
      if (m.event === "mark") {
        const playMs = Math.min(outboundBytes / 8, 30000);
        outboundBytes = 0;
        setTimeout(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ event: "mark", streamSid, sequenceNumber: "1", mark: { name: m.mark.name } }));
          prompts++;
          log(`prompt ${prompts}`);
          for (const w of [...waiters]) w();
        }, mockDeepgram ? 5 : playMs);
      }
    });
    ws.on("close", (code) => {
      closed = true;
      closeCode = code;
      for (const w of [...waiters]) w();
    });
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const send = (o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
    send({ event: "connected", protocol: "Call", version: "1.0.0" });
    send({ event: "start", sequenceNumber: "1", streamSid, start: { accountSid: "ACtest", streamSid, callSid: sid, tracks: ["inbound"], customParameters: { callToken }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
    const waitFor = (pred, ms) =>
      new Promise((resolve) => {
        const t = setTimeout(() => done(false), ms);
        function done(v) {
          clearTimeout(t);
          const i = waiters.indexOf(check);
          if (i >= 0) waiters.splice(i, 1);
          resolve(v);
        }
        function check() {
          if (pred()) done(true);
        }
        waiters.push(check);
        check();
      });
    const stream = async (bytes) => {
      const frame = 160;
      for (let off = 0; off < bytes.length && !closed; off += frame) {
        send({ event: "media", streamSid, media: { track: "inbound", chunk: String(off / frame), timestamp: String(off / 8), payload: bytes.subarray(off, off + frame).toString("base64") } });
        if (frameMs) await sleep(frameMs);
      }
    };
    const speak = async (text) => {
      if (mockDeepgram) {
        await sleep(900);
        await fetch(`${mockDeepgram}/phone/say?text=${encodeURIComponent(text)}`, { method: "POST" });
        await stream(Buffer.alloc(160 * 3, 0xff));
        return;
      }
      const r = await fetch(`https://api.deepgram.com/v1/speak?model=aura-2-orion-en&encoding=mulaw&sample_rate=8000&container=none`, { method: "POST", headers: { Authorization: `Token ${deepgramKey}`, "content-type": "application/json" }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error(`tts ${r.status}`);
      await stream(Buffer.from(await r.arrayBuffer()));
      await stream(Buffer.alloc(8000 * 1.5, 0xff));
    };
    for (const step of steps) {
      if (closed) break;
      if (step.waitPrompts) {
        const ok = await waitFor(() => prompts >= step.waitPrompts || closed, step.timeoutMs ?? 20000);
        if (!ok) throw new Error(`timed out waiting for prompt ${step.waitPrompts} (have ${prompts})`);
      } else if (step.digit) send({ event: "dtmf", streamSid, dtmf: { track: "inbound_track", digit: step.digit } });
      else if (step.say) await speak(step.say);
      else if (step.wav) await stream(wavToMulaw8k(step.wav));
      else if (step.ulaw) await stream(readFileSync(step.ulaw));
      else if (step.silence) await stream(Buffer.alloc(Math.round(step.silence * 8000), 0xff));
      else if (step.sleep) await sleep(step.sleep);
      else if (step.hangup) {
        send({ event: "stop", streamSid, stop: { accountSid: "ACtest", callSid: sid } });
        ws.close();
      } else if (step.waitClose) {
        const ok = await waitFor(() => closed, step.timeoutMs ?? 30000);
        if (!ok) throw new Error("call did not end");
      }
    }
    if (!closed) {
      send({ event: "stop", streamSid });
      ws.close();
    }
    return { connected: true, callSid: sid, prompts, closeCode, phone, inboxKey };
  }
}
