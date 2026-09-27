import TemplatesManager from "@/components/TemplatesManager";
import { requireUser } from "@/lib/server/auth";
import { templates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const user = await requireUser();
  return <TemplatesManager initial={await templates.list(user)} />;
}
