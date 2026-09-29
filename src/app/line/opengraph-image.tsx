import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Chartside Line: your scribe is a phone number";

export default async function Image() {
  const display = process.env.CHARTSIDE_LINE_DISPLAY || "";
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.paper, padding: 72, fontFamily: "Inter" }}>
      <Mark />
      <div style={{ fontSize: 92, lineHeight: 1.05, color: BRAND.ink, marginTop: 56, fontFamily: "Source Serif 4", maxWidth: 980 }}>Your scribe is a phone number.</div>
      <div style={{ fontSize: 34, color: BRAND.ink3, marginTop: 28, maxWidth: 900 }}>Call before the visit. Set the phone down. Hang up, and the note is waiting.</div>
      <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 20 }}>
        <div style={{ background: BRAND.teal, color: BRAND.paper, fontSize: 32, padding: "14px 28px", borderRadius: 999 }}>{display ? `Call ${display}` : "Call the line"}</div>
        <div style={{ fontSize: 28, color: BRAND.teal }}>No app. No login. First note free.</div>
      </div>
    </div>,
  );
}
