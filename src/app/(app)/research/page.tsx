import ResearchView from "@/components/ResearchView";
import { requireRoles } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import { researchDashboard } from "@/lib/server/trials";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "viewer"]);
  return <ResearchView initial={await researchDashboard(user)} canManage={can(user, "org.manage")} />;
}
