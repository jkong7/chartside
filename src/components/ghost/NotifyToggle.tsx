"use client";

import { useEffect, useState } from "react";

function key(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function NotifyToggle() {
  const [state, setState] = useState<"hidden" | "offer" | "on" | "blocked" | "busy">("hidden");
  const [pub, setPub] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    fetch("/api/push")
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j) => {
        if (!j?.configured || j.guest) return;
        setPub(j.publicKey);
        if (Notification.permission === "denied") return setState("blocked");
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        setState(sub && j.subscriptions > 0 ? "on" : "offer");
      })
      .catch(() => {});
  }, []);

  const enable = async () => {
    if (!pub) return;
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "offer");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(pub) });
      const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      setState(r.ok ? "on" : "offer");
    } catch {
      setState("offer");
    }
  };

  if (state === "hidden") return null;
  if (state === "on") return <p className="text-xs text-ink-3" data-testid="notify-on">Notifications are on. You'll hear when a note is ready. They never include patient details.</p>;
  if (state === "blocked") return <p className="text-xs text-ink-3" data-testid="notify-blocked">Notifications are blocked for this site in your browser settings.</p>;
  return (
    <button className="btn-outline w-full text-sm" onClick={enable} disabled={state === "busy"} data-testid="notify-enable">
      Notify me when a note is ready
    </button>
  );
}
