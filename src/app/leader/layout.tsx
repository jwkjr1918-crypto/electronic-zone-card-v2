import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(인도자용)",
  description: "후포회중 구역 방문 관리 시스템",
  manifest: "/leader/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "구역카드(인도자용)",

    icons: {
      icon: [
        {
          url: "/leader-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          url: "/leader-icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
      apple: [
        {
          url: "/leader-apple-touch-icon.png",
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },  
  },
  openGraph: {
    title: "구역카드(인도자용)",
    description: "후포회중 구역 방문 관리 시스템",
    siteName: "구역카드(인도자용)",
    type: "website",
  },
};

export default function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
