import MemoUpload from "@/components/ghost/MemoUpload";
import { currentUser } from "@/lib/server/auth";
import { orgJurisdiction } from "@/lib/server/jurisdiction";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upload a recording · Chartside", robots: { index: false }, referrer: "no-referrer" };

export default async function UploadPage() {
  const user = await currentUser();
  const vet = user ? (await orgJurisdiction(user.orgId)) === "veterinary" : false;
  return (
    <main className="flex min-h-screen items-center bg-paper px-4 py-10">
      <MemoUpload client={vet ? "client" : "patient"} signedIn={!!user} />
    </main>
  );
}
