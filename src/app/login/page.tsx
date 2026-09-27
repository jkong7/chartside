import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentUser } from "@/lib/server/auth";

export default async function Login() {
  if (await currentUser()) redirect("/today");
  return <AuthForm mode="login" />;
}
