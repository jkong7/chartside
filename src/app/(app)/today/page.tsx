import TodayList, { type TodayRow } from "@/components/TodayList";
import { currentUser } from "@/lib/server/auth";
import { encounters, patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Today() {
  const user = (await currentUser())!;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86400000);
  const pats = patients.list(user.id);
  const byId = new Map(pats.map((p) => [p.id, p]));
  const rows: TodayRow[] = encounters.list(user.id, { from: start.toISOString(), to: end.toISOString() }).map((e) => {
    const p = e.patientId ? byId.get(e.patientId) : undefined;
    return { ...e, patient: p ? { id: p.id, name: p.name, dob: p.dob, sex: p.sex, mrn: p.mrn, openLoops: p.chart.priorVisits?.[0]?.plan ?? [] } : null };
  });
  return <TodayList rows={rows} patients={pats.map((p) => ({ id: p.id, name: p.name }))} />;
}
