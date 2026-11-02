import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { publicEnv, serverEnv } from "@/lib/env";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Step one of Spotify connect: bounce to Spotify's consent page.
 *
 * Dormant until SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set, with the
 * redirect URI `<site>/api/integrations/spotify/callback` registered in the
 * Spotify dashboard. Only `user-top-read` is requested — enough to seed
 * follows; no playlists, no playback.
 *
 * Opens in the system browser from the shells (an external link), which is
 * also what Spotify requires — it refuses to sign in inside an embedded
 * WebView.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const clientId = serverEnv.spotifyClientId;
  if (!clientId || !serverEnv.spotifyClientSecret) {
    return NextResponse.redirect(new URL("/app/settings?spotify=unconfigured", request.url));
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = `${publicEnv.siteUrl}/api/integrations/spotify/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "user-top-read user-follow-read",
    state,
    show_dialog: "false",
  });
  const res = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
  res.cookies.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/integrations/spotify",
    maxAge: 600,
  });
  return res;
}
