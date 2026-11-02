import { NextResponse, type NextRequest } from "next/server";

import { publicEnv, serverEnv } from "@/lib/env";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Step two: exchange the code, read the user's top and followed artists,
 * and follow them here — which is what fills "For you" on Events and powers
 * the tour / on-sale alerts. Tokens are stored on the integrations row
 * (owner-only RLS) for a later re-sync; nothing else is read.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/app/settings?spotify=${q}`, request.url));

  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const clientId = serverEnv.spotifyClientId;
  const clientSecret = serverEnv.spotifyClientSecret;
  if (!clientId || !clientSecret) return back("unconfigured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = request.cookies.get("spotify_oauth_state")?.value;
  if (!code || !state || !expected || state !== expected) return back("denied");

  const redirectUri = `${publicEnv.siteUrl}/api/integrations/spotify/callback`;
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenRes.ok) {
    console.error("[spotify] token exchange failed", tokenRes.status);
    return back("failed");
  }
  const token = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  const auth = { Authorization: `Bearer ${token.access_token}` };
  const [me, top, followed] = await Promise.all([
    fetch("https://api.spotify.com/v1/me", { headers: auth, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)),
    fetch("https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term", { headers: auth, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)),
    fetch("https://api.spotify.com/v1/me/following?type=artist&limit=50", { headers: auth, signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)),
  ]);
  const names = new Map<string, string>();
  for (const a of (top?.items ?? []) as Array<{ name?: string; id?: string }>) if (a.name) names.set(a.name.toLowerCase(), a.name);
  for (const a of (followed?.artists?.items ?? []) as Array<{ name?: string }>) if (a.name) names.set(a.name.toLowerCase(), a.name);

  const supabase = await createClient();
  await supabase.from("integrations").upsert(
    {
      user_id: user.id,
      source: "spotify",
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      scope: token.scope ?? null,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      external_id: (me as { id?: string } | null)?.id ?? null,
      meta: { artists: names.size },
    } as never,
    { onConflict: "user_id,source" },
  );

  // Follows feed the Bandsintown sync, "For you", and the alerts. Existing
  // follows are untouched (unique on user, kind, name).
  const rows = [...names.values()].slice(0, 120).map((name) => ({ user_id: user.id, kind: "artist", name }));
  if (rows.length > 0) {
    await supabase.from("follows").upsert(rows as never, { onConflict: "user_id,kind,name", ignoreDuplicates: true });
  }

  const res = back(`connected&artists=${rows.length}`);
  res.cookies.delete("spotify_oauth_state");
  return res;
}
