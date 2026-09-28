"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { MeasureAction, MeasureResult } from "@/lib/engine/quality";
import { Check, Plus } from "../icons";
import { Spinner } from "../ui";

export const STATUS: Record<MeasureResult["status"], { label: string; cls: string }> = {
  met: { label: "Met", cls: "bg-ok-50 text-ok" },
  addressed: { label: "Addressed today", cls: "bg-info-50 text-info" },
  gap: { label: "Gap", cls: "bg-warn-50 text-warn" },
  excluded: { label: "Excluded", cls: "bg-sunken text-ink-3" },
};

export default function QualityPanel({ encounterId, quality, locked, onChanged, onInsert, onCite }: { encounterId: string; quality: MeasureResult[]; locked: boolean; onChanged: () => void; onInsert: (text: string) => Promise<void>; onCite: (ids: string[]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const order = ["gap", "addressed", "met", "excluded"];
  const list = [...quality].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  async function act(r: MeasureResult, a: MeasureAction) {
    setBusy(`${r.id}:${a.label}`);
    setErr(null);
    try {
      if (a.kind === "order" && a.order) await api(`/encounters/${encounterId}/orders`, { body: a.order });
      else if (a.text) await onInsert(a.text);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not complete that");
    } finally {
      setBusy(null);
    }
  }

  if (!quality.length) return <p className="text-sm text-ink-3">No quality measures apply to this patient today.</p>;
  return (
    <div className="space-y-3" data-testid="quality-panel">
      <p className="text-sm text-ink-2">CMS electronic clinical quality measures (eCQMs) this patient is eligible for, checked against the chart, the conversation, and today&apos;s orders. Inserted text with *** must be completed before signing.</p>
      {err && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
      <ul className="card divide-y divide-line">
        {list.map((r) => (
          <li key={r.id} className="px-4 py-3" data-testid="measure" data-status={r.status} data-measure={r.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill text-[10px] ${STATUS[r.status].cls}`}>{r.status === "met" && <Check size={10} />} {STATUS[r.status].label}</span>
              <span className="text-sm font-medium">{r.title}</span>
              <span className="font-mono text-[11px] text-ink-4">{r.ecqm}</span>
            </div>
            <p className="mt-1 text-sm text-ink-3">{r.reason}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {r.evidence.filter((x) => x !== "chart").length > 0 && <button className="text-xs font-medium text-brand" onClick={() => onCite(r.evidence.filter((x) => x !== "chart"))}>Show in transcript</button>}
              {!locked && r.status === "gap" && r.actions.map((a) => (
                <button key={a.label} className="btn-outline px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => act(r, a)} data-testid="measure-action">
                  {busy === `${r.id}:${a.label}` ? <Spinner /> : <Plus size={12} />} {a.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Gdmt encounterId={encounterId} />
      <TrialMatches encounterId={encounterId} canRefer={!locked} />
    </div>
  );
}

type Match = { trialId: string; title: string; status: "likely" | "possible"; met: string[]; unknown: string[]; referred: boolean; contact: string; nct: string | null };

function TrialMatches({ encounterId, canRefer }: { encounterId: string; canRefer: boolean }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ matches: Match[] }>(`/encounters/${encounterId}/trials`).then((r) => setMatches(r.matches)).catch(() => setMatches([]));
  }, [encounterId]);
  if (!matches?.length) return null;
  return (
    <section className="mt-5 border-t border-line pt-4" data-testid="trial-matches">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Research pre-screening</h3>
      <p className="mt-1 text-xs text-ink-3">Studies at your organization this patient may qualify for. The study team confirms eligibility.</p>
      {err && <p className="mt-2 text-sm text-rec" role="alert">{err}</p>}
      <ul className="mt-2 space-y-2">
        {matches.map((m) => (
          <li key={m.trialId} className="rounded-lg border border-line p-3 text-sm" data-testid="trial-match">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{m.title}</span>
              <span className={`pill text-[10px] ${m.status === "likely" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{m.status === "likely" ? "Meets listed criteria" : "Needs data"}</span>
              {m.referred ? <span className="ml-auto pill bg-info-50 text-[10px] text-info" data-testid="trial-referred">Referred</span> : canRefer && (
                <button className="btn-outline ml-auto px-2.5 py-1 text-xs" disabled={!!busy} onClick={async () => { setBusy(m.trialId); setErr(null); try { setMatches((await api<{ matches: Match[] }>(`/encounters/${encounterId}/trials`, { body: { trialId: m.trialId } })).matches); } catch (e) { setErr(e instanceof Error ? e.message : "Could not refer"); } setBusy(null); }} data-testid="trial-refer">{busy === m.trialId ? <Spinner /> : null} Refer to study team</button>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-2">{m.met.join(" · ")}</p>
            {m.unknown.length > 0 && <p className="mt-0.5 text-xs text-warn">To confirm: {m.unknown.join("; ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CareGaps({ quality }: { quality: MeasureResult[] }) {
  const gaps = quality.filter((q) => q.status === "gap");
  if (!gaps.length) return null;
  return (
    <div className="card p-5" data-testid="care-gaps">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Care gaps to close today</h3>
      <ul className="mt-3 space-y-2">
        {gaps.map((g) => (
          <li key={g.id} className="flex items-start gap-2 text-sm">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warn" />
            <span><span className="font-medium">{g.title}</span> <span className="font-mono text-[11px] text-ink-4">{g.ecqm}</span><span className="block text-ink-3">{g.reason}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Pillar = { key: string; label: string; status: "at_target" | "below_target" | "missing" | "held" | "not_evidence_based"; current: string | null; target: string; note: string };
const PILLAR_TONE: Record<Pillar["status"], string> = { at_target: "bg-ok-50 text-ok", below_target: "bg-warn-50 text-warn", missing: "bg-rec-50 text-rec", held: "bg-sunken text-ink-3", not_evidence_based: "bg-rec-50 text-rec" };
const PILLAR_LABEL: Record<Pillar["status"], string> = { at_target: "At target", below_target: "Below target", missing: "Not started", held: "Held", not_evidence_based: "Not evidence-based" };

function Gdmt({ encounterId }: { encounterId: string }) {
  const [g, setG] = useState<{ ef: number | null; pillars: Pillar[] | null } | null>(null);
  useEffect(() => {
    api<{ ef: number | null; pillars: Pillar[] | null }>(`/encounters/${encounterId}/gdmt`).then(setG).catch(() => setG(null));
  }, [encounterId]);
  if (!g?.pillars) return null;
  return (
    <section className="mt-5 border-t border-line pt-4" data-testid="gdmt">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">HFrEF therapy, LVEF {g.ef}%</h3>
      <ul className="mt-2 space-y-2">
        {g.pillars.map((p) => (
          <li key={p.key} className="rounded-lg border border-line p-3 text-sm" data-testid="gdmt-pillar">
            <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{p.label}</span><span className={`pill text-[10px] ${PILLAR_TONE[p.status]}`}>{PILLAR_LABEL[p.status]}</span>{p.current && <span className="text-xs text-ink-3">{p.current}</span>}</div>
            <p className="mt-1 text-xs text-ink-2">Target: {p.target}. {p.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
