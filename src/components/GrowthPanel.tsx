"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Kpi, Spinner } from "./ui";

interface Metrics {
  scope: "org" | "all";
  operator: boolean;
  windowDays: number;
  funnel: { loop: string; exposure: number; click: number; signup: number; activation: number }[];
  k: { loop: string; week: string; inviters: number; signups: number; k: number | null }[];
  ttfv: { medianSeconds: number | null; users: number };
  activation: { signups: number; activated: number; rate: number | null; rule: string };
}

const LABELS: Record<string, string> = { referral: "Referral link", share: "Shared note footer", receipt: "Weekly receipt", invite: "Invite after 3rd note", recap: "Patient recap footer", text: "Texted the line", line: "Line landing page", phone_guest: "First call (phone guest)", go_guest: "Try on the web (guest)", direct: "Direct" };

const dur = (s: number | null) => (s === null ? "–" : s < 120 ? `${s}s` : `${Math.round(s / 60)}m`);

export default function GrowthPanel() {
  const [scope, setScope] = useState<"org" | "all">("org");
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setM(null);
    api<Metrics>(`/admin/growth${scope === "all" ? "?scope=all" : ""}`).then(setM).catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [scope]);

  if (error) return <p className="mt-4 text-sm text-rec" role="alert">{error}</p>;
  if (!m) return <p className="mt-4 flex items-center gap-2 text-sm text-ink-3"><Spinner /> Loading growth metrics…</p>;
  const weeks = [...new Set(m.k.map((x) => x.week))];
  const kLoops = [...new Set(m.k.map((x) => x.loop))];
  return (
    <div className="mt-4 space-y-5" data-testid="growth-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-3">Last {m.windowDays} days · {m.scope === "all" ? "all organizations" : "loops started by your organization"}. No patient data is counted here.</p>
        {m.operator && <button className="btn-outline text-sm" onClick={() => setScope(scope === "all" ? "org" : "all")} data-testid="growth-scope">{scope === "all" ? "Show my organization" : "Show all organizations"}</button>}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Time to first note" value={<span data-testid="growth-ttfv">{dur(m.ttfv.medianSeconds)}</span>} hint={`median, first capture to note ready (${m.ttfv.users} clinicians)`} />
        <Kpi label="Activation" value={<span data-testid="growth-activation">{m.activation.rate === null ? "–" : `${m.activation.rate}%`}</span>} hint={`${m.activation.activated} of ${m.activation.signups} · ${m.activation.rule}`} tone="brand" />
        <Kpi label="Signups" value={m.funnel.reduce((n, f) => n + f.signup, 0)} />
        <Kpi label="Clicks" value={m.funnel.reduce((n, f) => n + f.click, 0)} />
      </div>
      <section className="card overflow-x-auto p-4">
        <h2 className="font-semibold">Funnel by loop</h2>
        <table className="mt-2 w-full text-sm" data-testid="growth-funnel">
          <thead><tr className="text-left text-ink-3"><th className="py-1 font-medium">Loop</th><th className="font-medium">Seen</th><th className="font-medium">Clicked</th><th className="font-medium">Signed up</th><th className="font-medium">Activated</th></tr></thead>
          <tbody>
            {!m.funnel.length && <tr><td colSpan={5} className="py-2 text-ink-3">No loop activity yet.</td></tr>}
            {m.funnel.map((f) => <tr key={f.loop} className="border-t border-line" data-testid="growth-row" data-loop={f.loop}><td className="py-1.5">{LABELS[f.loop] ?? f.loop}</td><td>{f.exposure}</td><td>{f.click}</td><td>{f.signup}</td><td>{f.activation}</td></tr>)}
          </tbody>
        </table>
      </section>
      <section className="card overflow-x-auto p-4">
        <h2 className="font-semibold">K per loop</h2>
        <p className="text-xs text-ink-3">Signups per active inviter, by week. Above 1.0, a loop grows on its own.</p>
        <table className="mt-2 w-full text-sm" data-testid="growth-k">
          <thead><tr className="text-left text-ink-3"><th className="py-1 font-medium">Loop</th>{weeks.map((w) => <th key={w} className="font-medium">Week of {w.slice(5)}</th>)}</tr></thead>
          <tbody>
            {!kLoops.length && <tr><td colSpan={weeks.length + 1} className="py-2 text-ink-3">No inviter activity yet.</td></tr>}
            {kLoops.map((l) => <tr key={l} className="border-t border-line"><td className="py-1.5">{LABELS[l] ?? l}</td>{weeks.map((w) => { const c = m.k.find((x) => x.loop === l && x.week === w); return <td key={w}>{c?.k === null || !c ? "–" : c.k.toFixed(2)}</td>; })}</tr>)}
          </tbody>
        </table>
      </section>
    </div>
  );
}
