"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneAudio, fromB64, toB64 } from "./phoneAudio";

type CallState = "idle" | "connecting" | "greeting" | "pin" | "confirmPatient" | "consent" | "recording" | "paused" | "drafting" | "review" | "ended";
type Text = { to: string; body: string; at: string };
type Tab = "phone" | "messages";

const STATUS: Record<CallState, string> = {
  idle: "",
  connecting: "Calling…",
  greeting: "Chartside is on the line",
  pin: "Enter your PIN",
  confirmPatient: "Confirming your patient",
  consent: "Waiting for patient consent",
  recording: "Listening to your visit",
  paused: "Paused",
  drafting: "Writing your note…",
  review: "Reading your note back",
  ended: "Call ended",
};

const HINTS: Partial<Record<CallState, string[]>> = {
  pin: ["Enter your PIN, then #", "Press * to skip"],
  confirmPatient: ["Say “yes”, or press 1", "Say “no”, or press 0"],
  consent: ["Patient agreed? Say “they agreed” or press 2", "Press 3 to have Chartside ask them, 9 in Spanish", "Declined? Press 0"],
  recording: ["Talk with your patient normally", "Say “Chartside, end visit” or press 5", "Press 4 to pause"],
  paused: ["Say “Chartside, resume” or press 2"],
  drafting: ["Stay on to hear it, or hang up and get a text"],
  review: ["Say “ready” or press 1", "Ask for a change: “make the plan shorter”", "Hang up and we'll text you"],
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function linkify(body: string) {
  const parts = body.split(/(https?:\/\/\S+)/);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all underline" data-testid="sim-text-link">
        {p.replace(/^https?:\/\//, "").slice(0, 38)}…
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function PhoneSim({ lineNumber, signedInAs }: { lineNumber: string; signedInAs: string | null }) {
  const [tab, setTab] = useState<Tab>("phone");
  const [state, setState] = useState<CallState>("idle");
  const [caption, setCaption] = useState<string>("");
  const [heard, setHeard] = useState<string>("");
  const [secs, setSecs] = useState(0);
  const [keypad, setKeypad] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [texts, setTexts] = useState<Text[]>([]);
  const [unread, setUnread] = useState(0);
  const [sample, setSample] = useState<{ pos: number; total: number } | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const audio = useRef<PhoneAudio | null>(null);
  const streamSid = useRef("");
  const inbox = useRef<{ key: string; phone: string } | null>(null);
  const sampleRef = useRef<{ bytes: Uint8Array; pos: number; timer: number | null } | null>(null);
  const seen = useRef(0);

  const send = useCallback((o: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(o));
  }, []);

  const stopSample = useCallback(() => {
    const s = sampleRef.current;
    if (s?.timer) window.clearInterval(s.timer);
    sampleRef.current = null;
    setSample(null);
    if (audio.current) audio.current.micBlocked = false;
  }, []);

  const cleanup = useCallback(() => {
    stopSample();
    audio.current?.stop();
    audio.current = null;
    ws.current = null;
    setLevel(0);
  }, [stopSample]);

  const hangUp = useCallback(() => {
    send({ event: "stop", streamSid: streamSid.current });
    ws.current?.close();
    cleanup();
    setState("ended");
    setKeypad(false);
  }, [cleanup, send]);

  useEffect(() => {
    if (state === "idle" || state === "ended" || state === "connecting") return;
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  useEffect(() => {
    const poll = async () => {
      if (!inbox.current) return;
      const r = await fetch(`/api/voice/sim/messages?key=${encodeURIComponent(inbox.current.key)}`).catch(() => null);
      if (!r?.ok) return;
      const j = (await r.json()) as { messages: Text[] };
      setTexts(j.messages);
      if (j.messages.length > seen.current) {
        setUnread((u) => u + j.messages.length - seen.current);
        seen.current = j.messages.length;
      }
    };
    const t = window.setInterval(poll, 2500);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const dial = async () => {
    setError(null);
    setCaption("");
    setHeard("");
    setSecs(0);
    setState("connecting");
    try {
      const r = await fetch("/api/voice/sim/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone: inbox.current?.phone }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't place the call");
      inbox.current = { key: j.inboxKey, phone: j.phone };
      const a = new PhoneAudio(
        (frame) => {
          if (sampleRef.current) return;
          send({ event: "media", streamSid: streamSid.current, media: { track: "inbound", payload: toB64(frame) } });
        },
        (l) => setLevel(l),
      );
      audio.current = a;
      await a.start();
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const sock = new WebSocket(`${proto}://${location.host}${j.streamPath}`);
      ws.current = sock;
      streamSid.current = `MZsim${Date.now().toString(16)}`;
      sock.onopen = () => {
        send({ event: "connected", protocol: "Call", version: "1.0.0" });
        send({ event: "start", streamSid: streamSid.current, start: { streamSid: streamSid.current, callSid: j.callSid, customParameters: { callToken: j.callToken }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
        setState("greeting");
      };
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string);
        if (m.event === "media") audio.current?.play(fromB64(m.media.payload));
        else if (m.event === "clear") audio.current?.clear();
        else if (m.event === "mark") audio.current?.whenPlayed(() => send({ event: "mark", streamSid: streamSid.current, mark: { name: m.mark.name } }));
        else if (m.event === "chartside.caption") setCaption(m.text);
        else if (m.event === "chartside.heard") setHeard(m.text);
        else if (m.event === "chartside.state") setState(m.state);
      };
      sock.onclose = () => {
        const wait = audio.current?.speaking ? 1500 : 0;
        window.setTimeout(() => {
          cleanup();
          setState((s) => (s === "idle" ? s : "ended"));
          setKeypad(false);
        }, wait);
      };
    } catch (err) {
      cleanup();
      setState("idle");
      setError(err instanceof Error && /Permission|NotAllowed/i.test(err.message + err.name) ? "Allow the microphone to call the line." : err instanceof Error ? err.message : "Couldn't place the call");
    }
  };

  const press = (d: string) => {
    send({ event: "dtmf", streamSid: streamSid.current, dtmf: { track: "inbound_track", digit: d } });
  };

  const playSample = async () => {
    if (sampleRef.current) return;
    const r = await fetch("/demo/sample-visit.ulaw");
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (audio.current) audio.current.micBlocked = true;
    const s = { bytes, pos: 0, timer: null as number | null };
    sampleRef.current = s;
    setSample({ pos: 0, total: bytes.length });
    s.timer = window.setInterval(() => {
      const cur = sampleRef.current;
      if (!cur) return;
      const chunk = cur.bytes.subarray(cur.pos, cur.pos + 1600);
      if (!chunk.length) {
        stopSample();
        return;
      }
      for (let off = 0; off < chunk.length; off += 160) send({ event: "media", streamSid: streamSid.current, media: { track: "inbound", payload: toB64(chunk.subarray(off, off + 160)) } });
      audio.current?.play(chunk, 0.8);
      cur.pos += chunk.length;
      setSample({ pos: cur.pos, total: cur.bytes.length });
    }, 200);
  };

  const skipSample = () => {
    const cur = sampleRef.current;
    if (!cur) return;
    const rest = cur.bytes.subarray(cur.pos);
    for (let off = 0; off < rest.length; off += 160) send({ event: "media", streamSid: streamSid.current, media: { track: "inbound", payload: toB64(rest.subarray(off, off + 160)) } });
    stopSample();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audio.current) audio.current.muted = next;
  };

  const inCall = state !== "idle" && state !== "ended";
  const hints = HINTS[state] ?? [];

  return (
    <div className="mx-auto w-full max-w-[400px]" data-testid="phone-sim">
      <div className="relative overflow-hidden rounded-[44px] border-[10px] border-[#11161f] bg-[#0b0f16] text-white shadow-2xl" style={{ height: 760 }}>
        <div className="absolute left-1/2 top-2 z-10 h-6 w-28 -translate-x-1/2 rounded-full bg-black" aria-hidden />
        <div className="flex items-center justify-between px-7 pt-3 text-[12px] font-semibold text-white/80" aria-hidden>
          <span>9:41</span>
          <span>5G ▮▮▮</span>
        </div>

        {tab === "phone" && !inCall && (
          <div className="flex h-[640px] flex-col items-center px-6 pt-10">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#15a38b] to-[#0f6b5c] text-4xl font-semibold" aria-hidden>
              C
            </div>
            <h2 className="mt-4 text-2xl font-semibold">Chartside</h2>
            <p className="mt-1 text-sm text-white/60">{lineNumber} · your scribe</p>
            {state === "ended" && <p className="mt-3 text-sm text-white/70" data-testid="sim-ended">Call ended · {clock(secs)}</p>}
            {signedInAs ? <p className="mt-2 text-xs text-white/65">Calling as {signedInAs}</p> : <p className="mt-2 text-xs text-white/65">No account needed. Your first note is free.</p>}
            <button onClick={dial} className="mt-10 flex h-20 w-20 items-center justify-center rounded-full bg-[#2fbf61] text-3xl shadow-lg transition hover:scale-105 active:scale-95" aria-label="Call Chartside" data-testid="sim-call">
              <PhoneIcon />
            </button>
            <p className="mt-3 text-sm text-white/70">{state === "ended" ? "Call again" : "Call"}</p>
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-center text-sm text-[#ffb4ae]">
                {error}
              </p>
            )}
            <ol className="mt-auto mb-2 w-full space-y-2 text-[13px] text-white/70">
              <li className="flex gap-2"><span className="text-white/65">1</span>Call, set the phone down, see your patient.</li>
              <li className="flex gap-2"><span className="text-white/65">2</span>Hang up, or say “Chartside, end visit”.</li>
              <li className="flex gap-2"><span className="text-white/65">3</span>Tap the text. Your note is waiting.</li>
            </ol>
          </div>
        )}

        {tab === "phone" && inCall && (
          <div className="flex h-[664px] flex-col items-center px-6 pb-14 pt-8" data-testid="sim-incall" data-state={state}>
            <div className="flex w-full min-h-0 flex-1 flex-col items-center overflow-y-auto">
            <p className="text-sm text-white/60">{state === "connecting" ? "Calling" : clock(secs)}</p>
            <h2 className="mt-1 text-2xl font-semibold">Chartside</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-white/80" data-testid="sim-status">
              {state === "recording" && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff5a4f]" aria-hidden />}
              {STATUS[state]}
            </p>

            <div className="mt-5 min-h-[112px] w-full rounded-2xl bg-white/10 p-3 text-[14px] leading-snug" aria-live="polite" data-testid="sim-caption">
              {caption ? caption : <span className="text-white/65">Connecting…</span>}
            </div>
            {heard && (
              <p className="mt-2 w-full text-right text-[12px] italic text-white/65" data-testid="sim-heard">
                You: “{heard}”
              </p>
            )}

            {state === "recording" && (
              <div className="mt-3 w-full">
                {sample ? (
                  <div className="rounded-xl bg-white/10 p-3 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span>Playing a sample visit</span>
                      <button onClick={skipSample} className="rounded-full bg-white/15 px-3 py-1 text-xs hover:bg-white/25" data-testid="sim-sample-skip">
                        Skip to end
                      </button>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full bg-[#2fbf61]" style={{ width: `${Math.round((sample.pos / sample.total) * 100)}%` }} />
                    </div>
                  </div>
                ) : (
                  <button onClick={playSample} className="w-full rounded-xl border border-white/20 px-3 py-2.5 text-[13px] hover:bg-white/10" data-testid="sim-sample">
                    No patient handy? Play a sample visit
                  </button>
                )}
              </div>
            )}

            {hints.length > 0 && (
              <ul className="mt-3 w-full space-y-1 text-[12px] text-white/60" data-testid="sim-hints">
                {hints.map((h) => (
                  <li key={h}>• {h}</li>
                ))}
              </ul>
            )}

            </div>
            <div className="w-full shrink-0 pt-3">
              {keypad ? (
                <div className="grid grid-cols-3 gap-3 px-4" data-testid="sim-keypad">
                  {KEYS.map((k) => (
                    <button key={k} onClick={() => press(k)} className="h-14 rounded-full bg-white/15 text-xl font-medium hover:bg-white/25 active:bg-white/35" aria-label={`Key ${k}`}>
                      {k}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mb-4 flex h-10 items-end justify-center gap-1" aria-hidden>
                  {Array.from({ length: 9 }).map((_, i) => (
                    <span key={i} className="w-1.5 rounded-full bg-white/60 transition-all" style={{ height: `${8 + level * 32 * (1 - Math.abs(4 - i) / 5)}px` }} />
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-around">
                <button onClick={toggleMute} className={`flex h-14 w-14 items-center justify-center rounded-full text-xs ${muted ? "bg-white text-black" : "bg-white/15"}`} aria-pressed={muted} data-testid="sim-mute">
                  {muted ? "Muted" : "Mute"}
                </button>
                <button onClick={hangUp} className="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff3b30] shadow-lg hover:scale-105" aria-label="End call" data-testid="sim-hangup">
                  <PhoneIcon down />
                </button>
                <button onClick={() => setKeypad((k) => !k)} className={`flex h-14 w-14 items-center justify-center rounded-full text-xs ${keypad ? "bg-white text-black" : "bg-white/15"}`} aria-pressed={keypad} data-testid="sim-keypad-toggle">
                  Keypad
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "messages" && (
          <div className="flex h-[640px] flex-col px-4 pt-4" data-testid="sim-messages">
            <h2 className="text-center text-sm font-semibold">Chartside</h2>
            <p className="text-center text-[11px] text-white/65">Text message</p>
            <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
              {texts.length === 0 && <p className="mt-10 text-center text-sm text-white/65">After your call, a link to your note shows up here. It never contains patient details.</p>}
              {texts.map((t, i) => (
                <div key={i} className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/15 px-3 py-2 text-[14px] leading-snug" data-testid="sim-text">
                  {linkify(t.body)}
                </div>
              ))}
            </div>
          </div>
        )}

        <nav className="absolute bottom-0 left-0 right-0 flex border-t border-white/10 bg-black/40 text-[12px] backdrop-blur">
          <button onClick={() => setTab("phone")} className={`flex-1 py-3 ${tab === "phone" ? "text-white" : "text-white/65"}`} aria-current={tab === "phone"} data-testid="sim-tab-phone">
            Phone
          </button>
          <button
            onClick={() => {
              setTab("messages");
              setUnread(0);
            }}
            className={`relative flex-1 py-3 ${tab === "messages" ? "text-white" : "text-white/65"}`}
            aria-current={tab === "messages"}
            data-testid="sim-tab-messages"
          >
            Messages
            {unread > 0 && (
              <span className="absolute right-[30%] top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] text-white" data-testid="sim-unread">
                {unread}
              </span>
            )}
          </button>
        </nav>
      </div>
    </div>
  );
}

function PhoneIcon({ down = false }: { down?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden style={down ? { transform: "rotate(135deg)" } : undefined}>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}
