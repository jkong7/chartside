"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/client";
import type { researchDashboard } from "@/lib/server/trials";
import { Plus } from "./icons";
import { Modal, Spinner } from "./ui";

type Study = Awaited<ReturnType<typeof researchDashboard>>[number];

const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export default function ResearchView({ initial, canManage }: { initial: Study[]; canManage: boolean }) {
  const [studies, setStudies] = useState(initial);
  const [edit, setEdit] = useState<Study | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = async () => setStudies((await api<{ trials: Study[] }>("/trials")).trials);
  const cur = edit && edit !== "new" ? edit : null;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="font-serif text-3xl">Research</h1>
          <p className="mt-1 text-sm text-ink-2">Pre-screen patients for your organization&apos;s studies. Each visit is checked against the criteria below, and possible matches show up in the Quality tab with what still needs confirming. Pre-screening only flags candidates. The study team confirms eligibility and consent.</p>
        </div>
        {canManage && <button className="btn-primary" onClick={() => { setErr(null); setEdit("new"); }} data-testid="trial-new"><Plus size={14} /> Add study</button>}
      </div>
      <div className="mt-6 space-y-4">
        {studies.map((s) => (
          <section key={s.id} className="card p-4" data-testid="trial-card">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="font-medium">{s.title}</h2>
              {s.nct && <a className="font-mono text-xs text-brand" href={`https://clinicaltrials.gov/study/${s.nct}`} target="_blank" rel="noreferrer">{s.nct}</a>}
              <span className={`pill text-[10px] ${s.status === "active" ? "bg-ok-50 text-ok" : "bg-sunken text-ink-3"}`}>{s.status === "active" ? "Enrolling" : "Closed"}</span>
              <span className="ml-auto text-xs text-ink-3">{s.referrals} referred</span>
              {canManage && <button className="btn-ghost px-2 text-xs" onClick={() => { setErr(null); setEdit(s); }} data-testid="trial-edit">Edit</button>}
            </div>
            <p className="mt-1 text-xs text-ink-3">{[s.sponsor, s.contact].filter(Boolean).join(" · ")}</p>
            <p className="mt-2 text-xs text-ink-2">
              {[s.criteria.minAge !== undefined || s.criteria.maxAge !== undefined ? `Age ${s.criteria.minAge ?? 0} to ${s.criteria.maxAge ?? "any"}` : null, s.criteria.sex ? (s.criteria.sex === "F" ? "Female" : "Male") : null, s.criteria.anyDx?.length ? `Dx ${s.criteria.anyDx.join(", ")}` : null, ...(s.criteria.labs ?? []).map((l) => `${l.name} ${l.op} ${l.value}`), s.criteria.excludeDx?.length ? `Excludes dx ${s.criteria.excludeDx.join(", ")}` : null, s.criteria.excludeMeds?.length ? `Excludes ${s.criteria.excludeMeds.join(", ")}` : null].filter(Boolean).join(" · ")}
            </p>
            {s.status === "active" && (
              <div className="mt-3">
                <p className="label">Possible candidates on file ({s.candidates.length})</p>
                <ul className="divide-y divide-line text-sm" data-testid="trial-candidates">
                  {s.candidates.map((c) => (
                    <li key={c.patientId} className="flex items-center gap-2 py-1.5">
                      <Link href={`/patients/${c.patientId}`} className="hover:text-brand">{c.name}</Link>
                      <span className={`pill text-[10px] ${c.status === "likely" ? "bg-ok-50 text-ok" : "bg-warn-50 text-warn"}`}>{c.status === "likely" ? "Meets listed criteria" : "Needs data"}</span>
                      {c.unknown.length > 0 && <span className="truncate text-xs text-ink-3">{c.unknown.join("; ")}</span>}
                      {c.referred && <span className="ml-auto pill bg-info-50 text-[10px] text-info">Referred</span>}
                    </li>
                  ))}
                  {!s.candidates.length && <li className="py-2 text-xs text-ink-3">No patients on file meet the criteria yet.</li>}
                </ul>
              </div>
            )}
          </section>
        ))}
        {!studies.length && <p className="card px-4 py-10 text-center text-sm text-ink-3">No studies yet.{canManage ? " Add one to start pre-screening." : ""}</p>}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Edit study" : "Add study"} wide>
        <form key={cur?.id ?? "new"} className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const labs = list(String(f.get("labs") ?? "")).map((x) => /^(.+?)\s*(>=|<=)\s*([\d.]+)$/.exec(x)).filter(Boolean).map((m) => ({ name: m![1].trim(), op: m![2] as ">=" | "<=", value: Number(m![3]) }));
          setBusy(true);
          setErr(null);
          try {
            await api("/trials", { body: { id: cur?.id, title: f.get("title"), sponsor: f.get("sponsor"), nct: f.get("nct"), contact: f.get("contact"), status: f.get("status"), criteria: { minAge: f.get("minAge") ? Number(f.get("minAge")) : undefined, maxAge: f.get("maxAge") ? Number(f.get("maxAge")) : undefined, sex: f.get("sex") || undefined, anyDx: list(String(f.get("anyDx"))), labs, excludeDx: list(String(f.get("excludeDx"))), excludeMeds: list(String(f.get("excludeMeds"))) } } });
            await reload();
            setEdit(null);
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Could not save");
          }
          setBusy(false);
        }}>
          <label className="block"><span className="label">Study name</span><input name="title" className="input" required defaultValue={cur?.title} data-testid="trial-title" /></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><span className="label">Sponsor</span><input name="sponsor" className="input" defaultValue={cur?.sponsor} /></label>
            <label className="block"><span className="label">ClinicalTrials.gov ID</span><input name="nct" className="input font-mono" placeholder="NCT01234567" defaultValue={cur?.nct ?? ""} /></label>
            <label className="block"><span className="label">Study team contact</span><input name="contact" className="input" defaultValue={cur?.contact} data-testid="trial-contact" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block"><span className="label">Min age</span><input name="minAge" type="number" className="input" defaultValue={cur?.criteria.minAge} data-testid="trial-min-age" /></label>
            <label className="block"><span className="label">Max age</span><input name="maxAge" type="number" className="input" defaultValue={cur?.criteria.maxAge} data-testid="trial-max-age" /></label>
            <label className="block"><span className="label">Sex</span><select name="sex" className="input" defaultValue={cur?.criteria.sex ?? ""}><option value="">Any</option><option value="F">Female</option><option value="M">Male</option></select></label>
            <label className="block"><span className="label">Status</span><select name="status" className="input" defaultValue={cur?.status ?? "active"}><option value="active">Enrolling</option><option value="closed">Closed</option></select></label>
          </div>
          <label className="block"><span className="label">Include if any diagnosis starts with (ICD-10, comma separated)</span><input name="anyDx" className="input font-mono" placeholder="E11, E13" defaultValue={cur?.criteria.anyDx?.join(", ")} data-testid="trial-dx" /></label>
          <label className="block"><span className="label">Lab requirements (one per line, like Hemoglobin A1c &gt;= 7.5)</span><textarea name="labs" className="input font-mono text-sm" rows={2} defaultValue={(cur?.criteria.labs ?? []).map((l) => `${l.name} ${l.op} ${l.value}`).join("\n")} data-testid="trial-labs" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Exclude diagnoses</span><input name="excludeDx" className="input font-mono" placeholder="N18.5, N18.6" defaultValue={cur?.criteria.excludeDx?.join(", ")} /></label>
            <label className="block"><span className="label">Exclude medications</span><input name="excludeMeds" className="input" placeholder="insulin glargine" defaultValue={cur?.criteria.excludeMeds?.join(", ")} data-testid="trial-exclude-meds" /></label>
          </div>
          {err && <p className="text-sm text-rec" role="alert">{err}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn-primary" disabled={busy} data-testid="trial-save">{busy ? <Spinner /> : null} Save study</button></div>
        </form>
      </Modal>
    </div>
  );
}
