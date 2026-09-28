import QualityView from "@/components/QualityView";
import { requireRoles } from "@/lib/server/auth";
import { qualityDashboard } from "@/lib/server/quality";

export const dynamic = "force-dynamic";

export default async function QualityPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "coder", "viewer"]);
  return <QualityView data={await qualityDashboard(user)} scope={["clinician"].includes(user.role) ? "mine" : "org"} />;
}
