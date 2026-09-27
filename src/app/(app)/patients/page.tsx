import PatientsView from "@/components/PatientsView";
import { currentUser } from "@/lib/server/auth";
import { encounters, patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Patients() {
  const user = (await currentUser())!;
  const all = encounters.list(user.id);
  const rows = patients.list(user.id).map((p) => {
    const mine = all.filter((e) => e.patientId === p.id);
    return { ...p, visits: mine.length, lastVisit: mine.at(-1)?.scheduledAt ?? null };
  });
  return <PatientsView patients={rows} />;
}
