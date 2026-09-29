import { redirect } from "next/navigation";
import AskChat from "@/components/stack/AskChat";
import { currentUser } from "@/lib/server/auth";
import { llmEnabled } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ask · Chartside", robots: { index: false } };

export default async function AskPage({ searchParams }: { searchParams: Promise<{ encounter?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/go/ask${sp.encounter ? `?encounter=${sp.encounter}` : ""}`)}`);
  return <AskChat encounterId={sp.encounter ?? null} offline={!llmEnabled()} />;
}
