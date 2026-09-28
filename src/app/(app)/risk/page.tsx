import RiskView from "@/components/RiskView";
import { requireRoles } from "@/lib/server/auth";
import { riskWorklist } from "@/lib/server/riskAdjust";

export const dynamic = "force-dynamic";

export default async function RiskPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "coder", "viewer"]);
  return <RiskView rows={await riskWorklist(user)} />;
}
