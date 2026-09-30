import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/server/auth";
import { consumerProviders } from "@/lib/server/consumer";

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : undefined;
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next ?? "/today");
  return <AuthForm mode="login" next={next} error={sp.error?.slice(0, 300)} providers={consumerProviders()} />;
}
