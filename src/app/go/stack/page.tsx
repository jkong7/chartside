import { redirect } from "next/navigation";
import Stack from "@/components/stack/Stack";
import { currentUser, publicUser } from "@/lib/server/auth";
import { listDecisions } from "@/lib/server/decisions";
import { guestCallerPhone } from "@/lib/server/magic";

export const dynamic = "force-dynamic";
export const metadata = { title: "To review · Chartside", robots: { index: false } };

export default async function StackPage({ searchParams }: { searchParams: Promise<{ focus?: string; claimed?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const here = `/go/stack${sp.focus ? `?focus=${encodeURIComponent(sp.focus)}` : ""}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);
  const all = await listDecisions(user);
  const decisions = user.guestUntil ? all.filter((d) => d.kind === "note.sign") : all;
  const sample = !!user.prefs.sampleDay;
  const raw = user.guestUntil ? await guestCallerPhone(user.id) : null;
  const callerPhone = raw ? (/^\+1555/.test(raw) ? "the browser phone" : raw.replace(/\d(?=\d{4})/g, "•")) : null;
  return <Stack initial={decisions} user={publicUser(user)} focus={sp.focus ?? null} justClaimed={sp.claimed === "1"} sample={sample} callerPhone={callerPhone} styleMatched={!!user.prefs.styleMatchedAt} />;
}
