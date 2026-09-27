"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { revenueSummary } from "@/lib/server/revenue";
import { ClaimStatus } from "./workspace/BillingPanel";
import { Kpi, Tabs } from "./ui";

type Data = Awaited<ReturnType<typeof revenueSummary>>;

const CATEGORY: Record<string, string> = {
  em_level: "E/M level supported by time",
  addon: "Add-on codes (G2211)",
  screening: "Screening instruments",
  counseling: "Counseling services",
  hcc: "Risk adjustment (HCC) suspects",
  preventive: "Preventive / wellness visits due",
  specificity: "Diagnosis specificity",
  part_d: "Part D vaccines to bill outside Part B",
  prolonged: "Prolonged services",
};

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RevenueView({ data }: { data: Data }) {
  const [tab, setTab] = useState<"queue" | "denials" | "ar" | "leakage" | "pa">("queue");
  const [filter, setFilter] = useState<string>("all");
  const rows = useMemo(() => data.rows.filter((r) => filter === "all" || r.status === filter), [data.rows, filter]);
  const s = (k: string) => data.byStatus[k] ?? { count: 0, charges: 0 };
  const paOpen = data.priorAuth.filter((p) => p.submission === "draft" || p.submission === "submitted");
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Revenue</h1>
      <p className="mt-1 text-sm text-ink-2">Claims are built from signed notes and accepted orders, validated against official ICD-10-CM, HCPCS, Medicare fee schedule, and CMS edit data, and tracked from pre-bill review through payment.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="revenue-kpis">
        <Kpi label="Needs review" value={s("needs_review").count} hint={money(s("needs_review").charges)} tone={s("needs_review").count ? "warn" : "ink"} />
        <Kpi label="Ready / approved" value={s("ready").count + s("approved").count} hint={money(s("ready").charges + s("approved").charges)} tone="brand" />
        <Kpi label="Collected" value={money(data.kpis.collected)} hint={`of ${money(data.kpis.expectedAllowed)} expected allowed`} tone="ok" />
        <Kpi label="Missed revenue found" value={money(data.totals.leakageValue)} hint={`${Object.values(data.leakage).reduce((n, l) => n + l.count, 0)} opportunities`} tone="warn" />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="rcm-kpis">
        <Kpi label="A/R outstanding" value={money(data.kpis.outstanding)} hint={`${data.kpis.claimsSubmitted} submitted`} />
        <Kpi label="First-pass resolution" value={pct(data.kpis.firstPassRate)} hint={`${data.kpis.claimsAdjudicated} adjudicated`} tone="brand" />
        <Kpi label="Denial rate" value={pct(data.kpis.denialRate)} tone={data.kpis.denialRate ? "warn" : "ink"} />
        <Kpi label="Net collection rate" value={pct(data.kpis.netCollectionRate)} hint="(paid + patient) ÷ allowed" />
        <Kpi label="Charge lag" value={data.kpis.avgChargeLagDays === null ? "—" : `${data.kpis.avgChargeLagDays} d`} hint="date of service to submission" />
      </div>
      <div className="mt-6">
        <Tabs<"queue" | "denials" | "ar" | "leakage" | "pa">
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "queue", label: "Claims queue", badge: <span className="pill bg-sunken text-[10px]">{data.rows.length}</span> },
            { id: "denials", label: "Denials", badge: data.denials.length ? <span className="pill bg-rec-50 text-[10px] text-rec">{data.denials.length}</span> : null },
            { id: "ar", label: "A/R aging" },
            { id: "leakage", label: "Missed revenue" },
            { id: "pa", label: "Prior authorizations", badge: paOpen.length ? <span className="pill bg-warn-50 text-[10px] text-warn">{paOpen.length}</span> : null },
          ]}
        />
      </div>
      {tab === "denials" && (
        <div className="card mt-4 overflow-x-auto" data-testid="denials">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Date</th><th>Patient</th><th>Payer</th><th>Root cause</th><th>CARC</th><th className="text-right">Open</th><th className="px-4">Next step</th></tr></thead>
            <tbody>
              {data.denials.map((d) => (
                <tr key={d.encounterId} className="border-t border-line align-top" data-testid="denial-row">
                  <td className="px-4 py-2.5 whitespace-nowrap">{new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td className="py-2.5"><Link className="font-medium text-brand hover:underline" href={`/encounters/${d.encounterId}?tab=billing`}>{d.patient}</Link></td>
                  <td className="py-2.5">{d.payer}</td>
                  <td className="py-2.5 capitalize" data-testid="denial-category">{d.category.replace("_", " ")}</td>
                  <td className="py-2.5 font-mono text-xs">{d.carcs.join(", ")}</td>
                  <td className="py-2.5 text-right font-mono">{money(d.amount)}</td>
                  <td className="px-4 py-2.5 text-xs text-ink-2">{d.appeal ? `Appeal ${d.appeal}` : d.action}</td>
                </tr>
              ))}
              {!data.denials.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">No open denials.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {tab === "ar" && (
        <div className="card mt-4 p-5" data-testid="ar-aging">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Accounts receivable by days since service</p>
          {(() => {
            const max = Math.max(1, ...data.aging.map((a) => a.amount));
            return (
              <div className="mt-4 space-y-2.5">
                {data.aging.map((a) => (
                  <div key={a.label} className="grid grid-cols-[72px_1fr_110px] items-center gap-3 text-sm" data-testid="aging-bucket">
                    <span className="text-ink-2">{a.label} d</span>
                    <div className="h-3 rounded-full bg-sunken"><div className="h-3 rounded-full bg-brand" style={{ width: `${(a.amount / max) * 100}%` }} /></div>
                    <span className="text-right font-mono">{money(a.amount)} <span className="text-xs text-ink-3">({a.count})</span></span>
                  </div>
                ))}
              </div>
            );
          })()}
          <p className="mt-4 text-xs text-ink-3">Outstanding = expected allowed on accepted claims awaiting payment, plus billed amounts on open denials. Write-offs to date: {money(data.kpis.writeOffs)}.</p>
        </div>
      )}
      {tab === "queue" && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {["all", "needs_review", "ready", "approved", "on_hold", "rejected", "accepted", "paid", "partial", "denied", "appealed", "closed"].filter((f) => f === "all" || data.byStatus[f]).map((f) => (
              <button key={f} className={`pill ${filter === f ? "bg-brand text-white" : "bg-sunken text-ink-2"}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f.replace("_", " ")}</button>
            ))}
          </div>
          <div className="card mt-3 overflow-x-auto" data-testid="claims-queue">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Date</th><th>Patient</th><th>E/M</th><th>Diagnoses</th><th>Edits</th><th className="text-right">Charges</th><th className="px-4">Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.encounterId} className="border-t border-line hover:bg-sunken" data-testid="claim-row">
                    <td className="px-4 py-2.5 whitespace-nowrap">{new Date(r.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td><Link className="font-medium text-brand hover:underline" href={`/encounters/${r.encounterId}?tab=billing`}>{r.patient}</Link></td>
                    <td className="font-mono">{r.em}</td>
                    <td className="font-mono text-xs">{r.dx.join(", ")}</td>
                    <td className="text-xs">{r.errors ? <span className="text-rec">{r.errors} error{r.errors > 1 ? "s" : ""}</span> : null}{r.errors && r.warnings ? " · " : ""}{r.warnings ? <span className="text-warn">{r.warnings} warning{r.warnings > 1 ? "s" : ""}</span> : null}{!r.errors && !r.warnings ? <span className="text-ok">clean</span> : null}</td>
                    <td className="text-right font-mono">{money(r.charges)}</td>
                    <td className="px-4"><ClaimStatus status={r.status} /></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">No claims in this view. Claims appear when notes are signed.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "leakage" && (
        <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="leakage">
          {Object.entries(data.leakage).sort((a, b) => b[1].value - a[1].value).map(([k, v]) => (
            <div key={k} className="card p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-semibold">{CATEGORY[k] ?? k}</p>
                <p className="font-mono text-ok">{v.value ? `+${money(v.value)}` : `${v.count} found`}</p>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {v.examples.map((e, i) => (
                  <li key={i}><Link className="text-brand hover:underline" href={`/encounters/${e.encounterId}?tab=billing`}>{e.patient}</Link> <span className="text-ink-2">· {e.title}</span></li>
                ))}
              </ul>
            </div>
          ))}
          {!Object.keys(data.leakage).length && <p className="text-sm text-ink-3">No missed revenue found in signed claims.</p>}
        </div>
      )}
      {tab === "pa" && (
        <div className="card mt-4 overflow-x-auto" data-testid="pa-worklist">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Patient</th><th>Service</th><th>Criteria</th><th className="px-4">Submission</th></tr></thead>
            <tbody>
              {data.priorAuth.map((p) => (
                <tr key={`${p.encounterId}-${p.id}`} className="border-t border-line">
                  <td className="px-4 py-2.5"><Link className="font-medium text-brand hover:underline" href={`/encounters/${p.encounterId}?tab=billing`}>{p.patient}</Link></td>
                  <td>{p.service}</td>
                  <td>{p.status === "likely_approved" ? <span className="text-ok">All criteria documented</span> : <span className="text-warn">{p.criteria.filter((c) => c.met === false).length} missing</span>}</td>
                  <td className="px-4 capitalize">{p.submission}</td>
                </tr>
              ))}
              {!data.priorAuth.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-3">No prior authorizations needed yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
