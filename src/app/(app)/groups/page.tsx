import GroupsView from "@/components/GroupsView";
import { requireRoles } from "@/lib/server/auth";
import { groups } from "@/lib/server/group";
import { encounters, patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const user = await requireRoles(["owner", "admin", "clinician"]);
  const list = await Promise.all((await groups.list(user)).map(async (g) => ({ id: g.id, title: g.title, members: g.members.map((m) => m.name), encounterId: g.encounterId, createdAt: g.createdAt, notes: Object.keys(g.memberEncounters).length, status: (await encounters.get(user, g.encounterId))?.status ?? "scheduled" })));
  return <GroupsView initial={list} patients={(await patients.list(user)).map((p) => ({ id: p.id, name: p.name, mrn: p.mrn }))} />;
}
