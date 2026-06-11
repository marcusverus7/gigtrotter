/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
