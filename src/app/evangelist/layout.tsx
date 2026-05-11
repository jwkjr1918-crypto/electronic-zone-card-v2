import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(전도인)",
  description: "전도인용 구역 번호 바로가기",
  appleWebApp: {
    title: "구역카드(전도인)",
    capable: true,
    statusBarStyle: "default",
  },
};

export default function EvangelistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}