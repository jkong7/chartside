import RevenueView from "@/components/RevenueView";
import { requireUser } from "@/lib/server/auth";
import { revenueSummary } from "@/lib/server/revenue";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const user = await requireUser();
  return <RevenueView data={await revenueSummary(user)} />;
}
