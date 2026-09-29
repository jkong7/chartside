import { redirect } from "next/navigation";
import ShortcutSetup from "@/components/stack/ShortcutSetup";
import { currentUser } from "@/lib/server/auth";
import { publicOrigin } from "@/lib/server/magic";

export const dynamic = "force-dynamic";
export const metadata = { title: "iPhone Shortcut · Chartside", robots: { index: false } };

export default async function ShortcutPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fgo%2Fshortcut");
  if (user.guestUntil) redirect("/go/stack");
  return <ShortcutSetup origin={publicOrigin()} state={user.prefs.state ?? "IL"} />;
}
