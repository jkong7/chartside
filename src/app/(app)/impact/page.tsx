import ImpactView from "@/components/ImpactView";
import { requireRoles } from "@/lib/server/auth";
import { impact } from "@/lib/server/impact";

export const dynamic = "force-dynamic";

export default async function ImpactPage({ searchParams }: { searchParams: Promise<{ days?: string; baseline?: string }> }) {
  const user = await requireRoles(["owner", "admin", "viewer"]);
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const baseline = Math.max(1, Math.min(30, Number(sp.baseline) || 7));
  return <ImpactView data={await impact(user, { days, baselineMinutes: baseline })} />;
}
