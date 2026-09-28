import InboxView from "@/components/InboxView";
import { requireRoles } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireRoles(["owner", "admin", "clinician", "scribe"]);
  const { m } = await searchParams;
  return <InboxView me={{ id: user.id, name: user.name, role: user.role }} initialMessage={m ?? null} />;
}
