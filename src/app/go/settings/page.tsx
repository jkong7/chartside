import { redirect } from "next/navigation";
import GoSettings from "@/components/stack/GoSettings";
import { currentUser, publicUser } from "@/lib/server/auth";
import { listCaptureTokens } from "@/lib/server/captureTokens";
import { growthState, receiptStats } from "@/lib/server/growth";
import { hasPhonePin } from "@/lib/server/magic";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings · Chartside", robots: { index: false } };

export default async function GoSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fgo%2Fsettings");
  if (user.guestUntil) redirect("/go/stack");
  const [growth, receipt, pin, devices] = await Promise.all([growthState(user), receiptStats(user), hasPhonePin(user.id), listCaptureTokens(user)]);
  return <GoSettings user={publicUser(user)} growth={growth} receipt={receipt} pinSet={pin} devices={devices} />;
}
