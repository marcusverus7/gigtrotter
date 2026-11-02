import Link from "next/link";
import { Music2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Spotify integration — V1 scaffold.
 *
 * The shape is wired: integrations row, an /api/integrations/spotify route
 * that handles OAuth (added in a follow-up), and the backfill flow that
 * reads top artists → crossrefs setlist.fm → surfaces "did you see these
 * live?" suggestions. Connecting needs Spotify OAuth client creds (parked).
 */
export async function SpotifyPanel() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const configured = !!serverEnv.spotifyClientId && !!serverEnv.spotifyClientSecret;
  const { data: integ } = await supabase
    .from("integrations")
    .select("source, external_id, created_at")
    .eq("user_id", user.id)
    .eq("source", "spotify")
    .maybeSingle();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Music2 className="h-4 w-4 text-secondary" />
              Spotify
            </CardTitle>
            <CardDescription>
              Cross-reference your top artists with setlist.fm to surface
              shows you might have already been to.
            </CardDescription>
          </div>
          <Badge variant={integ ? "verified" : "outline"}>
            {integ ? "Connected" : "Not connected"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {configured
            ? "Follows your top and followed artists here, so Events' \"For you\" and the tour and on-sale alerts know who you listen to. Reads nothing else."
            : "Needs Spotify client credentials on the server — not switched on yet."}
        </p>
        <div className="flex flex-wrap gap-2">
          {configured ? (
            <Button asChild size="sm">
              {/* A plain anchor: Spotify refuses to sign in inside an embedded
                  WebView, so from the shells this must open the system browser. */}
              <a href="/api/integrations/spotify" target="_blank" rel="noopener">
                {integ ? "Re-sync artists" : "Connect Spotify"}
              </a>
            </Button>
          ) : (
            <span className="inline-flex h-9 items-center rounded-md border border-border/60 px-3 text-sm text-muted-foreground opacity-60">
              Connect Spotify — needs credentials
            </span>
          )}
          <Button asChild size="sm" variant="ghost">
            <Link href="/app/import">All imports</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
