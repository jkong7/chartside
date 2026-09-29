import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Try the Chartside phone line in your browser";

export default async function Image() {
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.paper, padding: 72, fontFamily: "Inter", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Mark />
        <div style={{ fontSize: 80, lineHeight: 1.05, color: BRAND.ink, marginTop: 48, fontFamily: "Source Serif 4" }}>Call your scribe from this page.</div>
        <div style={{ fontSize: 32, color: BRAND.ink3, marginTop: 24 }}>Play a sample visit, hear the note read back, and get the text.</div>
      </div>
      <div style={{ width: 300, height: 486, borderRadius: 48, background: BRAND.ink, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <div style={{ fontSize: 30, color: BRAND.paper }}>Chartside</div>
        <div style={{ fontSize: 22, color: "#9fb3c8" }}>Listening…</div>
        <div style={{ width: 96, height: 96, borderRadius: 48, background: BRAND.teal, marginTop: 40, display: "flex" }} />
      </div>
    </div>,
  );
}
