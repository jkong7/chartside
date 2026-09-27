import { redirect } from "next/navigation";
import Sidebar, { MobileNav } from "@/components/Sidebar";
import { llmEnabled, llmModel } from "@/lib/llm";
import { currentUser } from "@/lib/server/auth";
import { orgs } from "@/lib/server/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const memberships = (await orgs.memberships(user.id)).filter((m) => m.status === "active").map((m) => ({ id: m.org_id, name: m.name, role: m.role }));
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, specialty: user.specialty, role: user.role, orgId: user.orgId, orgName: user.orgName, orgs: memberships }} engine={llmEnabled() ? `Claude · ${llmModel()}` : "On-device clinical engine"} />
      <div className="min-w-0 flex-1">
        <MobileNav role={user.role} />
        {children}
      </div>
    </div>
  );
}
