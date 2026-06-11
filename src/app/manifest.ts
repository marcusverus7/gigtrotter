import type { MetadataRoute } from "next";

/**
 * PWA manifest. Lets the site install as an app on Android/iOS and Windows,
 * with the GigTrotter glyph as the launch icon. Native iOS/Android are
 * planned later (Expo, phase 8+); this gets us close to a 1.0 web home.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GigTrotter — the wallet that remembers",
    short_name: "GigTrotter",
    description:
      "A capture-first ticket & travel wallet that builds a private life map automatically.",
    start_url: "/app",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "portrait",
    icons: [
      {
        src: "/icon",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "64x64",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
