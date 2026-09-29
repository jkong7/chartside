import type WebSocket from "ws";
import { ScribeCall } from "./call";
import { recordingMinutesFromEnv } from "../../engine/limits";
import { mulawDecode } from "./mulaw";
import { phoneSession } from "./session";
import { LiveListener, synthesize } from "./speech";
import { endCall, heardOnCall, registerCall, updateCall } from "./live";
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
const QUIET_WINDOW_S = 15;
const QUIET_RMS = 120;

export interface BridgeOptions {
  waitMs?: number;
  pollMs?: number;
}

const START_DEADLINE_MS = 5000;
const MAX_CALL_MS = Number(process.env.CHARTSIDE_MAX_CALL_MIN || 90) * 60_000;
const MAX_SIM_CALL_MS = Number(process.env.CHARTSIDE_MAX_SIM_CALL_MIN || 20) * 60_000;

export function handleMediaStream(ws: WebSocket, opts: BridgeOptions = {}) {
  const startDeadline = setTimeout(() => {
    if (!call) ws.close(1008, "no start");
  }, START_DEADLINE_MS);
  let wallClock: NodeJS.Timeout | null = null;
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
  let limitFired = false;
  let quietChecked = false;
  let heardWhileRecording = false;
  let quietSamples = 0;
  let quietSum = 0;
  const digits: string[] = [];
  let draining = false;
  const drainDigits = async () => {
    draining = true;
    try {
      while (digits.length && call && !hungUp) {
        const c = call;
        for (let i = 0; i < 1200 && c.isBusy && !hungUp; i++) await new Promise((r) => setTimeout(r, 50));
        const d = digits.shift()!;
        await c.onDigit(d).catch((err) => console.error("phone digit failed", err));
        emitState();
      }
    } finally {
      draining = false;
    }
  };
  const capSeconds = recordingMinutesFromEnv() * 60;
  let lastState = "";

  let liveSid = "";
  const emitState = () => {
    if (!call || call.state === lastState) return;
    lastState = call.state;
    if (liveSid) updateCall(liveSid, { state: call.state, encounterId: session?.encounterId() ?? null });
    if (sim) send({ event: "chartside.state", streamSid, state: call.state });
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
    clearTimeout(startDeadline);
    if (wallClock) clearTimeout(wallClock);
    if (liveSid) endCall(liveSid);
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
      clearTimeout(startDeadline);
      try {
        session = await phoneSession(claims, opts);
      } catch (err) {
        console.error("phone session failed", err);
        ws.close(1011, "session");
        return;
      }
      if (hungUp) return;
      call = new ScribeCall({ ...session.deps, say, hangup });
      const limitMs = claims.sim || claims.guest ? Math.min(MAX_SIM_CALL_MS, MAX_CALL_MS) : MAX_CALL_MS;
      const endingCall = call;
      wallClock = setTimeout(() => {
        void endingCall
          .onLimit()
          .catch(() => undefined)
          .finally(() => setTimeout(() => ws.close(1000, "call length limit"), 60_000));
      }, limitMs);
      liveSid = claims.callSid;
      const c = call;
      registerCall({
        callSid: liveSid,
        userId: claims.userId,
        startedAt: Date.now(),
        state: c.state,
        encounterId: null,
        lines: [],
        control: async (action) => {
          interrupt();
          const done = c
            .remote(action)
            .then(emitState)
            .catch((err) => console.error("phone remote failed", err));
          await Promise.race([done, new Promise((r) => setTimeout(r, 1200))]);
          emitState();
        },
      });
      listener = new LiveListener((text) => {
        if (Date.now() < speakingUntil) return;
        if (sim) send({ event: "chartside.heard", streamSid, text });
        if (call?.state === "recording") {
          heardOnCall(liveSid, text);
          heardWhileRecording = true;
        }
        void call
          ?.onTranscript(text)
          .then(emitState)
          .catch((err) => console.error("phone transcript failed", err));
      }, (err) => console.error("phone listen failed", err.message), `call-${claims.callSid}`);
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
        if (session.recordedSeconds() === 0) {
          quietChecked = false;
          quietSamples = 0;
          quietSum = 0;
          heardWhileRecording = false;
        }
        const pcm = mulawDecode(bytes);
        session.pushAudio(pcm);
        if (!quietChecked) {
          for (let i = 0; i < pcm.length; i++) quietSum += pcm[i] * pcm[i];
          quietSamples += pcm.length;
          if (quietSamples >= 8000 * QUIET_WINDOW_S) {
            quietChecked = true;
            if (Math.sqrt(quietSum / quietSamples) < QUIET_RMS && !heardWhileRecording) {
              const c = call;
              void c
                .onQuiet()
                .then(emitState)
                .catch((err) => console.error("phone quiet check failed", err));
            }
          }
        }
        if (limitFired && session.recordedSeconds() < capSeconds) limitFired = false;
        if (!limitFired && session.recordedSeconds() >= capSeconds) {
          limitFired = true;
          const c = call;
          void c
            .onLimit()
            .then(emitState)
            .catch((err) => console.error("phone limit failed", err));
        }
      }
      return;
    }
    if (msg.event === "dtmf" && msg.dtmf) {
      if (!/^[0-9*#]$/.test(String(msg.dtmf.digit)) || digits.length >= 24) return;
      digits.push(msg.dtmf.digit);
      interrupt();
      if (!draining) void drainDigits();
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
