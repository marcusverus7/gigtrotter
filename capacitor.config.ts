import type { CapacitorConfig } from "@capacitor/cli";

/**
 * GigTrotter is a server-rendered Next.js app (Supabase auth, server actions,
 * Mapbox). It can't be statically exported, so the iOS shell loads the live
 * production site in a WKWebView. Update `server.url` if the production domain
 * changes.
 */
const config: CapacitorConfig = {
  appId: "com.gigtrotter.app",
  appName: "GigTrotter",
  // Minimal local web root — Capacitor requires it to exist even when we load
  // a remote URL. It only serves the brief splash before the remote site loads.
  webDir: "ios-shell/www",
  server: {
    url: "https://gigtrotter.vercel.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
