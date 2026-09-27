import Link from "next/link";
import { notFound } from "next/navigation";
import StartVisitButton from "@/components/StartVisitButton";
import { Avatar, StatusPill } from "@/components/ui";
import { ageFrom } from "@/lib/engine/text";
import { currentUser } from "@/lib/server/auth";
import { artifacts, encounters, notes, patients } from "@/lib/server/repo";
import type { CodingResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await currentUser())!;
  const p = patients.get(user.id, id);
  if (!p) notFound();
  const visits = encounters.list(user.id, { patientId: id }).reverse();
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <Link href="/patients" className="text-sm text-ink-3 hover:text-ink">← Patients</Link>
      <div className="mt-4 flex items-center gap-4">
        <Avatar name={p.name} size={52} />
        <div className="flex-1">
          <h1 className="font-serif text-3xl">{p.name}</h1>
          <p className="text-sm text-ink-2">{ageFrom(p.dob)}{p.sex} · DOB {p.dob} · MRN {p.mrn}{p.pronouns ? ` · ${p.pronouns}` : ""} · prefers {({ en: "English", es: "Spanish", zh: "Mandarin", vi: "Vietnamese" } as Record<string, string>)[p.language] ?? p.language}</p>
        </div>
        <StartVisitButton patientId={p.id} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-4"><p className="label">Problems</p>{p.chart.problems.length ? p.chart.problems.map((x) => <p key={x.name} className="text-sm">{x.name} {x.icd10 && <span className="font-mono text-xs text-ink-3">{x.icd10}</span>}</p>) : <p className="text-sm text-ink-3">None</p>}</div>
        <div className="card p-4"><p className="label">Medications</p>{p.chart.medications.length ? p.chart.medications.map((m) => <p key={m.name} className="text-sm">{m.name} <span className="text-ink-3">{[m.dose, m.frequency].filter(Boolean).join(" ")}</span></p>) : <p className="text-sm text-ink-3">None</p>}</div>
        <div className="card p-4"><p className="label">Allergies</p>{p.chart.allergies.length ? p.chart.allergies.map((a) => <p key={a.substance} className="text-sm text-rec">{a.substance}{a.reaction ? ` (${a.reaction})` : ""}</p>) : <p className="text-sm text-ink-3">NKDA</p>}</div>
      </div>
      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-ink-3">Visits</h2>
      <div className="card mt-2 divide-y divide-line">
        {visits.map((e) => {
          const coding = artifacts.get<CodingResult>(e.id, "coding");
          const n = notes.latest(e.id);
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
