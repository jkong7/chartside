"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Kpi, Spinner } from "./ui";

interface LineData {
  operator: boolean;
  scope: "org" | "all";
  config: { number: string | null; publicUrl: string | null; voiceUrl: string | null; smsUrl: string | null; checks: Record<"speech" | "twilio" | "publicUrl" | "notes" | "cron", boolean> };
  roster: { userId: string; name: string; role: string; phone: string | null; pin: boolean; calls: number; lastCall: string | null; ready: boolean }[];
  stats: { days: number; calls: number; simCalls: number; consented: number; declined: number; readyOnCall: number; texted: number; agentTurns: number; textReplies: number; nudges: number; drafted: number; failed: number; byChannel: Record<string, number> };
}

const CHECKS: { key: keyof LineData["config"]["checks"]; label: string; fix: string }[] = [
  { key: "speech", label: "Speech (Deepgram)", fix: "Set DEEPGRAM_API_KEY" },
  { key: "notes", label: "Notes (Claude)", fix: "Set ANTHROPIC_API_KEY, or notes use the on-device engine" },
  { key: "publicUrl", label: "Public https address", fix: "Set CHARTSIDE_PUBLIC_URL" },
  { key: "twilio", label: "Twilio account", fix: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM" },
  { key: "cron", label: "End-of-clinic texts", fix: "Set CHARTSIDE_CRON_SECRET and schedule POST /api/cron/nudges hourly" },
];

const CHANNELS: Record<string, string> = { phone: "Phone line", "phone-sim": "Browser phone", go: "One-tap web", extension: "EHR side panel", shortcut: "iPhone Shortcut", token: "API or device key", session: "Web app" };

export default function LinePanel() {
  const [d, setD] = useState<LineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [scope, setScope] = useState<"org" | "all">("org");

  const load = useCallback(() => {
    api<LineData>(`/admin/line${scope === "all" ? "?scope=all" : ""}`).then(setD).catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [scope]);

  useEffect(load, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await api<{ connected: { number: string } }>("/admin/line", { body: { number } });
      setDone(`${r.connected.number} now answers with Chartside. Voice and text webhooks are set.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the number");
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">{error ? <span role="alert" className="text-rec">{error}</span> : <><Spinner /> Loading the line…</>}</p>;
  const s = d.stats;
  const ready = d.config.checks.speech && d.config.checks.twilio && d.config.checks.publicUrl;
  return (
    <div className="mt-4 space-y-5" data-testid="line-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">The phone line, texts, and every quick-capture door. Last {s.days} days · {d.scope === "all" ? "all organizations" : "your organization"}.</p>
        {d.operator && <button className="btn-outline text-sm" onClick={() => setScope(scope === "all" ? "org" : "all")} data-testid="line-scope">{scope === "all" ? "Show my organization" : "Show all organizations"}</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Calls" value={<span data-testid="line-calls">{s.calls}</span>} hint={`${s.simCalls} from the browser phone`} />
        <Kpi label="Consented" value={s.consented} hint={`${s.declined} declined, nothing kept`} tone="ok" />
        <Kpi label="Marked ready on a call" value={s.readyOnCall} hint={`${s.agentTurns} spoken requests`} tone="brand" />
        <Kpi label="Texts" value={s.texted + s.textReplies + s.nudges} hint={`${s.texted} note links · ${s.textReplies} replies · ${s.nudges} nudges`} />
      </div>
      <section className="card p-4">
        <h2 className="font-semibold">Where visits came in</h2>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" data-testid="line-channels">
          {!Object.keys(s.byChannel).length && <li className="text-ink-3">No quick captures yet.</li>}
          {Object.entries(s.byChannel)
            .sort((a, b) => b[1] - a[1])
            .map(([ch, n]) => (
              <li key={ch} className="flex justify-between border-b border-line py-1" data-channel={ch}>
                <span>{CHANNELS[ch] ?? ch}</span>
                <span className="font-mono">{n}</span>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-xs text-ink-3">{s.drafted} notes drafted · {s.failed} failed</p>
      </section>
      <section className="card overflow-x-auto p-4">
        <h2 className="font-semibold">Your team on the line</h2>
        <p className="text-xs text-ink-3">Each clinician verifies their phone and sets a PIN once in Chartside settings. Then they just call.</p>
        <table className="mt-2 w-full text-sm" data-testid="line-roster">
          <thead>
            <tr className="text-left text-ink-3"><th className="py-1 font-medium">Name</th><th className="font-medium">Phone</th><th className="font-medium">PIN</th><th className="font-medium">Calls</th><th className="font-medium"><span className="sr-only">Invite</span></th></tr>
          </thead>
          <tbody>
            {d.roster.map((m) => (
              <tr key={m.userId} className="border-t border-line" data-testid="line-member" data-ready={m.ready}>
                <td className="py-1.5">{m.name}<span className="ml-1 text-xs text-ink-3">{m.role}</span></td>
                <td className="font-mono text-xs">{m.phone ?? <span className="text-warn">not verified</span>}</td>
                <td>{m.pin ? <span className="text-ok">set</span> : <span className="text-ink-3">not set</span>}</td>
                <td>{m.calls}</td>
                <td className="text-right">
                  {!m.ready && (
                    <a className="text-xs font-medium text-brand underline" href={`sms:?&body=${encodeURIComponent(`Set up the Chartside line in two minutes: verify your phone and pick a PIN at ${d.config.publicUrl ?? ""}/go/settings. Then just call before a visit.`)}`} data-testid="line-invite">
                      Text setup link
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card p-4">
        <h2 className="font-semibold">Setup</h2>
        <ul className="mt-2 space-y-1.5 text-sm" data-testid="line-checks">
          {CHECKS.map((c) => (
            <li key={c.key} className="flex items-start gap-2" data-check={c.key} data-ok={d.config.checks[c.key]}>
              <span className={d.config.checks[c.key] ? "text-ok" : "text-warn"} aria-hidden>{d.config.checks[c.key] ? "✓" : "!"}</span>
              <span>
                {c.label}
                {!d.config.checks[c.key] && <span className="block text-xs text-ink-3">{c.fix}</span>}
              </span>
            </li>
          ))}
        </ul>
        {d.config.voiceUrl && (
          <dl className="mt-3 grid gap-1 text-xs text-ink-2">
            <div><dt className="inline font-medium">Voice webhook: </dt><dd className="inline font-mono">{d.config.voiceUrl}</dd></div>
            <div><dt className="inline font-medium">Messaging webhook: </dt><dd className="inline font-mono">{d.config.smsUrl}</dd></div>
          </dl>
        )}
        {d.operator ? (
          <div className="mt-4">
            <label className="label" htmlFor="line-number">Twilio number to answer with Chartside</label>
            <div className="flex flex-wrap gap-2">
              <input id="line-number" className="input max-w-xs" placeholder="+13125550199" value={number} onChange={(e) => setNumber(e.target.value)} data-testid="line-number-input" />
              <button className="btn-primary" disabled={busy || !number || !ready} onClick={connect} data-testid="line-connect">{busy ? "Connecting…" : "Point it at Chartside"}</button>
            </div>
            {!ready && <p className="mt-1 text-xs text-ink-3">Speech, a public https address and Twilio need to be set first.</p>}
          </div>
        ) : (
          <p className="mt-3 text-xs text-ink-3">A Chartside operator connects the phone number for this deployment.</p>
        )}
        {done && <p className="mt-2 text-sm text-ok" role="status" data-testid="line-connected">{done}</p>}
        {error && <p className="mt-2 text-sm text-rec" role="alert">{error}</p>}
      </section>
    </div>
  );
}
