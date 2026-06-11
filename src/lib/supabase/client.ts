"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Browser-side Supabase client. Reads anon session from cookies.
 *
 * Untyped at the query-builder level on purpose — until we link a live
 * Supabase project and regenerate types, the hand-written Database type
 * fights with supabase-js generics. Domain types live alongside in
 * `./types.ts` and are imported directly where we need shape safety.
 */
export function createClient() {
  return createBrowserClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
  );
}
