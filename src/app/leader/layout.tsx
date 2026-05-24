import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(인도자용)",
  description: "인도자용 구역 관리",
  manifest: "/leader/manifest.webmanifest",

  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "구역카드(인도자용)",
  },

  openGraph: {
    title: "구역카드(인도자용)",
    description: "인도자용 구역 관리",
    siteName: "구역카드(인도자용)",
    type: "website",
  },

  icons: {
    icon: [
      {
        url: "/leader-icon-192-safe.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/leader-icon-512-safe.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],

    apple: [
      {
        url: "/leader-icon-192-safe.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  },
};

export default function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
