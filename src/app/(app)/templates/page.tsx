import TemplatesManager from "@/components/TemplatesManager";
import { currentUser } from "@/lib/server/auth";
import { templates } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const user = (await currentUser())!;
  return <TemplatesManager initial={templates.list(user.id)} />;
}
