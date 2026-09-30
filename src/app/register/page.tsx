import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/server/auth";

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : undefined;
}

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string; specialty?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next ?? "/today");
  return <AuthForm mode="register" next={next} specialty={sp.specialty} />;
}
