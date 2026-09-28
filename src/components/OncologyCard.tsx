import type { OncologyProfile } from "@/lib/types";

const GRADE_CLS = ["", "bg-warn-50 text-warn", "bg-warn-50 text-warn ring-1 ring-warn/40", "bg-rec-50 text-rec", "bg-rec text-white"];

export default function OncologyCard({ profile }: { profile: OncologyProfile }) {
  const cycles = Array.from(new Set((profile.toxicityHistory ?? []).map((t) => t.cycle).filter((c): c is number => c !== undefined))).sort((a, b) => a - b);
  const terms = Array.from(new Set((profile.toxicityHistory ?? []).map((t) => t.term)));
  const grade = (term: string, cycle: number) => Math.max(0, ...(profile.toxicityHistory ?? []).filter((t) => t.term === term && t.cycle === cycle).map((t) => t.grade));
  const ecog = profile.ecogHistory?.at(-1);
  return (
    <section className="card mt-4 p-4" data-testid="oncology-card">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="label mb-0">Oncology</p>
        <p className="text-sm font-medium" data-testid="onc-dx">{profile.stage ? `Stage ${profile.stage} ` : ""}{profile.diagnosis.replace(/^Malignant neoplasm of /, "cancer of the ")}{profile.tnm ? ` (${profile.tnm})` : ""}</p>
        {profile.icd10 && <span className="font-mono text-xs text-ink-3">{profile.icd10}</span>}
        {ecog && <span className="pill ml-auto bg-sunken text-[11px] text-ink-2" data-testid="onc-ecog">ECOG {ecog.score} · {ecog.date}</span>}
      </div>
      {profile.biomarkers?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{profile.biomarkers.map((b) => <span key={b} className="pill bg-info-50 text-[11px] text-info">{b}</span>)}</div> : null}
      <p className="label mt-4">Lines of therapy</p>
      <ol className="space-y-1 text-sm" data-testid="onc-regimens">
        {profile.regimens.map((r, i) => (
          <li key={`${r.name}-${r.start}`} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-4">{i + 1}</span>
            <span className="font-medium">{r.name}</span>
            <span className="text-ink-3">{[r.intent, r.line ? `${r.line} line` : null].filter(Boolean).join(", ")}</span>
            <span className="text-xs text-ink-3">{r.start} to {r.end ?? "present"}{r.cycles ? ` · ${r.cycles} cycle${r.cycles === 1 ? "" : "s"}` : ""}</span>
            {r.reason && <span className="pill bg-rec-50 text-[10px] text-rec">stopped: {r.reason}</span>}
            {!r.end && <span className="pill bg-ok-50 text-[10px] text-ok">current</span>}
          </li>
        ))}
      </ol>
      {cycles.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <p className="label">Toxicity by cycle (CTCAE grade)</p>
          <table className="text-xs" data-testid="onc-toxicity">
            <thead><tr><th className="pr-3 text-left font-normal text-ink-4" />{cycles.map((c) => <th key={c} className="w-10 px-1 text-center font-normal text-ink-4">C{c}</th>)}</tr></thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t}>
                  <td className="whitespace-nowrap py-0.5 pr-3 text-ink-2">{t}</td>
                  {cycles.map((c) => {
                    const g = grade(t, c);
                    return <td key={c} className="px-1 py-0.5 text-center">{g ? <span className={`inline-block w-7 rounded ${GRADE_CLS[g]}`}>{g}</span> : <span className="text-ink-4">·</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
