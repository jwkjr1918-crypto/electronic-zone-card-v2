import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "구역카드(인도자용)",
    short_name: "인도자용",
    description: "후포회중 구역 방문 관리 시스템",
    id: "/leader-app-v2",
    start_url: "/leader",
    scope: "/leader",
    display: "standalone",
    background_color: "#f1f5f9",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/leader-icon-192-safe.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: "/leader-icon-512-safe.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
  };
}
