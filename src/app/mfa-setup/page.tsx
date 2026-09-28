import { redirect } from "next/navigation";
import MfaRequired from "@/components/MfaRequired";
import { currentUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <MfaRequired orgName={user.orgName} />;
}
