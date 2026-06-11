"use client";

import dynamic from "next/dynamic";

/**
 * Client-side dynamic loader for the Three.js globe.
 *
 * Next 15 disallows `next/dynamic({ ssr: false })` inside a Server Component,
 * so the dynamic import lives behind this client boundary. The landing page
 * RSC just imports `<GlobeLoader />` and renders it.
 */
const Globe = dynamic(
  () => import("@/features/landing/globe").then((m) => m.Globe),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square w-full max-w-[640px] mx-auto">
        <div className="relative h-full w-full">
          <div className="absolute inset-[8%] animate-pulse rounded-full bg-gradient-to-br from-primary/20 to-secondary/10" />
          <div className="absolute inset-[12%] rounded-full border border-primary/20" />
        </div>
      </div>
    ),
  },
);

export function GlobeLoader({ className }: { className?: string }) {
  return (
    <div data-testid="globe-container">
      <Globe className={className} />
    </div>
  );
}
