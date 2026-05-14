import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(인도자용)",
  description: "후포회중 구역 방문 관리 시스템",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "구역카드(인도자용)",
  },
};

export default function LeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
