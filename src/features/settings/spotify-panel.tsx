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
import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

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
          Coming with V1 — Spotify OAuth flow + the &quot;did you see these
          live?&quot; swipe session that turns scrobble history into pins.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" disabled>
            <span>Connect Spotify (V1)</span>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/app/import">All imports</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
