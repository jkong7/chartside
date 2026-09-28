"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { CdiQuery, PoaLine } from "@/lib/engine/prebill";
import { Check } from "./icons";
import { Spinner } from "./ui";

type Review = { queries: (CdiQuery & { answer: { option: string; by: string; at: string; addendum: boolean } | null })[]; poa: PoaLine[]; open: number };

const SEV: Record<CdiQuery["severity"], string> = { MCC: "bg-rec-50 text-rec", CC: "bg-warn-50 text-warn", none: "bg-sunken text-ink-3" };

export default function PrebillPanel({ admissionId, canAnswer }: { admissionId: string; canAnswer: boolean }) {
  const [r, setR] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Review>(`/admissions/${admissionId}/prebill`).then(setR).catch((e) => setErr(e.message));
  }, [admissionId]);
  if (!r) return <div className="mt-6 flex justify-center text-brand">{err ? <p className="text-sm text-rec">{err}</p> : <Spinner />}</div>;
  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]" data-testid="prebill">
      <section className="space-y-3">
        <p className="text-sm text-ink-2">Clinical indicators from every note in the stay are checked against what was documented. Queries are non-leading and offer &quot;clinically undetermined&quot;. A confirmed diagnosis is added to the latest signed note as an addendum. Nothing changes the codes without the attending.</p>
        {err && <p className="rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec" role="alert">{err}</p>}
        {r.queries.map((q) => (
          <div key={q.key} className="card p-4" data-testid="cdi-query">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{q.condition}</p>
              <span className="font-mono text-xs text-ink-3">{q.code}</span>
              {q.severity !== "none" && <span className={`pill text-[10px] ${SEV[q.severity]}`} data-testid="cdi-severity">{q.severity}</span>}
              {q.answer && <span className="ml-auto pill bg-ok-50 text-[10px] text-ok" data-testid="cdi-answered"><Check size={10} /> {q.answer.option}</span>}
            </div>
            <ul className="mt-2 list-inside list-disc text-xs text-ink-2">{q.indicators.map((i) => <li key={i}>{i}</li>)}</ul>
            <p className="mt-2 text-sm">{q.question}</p>
            {!q.answer && canAnswer && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {q.options.map((o) => (
                  <button key={o} className="btn-outline px-2.5 py-1 text-xs" disabled={!!busy} onClick={async () => { setBusy(`${q.key}:${o}`); setErr(null); try { setR(await api<Review>(`/admissions/${admissionId}/prebill`, { body: { key: q.key, option: o } })); } catch (e) { setErr(e instanceof Error ? e.message : "Could not answer"); } setBusy(null); }} data-testid="cdi-option">{busy === `${q.key}:${o}` ? <Spinner /> : null}{o}</button>
                ))}
              </div>
            )}
            {q.answer && <p className="mt-2 text-xs text-ink-3">Answered by {q.answer.by}{q.answer.addendum ? "; clarification added as an addendum" : ""}.</p>}
          </div>
        ))}
        {!r.queries.length && <p className="card px-4 py-8 text-center text-sm text-ink-3" data-testid="cdi-none">No documentation opportunities found for this stay.</p>}
      </section>
      <section className="card self-start p-4">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-2">Present on admission</h2>
        <ul className="mt-2 space-y-1.5 text-sm" data-testid="poa">
          {r.poa.map((p) => (
            <li key={p.code} className="flex items-start gap-2"><span className={`pill w-6 justify-center text-[10px] ${p.poa === "Y" ? "bg-ok-50 text-ok" : p.poa === "N" ? "bg-warn-50 text-warn" : "bg-sunken text-ink-3"}`}>{p.poa}</span><span className="min-w-0"><span className="font-mono text-xs">{p.code}</span> {p.label}<span className="block text-[11px] text-ink-4">{p.basis}</span></span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
