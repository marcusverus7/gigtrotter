import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv, isSupabaseConfigured } from "@/lib/env";

/**
 * Session-refresh middleware. Runs on every request that hits an app route.
 * If Supabase isn't configured (local dev without keys), pass through cleanly.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the auth token; the user is also what the redirects below need.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed out and heading for the app: a public event has a public page, so
  // go there rather than to a login wall; anything else goes to login with
  // the destination kept, so signing in lands where the person was going.
  // The app layout's own redirect("/login") stays as the backstop.
  if (!user) {
    const { pathname, search } = request.nextUrl;
    const publicEvent = /^\/app\/events(\/[0-9a-f-]{36})?\/?$/i.exec(pathname);
    if (publicEvent) {
      const url = request.nextUrl.clone();
      url.pathname = publicEvent[1] ? `/events${publicEvent[1]}` : "/events";
      return NextResponse.redirect(url);
    }
    if (pathname.startsWith("/app")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }

  return response;
}
