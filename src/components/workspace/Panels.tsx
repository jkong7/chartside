"use client";

import OrderSets from "./OrderSets";
import { useState } from "react";
import { api, copyText } from "@/lib/client";
import SendToPatient from "../SendToPatient";
import type { CodingResult, DxDetail, MdmElement, PatientSummary, StagedOrder } from "@/lib/types";
import { Alert, Check, Copy, Globe, Info, Link as LinkIcon, X } from "../icons";
import { Empty, Spinner } from "../ui";
import type { Bundle } from "./types";

const LEVEL_TONE: Record<MdmElement["level"], string> = {
  straightforward: "bg-sunken text-ink-2",
  low: "bg-info-50 text-info",
  moderate: "bg-brand-50 text-brand",
  high: "bg-rec-50 text-rec",
};

function EvidenceButton({ ids, onCite }: { ids: string[]; onCite: (ids: string[]) => void }) {
  if (!ids.length) return <span className="text-xs text-ink-4">no link</span>;
  return (
    <button className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline" onClick={() => onCite(ids)}>
      <LinkIcon size={12} /> {ids.length} source{ids.length > 1 ? "s" : ""}
    </button>
  );
}

const SEV_TONE = { error: "bg-rec-50 text-rec", warning: "bg-warn-50 text-warn", info: "bg-info-50 text-info" } as const;

function RuleSource({ source }: { source: { set: string; version: string; ref?: string } }) {
  return <span className="ml-1 inline-block rounded bg-white/70 px-1.5 py-px font-mono text-[10px] text-ink-3" data-testid="rule-source">{source.set} · {source.version}{source.ref ? ` · ${source.ref}` : ""}</span>;
}

function DxQuery({ q, locked, busy, onAnswer }: { q: NonNullable<DxDetail["query"]>; locked: boolean; busy: boolean; onAnswer: (code: string | null) => void }) {
  const [choice, setChoice] = useState<string>("");
  if (q.answer) return <p className="mt-2 text-xs text-ink-3" data-testid="query-answered">Query answered: {q.answer.label} ({q.answer.by})</p>;
  return (
    <div className="mt-2 rounded-lg border border-info/30 bg-info-50/40 p-3" data-testid="cdi-query">
      <p className="text-xs font-semibold uppercase tracking-wide text-info">Documentation query</p>
      <p className="mt-1 text-sm">{q.question}</p>
      <div className="mt-2 space-y-1">
        {q.options.map((o) => (
          <label key={o.code} className="flex items-start gap-2 text-sm">
            <input type="radio" name={q.id} value={o.code} checked={choice === o.code} onChange={() => setChoice(o.code)} disabled={locked} className="mt-1 accent-brand" />
            <span><span className="font-mono text-xs">{o.code}</span> {o.label}</span>
          </label>
        ))}
        <label className="flex items-start gap-2 text-sm">
          <input type="radio" name={q.id} value="undetermined" checked={choice === "undetermined"} onChange={() => setChoice("undetermined")} disabled={locked} className="mt-1 accent-brand" />
          <span>Clinically undetermined</span>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">Options are the official ICD-10-CM codes at this level; none is preselected. <RuleSource source={q.source} /></p>
      {!locked && <button className="btn-primary mt-2 px-3 py-1 text-xs" disabled={!choice || busy} onClick={() => onAnswer(choice === "undetermined" ? null : choice)} data-testid="answer-query">{busy ? <Spinner /> : <Check size={13} />} Answer query</button>}
    </div>
  );
}

export function CodesPanel({ coding, encounterId, locked = true, onUpdate, onCite }: { coding?: CodingResult; encounterId?: string; locked?: boolean; onUpdate?: (coding: CodingResult, claim: unknown) => void; onCite: (ids: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!coding) return <Empty title="Codes appear after the note is drafted." />;
  const { em } = coding;
  const risk = em.auditRisk;
  const details: DxDetail[] = coding.dxDetail ?? coding.diagnoses.map((d) => ({ code: d.code, label: d.label, official: null, billable: true, release: null, chapter: null, hccs: [], issues: [] }));
  const raf = coding.risk;

  async function revise(bodyIn: Record<string, unknown>) {
    if (!encounterId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ coding: CodingResult; claim: unknown }>(`/encounters/${encounterId}/coding`, { body: bodyIn });
      onUpdate?.(r.coding, r.claim);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update coding");
    } finally {
      setBusy(false);
    }
  }

  const th = coding.therapy;
  const timedTotal = th ? th.services.filter((x) => x.timed).reduce((n, x) => n + (x.minutes ?? 0), 0) : 0;
  return (
    <div className="space-y-5" data-testid="codes-panel">
      {th && (
        <div className="card p-5" data-testid="therapy-codes">
          <p className="label">{th.discipline} services · modifier {th.discipline === "PT" ? "GP" : th.discipline === "OT" ? "GO" : "GN"} · {timedTotal} timed minutes</p>
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-line">
              {th.evalCode && <tr><td className="py-1.5 font-mono">{th.evalCode}</td><td>Evaluation</td><td className="text-right text-ink-3">1 unit</td></tr>}
              {th.services.map((x) => (
                <tr key={x.cpt}>
                  <td className="py-1.5 font-mono">{x.cpt}</td>
                  <td><button className="text-left hover:text-brand" onClick={() => onCite(x.evidence)}>{x.label}</button></td>
                  <td className="text-right text-ink-3">{x.bundled ? "bundled" : !x.timed ? "untimed" : x.minutes === null ? "minutes missing" : `${x.minutes} min`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-3">Units follow the CMS 8-minute rule for Medicare and Medicare Advantage (total timed minutes across services) and the per-service rule for other payers. See Billing for the units on this claim.</p>
        </div>
      )}
      <div className={`card p-5 ${th ? "hidden" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="label">E/M level · {em.patientType} patient · MDM</p>
            <p className="font-serif text-4xl" data-testid="em-code">{em.code}</p>
            <p className={`pill mt-1 capitalize ${LEVEL_TONE[em.level]}`}>{em.level} complexity</p>
            {em.timeBased && <p className="mt-2 text-xs text-ink-3">Time alternative: {em.timeBased.minutes} min recorded → {em.timeBased.code} if total time is documented</p>}
          </div>
          <div className="w-64">
            <p className="label">Audit defensibility</p>
            <div className="h-2 overflow-hidden rounded-full bg-sunken"><div className={`h-full ${risk.score >= 80 ? "bg-ok" : risk.score >= 60 ? "bg-warn" : "bg-rec"}`} style={{ width: `${risk.score}%` }} /></div>
            <p className="mt-1 text-sm"><span className="font-semibold">{risk.score}/100</span> · {risk.direction === "balanced" ? "balanced" : risk.direction === "under" ? "possible undercoding" : "overcoding risk"}</p>
            <ul className="mt-1 space-y-0.5 text-xs text-ink-3">{risk.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {([["Problems addressed", em.problems], ["Data reviewed / ordered", em.data], ["Risk of management", em.risk]] as const).map(([title, el]) => (
            <div key={title} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-2">{title}</p>
                <span className={`pill text-[10px] capitalize ${LEVEL_TONE[el.level]}`}>{el.level}</span>
              </div>
              <ul className="mt-2 space-y-1 text-xs text-ink-2">{el.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
              <div className="mt-2"><EvidenceButton ids={el.evidence} onCite={onCite} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden" data-testid="dx-list">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Diagnoses · ICD-10-CM</p>
          {details[0]?.release && <span className="pill bg-sunken text-[10px] text-ink-2" data-testid="icd-release">{details[0].release} release</span>}
        </div>
        {err && <p className="mx-4 mt-3 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
        <ul className="divide-y divide-line">
          {details.map((d, i) => {
            const s = coding.diagnoses[i];
            return (
              <li key={d.code + i} className="px-4 py-3" data-testid="dx-row" data-code={d.code}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="w-20 shrink-0 font-mono font-medium">{d.code}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium" data-testid="dx-official">{d.official ?? d.label}</p>
                    {s && <p className="text-xs text-ink-3">{s.rationale}</p>}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`pill text-[10px] ${d.billable ? "bg-ok-50 text-ok" : "bg-rec-50 text-rec"}`}>{d.billable ? "Billable" : "Not billable"}</span>
                      {d.hccs.map((h) => <span key={h.hcc} className="pill bg-brand-50 text-[10px] text-brand" data-testid="dx-hcc" title={h.label}>{h.hcc} · {h.label}</span>)}
                    </div>
                  </div>
                  {s && <span className="w-24 text-right"><EvidenceButton ids={s.evidence} onCite={onCite} /></span>}
                </div>
                {d.issues.filter((x) => x.rule !== "ICD.SPECIFICITY").map((x) => (
                  <div key={x.rule + x.message} className={`mt-2 rounded-md px-2.5 py-1.5 text-sm ${SEV_TONE[x.severity]}`} data-testid="dx-issue" data-rule={x.rule}>
                    <span className="font-mono text-[11px]">{x.rule}</span> · {x.message}<RuleSource source={x.source} />
                    {x.rule === "ICD.USE_ADDITIONAL" && !locked && x.codes?.map((c) => <button key={c} className="btn-outline ml-2 px-2 py-0.5 text-xs" disabled={busy} onClick={() => revise({ action: "add", code: c })} data-testid="add-dx">Add {c}</button>)}
                  </div>
                ))}
                {d.query && <DxQuery q={d.query} locked={locked || !encounterId} busy={busy} onAnswer={(code) => revise({ action: "answer", queryId: d.query!.id, code })} />}
              </li>
            );
          })}
          {!details.length && <li className="px-4 py-3 text-ink-3">No diagnoses identified.</li>}
        </ul>
      </div>

      {raf && (
        <div className="card p-4" data-testid="risk-card">
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Risk adjustment · CMS-HCC V28</p>
              <p className="mt-1 font-serif text-3xl" data-testid="raf">{raf.total.toFixed(3)}</p>
              <p className="text-xs text-ink-3">{raf.segmentLabel} · {raf.demographic.label} {raf.demographic.factor.toFixed(3)}</p>
            </div>
            <div className="min-w-[240px] flex-1 space-y-1 text-sm">
              {raf.hccs.map((h) => <p key={h.hcc} className={h.droppedBy ? "text-ink-4 line-through" : ""}><span className="font-mono">{h.hcc}</span> {h.label} <span className="font-mono text-ink-3">+{h.factor.toFixed(3)}</span>{h.droppedBy ? <span className="ml-1 text-xs no-underline">(superseded by {h.droppedBy})</span> : null}</p>)}
              {raf.interactions.map((x) => <p key={x.variable}><span className="font-mono">{x.variable}</span> <span className="font-mono text-ink-3">+{x.factor.toFixed(3)}</span></p>)}
              {!raf.hccs.length && <p className="text-ink-3">No payment HCCs documented this visit.</p>}
            </div>
          </div>
          {raf.suspects.length > 0 && (
            <div className="mt-3 border-t border-line pt-3" data-testid="hcc-suspects">
              <p className="text-xs font-semibold uppercase tracking-wide text-warn">Not yet captured this year</p>
              <ul className="mt-1 space-y-1 text-sm">
                {raf.suspects.map((x) => <li key={x.code} data-testid="hcc-suspect"><span className="font-mono">{x.code}</span> {x.label} · {x.hccs.map((h) => h.hcc).join(", ")} <span className="font-mono text-ok">+{x.delta.toFixed(3)}</span><p className="text-xs text-ink-3">{x.reason}. Address it only if clinically assessed today (monitor, evaluate, assess, or treat).</p></li>)}
              </ul>
            </div>
          )}
          <p className="mt-3 text-[11px] text-ink-3">{raf.note} <RuleSource source={raf.source} /></p>
        </div>
      )}

      {coding.cdi.length > 0 && (
        <div className="card p-4" data-testid="cdi">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Documentation improvement</p>
          {coding.cdi.map((c) => (
            <p key={c.message} className="mt-2 flex gap-2 text-sm text-ink-2"><Info size={15} className="mt-0.5 shrink-0 text-info" />{c.message}</p>
          ))}
        </div>
      )}

      {coding.reference?.length ? (
        <div className="rounded-lg border border-line px-4 py-3 text-xs text-ink-3" data-testid="coding-reference">
          <p className="font-semibold uppercase tracking-wide text-ink-2">Official sources used</p>
          <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">{coding.reference.map((r) => <li key={r.label}><span className="text-ink-2">{r.label}:</span> {r.version}</li>)}</ul>
        </div>
      ) : null}
    </div>
  );
}

const KIND_LABEL: Record<StagedOrder["kind"], string> = { lab: "Lab", imaging: "Imaging", medication: "Rx", referral: "Referral", procedure: "Procedure", vaccine: "Vaccine", follow_up: "Follow-up" };

export function OrdersPanel({ encounterId, orders, locked, onChange, onCite }: { encounterId: string; orders: StagedOrder[]; locked: boolean; onChange: (fn: (o: StagedOrder[]) => StagedOrder[]) => void; onCite: (ids: string[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function set(o: StagedOrder, status: StagedOrder["status"], override = false) {
    setBusy(o.id);
    setErr(null);
    try {
      const r = await api<{ order: StagedOrder }>(`/encounters/${encounterId}/orders/${o.id}`, { method: "PATCH", body: { status, override } });
      onChange((list) => list.map((x) => (x.id === o.id ? r.order : x)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update order");
    } finally {
      setBusy(null);
    }
  }

  const safe = orders.filter((o) => o.status === "staged" && !o.alerts.some((a) => a.level !== "info"));
  const sets = <OrderSets encounterId={encounterId} orders={orders} locked={locked} onApplied={(next, note) => { onChange(() => next); setErr(null); setNote(note); }} />;
  if (!orders.length) return <div className="space-y-3">{sets}<Empty title="No orders were discussed in this visit." /></div>;
  return (
    <div className="space-y-3" data-testid="orders-panel">
      {sets}
      {note && <p className="text-xs text-ok" data-testid="order-set-applied">{note}</p>}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">Orders heard during the visit are staged here. Nothing is sent until you accept it.</p>
        {!locked && safe.length > 1 && (
          <button className="btn-outline" onClick={async () => { for (const o of safe) await set(o, "accepted"); }} data-testid="accept-safe">
            <Check /> Accept {safe.length} without alerts
          </button>
        )}
      </div>
      {err && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      {orders.map((o) => {
        const block = o.alerts.some((a) => a.level === "block");
        return (
          <div key={o.id} className={`card p-4 ${o.status === "rejected" ? "opacity-60" : ""}`} data-testid="order-row" data-status={o.status}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="pill bg-sunken text-ink-2">{KIND_LABEL[o.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${o.status === "rejected" ? "line-through" : ""}`}>{o.name}</p>
                <p className="text-xs text-ink-3">{[o.detail, o.problem].filter(Boolean).join(" · ")}</p>
              </div>
              <EvidenceButton ids={o.evidence} onCite={onCite} />
              {o.status === "staged" && !locked ? (
                <div className="flex gap-1.5">
                  <button className="btn-outline px-2.5 py-1 text-xs" disabled={busy === o.id} onClick={() => set(o, "rejected")}><X size={13} /> Reject</button>
                  {block ? (
                    <button className="btn-danger px-2.5 py-1 text-xs" disabled={busy === o.id} onClick={() => set(o, "accepted", true)}>Override &amp; accept</button>
                  ) : (
                    <button className="btn-primary px-2.5 py-1 text-xs" disabled={busy === o.id} onClick={() => set(o, "accepted")} data-testid="accept-order"><Check size={13} /> Accept</button>
                  )}
                </div>
              ) : (
                <span className={`pill ${o.status === "accepted" ? "bg-ok-50 text-ok" : o.status === "rejected" ? "bg-sunken text-ink-3" : "bg-sunken text-ink-2"}`}>{o.status}</span>
              )}
              {o.status !== "staged" && !locked && <button className="text-xs text-ink-3 hover:underline" onClick={() => set(o, "staged")}>Undo</button>}
            </div>
            {o.alerts.length > 0 && (
              <ul className="mt-3 space-y-1">
                {o.alerts.map((a) => (
                  <li key={a.message} className={`flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs ${a.level === "block" ? "bg-rec-50 text-rec" : a.level === "warn" ? "bg-warn-50 text-warn" : "bg-info-50 text-info"}`} data-testid={`alert-${a.level}`}>
                    {a.level === "info" ? <Info size={13} className="mt-px shrink-0" /> : <Alert size={13} className="mt-px shrink-0" />}
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

const LANGS: Record<string, string> = { en: "English", es: "Español", zh: "中文", vi: "Tiếng Việt" };

export function SummaryPanel({ b, onFlags }: { b: Bundle; onFlags: () => void }) {
  const summaries = b.artifacts.summaries ?? {};
  const langs = Object.keys(summaries);
  const [lang, setLang] = useState(langs.includes(b.encounter.outputLang) ? b.encounter.outputLang : langs[0] ?? "en");
  const [extra, setExtra] = useState<Record<string, PatientSummary>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [share, setShare] = useState<string | null>(b.artifacts.share ? `/s/${b.artifacts.share.token}` : null);
  const [copied, setCopied] = useState(false);
  const all = { ...summaries, ...extra };
  const s = all[lang];

  async function translate(to: string) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ summary: PatientSummary }>(`/encounters/${b.encounter.id}/summary`, { body: { lang: to } });
      setExtra((x) => ({ ...x, [to]: r.summary }));
      setLang(to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setBusy(false);
    }
  }

  const text = s ? [s.greeting, ...s.sections.flatMap((x) => [``, x.title, ...x.items.map((i) => `• ${i}`)])].join("\n") : "";
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]" data-testid="summary-panel">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          {Object.keys(all).map((l) => (
            <button key={l} className={`pill ${l === lang ? "bg-brand text-white" : "bg-sunken text-ink-2"}`} onClick={() => setLang(l)}>{LANGS[l] ?? l}</button>
          ))}
          <div className="relative ml-1">
            <select className="input w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && translate(e.target.value)} disabled={busy} aria-label="Translate summary">
              <option value="">+ Translate…</option>
              {Object.entries(LANGS).filter(([k]) => !all[k]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {busy && <Spinner className="text-brand" />}
          {s?.readingGrade ? <span className={`pill ml-auto ${s.readingGrade <= 8 ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`} data-testid="reading-grade">Grade {s.readingGrade} reading level</span> : null}
        </div>
        {err && <p className="mx-4 mt-3 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn">{err}</p>}
        {s ? (
          <div className="space-y-4 px-5 py-4 text-[15px] leading-7" lang={s.lang}>
            {s.warnings.map((w) => <p key={w} className="rounded-lg bg-warn-50 px-3 py-2 text-xs text-warn">{w}</p>)}
            <p className="font-serif text-lg">{s.greeting}</p>
            {s.sections.map((sec) => (
              <div key={sec.title}>
                <p className="font-semibold">{sec.title}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{sec.items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        ) : <div className="p-5"><Empty title="No summary yet." /></div>}
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <p className="font-semibold">Send to patient</p>
          <p className="mt-1 text-sm text-ink-3">A private link shows the summary and the transcript, and lets the patient flag anything that doesn&apos;t match what they said.</p>
          <div className="mt-3 flex flex-col gap-2">
            <button className="btn-outline" onClick={async () => { await copyText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="text-ok" /> : <Copy />} Copy summary</button>
            <button className="btn-primary" onClick={async () => { const r = await api<{ url: string }>(`/encounters/${b.encounter.id}/share`, { method: "POST" }); setShare(r.url); }} data-testid="share">
              <Globe /> {share ? "Patient link ready" : "Create patient link"}
            </button>
            {share && <SendToPatient encounterId={b.encounter.id} kind="summary" />}
            {share && (
              <a href={share} target="_blank" rel="noreferrer" className="break-all rounded-lg bg-sunken px-3 py-2 font-mono text-xs text-brand" data-testid="share-link">{typeof window !== "undefined" ? window.location.origin : ""}{share}</a>
            )}
          </div>
        </div>
        <div className="card p-4" data-testid="patient-flags">
          <p className="font-semibold">Patient corrections</p>
          {b.patientFlags.length ? (
            <ul className="mt-2 space-y-2">
              {b.patientFlags.map((f) => (
                <li key={f.id} className={`rounded-lg border px-3 py-2 text-sm ${f.resolved ? "border-line opacity-60" : "border-warn/40 bg-warn-50"}`}>
                  <p className="text-xs text-ink-3">On &ldquo;{f.item}&rdquo;</p>
                  <p className="mt-0.5">{f.comment}</p>
                  {!f.resolved && <button className="mt-1 text-xs font-medium text-brand" onClick={async () => { await api(`/encounters/${b.encounter.id}/flags`, { method: "PATCH", body: { flagId: f.id } }); onFlags(); }}>Mark reviewed</button>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-ink-3">None yet.</p>}
        </div>
      </div>
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "consent.granted": "Consent recorded",
  "consent.declined": "Patient declined recording",
  "capture.started": "Ambient capture started",
  "capture.manual": "Manual documentation started",
  "capture.paused": "Capture paused",
  "capture.resumed": "Capture resumed",
  "capture.reset": "Capture reset",
  "note.generated": "Note drafted",
  "note.edited": "Note edited",
  "note.signed": "Note signed",
  "order.accepted": "Order accepted",
  "order.rejected": "Order rejected",
  "order.staged": "Order returned to staged",
  "transcript.redacted": "Transcript line redacted",
  "transcript.unredacted": "Transcript line restored",
  "summary.shared": "Patient link created",
  "patient.flagged": "Patient flagged a correction",
  "export.fhir": "FHIR bundle exported",
  "export.text": "Note copied for EHR",
  assist: "Assistant used",
  "ehr.context": "Launched from the EHR with patient and encounter context",
  "ehr.filed": "Signed note filed to the EHR",
  "ehr.file_failed": "Filing to the EHR failed",
  "claim.approve": "Claim approved",
  "claim.hold": "Claim placed on hold",
  "claim.submit": "Claim submitted",
  "claim.reopen": "Claim reopened",
  "claim.add_opportunity": "Billing opportunity added to claim",
  "prior_auth.submitted": "Prior authorization submitted",
  "prior_auth.approved": "Prior authorization approved",
  "prior_auth.denied": "Prior authorization denied",
  "audio.purged": "Audio deleted per retention policy",
  "transcript.final_pass": "Full recording re-transcribed with speaker separation",
  "transcript.diarized": "Speakers separated from voice characteristics",
};

export function AuditPanel({ b }: { b: Bundle }) {
  const c = b.consent;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]" data-testid="audit-panel">
      <div className="card">
        <p className="border-b border-line px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-2">Audit trail</p>
        <ol className="divide-y divide-line">
          {b.audit.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-2.5 text-sm">
              <span className="w-20 shrink-0 font-mono text-xs text-ink-3">{new Date(a.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span>
              <span className="flex-1">{ACTION_LABEL[a.action] ?? a.action}{a.action === "note.generated" && a.detail.supportedPct !== undefined ? ` · ${a.detail.supportedPct}% linked · ${a.detail.omissions} omission flag(s)` : ""}{a.action.startsWith("order.") && a.detail.order ? ` · ${a.detail.order}` : ""}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="card p-4">
        <p className="font-semibold">Consent record</p>
        {c ? (
          <dl className="mt-2 space-y-2 text-sm">
            <div><dt className="label">Decision</dt><dd className="capitalize">{c.decision} · {c.method}</dd></div>
            <div><dt className="label">Location</dt><dd>{c.state}{c.allParty ? " · all-party consent state" : ""}</dd></div>
            <div><dt className="label">Script</dt><dd className="font-mono text-xs">{c.scriptVersion}</dd></div>
            <div><dt className="label">Statement</dt><dd className="text-ink-2">{c.statement}</dd></div>
            <div><dt className="label">SHA-256</dt><dd className="break-all font-mono text-[11px] text-ink-3">{c.digest}</dd></div>
          </dl>
        ) : <p className="mt-1 text-sm text-ink-3">No consent recorded.</p>}
      </div>
    </div>
  );
}
