"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers. PostHog is initialised lazily and only when a key is
 * present, so local dev without analytics keys is silent. Per §9/§11, we never
 * capture location or travel data into analytics — autocapture is conservative.
 */
function initAnalytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === "undefined" || posthog.__loaded) return;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    capture_pageview: true,
    autocapture: false,
    persistence: "localStorage+cookie",
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
    </PostHogProvider>
  );
}
