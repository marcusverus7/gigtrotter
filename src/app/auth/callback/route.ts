import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback for BOTH flows Supabase can send here:
 *
 *   1. OAuth / PKCE  → `?code=...`
 *      Google/Apple sign-in. Exchanged for a session.
 *
 *   2. Email links   → `?token_hash=...&type=recovery|signup|email_change|invite`
 *      Password reset and email confirmation. These never carry a `code`.
 *
 * Handling only (1) — as this route used to — meant every password-reset link
 * fell through to the failure redirect: the user was bounced to /login, tried
 * their OLD password, and got "invalid credentials". The reset was never
 * applied because no recovery session was ever established. Email confirmation
 * links were broken the same way.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Supabase reports its own failures (expired/consumed link) as query params
  // rather than an exception — surface them instead of showing a generic error.
  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");

  const raw = searchParams.get("next") ?? "/app";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/app";

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`);

  if (providerError) {
    console.error("[auth/callback] provider error:", providerError);
    return fail("link_invalid");
  }

  const supabase = await createClient();

  // Email links: recovery, signup confirmation, email change, invite.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] verifyOtp failed:", type, error.message);
    // A used or expired link is the common case and deserves its own message.
    return fail("link_invalid");
  }

  // OAuth / PKCE.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] code exchange failed:", error.message);
    return fail("oauth_failed");
  }

  return fail("no_credentials");
}
