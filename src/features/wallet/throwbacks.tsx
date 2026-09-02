import Link from "next/link";
import { Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * "On this day" — a quiet header strip on the wallet home when the user
 * has past experiences sharing today's day-of-year. Cheap, beautiful,
 * compounds with library size. §8.2 throwbacks.
 */
export async function ThrowbacksStrip() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data } = await supabase.rpc("on_this_day", {
    target_user: user.id,
  });

  // on_this_day returns `setof experiences`, so `id` here is an EXPERIENCE id.
  // Linking it to /app/item/<id> -- which looks up wallet_items -- meant every
  // throwback 404'd. The wallet item is a separate column.
  const items = ((data ?? []) as Array<{
    id: string;
    wallet_item_id: string | null;
    title: string;
    starts_at: string;
    kind: string;
  }>).filter(
    // A pin outlives its wallet item (ON DELETE SET NULL), and a throwback
    // with nowhere to go is worse than no throwback.
    (i): i is typeof i & { wallet_item_id: string } => i.wallet_item_id !== null,
  );

  if (items.length === 0) return null;

  const yearsAgo = (iso: string) => {
    const then = new Date(iso);
    const diff = Date.now() - then.getTime();
    const years = Math.max(1, Math.round(diff / (365.25 * 86400_000)));
    return `${years} year${years === 1 ? "" : "s"} ago`;
  };

  return (
    <Card className="overflow-hidden border-secondary/30 bg-gradient-to-r from-secondary/10 via-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-secondary" />
          <CardTitle className="text-base">On this day</CardTitle>
        </div>
        <CardDescription>The compounding asset, ticking.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.slice(0, 4).map((i) => (
            <li key={i.id}>
              <Link
                href={`/app/item/${i.wallet_item_id}`}
                className="group flex items-center justify-between gap-3 rounded-md p-2 transition-colors hover:bg-accent/30"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {i.title}
                </span>
                <span className="font-mono text-xs text-muted-foreground tnum">
                  {yearsAgo(i.starts_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
