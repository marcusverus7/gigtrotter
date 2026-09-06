import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ExternalLink } from "lucide-react";

export const metadata: Metadata = { title: "Alerts" };

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocalDateTime } from "@/components/local-datetime";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { AlertDismisser } from "@/features/wishlist/alert-dismisser";

const KIND_LABEL: Record<string, string> = {
  doors_tonight: "Tonight",
  friend_going: "Friend going",
  on_sale: "On sale",
  price_drop: "Price drop",
  tour_announce: "Tour announced",
};

const KIND_VARIANT: Record<
  string,
  "inner" | "friends" | "open" | "verified" | "outline"
> = {
  doors_tonight: "inner",
  friend_going: "friends",
  on_sale: "open",
  price_drop: "verified",
  tour_announce: "inner",
};

export default async function AlertsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", user.id)
    .neq("state", "dismissed")
    .order("created_at", { ascending: false })
    .limit(50);

  // Opening this page IS reading your alerts. Nothing else ever marked them
  // read, so the bell badge was permanent nagware — the only way to clear it
  // was dismissing every alert one X at a time. The rows fetched above still
  // carry state='unread', so this visit renders them highlighted; the badge
  // clears from the next navigation.
  await supabase
    .from("alerts")
    .update({ state: "read" })
    .eq("user_id", user.id)
    .eq("state", "unread");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Bell className="h-4 w-4 text-primary" />
          Doors tonight, and who else is going.
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Alerts</h1>
      </header>

      {!alerts || alerts.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">All caught up</CardTitle>
            <CardDescription>
              You&apos;ll hear from us the day of a gig, and when someone in
              your inner circle turns out to be going to the same thing. Add a
              gig to your{" "}
              <Link href="/app" className="text-primary underline">
                wallet
              </Link>{" "}
              and this fills itself in.
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
                      // In the VIEWER's zone, not the server's (UTC on
                      // Vercel), and with the time for on-sale alerts — the
                      // one fact an on-sale alert exists to deliver is when
                      // to be at the ticket page, and it was not on screen.
                      <LocalDateTime
                        className="font-mono text-xs text-muted-foreground"
                        iso={a.event_at}
                        options={{
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          ...(a.kind === "on_sale"
                            ? { hour: "2-digit", minute: "2-digit" }
                            : {}),
                        }}
                      />
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
