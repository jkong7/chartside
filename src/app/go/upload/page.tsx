import { redirect } from "next/navigation";
import MemoUpload from "@/components/ghost/MemoUpload";
import { currentUser } from "@/lib/server/auth";
import { orgJurisdiction } from "@/lib/server/jurisdiction";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload a recording · Chartside", robots: { index: false } };

export default async function UploadPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=%2Fgo%2Fupload");
  const vet = (await orgJurisdiction(user.orgId)) === "veterinary";
  return (
    <main className="flex min-h-screen items-center bg-paper px-4 py-10">
      <MemoUpload client={vet ? "client" : "patient"} />
    </main>
  );
}
