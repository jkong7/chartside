import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

let fonts: { name: string; data: Buffer; weight: 500 | 600; style: "normal" }[] | null = null;

function loadFonts() {
  if (fonts) return fonts;
  const dir = path.join(process.cwd(), "assets", "og");
  try {
    fonts = [
      { name: "Source Serif 4", data: readFileSync(path.join(dir, "source-serif-4-latin-600-normal.woff")), weight: 600, style: "normal" },
      { name: "Inter", data: readFileSync(path.join(dir, "inter-latin-500-normal.woff")), weight: 500, style: "normal" },
    ];
  } catch {
    fonts = [];
  }
  return fonts;
}

export const BRAND = { paper: "#f7f5f0", surface: "#ffffff", ink: "#16202e", ink3: "#566070", teal: "#0f6b5c", teal50: "#e6f2ef" };

export function ogImage(node: React.ReactElement) {
  return new ImageResponse(node, { ...OG_SIZE, fonts: loadFonts() });
}

export function Mark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: BRAND.teal, display: "flex", alignItems: "center", justifyContent: "center", color: BRAND.paper, fontSize: 32, fontFamily: "Source Serif 4" }}>C</div>
      <div style={{ fontSize: 34, color: BRAND.ink, fontFamily: "Source Serif 4" }}>Chartside</div>
    </div>
  );
}
