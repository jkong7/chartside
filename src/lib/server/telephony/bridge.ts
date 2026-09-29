import type WebSocket from "ws";
import { ScribeCall } from "./call";
import { mulawDecode } from "./mulaw";
import { phoneSession } from "./session";
import { LiveListener, synthesize } from "./speech";
import { claimCallStart, readCallToken } from "./token";

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
  let sim = false;
  let interrupted = false;
  let lastState = "";

  const emitState = () => {
    if (!sim || !call || call.state === lastState) return;
    lastState = call.state;
    send({ event: "chartside.state", streamSid, state: call.state });
  };

  const send = (obj: unknown) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  };

  const interrupt = () => {
    if (speakingUntil !== Number.POSITIVE_INFINITY) return;
    interrupted = true;
    send({ event: "clear", streamSid });
    for (const r of marks.values()) r();
    marks.clear();
  };

  const say = async (text: string, lang: "en" | "es" = "en") => {
    if (hungUp) return;
    interrupted = false;
    speakingUntil = Number.POSITIVE_INFINITY;
    emitState();
    if (sim) send({ event: "chartside.caption", streamSid, text });
    let pending = Buffer.alloc(0);
    let total = 0;
    const flushOut = (final: boolean) => {
      if (interrupted) return;
      const n = final ? pending.length : pending.length - (pending.length % FRAME);
      if (!n) return;
      send({ event: "media", streamSid, media: { payload: pending.subarray(0, n).toString("base64") } });
      pending = pending.subarray(n);
    };
    try {
      await synthesize(
        text,
        (chunk) => {
        total += chunk.length;
        pending = Buffer.concat([pending, chunk]);
        if (pending.length >= FRAME * 25) flushOut(false);
        },
        lang,
      );
      flushOut(true);
    } catch (err) {
      console.error("phone tts failed", err);
      speakingUntil = Date.now();
      return;
    }
    if (interrupted) {
      speakingUntil = Date.now() + ECHO_GUARD_MS;
      return;
    }
    const name = `m${++markSeq}`;
    const played = new Promise<void>((resolve) => {
      marks.set(name, resolve);
      setTimeout(() => {
        if (marks.delete(name)) resolve();
      }, Math.ceil(total / 8) + 4000);
    });
    send({ event: "mark", streamSid, mark: { name } });
    await played;
    speakingUntil = Date.now() + ECHO_GUARD_MS;
    emitState();
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
      if (!claims || claims.callSid !== msg.start.callSid || !claimCallStart(claims.callSid)) {
        ws.close(1008, "bad call token");
        return;
      }
      sim = claims.sim;
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
        if (sim) send({ event: "chartside.heard", streamSid, text });
        void call
          ?.onTranscript(text)
          .then(emitState)
          .catch((err) => console.error("phone transcript failed", err));
      }, (err) => console.error("phone listen failed", err.message));
      listener.open();
      void call
        .start()
        .then(emitState)
        .catch((err) => console.error("phone start failed", err));
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
      const digit = msg.dtmf.digit;
      const c = call;
      interrupt();
      void (async () => {
        for (let i = 0; i < 200 && c.isBusy; i++) await new Promise((r) => setTimeout(r, 100));
        await c.onDigit(digit);
        emitState();
      })().catch((err) => console.error("phone digit failed", err));
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
