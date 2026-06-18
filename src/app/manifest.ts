import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f7f1e8",
    description: "Realtime polling dashboard for Google Sheet tasks.",
    display: "standalone",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon/medium",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon/large",
        sizes: "512x512",
        type: "image/png",
      },
      {
        purpose: "maskable",
        src: "/icon/large",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    name: "2026 To-do Cockpit",
    short_name: "2026 Tasks",
    start_url: "/",
    theme_color: "#020617",
  };
}
