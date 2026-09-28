"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Kpi, Spinner } from "./ui";

type Plan = { tier: "trial" | "pro" | "enterprise"; seats: number | null; used: number; pending: number; daysLeft: number | null; monthly: number | null; startedAt: string };
type Usage = { month: string; drafted: number; signed: number; audioMinutes: number; activeClinicians: number; byClinician: { name: string; signed: number }[] };

const TIER = { trial: "Free trial", pro: "Pro", enterprise: "Enterprise" } as const;

export default function PlanPanel({ isOwner }: { isOwner: boolean }) {
  const [d, setD] = useState<{ plan: Plan; usage: Usage; pricePerSeat: number } | null>(null);
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    api<{ plan: Plan; usage: Usage; pricePerSeat: number }>("/admin/plan").then((r) => { setD(r); setSeats(Math.max(r.plan.used, r.plan.seats ?? r.plan.used)); });
  }, []);
  if (!d) return <div className="mt-6 flex justify-center text-brand"><Spinner /></div>;
  const p = d.plan;
  async function change(tier: "pro" | "enterprise") {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ plan: Plan }>("/admin/plan", { method: "PUT", body: { tier, seats } });
      setD({ ...d!, plan: r.plan });
      setMsg(tier === "enterprise" ? "Switched to Enterprise." : `Pro with ${r.plan.seats} seats.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not change the plan");
    }
    setBusy(false);
  }
  return (
    <div className="mt-5 space-y-5" data-testid="plan-panel">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Plan" value={TIER[p.tier]} tone="brand" hint={p.tier === "trial" && p.daysLeft !== null ? `${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left` : p.monthly !== null ? `$${p.monthly.toLocaleString("en-US")} per month` : "Annual contract"} />
        <Kpi label="Clinician seats" value={p.seats === null ? `${p.used} of unlimited` : `${p.used} of ${p.seats}`} tone={p.seats !== null && p.used + p.pending >= p.seats ? "warn" : "ink"} hint={p.pending ? `${p.pending} pending invite${p.pending === 1 ? "" : "s"}` : "Scribes, nurses, coders, and viewers are free"} />
        <Kpi label={`Notes signed, ${d.usage.month}`} value={d.usage.signed} hint={`${d.usage.drafted} drafted`} />
        <Kpi label="Recorded minutes" value={d.usage.audioMinutes} hint={`${d.usage.activeClinicians} active clinician${d.usage.activeClinicians === 1 ? "" : "s"}`} />
      </div>
      {isOwner && (
        <div className="card p-4" data-testid="plan-change">
          <p className="text-sm font-semibold">Change plan</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block"><span className="label">Pro seats</span><input type="number" min={p.used} max={500} className="input w-28" value={seats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="plan-seats" /></label>
            <button className="btn-primary" disabled={busy} onClick={() => change("pro")} data-testid="plan-pro">{busy ? <Spinner /> : null} {p.tier === "pro" ? "Update seats" : "Switch to Pro"} (${(seats * d.pricePerSeat).toLocaleString("en-US")}/month)</button>
            {p.tier !== "enterprise" && <button className="btn-outline" disabled={busy} onClick={() => change("enterprise")} data-testid="plan-enterprise">Enterprise (unlimited seats)</button>}
          </div>
          <p className="mt-2 text-xs text-ink-3">${d.pricePerSeat} per clinician seat per month. Enterprise adds unlimited seats under an annual agreement. Payment collection isn&apos;t connected in this build.</p>
          {msg && <p className="mt-2 text-sm text-ink-2" data-testid="plan-msg">{msg}</p>}
        </div>
      )}
      {d.usage.byClinician.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-semibold">Signed notes by clinician this month</p>
          <ul className="mt-2 space-y-1 text-sm">{d.usage.byClinician.map((c) => <li key={c.name} className="flex justify-between"><span>{c.name}</span><span className="font-mono text-xs">{c.signed}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
