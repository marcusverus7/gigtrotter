/**
 * Centralised, typed environment access.
 *
 * Public (NEXT_PUBLIC_*) vars are read inline so Next can inline them at build.
 * Server secrets are read lazily via getters so the client bundle never trips
 * over them, and so a missing-but-unused secret never breaks the build during
 * phase 0/1 when not every integration is wired yet.
 */

function clean(v: string): string {
  // Trim first: a value pasted into a hosting dashboard keeps whatever
  // whitespace came with it. Vercel stores exactly what you paste (unlike
  // dotenv, which trims), so a stray leading space on an API key ships a
  // malformed credential and the provider answers 401 — with nothing in the
  // value that looks wrong. Cost several hours on 2026-07-28.
  return v.trim().replace(/[^\x20-\x7E]/g, "");
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return clean(value);
}

export const publicEnv = {
  supabaseUrl: clean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
  supabaseAnonKey: clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""),
  mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "",
  posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
} as const;

/** True when Supabase public config is present — gate auth UI on this. */
export const isSupabaseConfigured =
  !!publicEnv.supabaseUrl && !!publicEnv.supabaseAnonKey;

/** True when a Mapbox token is present — gate the live globe on this. */
export const isMapboxConfigured = !!publicEnv.mapboxToken;

/** Server-only secrets. Throws if accessed without being set. */
export const serverEnv = {
  get supabaseServiceRoleKey() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  get anthropicParseModel() {
    // clean() here too, not just on the secrets. The deployed value carried a
    // UTF-8 BOM ("﻿claude-fable-5"), which would have failed as an unknown
    // model the moment authentication started succeeding — a confusingly
    // different error from the 401 it was hiding behind.
    return clean(process.env.ANTHROPIC_PARSE_MODEL ?? "claude-fable-5");
  },
  get inboundWebhookSecret() {
    return required("INBOUND_WEBHOOK_SECRET", process.env.INBOUND_WEBHOOK_SECRET);
  },
  get forwardingDomain() {
    return process.env.FORWARDING_DOMAIN ?? "capture.gigtrotter.example";
  },
  /**
   * True only when a REAL inbound-email domain is configured. `.example` TLDs
   * are reserved placeholders that can never receive mail — a tester forwarded
   * a ticket to one and got a Gmail NXDOMAIN bounce (2026-08-20). UI surfaces
   * must not display a copyable address until this is true.
   */
  get isForwardingConfigured() {
    const d = process.env.FORWARDING_DOMAIN?.trim() ?? "";
    return d.length > 0 && !d.endsWith(".example");
  },
  get captureMasterKey() {
    return required("CAPTURE_MASTER_KEY", process.env.CAPTURE_MASTER_KEY);
  },
  // ── events feed ───────────────────────────────────────────────────────────
  get ticketmasterApiKey() {
    return required("TICKETMASTER_API_KEY", process.env.TICKETMASTER_API_KEY);
  },
  get bandsintownAppId() {
    return required("BANDSINTOWN_APP_ID", process.env.BANDSINTOWN_APP_ID);
  },
  get cronSecret() {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
};
