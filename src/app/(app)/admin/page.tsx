import AdminConsole from "@/components/AdminConsole";
import { adminSnapshot } from "@/lib/server/admin";
import { requirePermission } from "@/lib/server/auth";
import { computeOrgAnalytics } from "@/lib/server/insights";
import { audit } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePermission("org.manage");
  const [snap, analytics, log] = await Promise.all([adminSnapshot(user), computeOrgAnalytics(user.orgId), audit.forOrg(user.orgId, 100)]);
  const origin = process.env.SSO_REDIRECT_URI ? new URL(process.env.SSO_REDIRECT_URI).origin : null;
  return <AdminConsole initial={{ ...snap, analytics, audit: log }} me={{ id: user.id, role: user.role }} tab={(await searchParams).tab} redirectOrigin={origin} />;
}
