import { notFound } from "next/navigation";
import GroupView from "@/components/GroupView";
import { requireRoles } from "@/lib/server/auth";
import { groupDetail } from "@/lib/server/group";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoles(["owner", "admin", "clinician"]);
  const g = await groupDetail(user, id);
  if (!g) notFound();
  return <GroupView initial={g} />;
}
