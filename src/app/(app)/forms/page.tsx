import FormsAdmin from "@/components/FormsAdmin";
import { SOURCES } from "@/lib/engine/forms";
import { requireRoles } from "@/lib/server/auth";
import { forms } from "@/lib/server/forms";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const user = await requireRoles(["owner", "admin"]);
  return <FormsAdmin initial={await forms.list(user)} sources={SOURCES.map((s) => ({ key: s.key, label: s.label }))} />;
}
