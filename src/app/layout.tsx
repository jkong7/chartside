import type { Metadata, Viewport } from "next";
import ServiceWorker from "@/components/ServiceWorker";
import "./globals.css";
import { TZ_COOKIE } from "@/lib/tz";
import { connection } from "next/server";
import EditionProvider from "@/components/EditionProvider";
import { edition } from "@/lib/edition";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.CHARTSIDE_PUBLIC_URL || "http://localhost:3100"),
  title: "Chartside",
  description: "Ambient clinical documentation with every sentence traceable to the visit.",
  applicationName: "Chartside",
  appleWebApp: { capable: true, title: "Chartside", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f6b5c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen font-sans">
        <script dangerouslySetInnerHTML={{ __html: `try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(z)document.cookie="${TZ_COOKIE}="+encodeURIComponent(z)+";path=/;max-age=31536000;samesite=lax"}catch(e){}` }} />
        <EditionProvider value={edition()}>{children}</EditionProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
