import InsightsView from "@/components/InsightsView";
import { requireUser } from "@/lib/server/auth";
import { computeInsights } from "@/lib/server/insights";
import { styleRules } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const user = await requireUser();
  return <InsightsView insights={computeInsights(user.id)} rules={styleRules.list(user.id)} />;
}
