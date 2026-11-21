import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://novaworkstudio-zeta.vercel.app"),
  alternates: { canonical: "https://novaworkstudio-zeta.vercel.app/" },
  title: "Nova Work Studio",
  description: "All-in-one AI work studio: Chat Bot, Prompts, 10 daily Tools (Invoice & Khata, Content Calendar, CV Maker, WhatsApp Kit), Create, Image Generate, Database & Deploy. Free and Pro plans.",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Nova Studio", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "Nova Work Studio",
    description: "Chat Bot, Prompts, 10 daily Tools, Create, Image Generate, Database & Deploy. Free and Pro plans.",
    url: "https://novaworkstudio-zeta.vercel.app",
    siteName: "Nova Work Studio",
    type: "website",
  },
};
export const viewport: Viewport = { themeColor: "#6d3df5", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap" rel="stylesheet" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Nova Work Studio",
              url: "https://novaworkstudio-zeta.vercel.app",
            }),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
