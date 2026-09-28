import PatientsView from "@/components/PatientsView";
import { requireUser } from "@/lib/server/auth";
import { patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Patients() {
  const user = await requireUser();
  const first = await patients.page(user, { limit: 50 });
  return <PatientsView initial={first.rows} total={first.total} />;
}
