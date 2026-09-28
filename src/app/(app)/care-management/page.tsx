import CareManagement from "@/components/CareManagement";
import { requireRoles } from "@/lib/server/auth";
import { ccmWorklist } from "@/lib/server/ccm";
import { orgs } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function CareManagementPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "nurse", "coder"]);
  const clinicians = (await orgs.members(user.orgId)).filter((m) => m.status === "active" && ["owner", "admin", "clinician"].includes(m.role)).map((m) => ({ id: m.userId, name: m.name }));
  return <CareManagement initial={await ccmWorklist(user)} clinicians={clinicians} me={user.id} canWork={["owner", "admin", "clinician", "nurse"].includes(user.role)} />;
}
