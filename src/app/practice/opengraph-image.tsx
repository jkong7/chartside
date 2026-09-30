import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Chartside Practice: talk to a patient, write the note, get graded";

export default async function Image() {
  const bar = (label: string, v: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: BRAND.ink }}>
        <span>{label}</span>
        <span>{String(v)}</span>
      </div>
      <div style={{ width: 300, height: 14, borderRadius: 7, background: "#e2ddd2", display: "flex" }}>
        <div style={{ width: v * 3, height: 14, borderRadius: 7, background: BRAND.teal }} />
      </div>
    </div>
  );
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.paper, padding: 72, fontFamily: "Inter", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Mark />
        <div style={{ fontSize: 76, lineHeight: 1.05, color: BRAND.ink, marginTop: 48, fontFamily: "Source Serif 4" }}>Practice the encounter. Get graded on the note.</div>
        <div style={{ fontSize: 30, color: BRAND.ink3, marginTop: 24 }}>Free OSCE practice with an AI patient. Share your scorecard.</div>
      </div>
      <div style={{ width: 360, borderRadius: 32, background: BRAND.surface, padding: 32, display: "flex", flexDirection: "column", gap: 22, justifyContent: "center" }}>
        {bar("History", 86)}
        {bar("Exam", 100)}
        {bar("Communication", 78)}
        {bar("Note", 82)}
      </div>
    </div>,
  );
}
