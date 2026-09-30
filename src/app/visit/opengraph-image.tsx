import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Chartside: remember everything your doctor said";

export default async function Image() {
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.paper, padding: 72, fontFamily: "Inter" }}>
      <Mark />
      <div style={{ fontSize: 88, lineHeight: 1.05, color: BRAND.ink, marginTop: 56, fontFamily: "Source Serif 4", maxWidth: 1000 }}>Remember everything your doctor said.</div>
      <div style={{ fontSize: 34, color: BRAND.ink3, marginTop: 28, maxWidth: 940 }}>Record your visit with their OK. Get a plain-English recap you can share with family.</div>
      <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 20 }}>
        <div style={{ background: BRAND.teal, color: BRAND.paper, fontSize: 32, padding: "14px 28px", borderRadius: 999 }}>Record my visit</div>
        <div style={{ fontSize: 28, color: BRAND.teal }}>Free. No app. Delete any time.</div>
      </div>
    </div>,
  );
}
