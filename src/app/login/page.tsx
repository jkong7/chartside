import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/server/auth";

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : undefined;
}

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentUser()) redirect(next ?? "/today");
  return <AuthForm mode="login" next={next} />;
}
