import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "구역카드(관리자용)",
  description: "관리자용 방문 기록 관리",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "구역카드(관리자용)",
  },
  openGraph: {
    title: "구역카드(관리자용)",
    description: "관리자용 방문 기록 관리",
    siteName: "구역카드(관리자용)",
    type: "website",
  },
};

export default function VisitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
