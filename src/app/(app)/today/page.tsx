import TodayList, { type TodayRow } from "@/components/TodayList";
import { requireUser } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import { encounters, orgs, patients, SEES_ORG } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = await requireUser();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  const pats = await patients.list(user);
  const byId = new Map(pats.map((p) => [p.id, p]));
  const rows: TodayRow[] = (await encounters.list(user, { from: start.toISOString(), to: end.toISOString() })).map((e) => {
    const p = e.patientId ? byId.get(e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null };
  });
  const orgWide = SEES_ORG.has(user.role);
  const clinicians = orgWide ? (await orgs.members(user.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name })) : [];
  return (
    <TodayList
      rows={rows}
      patients={pats.map((p) => ({ id: p.id, name: p.name }))}
      me={user.id}
      orgWide={orgWide}
      clinicians={clinicians}
      canCreate={can(user, "clinical.create")}
      canCapture={can(user, "clinical.capture")}
    />
  );
}
