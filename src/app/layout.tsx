import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "구역카드(전도인)",
  description: "전도인용 구역 번호 바로가기",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "구역카드(전도인)",
  },
  openGraph: {
    title: "구역카드(전도인)",
    description: "전도인용 구역 번호 바로가기",
    siteName: "구역카드(전도인)",
    type: "website",
  },
  icons: {
    icon: [
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
