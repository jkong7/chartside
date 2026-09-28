import HospitalView from "@/components/HospitalView";
import { requireRoles } from "@/lib/server/auth";
import { census } from "@/lib/server/inpatient";
import { orgs, patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function HospitalPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "nurse", "scribe", "viewer"]);
  const members = (await orgs.members(user.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name }));
  return <HospitalView initial={await census(user)} patients={(await patients.list(user)).map((p) => ({ id: p.id, name: p.name, mrn: p.mrn }))} attendings={members} me={user.id} canDocument={["owner", "admin", "clinician", "scribe"].includes(user.role)} />;
}
