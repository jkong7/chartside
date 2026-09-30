"use client";

import { useState } from "react";
import { Link as LinkIcon, Refresh, Users } from "@/components/icons";

export default function ShareScore({ path, challengePath, retryPath, score, caseTitle }: { path: string; challengePath: string; retryPath: string; score: number; caseTitle: string }) {
  const [done, setDone] = useState<string | null>(null);
  const copy = async (url: string, msg: string) => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setDone(msg);
  };
  const share = async () => {
    const url = `${location.origin}${path}`;
    const text = `I scored ${score} on the ${caseTitle.toLowerCase()} case in Chartside Practice.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Chartside Practice score", text, url });
        return;
      }
    } catch {
      return;
    }
    await copy(url, "Link copied. Paste it in your group chat.");
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="practice-share">
      <button className="btn-primary" onClick={share} data-testid="share-score">
        <LinkIcon size={15} /> Share my score
      </button>
      <button className="btn-outline" onClick={() => copy(`${location.origin}${challengePath}`, "Challenge link copied. Send it to a friend.")} data-testid="challenge-copy">
        <Users size={15} /> Challenge a friend
      </button>
      <a className="btn-ghost" href={retryPath} data-testid="practice-retry">
        <Refresh size={15} /> Try it again
      </a>
      {done && <p className="w-full text-sm text-ok" role="status" data-testid="share-done">{done}</p>}
    </div>
  );
}
