import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(인도자용)",
  description: "인도자용 구역 관리",
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
};

export default function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
