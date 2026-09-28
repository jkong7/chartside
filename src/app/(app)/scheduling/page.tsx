import SchedulingView from "@/components/SchedulingView";
import { requireRoles } from "@/lib/server/auth";
import { followUpQueue } from "@/lib/server/schedule";

export const dynamic = "force-dynamic";

export default async function SchedulingPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "scribe"]);
  return <SchedulingView initial={await followUpQueue(user)} />;
}
