import { LocalDateTime } from "@/components/local-datetime";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquare, Bug, Lightbulb, Paintbrush, Globe } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getAdminUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin — Feedback" };

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; variant: "outline" | "verified" | "destructive" | "friends" }> = {
  bug:     { label: "Bug",     icon: Bug,          variant: "destructive" },
  idea:    { label: "Idea",    icon: Lightbulb,    variant: "verified" },
  design:  { label: "Design",  icon: Paintbrush,   variant: "friends" },
  general: { label: "General", icon: MessageSquare, variant: "outline" },
};

export default async function FeedbackAdminPage() {
  // Every feedback message, with the user_id attached — owner only. This gate
  // used to be `if (adminEmail && user.email !== adminEmail)`, so an unset
  // ADMIN_EMAIL opened the page to every signed-in user: exactly the wrong way
  // round for a missing secret. Use the shared allowlist, which never fails
  // open, rather than a third hand-rolled check.
  const user = await getAdminUser();
  if (!user) redirect("/app");

  type FeedbackRow = {
    id: string;
    user_id: string | null;
    page_url: string | null;
    category: string;
    message: string;
    created_at: string;
    profiles: { display_name: string | null; username: string | null } | null;
  };

  const service = createServiceClient();
  // The `feedback` table and its `profiles` embed aren't in the generated
  // Supabase types, so the query builder can't infer them. Query loosely at the
  // `.from()` boundary and apply our own row shape.
  const { data } = await (service.from("feedback") as any)
    .select(
      "id, user_id, page_url, category, message, created_at, profiles(display_name, username)",
    )
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as FeedbackRow[];

  const byCategory = (rows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Tester Feedback</h1>
        <p className="text-sm text-muted-foreground">
          All in-app submissions · {rows?.length ?? 0} total
        </p>
      </header>

      {/* Category summary */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <div
            key={key}
            className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-4 py-2 text-sm"
          >
            <meta.icon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium capitalize">{meta.label}</span>
            <span className="text-muted-foreground">{byCategory[key] ?? 0}</span>
          </div>
        ))}
      </div>

      {rows?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No feedback yet. Share the TestFlight link and check back here.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {(rows ?? []).map((row) => {
          const meta = CATEGORY_META[row.category] ?? CATEGORY_META.general;
          const Icon = meta.icon;
          const submitter =
            row.profiles?.display_name ??
            row.profiles?.username ??
            "Anonymous";
          const ts = (
            <LocalDateTime
              iso={row.created_at}
              options={{
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }}
            />
          );

          return (
            <Card key={row.id} className="border-border/60">
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <Badge variant={meta.variant} className="capitalize">
                      {meta.label}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{submitter}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    <span className="font-mono">{row.page_url}</span>
                    <span>·</span>
                    <span>{ts}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{row.message}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
