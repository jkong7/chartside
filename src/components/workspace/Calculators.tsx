"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { CALCULATORS, type CalcValues } from "@/lib/engine/calculators";
import { Alert, Plus, Search } from "../icons";
import { Modal, Spinner } from "../ui";

type Prefill = Record<string, { values: CalcValues; sources: Record<string, string> }>;

const BAND: Record<string, string> = { low: "bg-ok-50 text-ok", moderate: "bg-warn-50 text-warn", high: "bg-rec-50 text-rec" };

export default function Calculators({ encounterId, open, onClose, onInsert, canInsert }: { encounterId: string; open: boolean; onClose: () => void; onInsert: (text: string) => Promise<void>; canInsert: boolean }) {
  const [data, setData] = useState<{ suggested: string[]; prefill: Prefill } | null>(null);
  const [sel, setSel] = useState<string>(CALCULATORS[0].id);
  const [q, setQ] = useState("");
  const [values, setValues] = useState<CalcValues>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ suggested: string[]; prefill: Prefill }>(`/encounters/${encounterId}/calculators`).then((r) => {
      setData(r);
      const first = r.suggested[0] ?? CALCULATORS[0].id;
      setSel(first);
      setValues(r.prefill[first]?.values ?? {});
    });
  }, [open, encounterId]);

  const calc = CALCULATORS.find((c) => c.id === sel)!;
  const result = useMemo(() => calc.compute(values), [calc, values]);
  const list = CALCULATORS.filter((c) => !q || `${c.name} ${c.category}`.toLowerCase().includes(q.toLowerCase()));
  const sources = data?.prefill[sel]?.sources ?? {};

  function pick(id: string) {
    setSel(id);
    setValues(data?.prefill[id]?.values ?? {});
    setDone(null);
  }

  return (
    <Modal open={open} onClose={onClose} title="Clinical calculators" wide>
      {!data ? <div className="flex h-40 items-center justify-center text-brand"><Spinner /></div> : (
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]" data-testid="calculators">
          <div>
            <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-ink-4" /><input className="input pl-8 text-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search calculators" /></div>
            <ul className="mt-2 max-h-[420px] space-y-0.5 overflow-y-auto">
              {list.map((c) => (
                <li key={c.id}>
                  <button className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${sel === c.id ? "bg-brand-50 font-medium text-brand" : "hover:bg-sunken"}`} onClick={() => pick(c.id)} data-testid={`calc-${c.id}`}>
                    {c.name}
                    <span className="block text-[11px] font-normal text-ink-4">{c.category}{data.suggested.includes(c.id) ? " · suggested" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <p className="font-medium">{calc.name}</p>
            <p className="text-[11px] text-ink-4">{calc.source}</p>
            <div className="mt-3 space-y-2">
              {calc.inputs.map((i) => (
                <div key={i.key} className="flex flex-wrap items-center gap-2 text-sm">
                  {i.type === "boolean" ? (
                    <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={values[i.key] === true} onChange={(e) => setValues((v) => ({ ...v, [i.key]: e.target.checked }))} data-testid={`in-${i.key}`} /> {i.label}{i.points && i.points !== 1 ? <span className="text-xs text-ink-4">+{i.points}</span> : null}</label>
                  ) : (
                    <>
                      <label className="min-w-40 flex-1" htmlFor={`in-${i.key}`}>{i.label}</label>
                      {i.type === "number" ? (
                        <span className="flex items-center gap-1"><input id={`in-${i.key}`} type="number" className="input w-28 py-1 text-sm" step={i.step ?? 1} value={values[i.key] === undefined ? "" : String(values[i.key])} onChange={(e) => setValues((v) => ({ ...v, [i.key]: e.target.value === "" ? "" : Number(e.target.value) }))} data-testid={`in-${i.key}`} />{i.unit && <span className="text-xs text-ink-3">{i.unit}</span>}</span>
                      ) : (
                        <select id={`in-${i.key}`} className="input w-56 py-1 text-sm" value={String(values[i.key] ?? "")} onChange={(e) => setValues((v) => ({ ...v, [i.key]: e.target.value }))} data-testid={`in-${i.key}`}>
                          <option value="">Choose…</option>
                          {i.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      )}
                    </>
                  )}
                  {sources[i.key] && <span className="pill bg-info-50 text-[10px] text-info">from {sources[i.key]}</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-line p-3" data-testid="calc-result">
              {"missing" in result ? (
                <p className="text-sm text-ink-3">Enter: {result.missing.slice(0, 3).join(", ")}{result.missing.length > 3 ? ` and ${result.missing.length - 3} more` : ""}.</p>
              ) : (
                <>
                  <p className="flex items-center gap-2"><span className="font-serif text-2xl" data-testid="calc-value">{result.display}</span><span className={`pill text-[10px] ${BAND[result.band]}`}>{result.band}</span></p>
                  <p className="mt-1 text-sm text-ink-2">{result.interpretation}</p>
                  {result.alert && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-rec-50 px-3 py-2 text-sm text-rec"><Alert size={14} /> {result.alert}</p>}
                  <p className="mt-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">{result.noteText}</p>
                  {canInsert && (
                    <button className="btn-primary mt-2" disabled={busy} onClick={async () => { setBusy(true); await onInsert(result.noteText); setBusy(false); setDone("Added to the assessment and plan."); }} data-testid="calc-insert">{busy ? <Spinner /> : <Plus size={14} />} Insert into note</button>
                  )}
                  {done && <p className="mt-2 text-sm text-ok" role="status">{done}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
