import Link from "next/link";
import { notFound } from "next/navigation";
import CoverageCard from "@/components/CoverageCard";
import ContactCard from "@/components/ContactCard";
import OncologyCard from "@/components/OncologyCard";
import OutsideRecords from "@/components/OutsideRecords";
import { recordsFor } from "@/lib/server/records";
import ResyncButton from "@/components/ResyncButton";
import StartVisitButton from "@/components/StartVisitButton";
import { systemLabel } from "@/lib/server/ehr";
import { Avatar, StatusPill } from "@/components/ui";
import { ageFrom } from "@/lib/engine/text";
import { requireUser } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import { artifacts, encounters, notes, patients } from "@/lib/server/repo";
import type { CodingResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await patients.get(user, id);
  if (!p) notFound();
  const visits = (await encounters.list(user, { patientId: id })).reverse();
  const rows = await Promise.all(visits.map(async (e) => ({ e, coding: await artifacts.get<CodingResult>(e.id, "coding"), n: await notes.latest(e.id) })));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <Link href="/patients" className="text-sm text-ink-3 hover:text-ink">← Patients</Link>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={p.name} size={52} />
        <div className="flex-1">
          <h1 className="font-serif text-3xl">{p.name} {p.externalSystem && <span className="pill ml-2 align-middle bg-info-50 font-sans text-xs text-info" data-testid="ehr-linked">Linked to {systemLabel(p.externalSystem)}</span>}</h1>
          <p className="text-sm text-ink-2">{ageFrom(p.dob)}{p.sex} · DOB {p.dob} · MRN {p.mrn}{p.pronouns ? ` · ${p.pronouns}` : ""} · prefers {({ en: "English", es: "Spanish", zh: "Mandarin", vi: "Vietnamese" } as Record<string, string>)[p.language] ?? p.language}</p>
        </div>
        {p.externalSystem && <ResyncButton patientId={p.id} system={systemLabel(p.externalSystem)} />}
        <StartVisitButton patientId={p.id} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-4"><p className="label">Problems</p>{p.chart.problems.length ? p.chart.problems.map((x) => <p key={x.name} className="text-sm">{x.name} {x.icd10 && <span className="font-mono text-xs text-ink-3">{x.icd10}</span>}{x.source?.startsWith("outside") && <span className="pill ml-1 bg-info-50 text-[10px] text-info">outside</span>}</p>) : <p className="text-sm text-ink-3">None</p>}</div>
        <div className="card p-4"><p className="label">Medications</p>{p.chart.medications.length ? p.chart.medications.map((m) => <p key={m.name} className="text-sm">{m.name} <span className="text-ink-3">{[m.dose, m.frequency].filter(Boolean).join(" ")}</span>{m.source?.startsWith("outside") && <span className="pill ml-1 bg-info-50 text-[10px] text-info">outside</span>}</p>) : <p className="text-sm text-ink-3">None</p>}</div>
        <div className="card p-4"><p className="label">Allergies</p>{p.chart.allergies.length ? p.chart.allergies.map((a) => <p key={a.substance} className="text-sm text-rec">{a.substance}{a.reaction ? ` (${a.reaction})` : ""}</p>) : <p className="text-sm text-ink-3">NKDA</p>}</div>
      </div>
      {p.chart.oncology && <OncologyCard profile={p.chart.oncology} />}
      <div className="mt-4"><ContactCard patientId={p.id} initial={{ phone: p.phone ?? null, email: p.email ?? null, pref: p.contactPref ?? null }} canEdit={can(user, "patients.write")} /></div>
      <div className="mt-4 max-w-xl"><CoverageCard patientId={p.id} initial={p.chart.coverage} canEdit={can(user, "patients.write") || can(user, "billing.review")} /></div>
      <OutsideRecords patientId={p.id} initial={await recordsFor(user, p.id)} canEdit={can(user, "patients.write")} />
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Visits</h2>
      <div className="card mt-2 divide-y divide-line">
        {rows.map(({ e, coding, n }) => {
          return (
            <Link key={e.id} href={`/encounters/${e.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-sunken">
              <div className="w-28 text-sm">{new Date(e.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.reason || "Visit"}</p>
                <p className="truncate text-xs text-ink-3">{coding ? `${coding.em.code} · ${coding.diagnoses.map((d) => d.code).join(", ")}` : n ? "Draft note" : "No note yet"}</p>
              </div>
              <StatusPill status={e.status} />
            </Link>
          );
        })}
        {!visits.length && <p className="px-4 py-6 text-sm text-ink-3">No visits yet.</p>}
      </div>
      {p.chart.priorVisits?.length ? (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Outside history</h2>
          <div className="card mt-2 divide-y divide-line">{p.chart.priorVisits.map((v) => <div key={v.date} className="px-4 py-3 text-sm"><p className="font-medium">{v.date}</p><p className="text-ink-2">{v.summary}</p><p className="text-xs text-ink-3">Plan: {v.plan.join(" · ")}</p></div>)}</div>
        </>
      ) : null}
    </div>
  );
}
