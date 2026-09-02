"use client";

import { useEffect } from "react";

import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers. PostHog is initialised lazily and only when a key is
 * present, so local dev without analytics keys is silent. Per §9/§11, we never
 * capture location or travel data into analytics — autocapture is conservative.
 */
async function initAnalytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === "undefined") return;
  // Dynamic import: posthog-js is ~50KB gz and was statically imported by the
  // root layout, ahead of the app itself, on every load. Nothing in the app
  // consumes its React context (zero usePostHog call sites), so the provider
  // wrapper is gone too and analytics loads after the page is interactive.
  const { default: posthog } = await import("posthog-js");
  if (posthog.__loaded) return;
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
    <TooltipProvider delayDuration={150}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "hsl(222 47% 8%)",
              border: "1px solid hsl(217 19% 20%)",
              color: "hsl(210 40% 98%)",
            },
          }}
        />
    </TooltipProvider>
  );
}
