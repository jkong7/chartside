import { BRAND, Mark, OG_SIZE, ogImage } from "@/lib/server/og";
import { getPractice, publicCard } from "@/lib/server/practice";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A Chartside Practice scorecard";

const tone = (n: number) => (n >= 85 ? "#22683f" : n >= 70 ? BRAND.teal : n >= 50 ? "#8a5a12" : "#b8322b");

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const s = await getPractice((await params).id);
  const card = s && s.score !== null ? publicCard(s) : null;
  const score = card?.overall ?? 0;
  const missed = card?.missedRedFlags.map((m) => m.label.toLowerCase()).slice(0, 2).join(", ") ?? "";
  return ogImage(
    <div style={{ width: "100%", height: "100%", display: "flex", background: BRAND.paper, padding: 64, fontFamily: "Inter", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Mark />
        <div style={{ fontSize: 28, color: BRAND.ink3, marginTop: 40, letterSpacing: 3 }}>PRACTICE SCORECARD</div>
        <div style={{ fontSize: 76, lineHeight: 1.05, color: BRAND.ink, marginTop: 8, fontFamily: "Source Serif 4" }}>{card ? card.caseTitle : "Chartside Practice"}</div>
        <div style={{ fontSize: 32, color: BRAND.ink3, marginTop: 16 }}>{card ? `${card.name ?? "A student"}${card.student ? " · Student" : ""}` : "Talk to a patient. Write the note. Get graded."}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 8 }}>
          <div style={{ fontSize: 32, color: BRAND.ink }}>{card ? `History ${card.historyHits}/${card.historyTotal}` : ""}</div>
          <div style={{ fontSize: 28, color: missed ? "#b8322b" : "#22683f" }}>{card ? (missed ? `Missed: ${missed}` : "No red flags missed") : ""}</div>
          <div style={{ fontSize: 24, color: BRAND.teal, marginTop: 8 }}>Can you beat it? Fictional patient, no real patient data.</div>
        </div>
      </div>
      <div style={{ width: 360, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 340, height: 340, borderRadius: 170, border: `28px solid ${tone(score)}`, background: BRAND.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 132, lineHeight: 1, color: tone(score), fontFamily: "Source Serif 4" }}>{String(score)}</div>
          <div style={{ fontSize: 26, color: BRAND.ink3, marginTop: 8 }}>out of 100</div>
        </div>
      </div>
    </div>,
  );
}
