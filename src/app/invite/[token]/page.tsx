import Link from "next/link";
import AcceptInvite from "@/components/AcceptInvite";
import AuthForm from "@/components/AuthForm";
import { Logo } from "@/components/icons";
import { roleLabel } from "@/lib/roles";
import { currentUser } from "@/lib/server/auth";
import { invites, orgs, users } from "@/lib/server/repo";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl">Chartside</span>
        </Link>
        <div className="card space-y-4 p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invites.get(token);
  const org = inv ? await orgs.get(inv.orgId) : undefined;
  if (!inv || !org || inv.acceptedAt || new Date(inv.expiresAt) < new Date()) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-ink-2" data-testid="invite-invalid">This invitation has expired, was revoked, or was already used. Ask your administrator to send a new one.</p>
        <Link className="btn-outline w-full" href="/login">Go to sign in</Link>
      </Shell>
    );
  }
  const role = roleLabel(inv.role);
  const me = await currentUser();
  if (me) {
    if (me.email.toLowerCase() !== inv.email) {
      return (
        <Shell>
          <h1 className="text-lg font-semibold">Wrong account</h1>
          <p className="text-sm text-ink-2">This invitation to {org.name} was sent to <b>{inv.email}</b>, but you&apos;re signed in as {me.email}. Sign out and open the link again.</p>
        </Shell>
      );
    }
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Join {org.name}</h1>
        <p className="text-sm text-ink-2">You&apos;ve been invited to join <b>{org.name}</b> as <b>{role}</b>. You&apos;ll keep access to your other organizations and can switch between them from the sidebar.</p>
        <AcceptInvite token={token} orgName={org.name} />
      </Shell>
    );
  }
  if (await users.byEmail(inv.email)) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Join {org.name}</h1>
        <p className="text-sm text-ink-2">You already have a Chartside account for {inv.email}. Sign in to accept the invitation.</p>
        <Link className="btn-primary w-full" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link>
      </Shell>
    );
  }
  return <AuthForm mode="register" invite={{ token, email: inv.email, orgName: org.name, role }} />;
}
