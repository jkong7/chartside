"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { age, api } from "@/lib/client";
import type { Patient } from "@/lib/types";
import { Plus, Search } from "./icons";
import { Avatar, Modal, Spinner } from "./ui";

export default function PatientsView({ patients }: { patients: (Patient & { visits: number; lastVisit: string | null })[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shown = useMemo(() => patients.filter((p) => `${p.name} ${p.mrn}`.toLowerCase().includes(q.toLowerCase())), [patients, q]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const allergies = String(f.get("allergies") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((substance) => ({ substance }));
      const meds = String(f.get("meds") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
      const problems = String(f.get("problems") ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
      const { patient } = await api<{ patient: Patient }>("/patients", { body: { name: f.get("name"), dob: f.get("dob"), sex: f.get("sex"), pronouns: f.get("pronouns"), language: f.get("language"), chart: { allergies, medications: meds, problems } } });
      router.push(`/patients/${patient.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add patient");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Patients</h1>
          <p className="mt-1 text-sm text-ink-2">{patients.length} patients on your panel</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}><Plus /> Add patient</button>
      </div>
      <div className="relative mt-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
        <input className="input pl-9" placeholder="Search by name or MRN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
      </div>
      <div className="card mt-4 divide-y divide-line" data-testid="patient-list">
        {shown.map((p) => (
          <Link key={p.id} href={`/patients/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-sunken">
            <Avatar name={p.name} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name} <span className="text-sm font-normal text-ink-3">{age(p.dob)}{p.sex} · MRN {p.mrn}</span></p>
              <p className="truncate text-sm text-ink-3">{p.chart.problems.map((x) => x.name).join(" · ") || "No active problems"}</p>
            </div>
            <div className="text-right text-xs text-ink-3">
              <p>{p.visits} visit{p.visits === 1 ? "" : "s"}</p>
              {p.lastVisit && <p>Last {new Date(p.lastVisit).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>}
            </div>
            {p.chart.allergies.length > 0 && <span className="pill bg-rec-50 text-rec">{p.chart.allergies.length} allerg{p.chart.allergies.length > 1 ? "ies" : "y"}</span>}
          </Link>
        ))}
        {!shown.length && <p className="px-4 py-8 text-center text-sm text-ink-3">No patients match &ldquo;{q}&rdquo;.</p>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add a patient">
        <form onSubmit={create} className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><label className="label" htmlFor="pname">Full name</label><input id="pname" name="name" className="input" required /></div>
          <div><label className="label" htmlFor="pdob">Date of birth</label><input id="pdob" name="dob" type="date" className="input" required /></div>
          <div><label className="label" htmlFor="psex">Sex</label><select id="psex" name="sex" className="input"><option value="F">Female</option><option value="M">Male</option><option value="X">Other / unspecified</option></select></div>
          <div><label className="label" htmlFor="ppro">Pronouns</label><input id="ppro" name="pronouns" className="input" placeholder="she/her" /></div>
          <div><label className="label" htmlFor="plang">Preferred language</label><select id="plang" name="language" className="input"><option value="en">English</option><option value="es">Spanish</option><option value="zh">Mandarin</option><option value="vi">Vietnamese</option></select></div>
          <div className="col-span-2"><label className="label" htmlFor="pprob">Problems (comma separated)</label><input id="pprob" name="problems" className="input" placeholder="Hypertension, Asthma" /></div>
          <div className="col-span-2"><label className="label" htmlFor="pmeds">Medications (comma separated)</label><input id="pmeds" name="meds" className="input" placeholder="lisinopril 10 mg daily" /></div>
          <div className="col-span-2"><label className="label" htmlFor="pall">Allergies (comma separated)</label><input id="pall" name="allergies" className="input" placeholder="penicillin" /></div>
          {err && <p className="col-span-2 text-sm text-rec">{err}</p>}
          <div className="col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy && <Spinner />} Add patient</button></div>
        </form>
      </Modal>
    </div>
  );
}
