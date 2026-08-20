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
    // "always" natively inset the WebView for the notch/home bar — but the CSS
    // already handles safe areas (viewport-fit=cover + env(safe-area-inset-*)
    // padding on the header and bottom nav), so content was inset TWICE and the
    // page looked vertically compressed ("squeezed, ratio off" — tester
    // feedback, build 18). "never" renders edge-to-edge and lets the CSS do it.
    contentInset: "never",
  },
};

export default config;
