import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ExternalLink } from "lucide-react";

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
import { AlertDismisser } from "@/features/wishlist/alert-dismisser";

const KIND_LABEL: Record<string, string> = {
  on_sale: "On sale",
  price_drop: "Price drop",
  tour_announce: "Tour announced",
  friend_going: "Friend going",
};

const KIND_VARIANT: Record<
  string,
  "inner" | "friends" | "open" | "verified" | "outline"
> = {
  on_sale: "open",
  price_drop: "verified",
  tour_announce: "inner",
  friend_going: "friends",
};

export default async function AlertsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .neq("state", "dismissed")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bell className="h-4 w-4 text-primary" />
          When things you&apos;re watching change.
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Alerts</h1>
      </header>

      {!alerts || alerts.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">All caught up</CardTitle>
            <CardDescription>
              We&apos;ll surface tour announcements, on-sale dates and price
              drops for everything on your{" "}
              <Link href="/app/wishlist" className="text-primary underline">
                wishlist
              </Link>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card
              key={a.id}
              className={`group transition-colors hover:border-primary/40 ${
                a.state === "unread" ? "border-primary/30 bg-card/80" : ""
              }`}
            >
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_VARIANT[a.kind] ?? "outline"}>
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </Badge>
                    {a.state === "unread" ? (
                      <span className="relative inline-flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                      </span>
                    ) : null}
                    {a.event_at ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(a.event_at))}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base font-medium leading-tight">
                    {a.title}
                  </p>
                  {a.body ? (
                    <p className="text-sm text-muted-foreground">{a.body}</p>
                  ) : null}
                  {a.url ? (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/affiliate/${a.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink /> Open on {a.partner ?? "site"}
                      </a>
                    </Button>
                  ) : null}
                </div>
                <AlertDismisser id={a.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
