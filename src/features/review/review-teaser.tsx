import Link from "next/link";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Surface a Year-in-Review teaser on the wallet home when the user has at
 * least 6 experiences in the most-recent complete year. We offer last year
 * by default; their current year is a moving target.
 */
export async function YearReviewTeaser() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const lastYear = new Date().getFullYear() - 1;
  const start = `${lastYear}-01-01T00:00:00.000Z`;
  const end = `${lastYear + 1}-01-01T00:00:00.000Z`;
  const { count } = await supabase
    .from("experiences")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("starts_at", start)
    .lt("starts_at", end);

  if (!count || count < 6) return null;

  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-secondary/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Your {lastYear}, in review</CardTitle>
        </div>
        <CardDescription>
          {count} pins on the map. We&apos;ll fly you through them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link href={`/app/review/${lastYear}`}>Open the reel</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
