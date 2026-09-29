import { ImageResponse } from "next/og";
import { receiptByToken } from "@/lib/server/growth";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "A Chartside weekly receipt";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const r = await receiptByToken((await params).token);
  const big = (v: string | number, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#ffffff", borderRadius: 24, padding: "28px 36px", width: 330 }}>
      <div style={{ fontSize: 88, color: "#0f6b5c", lineHeight: 1 }}>{String(v)}</div>
      <div style={{ fontSize: 28, color: "#566070", marginTop: 10 }}>{label}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f7f5f0", padding: 64, fontFamily: "serif" }}>
        <div style={{ fontSize: 30, color: "#566070", letterSpacing: 4 }}>CHARTSIDE RECEIPT</div>
        <div style={{ fontSize: 72, color: "#16202e", marginTop: 12 }}>{r ? r.clinician : "Chartside"}</div>
        <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
          {big(r?.notesSigned ?? 0, "charts closed")}
          {big(r?.hoursBack ?? 0, "hours back")}
          {big(r?.closedSameDay ?? 0, "before leaving clinic")}
        </div>
        <div style={{ fontSize: 36, color: "#0f6b5c", marginTop: "auto" }}>{`Call your scribe: ${r?.line ?? "chartside/line"}`}</div>
      </div>
    ),
    size,
  );
}
