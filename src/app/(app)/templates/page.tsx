import TemplatesManager from "@/components/TemplatesManager";
import { requireRoles } from "@/lib/server/auth";
import { can } from "@/lib/server/policy";
import { templates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const user = await requireRoles(["owner", "admin", "clinician", "scribe"]);
  return <TemplatesManager initial={await templates.list(user)} canShare={can(user, "templates.share")} />;
}
