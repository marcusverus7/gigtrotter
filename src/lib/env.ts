/**
 * Centralised, typed environment access.
 *
 * Public (NEXT_PUBLIC_*) vars are read inline so Next can inline them at build.
 * Server secrets are read lazily via getters so the client bundle never trips
 * over them, and so a missing-but-unused secret never breaks the build during
 * phase 0/1 when not every integration is wired yet.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
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
    return process.env.ANTHROPIC_PARSE_MODEL ?? "claude-fable-5";
  },
  get inboundWebhookSecret() {
    return required("INBOUND_WEBHOOK_SECRET", process.env.INBOUND_WEBHOOK_SECRET);
  },
  get forwardingDomain() {
    return process.env.FORWARDING_DOMAIN ?? "capture.gigtrotter.example";
  },
  get captureMasterKey() {
    return required("CAPTURE_MASTER_KEY", process.env.CAPTURE_MASTER_KEY);
  },
};
