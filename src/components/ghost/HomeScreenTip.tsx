"use client";

import { useEffect, useState } from "react";

const KEY = "chartside.homeTip.dismissed";

export default function HomeScreenTip() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {
      dismissed = false;
    }
    setShow(ios && !standalone && !dismissed);
  }, []);

  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  };
  return (
    <aside className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-testid="home-tip">
      <p className="flex-1 text-ink-2">
        <span className="font-medium text-ink">Keep Chartside one tap away.</span> Tap the Share button, then <span className="font-medium text-ink">Add to Home Screen</span>. Your notes open like an app, with a Record visit shortcut.
      </p>
      <button className="text-ink-3 hover:text-ink" onClick={close} aria-label="Dismiss tip" data-testid="home-tip-close">
        ✕
      </button>
    </aside>
  );
}
