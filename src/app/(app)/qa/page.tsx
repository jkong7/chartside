import QaView from "@/components/QaView";
import { requireRoles } from "@/lib/server/auth";
import { goldenCases, reviews, RUBRIC, trustMetrics } from "@/lib/server/qa";
import { encounters, orgs } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function QaPage() {
  const user = await requireRoles(["owner", "admin", "viewer", "clinician"]);
  const org = await orgs.get(user.orgId);
  const qa = (org?.settings as { qa?: { samplePct?: number; newUserDays?: number } } | undefined)?.qa ?? {};
  const recent = (await encounters.list(user, { statuses: ["signed"], from: new Date(Date.now() - 60 * 86400000).toISOString() })).slice(-30).reverse().map((e) => ({ id: e.id, label: `${new Date(e.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${e.reason || "Visit"}` }));
  return <QaView reviews={await reviews(user)} metrics={await trustMetrics(user)} rubric={[...RUBRIC]} cases={await goldenCases(user)} recent={recent} policy={{ samplePct: qa.samplePct ?? 5, newUserDays: qa.newUserDays ?? 14 }} canManage={["owner", "admin"].includes(user.role)} canReview={["owner", "admin", "viewer"].includes(user.role)} />;
}
