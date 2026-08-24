/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // There is a stray package-lock.json in the parent directory (C:/Users/44785),
  // so Next inferred THAT as the workspace root and warned on every build. Pin
  // it to this project so file tracing collects the right files — otherwise a
  // standalone build can miss dependencies or bundle the whole home directory.
  outputFileTracingRoot: import.meta.dirname,
  images: {
    remotePatterns: [
      // Supabase Storage public/signed URLs
      { protocol: "https", hostname: "*.supabase.co" },
      // Mapbox static/marker assets
      { protocol: "https", hostname: "api.mapbox.com" },
    ],
  },
  // mapbox-gl ships an ES module that Next can transpile cleanly
  transpilePackages: ["mapbox-gl"],
  experimental: {
    // Server Actions are used for capture confirm + circle mutations
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
