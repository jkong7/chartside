import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Barn Line: your vet scribe is a phone number";

export default async function Image() {
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: BRAND.paper, padding: 72, fontFamily: "Inter" }}>
      <Mark />
      <div style={{ fontSize: 30, color: BRAND.teal, marginTop: 40 }}>Barn Line, for ambulatory, equine and farm vets</div>
      <div style={{ fontSize: 88, lineHeight: 1.05, color: BRAND.ink, marginTop: 20, fontFamily: "Source Serif 4", maxWidth: 1000 }}>Your vet scribe is a phone number.</div>
      <div style={{ fontSize: 32, color: BRAND.ink3, marginTop: 24, maxWidth: 980 }}>Call from the truck, gloves on. Every animal on the farm call gets its own record.</div>
      <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 20 }}>
        <div style={{ background: BRAND.teal, color: BRAND.paper, fontSize: 30, padding: "14px 28px", borderRadius: 999 }}>Biscuit · Duchess · Cow 214</div>
        <div style={{ fontSize: 28, color: BRAND.teal }}>Three animals, three records.</div>
      </div>
    </div>,
  );
}
