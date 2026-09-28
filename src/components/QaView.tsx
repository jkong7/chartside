"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { GoldenCase, reviews as reviewsFn, trustMetrics } from "@/lib/server/qa";
import { Check, Refresh, X } from "./icons";
import { Kpi, Spinner, Tabs } from "./ui";

type Reviews = Awaited<ReturnType<typeof reviewsFn>>;
type Metrics = Awaited<ReturnType<typeof trustMetrics>>;

export default function QaView({ reviews, metrics, rubric, cases: initialCases, recent, policy, canManage, canReview }: { reviews: Reviews; metrics: Metrics; rubric: { key: string; label: string }[]; cases: GoldenCase[]; recent: { id: string; label: string }[]; policy: { samplePct: number; newUserDays: number }; canManage: boolean; canReview: boolean }) {
  const [tab, setTab] = useState<"metrics" | "queue" | "cases">("metrics");
  const [cases, setCases] = useState(initialCases);
  const [pick, setPick] = useState(recent[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pol, setPol] = useState(policy);
  const [msg, setMsg] = useState<string | null>(null);
  const open = reviews.filter((r) => r.status === "open");
  const passing = cases.filter((c) => c.lastRun?.passed).length;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="font-serif text-3xl">Note QA</h1>
      <p className="mt-1 text-sm text-ink-2">How much clinicians change AI drafts, where they change them, sampled human review against a rubric, and regression tests for the documentation engine.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-4" data-testid="qa-kpis">
        <Kpi label="Signed notes (30 days)" value={metrics.clinicians.reduce((n, c) => n + c.notes, 0)} />
        <Kpi label="Signed without edits" value={(() => { const t = metrics.clinicians.reduce((n, c) => n + c.notes, 0); const un = metrics.clinicians.reduce((n, c) => n + Math.round(((c.uneditedRate ?? 0) / 100) * c.notes), 0); return t ? `${Math.round((un / t) * 100)}%` : "—"; })()} tone="brand" />
        <Kpi label="Open reviews" value={open.length} tone={open.length ? "warn" : "ink"} />
        <Kpi label="Engine test cases passing" value={cases.length ? `${passing}/${cases.length}` : "—"} tone={cases.length && passing === cases.length ? "ok" : "ink"} />
      </div>
      <div className="mt-6"><Tabs<"metrics" | "queue" | "cases"> value={tab} onChange={setTab} tabs={[{ id: "metrics", label: "Trust metrics" }, { id: "queue", label: "Review queue", badge: open.length ? <span className="pill bg-warn-50 text-[10px] text-warn">{open.length}</span> : null }, { id: "cases", label: "Engine test cases" }]} /></div>
      {msg && <p className="mt-3 text-sm text-ok" role="status">{msg}</p>}
      {tab === "metrics" && (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm" data-testid="trust-table">
              <thead className="text-left text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="px-4 py-2">Clinician</th><th className="text-right">Notes</th><th className="text-right">Signed unedited</th><th className="text-right">Edited lines per 100 notes</th><th className="px-4">Most-edited section</th></tr></thead>
              <tbody>{metrics.clinicians.map((c) => <tr key={c.id} className="border-t border-line"><td className="px-4 py-2">{c.name}</td><td className="text-right">{c.notes}</td><td className="text-right">{c.uneditedRate ?? "—"}%</td><td className="text-right">{c.editsPer100 ?? "—"}</td><td className="px-4 text-ink-3">{c.topSection ?? "—"}</td></tr>)}{!metrics.clinicians.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-3">No signed notes in the last 30 days.</td></tr>}</tbody>
            </table>
          </div>
          <div className="space-y-4">
            <div className="card p-4"><p className="text-sm font-semibold">Sections edited most</p><ul className="mt-2 space-y-1 text-sm">{metrics.sections.map((s) => <li key={s.title} className="flex"><span className="flex-1">{s.title}</span><span className="font-mono text-ink-3">{s.count}</span></li>)}{!metrics.sections.length && <li className="text-ink-3">No edits yet.</li>}</ul></div>
            <div className="card p-4"><p className="text-sm font-semibold">Reviewer scores ({metrics.reviewed} reviews)</p><ul className="mt-2 space-y-1 text-sm">{metrics.rubric.map((r) => <li key={r.key} className="flex"><span className="flex-1">{r.label}</span><span className="font-mono">{r.average ?? "—"}{r.average ? " / 5" : ""}</span></li>)}</ul></div>
          </div>
        </div>
      )}
      {tab === "queue" && (
        <div className="mt-4 space-y-4">
          {canManage && (
            <form className="card flex flex-wrap items-end gap-3 p-4 text-sm" onSubmit={async (e) => { e.preventDefault(); const r = await api<{ policy: typeof pol }>("/qa", { body: pol }); setPol(r.policy); setMsg("Review policy saved."); }}>
              <label><span className="label">Randomly review</span><span className="flex items-center gap-1"><input type="number" className="input w-20" min={0} max={100} value={pol.samplePct} onChange={(e) => setPol({ ...pol, samplePct: Number(e.target.value) })} data-testid="sample-pct" />% of signed notes</span></label>
              <label><span className="label">Review every note from new members for</span><span className="flex items-center gap-1"><input type="number" className="input w-20" min={0} max={90} value={pol.newUserDays} onChange={(e) => setPol({ ...pol, newUserDays: Number(e.target.value) })} /> days</span></label>
              <button className="btn-outline">Save policy</button>
            </form>
          )}
          <ul className="card divide-y divide-line" data-testid="review-queue">
            {reviews.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" data-testid="review-item">
                <span className="flex-1">{r.clinicianName} · <span className="text-ink-3">{r.reason}</span></span>
                {r.status === "done" ? <span className="pill bg-ok-50 text-[10px] text-ok"><Check size={10} /> Reviewed{r.reviewerName ? ` by ${r.reviewerName}` : ""}</span> : <span className="pill bg-warn-50 text-[10px] text-warn">Open</span>}
                <Link className={r.status === "open" && canReview ? "btn-primary px-3 py-1 text-xs" : "text-xs text-brand"} href={`/qa/${r.id}`} data-testid="open-review">{r.status === "open" && canReview ? "Review" : "View"}</Link>
              </li>
            ))}
            {!reviews.length && <li className="px-4 py-8 text-center text-sm text-ink-3">No notes sampled yet.</li>}
          </ul>
        </div>
      )}
      {tab === "cases" && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-ink-2">A test case saves a visit&apos;s transcript and what the engine extracted from it (diagnoses, medication changes, orders). Run them after changing templates, vocabulary, or engine versions to catch regressions.</p>
          {canManage && (
            <div className="card flex flex-wrap items-end gap-2 p-4">
              <select className="input w-72 text-sm" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Visit" data-testid="case-visit">{recent.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              <input className="input w-60 text-sm" placeholder="Case name" value={name} onChange={(e) => setName(e.target.value)} data-testid="case-name" />
              <button className="btn-outline" disabled={!pick} onClick={async () => setCases((await api<{ cases: GoldenCase[] }>("/qa/golden", { body: { encounterId: pick, name } })).cases)} data-testid="case-save">Save as test case</button>
              <span className="flex-1" />
              <button className="btn-primary" disabled={busy || !cases.length} onClick={async () => { setBusy(true); const r = await api<{ total: number; passed: number; cases: GoldenCase[] }>("/qa/golden", { body: { run: true } }); setCases(r.cases); setMsg(`${r.passed} of ${r.total} test cases passed.`); setBusy(false); }} data-testid="case-run">{busy ? <Spinner /> : <Refresh size={14} />} Run all</button>
            </div>
          )}
          <ul className="card divide-y divide-line" data-testid="cases">
            {cases.map((c) => (
              <li key={c.id} className="px-4 py-2.5 text-sm" data-testid="case">
                <div className="flex items-center gap-2"><span className="flex-1 font-medium">{c.name}</span>{c.lastRun ? (c.lastRun.passed ? <span className="pill bg-ok-50 text-[10px] text-ok" data-testid="case-pass"><Check size={10} /> Pass</span> : <span className="pill bg-rec-50 text-[10px] text-rec"><X size={10} /> Fail</span>) : <span className="pill bg-sunken text-[10px]">Not run</span>}</div>
                <p className="text-xs text-ink-3">{c.expected.problems.length} diagnoses · {c.expected.meds.length} medication changes · {c.expected.orders.length} orders</p>
                {c.lastRun && !c.lastRun.passed && <p className="mt-1 text-xs text-rec">{c.lastRun.missing.length ? `Missing: ${c.lastRun.missing.join(", ")}. ` : ""}{c.lastRun.extra.length ? `Unexpected: ${c.lastRun.extra.join(", ")}.` : ""}</p>}
              </li>
            ))}
            {!cases.length && <li className="px-4 py-8 text-center text-sm text-ink-3">No test cases yet.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
