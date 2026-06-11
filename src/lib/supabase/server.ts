import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/** Server-side Supabase client (RSC + route handlers). Honours user session. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // RSCs can't set cookies — middleware handles refresh instead.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server contexts
 * (inbound webhook, scheduled jobs). Never expose to client code paths.
 */
export function createServiceClient() {
  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
