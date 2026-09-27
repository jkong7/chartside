import InsightsView from "@/components/InsightsView";
import { requireUser } from "@/lib/server/auth";
import { computeInsights } from "@/lib/server/insights";
import { styleRules } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await requireUser();
  return <InsightsView insights={await computeInsights(user.id)} rules={await styleRules.list(user.id)} />;
}
