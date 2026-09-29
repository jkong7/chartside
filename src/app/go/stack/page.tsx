import { redirect } from "next/navigation";
import Stack from "@/components/stack/Stack";
import { currentUser, publicUser } from "@/lib/server/auth";
import { listDecisions } from "@/lib/server/decisions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your stack · Chartside", robots: { index: false } };

export default async function StackPage({ searchParams }: { searchParams: Promise<{ focus?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const here = `/go/stack${sp.focus ? `?focus=${encodeURIComponent(sp.focus)}` : ""}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  const decisions = await listDecisions(user);
  return <Stack initial={decisions} user={publicUser(user)} focus={sp.focus ?? null} />;
}
