"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

export default function IdleWarning({ minutes }: { minutes: number }) {
  const last = useRef(0);
  const lastPing = useRef(0);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    last.current = Date.now();
    lastPing.current = Date.now();
    const bump = () => {
      last.current = Date.now();
      if (Date.now() - lastPing.current > 120000) {
        lastPing.current = Date.now();
        fetch("/api/auth/me", { cache: "no-store" }).catch(() => {});
      }
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const t = setInterval(() => {
      const remaining = minutes * 60000 - (Date.now() - Math.max(last.current, lastPing.current));
      if (remaining <= 0) window.location.assign("/login?idle=1");
      else setLeft(remaining <= 120000 ? Math.ceil(remaining / 1000) : null);
    }, 1000);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      clearInterval(t);
    };
  }, [minutes]);
  return (
    <Modal open={left !== null} onClose={() => {}} title="Are you still there?">
      <p className="text-sm text-ink-2" data-testid="idle-warning">For patient privacy you&apos;ll be signed out in {left !== null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : ""}.</p>
      <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={async () => { last.current = Date.now(); lastPing.current = Date.now(); await fetch("/api/auth/me", { cache: "no-store" }); setLeft(null); }}>Stay signed in</button></div>
    </Modal>
  );
}
