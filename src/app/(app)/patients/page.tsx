import PatientsView from "@/components/PatientsView";
import { requireUser } from "@/lib/server/auth";
import { encounters, patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Patients() {
  const user = await requireUser();
  const all = await encounters.list(user);
  const rows = (await patients.list(user)).map((p) => {
    const mine = all.filter((e) => e.patientId === p.id);
    return { ...p, visits: mine.length, lastVisit: mine.at(-1)?.scheduledAt ?? null };
  });
  return <PatientsView patients={rows} />;
}
