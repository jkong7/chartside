import SignQueue from "@/components/SignQueue";
import { requireRoles } from "@/lib/server/auth";
import { unsignedQueue } from "@/lib/server/queue";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const user = await requireRoles(["owner", "admin", "clinician"]);
  return <SignQueue initial={await unsignedQueue(user)} />;
}
