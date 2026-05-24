import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(전도인)",
  description: "전도인용 구역 번호 바로가기",
  manifest: "/evangelist/manifest.webmanifest",
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
};

export default function EvangelistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
