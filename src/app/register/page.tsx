import { redirect } from "next/navigation";
import RegisterForm from "@/components/RegisterForm";
import { currentUser } from "@/lib/server/auth";
import { consumerProviders } from "@/lib/server/consumer";

export const metadata = { title: "Create your account · Chartside" };

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : undefined;
}

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const user = await currentUser();
  if (user && !user.guestUntil) redirect(next ?? "/go");
  return <RegisterForm next={next} providers={consumerProviders()} />;
}
