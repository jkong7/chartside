"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui";

const GO: Record<string, [string, string]> = {
  t: ["/today", "Today"],
  i: ["/inbox", "Inbox"],
  q: ["/queue", "Sign queue"],
  p: ["/patients", "Patients"],
  h: ["/hospital", "Hospital"],
  e: ["/ed", "Emergency"],
  r: ["/revenue", "Revenue"],
  s: ["/settings", "Settings"],
};

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function Shortcuts() {
  const router = useRouter();
  const [help, setHelp] = useState(false);
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        window.dispatchEvent(new CustomEvent("chartside:sign"));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      if (e.key === "/") {
        const el = document.querySelector<HTMLInputElement>('[data-shortcut="search"], input[aria-label="Search patients"], [data-testid="ask-input"], [data-testid="patient-picker"]');
        if (el) {
          e.preventDefault();
          el.focus();
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (Date.now() - pendingG.current < 1200 && GO[e.key]) {
        pendingG.current = 0;
        router.push(GO[e.key][0]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return (
    <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm" data-testid="shortcuts-help">
        <dt><kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">?</kbd></dt><dd>Show this list</dd>
        <dt><kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">/</kbd></dt><dd>Focus search</dd>
        <dt><kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">Ctrl</kbd> + <kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">Enter</kbd></dt><dd>Sign the open note</dd>
        {Object.entries(GO).map(([k, [, label]]) => (
          <div key={k} className="contents"><dt><kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">g</kbd> <kbd className="rounded border border-line bg-sunken px-1.5 font-mono text-xs">{k}</kbd></dt><dd>Go to {label}</dd></div>
        ))}
      </dl>
    </Modal>
  );
}
