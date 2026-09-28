"use client";

import ImportSchedule from "./ImportSchedule";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { age, api, fmtTime } from "@/lib/client";
import type { Encounter } from "@/lib/types";
import { Mic, Plus, Refresh } from "./icons";
import { Avatar, Modal, Spinner, StatusPill } from "./ui";

export interface TodayRow extends Encounter {
  clinicianName?: string;
  patient: { id: string; name: string; dob: string; sex: string; mrn: string; openLoops: string[] } | null;
}

const TYPE_LABEL: Record<string, string> = { new: "New patient", "follow-up": "Follow-up", acute: "Acute", annual: "Annual", telehealth: "Telehealth" };

interface Props {
  rows: TodayRow[];
  patients: { id: string; name: string }[];
  me?: string;
  orgWide?: boolean;
  clinicians?: { id: string; name: string }[];
  canCreate?: boolean;
  canCapture?: boolean;
}

export default function TodayList({ rows: allRows, patients, me, orgWide = false, clinicians = [], canCreate = true, canCapture = true }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<string>(orgWide && canCreate && allRows.some((r) => r.userId === me) ? "me" : "all");
  const rows = who === "all" ? allRows : allRows.filter((r) => r.userId === (who === "me" ? me : who));
  const counts = {
    total: rows.length,
    done: rows.filter((r) => r.status === "signed").length,
    review: rows.filter((r) => r.status === "review").length,
  };

  const [importOpen, setImportOpen] = useState(false);

  async function startAdhoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const { encounter } = await api<{ encounter: Encounter }>("/encounters", { body: { patientId: f.get("patientId") || null, reason: f.get("reason"), visitType: f.get("visitType"), clinicianId: f.get("clinicianId") || undefined, scheduledAt: new Date().toISOString() } });
    router.push(`/encounters/${encounter.id}`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="font-serif text-3xl">Today&apos;s visits</h1>
          <p className="mt-1 text-sm text-ink-2" data-testid="today-summary">{counts.total} scheduled · {counts.review} awaiting review · {counts.done} signed</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {orgWide && (
            <select className="input w-auto py-1.5 text-sm" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Clinician" data-testid="clinician-filter">
              {canCreate && <option value="me">My visits</option>}
              <option value="all">All clinicians</option>
              {clinicians.filter((c) => c.id !== me).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {canCreate && <button
            className="btn-outline"
            onClick={async () => {
              setBusy(true);
              await api("/demo/reset", { method: "POST" });
              router.refresh();
              setBusy(false);
            }}
            disabled={busy}
            title="Recreate today's demo schedule"
          >
            <Refresh /> Reset demo day
          </button>}
          {canCapture && <button className="btn-outline" onClick={() => setImportOpen(true)} data-testid="open-import">Import schedule</button>}
          {canCapture && <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus /> Unscheduled visit
          </button>}
        </div>
      </div>

      <ImportSchedule open={importOpen} onClose={() => setImportOpen(false)} clinicians={canCreate && me ? [{ id: me, name: "Me" }, ...clinicians.filter((c) => c.id !== me)] : clinicians} me={(canCreate && me) || clinicians[0]?.id || ""} />
      <ol className="mt-8 space-y-2.5" data-testid="schedule">
        {rows.map((r) => {
          const done = r.status === "signed";
          return (
            <li key={r.id}>
              <Link href={`/encounters/${r.id}`} className={`card flex items-center gap-4 px-4 py-3.5 transition-shadow hover:shadow-md ${done ? "opacity-80" : ""}`} data-testid="visit-row">
                <div className="w-16 shrink-0 whitespace-nowrap text-right sm:w-20">
                  <p className="font-mono text-sm font-medium">{fmtTime(r.scheduledAt)}</p>
                  <p className="text-[11px] text-ink-3">{TYPE_LABEL[r.visitType] ?? r.visitType}</p>
                </div>
                <div className="hidden h-10 w-px bg-line sm:block" />
                <span className="hidden sm:inline-flex">{r.patient ? <Avatar name={r.patient.name} /> : <Avatar name="?" />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium sm:truncate">
                    {r.patient?.name ?? "Unassigned patient"}
                    {r.patient && <span className="ml-2 block text-sm font-normal text-ink-3 sm:inline">{age(r.patient.dob)}{r.patient.sex} · MRN {r.patient.mrn}</span>}
                  </p>
                  <p className="truncate text-sm text-ink-2">{r.reason || "No reason given"}{orgWide && r.clinicianName && r.userId !== me ? <span className="text-ink-3" data-testid="row-clinician"> · {r.clinicianName}</span> : null}</p>
                  {r.patient?.openLoops?.length && !done ? (
                    <p className="mt-0.5 truncate text-xs text-warn">Last visit plan: {r.patient.openLoops.join(" · ")}</p>
                  ) : null}
                </div>
                <span className="shrink-0"><StatusPill status={r.status} /></span>
                <span className={`hidden w-24 justify-end sm:flex ${done ? "text-ink-3" : "text-brand"} text-sm font-medium`}>
                  {r.status === "scheduled" ? (<span className="flex items-center gap-1"><Mic size={14} /> Start</span>) : r.status === "signed" ? "View" : "Open"}
                </span>
              </Link>
            </li>
          );
        })}
        {!rows.length && <li className="rounded-xl border border-dashed border-line-strong px-6 py-12 text-center text-ink-3">No visits scheduled today. Start an unscheduled visit or reset the demo day.</li>}
      </ol>

      <Modal open={open} onClose={() => setOpen(false)} title="Start an unscheduled visit">
        <form onSubmit={startAdhoc} className="space-y-4">
          <div>
            <label className="label" htmlFor="patientId">Patient</label>
            <select className="input" id="patientId" name="patientId" defaultValue="">
              <option value="">Add patient later</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {(orgWide || !canCreate) && clinicians.length > 0 && (
            <div>
              <label className="label" htmlFor="clinicianId">Clinician</label>
              <select className="input" id="clinicianId" name="clinicianId" defaultValue={canCreate ? me : clinicians[0]?.id}>
                {clinicians.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === me ? " (you)" : ""}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="reason">Reason for visit</label>
            <input className="input" id="reason" name="reason" placeholder="e.g. Sore throat" />
          </div>
          <div>
            <label className="label" htmlFor="visitType">Visit type</label>
            <select className="input" id="visitType" name="visitType" defaultValue="acute">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>{busy && <Spinner />} Open visit</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
