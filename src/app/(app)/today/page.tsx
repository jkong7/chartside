import TodayList, { type TodayRow } from "@/components/TodayList";
import { requireUser } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import Link from "next/link";
import { encounters, orgs, patients, SEES_ORG } from "@/lib/server/repo";
import { sharedWithMe } from "@/lib/server/sharing";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = await requireUser();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  const pats = await patients.list(user);
  const byId = new Map(pats.map((p) => [p.id, p]));
  const rows: TodayRow[] = (await encounters.list(user, { from: start.toISOString(), to: end.toISOString(), outpatient: true })).map((e) => {
    const p = e.patientId ? byId.get(e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null };
  });
  const orgWide = SEES_ORG.has(user.role);
  const clinicians = orgWide ? (await orgs.members(user.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name })) : [];
  const shared = await sharedWithMe(user);
  return (
    <>
    <TodayList
      rows={rows}
      patients={pats.map((p) => ({ id: p.id, name: p.name }))}
      me={user.id}
      orgWide={orgWide}
      clinicians={clinicians}
      canCreate={can(user, "clinical.create")}
      canCapture={can(user, "clinical.capture")}
    />
    {shared.length > 0 && (
      <section className="mx-auto max-w-5xl px-4 pb-10 md:px-8" data-testid="shared-with-me">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Shared with you</h2>
        <ul className="card mt-2 divide-y divide-line">
          {shared.map((s) => (
            <li key={s.id}>
              <Link href={`/shared/${s.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-sunken" data-testid="shared-item">
                <span className="min-w-0 flex-1 truncate"><span className="font-medium">{s.patientName ?? "Visit"}</span> · {s.reason || "Visit"} · from {s.ownerName}</span>
                <span className="pill bg-sunken text-[11px] text-ink-3">{s.access === "edit" ? "Can edit" : "View only"}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )}
    </>
  );
}
