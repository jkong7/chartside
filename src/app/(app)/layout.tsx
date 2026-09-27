import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { llmEnabled, llmModel } from "@/lib/llm";
import { currentUser } from "@/lib/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: user.name, specialty: user.specialty }} engine={llmEnabled() ? `Claude · ${llmModel()}` : "On-device clinical engine"} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
