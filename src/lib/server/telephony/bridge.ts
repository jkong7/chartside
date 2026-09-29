import type WebSocket from "ws";
import { ScribeCall } from "./call";
import { mulawDecode } from "./mulaw";
import { phoneSession } from "./session";
import { LiveListener, synthesize } from "./speech";
import { readCallToken } from "./token";

interface TwilioFrame {
  event: string;
  streamSid?: string;
  start?: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
  media?: { track?: string; payload: string };
  dtmf?: { digit: string };
  mark?: { name: string };
}

const FRAME = 160;
const ECHO_GUARD_MS = 700;

export interface BridgeOptions {
  waitMs?: number;
  pollMs?: number;
}

export function handleMediaStream(ws: WebSocket, opts: BridgeOptions = {}) {
  let streamSid = "";
  let call: ScribeCall | null = null;
  let listener: LiveListener | null = null;
  let session: Awaited<ReturnType<typeof phoneSession>> | null = null;
  let speakingUntil = 0;
  let markSeq = 0;
  const marks = new Map<string, () => void>();
  let ended = false;
  let hungUp = false;

  const send = (obj: unknown) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  const say = async (text: string) => {
    if (hungUp) return;
    let audio: Buffer;
    try {
      audio = await synthesize(text);
    } catch (err) {
      console.error("phone tts failed", err);
      return;
    }
    speakingUntil = Number.POSITIVE_INFINITY;
    for (let off = 0; off < audio.length; off += FRAME * 50) send({ event: "media", streamSid, media: { payload: audio.subarray(off, off + FRAME * 50).toString("base64") } });
    const name = `m${++markSeq}`;
    const played = new Promise<void>((resolve) => {
      marks.set(name, resolve);
      setTimeout(() => {
        if (marks.delete(name)) resolve();
      }, Math.ceil(audio.length / 8) + 4000);
    });
    send({ event: "mark", streamSid, mark: { name } });
    await played;
    speakingUntil = Date.now() + ECHO_GUARD_MS;
  };

  const hangup = () => {
    if (ended) return;
    ended = true;
    setTimeout(() => ws.close(1000, "done"), 300);
  };

  const teardown = async () => {
    listener?.close();
    for (const r of marks.values()) r();
    marks.clear();
  };

  ws.on("message", async (raw) => {
    let msg: TwilioFrame;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.event === "start" && msg.start && !call) {
      streamSid = msg.start.streamSid;
      const claims = readCallToken(msg.start.customParameters?.callToken);
      if (!claims || claims.callSid !== msg.start.callSid) {
        ws.close(1008, "bad call token");
        return;
      }
      try {
        session = await phoneSession(claims, opts);
      } catch (err) {
        console.error("phone session failed", err);
        ws.close(1011, "session");
        return;
      }
      call = new ScribeCall({ ...session.deps, say, hangup });
      listener = new LiveListener((text) => {
        if (Date.now() < speakingUntil) return;
        void call?.onTranscript(text).catch((err) => console.error("phone transcript failed", err));
      });
      listener.open();
      void call.start().catch((err) => console.error("phone start failed", err));
      return;
    }
    if (!call || !session) return;
    if (msg.event === "media" && msg.media && (msg.media.track ?? "inbound") === "inbound") {
      const bytes = Buffer.from(msg.media.payload, "base64");
      listener?.send(bytes);
      if (call.capturing) {
        call.onAudio();
        session.pushAudio(mulawDecode(bytes));
      }
      return;
    }
    if (msg.event === "dtmf" && msg.dtmf) {
      void call.onDigit(msg.dtmf.digit).catch((err) => console.error("phone digit failed", err));
      return;
    }
    if (msg.event === "mark" && msg.mark) {
      const r = marks.get(msg.mark.name);
      if (r) {
        marks.delete(msg.mark.name);
        r();
      }
      return;
    }
    if (msg.event === "stop") {
      hungUp = true;
      await teardown();
      if (!ended) {
        ended = true;
        await call.onHangup().catch((err) => console.error("phone hangup failed", err));
      }
    }
  });

  ws.on("close", async () => {
    hungUp = true;
    await teardown();
    if (call && !ended) {
      ended = true;
      await call.onHangup().catch((err) => console.error("phone hangup failed", err));
    }
  });
}
