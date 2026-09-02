import { cache } from "react";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv, serverEnv } from "@/lib/env";

/** Server-side Supabase client (RSC + route handlers). Honours user session. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
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
 * The signed-in user for the current request, resolved AT MOST ONCE.
 *
 * `supabase.auth.getUser()` is not a cookie read — it is an HTTPS call to
 * Supabase Auth that verifies the JWT server-side. There are ~90 call sites
 * across the server components, and one wallet-page navigation was paying for
 * SIX of them (middleware, layout, page, and three widgets), each serializing
 * its own round trip before its own query could start. React's `cache()`
 * dedupes per request: everyone who asks after the first gets the same
 * promise for free.
 *
 * Use this in preference to calling supabase.auth.getUser() directly in any
 * server component or page.
 */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Service-role client. Bypasses RLS — use ONLY in trusted server contexts
 * (inbound webhook, scheduled jobs). Never expose to client code paths.
 */
export function createServiceClient() {
  return createServerClient(
    publicEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  );
}
