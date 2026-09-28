"use client";

import { Logo } from "./icons";
import { MfaSetup } from "./SecurityCard";

export default function MfaRequired({ orgName }: { orgName: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md space-y-4 p-6" data-testid="mfa-required">
        <div className="flex items-center gap-2"><Logo size={24} /><span className="font-serif text-lg">Chartside</span></div>
        <h1 className="text-lg font-semibold">Set up two-step verification</h1>
        <p className="text-sm text-ink-2">{orgName} requires two-step verification for everyone who can see patient records.</p>
        <MfaSetup onDone={() => window.location.assign("/today")} />
      </div>
    </main>
  );
}
