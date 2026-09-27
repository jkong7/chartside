import RevenueView from "@/components/RevenueView";
import { requireRoles } from "@/lib/server/auth";
import { revenueSummary } from "@/lib/server/revenue";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const user = await requireRoles(["owner", "admin", "clinician", "coder", "viewer"]);
  return <RevenueView data={await revenueSummary(user)} />;
}
