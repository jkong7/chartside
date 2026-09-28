import EdBoard from "@/components/EdBoard";
import { requireRoles } from "@/lib/server/auth";
import { edBoard, edProviders } from "@/lib/server/ed";
import { patients } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function EdPage() {
  const user = await requireRoles(["owner", "admin", "clinician", "nurse", "scribe", "viewer"]);
  return <EdBoard initial={await edBoard(user)} patients={(await patients.list(user)).map((p) => ({ id: p.id, name: p.name, mrn: p.mrn }))} attendings={await edProviders(user)} me={user.id} canUpdate={["owner", "admin", "clinician", "nurse", "scribe"].includes(user.role)} isProvider={["owner", "admin", "clinician"].includes(user.role)} />;
}
