"use client";

import { useEffect, useState } from "react";

interface Live {
  callSid: string;
  seconds: number;
  state: string;
  encounterId: string | null;
  lines: string[];
}

const LABEL: Record<string, string> = { greeting: "Connecting", pin: "Entering PIN", confirmPatient: "Confirming patient", consent: "Waiting for consent", recording: "Recording", paused: "Paused", drafting: "Writing the note", review: "Reading the note back" };

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function LiveCallBanner() {
  const [calls, setCalls] = useState<Live[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    const poll = async () => {
      const r = await fetch("/api/voice/live", { cache: "no-store" }).catch(() => null);
      if (stop) return;
      if (r?.status === 401) return;
      if (r?.ok) setCalls(((await r.json()) as { calls: Live[] }).calls);
      timer = window.setTimeout(poll, 3000);
    };
    void poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, []);

  const act = async (sid: string, action: "pause" | "resume" | "end") => {
    setBusy(action);
    await fetch(`/api/voice/live/${encodeURIComponent(sid)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    setBusy(null);
  };

  if (!calls.length) return null;
  return (
    <div className="space-y-2" data-testid="live-calls">
      {calls.map((c) => (
        <section key={c.callSid} className="rounded-xl border border-rec/30 bg-rec-50 px-4 py-3 text-sm text-ink shadow-lg" aria-live="polite" data-testid="live-call" data-state={c.state}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 font-medium">
              <span className={`h-2.5 w-2.5 rounded-full ${c.state === "recording" ? "animate-pulse bg-rec" : "bg-ink-4"}`} aria-hidden />
              On a call · {LABEL[c.state] ?? c.state} · <span className="font-mono">{clock(c.seconds)}</span>
            </span>
            {(c.state === "recording" || c.state === "paused") && (
              <span className="ml-auto flex gap-2">
                {c.state === "recording" ? (
                  <button className="btn-outline py-1" disabled={!!busy} onClick={() => act(c.callSid, "pause")} data-testid="live-pause">Pause</button>
                ) : (
                  <button className="btn-outline py-1" disabled={!!busy} onClick={() => act(c.callSid, "resume")} data-testid="live-resume">Resume</button>
                )}
                <button className="btn-danger py-1" disabled={!!busy} onClick={() => act(c.callSid, "end")} data-testid="live-end">End visit</button>
              </span>
            )}
          </div>
          {c.lines.length > 0 && (
            <p className="mt-2 line-clamp-2 text-xs text-ink-2" data-testid="live-lines">
              {c.lines.slice(-2).join(" ")}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
