import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const shareTarget = {
    action: "/go/share",
    method: "POST",
    enctype: "multipart/form-data",
    params: { title: "title", text: "text", files: [{ name: "audio", accept: ["audio/*", ".m4a", ".mp3", ".wav", ".webm", ".ogg", ".aac"] }] },
  };
  return {
    ...({ share_target: shareTarget } as object),
    name: "Chartside",
    short_name: "Chartside",
    description: "Ambient clinical documentation with every sentence traceable to the visit.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#faf8f3",
    theme_color: "#0f6b5c",
    categories: ["medical", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Record visit", url: "/go" },
      { name: "Your stack", url: "/go/stack" },
      { name: "Today", url: "/today" },
      { name: "Inbox", url: "/inbox" },
      { name: "Hospital", url: "/hospital" },
    ],
  };
}
