import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  ExternalLink,
  Globe2,
  MousePointerClick,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin — Click Metrics" };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminMetricsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin gate: only allow specific user emails (hardcoded for now)
  const ADMIN_EMAILS = ["markloughran7@gmail.com"];
  if (!ADMIN_EMAILS.includes(user.email ?? "")) {
    redirect("/app");
  }

  // Use service client to bypass RLS on click analytics
  const service = createServiceClient();

  // Provider summary
  const { data: providerStats } = await service
    .from("event_outbound_clicks")
    .select("provider, clicked_at, user_id, event_id");

  type ProviderAgg = {
    total: number;
    unique_users: Set<string>;
    unique_events: Set<string>;
    last_7d: number;
    last_30d: number;
  };

  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;

  const providers: Record<string, ProviderAgg> = {};
  let totalClicks = 0;
  const uniqueUsersAll = new Set<string>();
  const uniqueEventsAll = new Set<string>();

  for (const row of providerStats ?? []) {
    totalClicks++;
    if (row.user_id) uniqueUsersAll.add(row.user_id);
    uniqueEventsAll.add(row.event_id);

    if (!providers[row.provider]) {
      providers[row.provider] = {
        total: 0,
        unique_users: new Set(),
        unique_events: new Set(),
        last_7d: 0,
        last_30d: 0,
      };
    }
    const p = providers[row.provider];
    p.total++;
    if (row.user_id) p.unique_users.add(row.user_id);
    p.unique_events.add(row.event_id);
    const t = new Date(row.clicked_at).getTime();
    if (t >= d7) p.last_7d++;
    if (t >= d30) p.last_30d++;
  }

  const sortedProviders = Object.entries(providers).sort(
    ([, a], [, b]) => b.total - a.total,
  );

  // Top events by clicks
  const eventCounts: Record<string, { count: number; title: string; city: string | null }> = {};
  for (const row of providerStats ?? []) {
    if (!eventCounts[row.event_id]) {
      eventCounts[row.event_id] = { count: 0, title: "", city: null };
    }
    eventCounts[row.event_id].count++;
  }

  // Fetch event titles for top events
  const topEventIds = Object.entries(eventCounts)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([id]) => id);

  let topEvents: { id: string; title: string; venue_city: string | null; clicks: number }[] = [];
  if (topEventIds.length > 0) {
    const { data: eventRows } = await service
      .from("events")
      .select("id, title, venue_city")
      .in("id", topEventIds);

    topEvents = (eventRows ?? [])
      .map((e) => ({
        ...e,
        clicks: eventCounts[e.id]?.count ?? 0,
      }))
      .sort((a, b) => b.clicks - a.clicks);
  }

  // Daily trend (last 30 days)
  const dailyCounts: Record<string, number> = {};
  for (const row of providerStats ?? []) {
    const day = new Date(row.clicked_at).toISOString().slice(0, 10);
    dailyCounts[day] = (dailyCounts[day] ?? 0) + 1;
  }
  const dailySorted = Object.entries(dailyCounts)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30);

  // Platform stats
  const { count: totalEvents } = await service
    .from("events")
    .select("id", { count: "exact", head: true });
  const { count: totalInterests } = await service
    .from("event_interests")
    .select("id", { count: "exact", head: true });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4 text-primary" />
          Internal · not visible to users
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          Partnership Metrics
        </h1>
        <p className="text-sm text-muted-foreground">
          Outbound click data for ticket provider partnership pitches. Every
          click on a &quot;Buy tickets&quot; link is tracked here.
        </p>
      </header>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={MousePointerClick}
          label="Total clicks"
          value={totalClicks.toLocaleString()}
        />
        <StatCard
          icon={Users}
          label="Unique clickers"
          value={uniqueUsersAll.size.toLocaleString()}
        />
        <StatCard
          icon={Globe2}
          label="Events clicked"
          value={uniqueEventsAll.size.toLocaleString()}
        />
        <StatCard
          icon={ExternalLink}
          label="Providers"
          value={sortedProviders.length.toString()}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Calendar}
          label="Total events"
          value={(totalEvents ?? 0).toLocaleString()}
          sub="in discovery"
        />
        <StatCard
          icon={TrendingUp}
          label="Interest signals"
          value={(totalInterests ?? 0).toLocaleString()}
          sub="interested + going"
        />
      </div>

      <Separator />

      {/* Provider breakdown */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Clicks by provider
        </h2>
        {sortedProviders.length === 0 ? (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base">No clicks yet</CardTitle>
              <CardDescription>
                Clicks will appear here once users start browsing events and
                clicking ticket links.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-2">
            {sortedProviders.map(([provider, stats]) => {
              const pct =
                totalClicks > 0
                  ? Math.round((stats.total / totalClicks) * 100)
                  : 0;
              return (
                <Card key={provider}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <ExternalLink className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium capitalize">{provider}</p>
                        <p className="text-xs text-muted-foreground">
                          {stats.unique_users.size} unique users · {stats.unique_events.size}{" "}
                          events
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xl font-bold tnum">
                          {stats.total.toLocaleString()}
                        </p>
                        <Badge variant="outline" className="text-[10px]">
                          {pct}%
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        7d: {stats.last_7d} · 30d: {stats.last_30d}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Separator />

      {/* Top events */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Top events by click volume
        </h2>
        {topEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-2">
            {topEvents.map((event, i) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{event.title}</p>
                    {event.venue_city ? (
                      <p className="text-xs text-muted-foreground">
                        {event.venue_city}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-sm font-bold tnum">
                    {event.clicks}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Daily trend */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Daily click trend (last 30 days)
        </h2>
        {dailySorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-1">
            {dailySorted.map(([day, count]) => {
              const maxCount = Math.max(...dailySorted.map(([, c]) => c));
              const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {day}
                  </span>
                  <div className="flex-1">
                    <div
                      className="h-5 rounded bg-primary/20"
                      style={{ width: `${Math.max(barWidth, 2)}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-xs font-bold tnum">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        This dashboard is for internal use only. Data powers partnership
        pitches — &quot;We sent X clicks to {"{provider}"} last month.&quot;
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-mono text-2xl font-bold tnum">{value}</p>
          <p className="text-xs text-muted-foreground">
            {label}
            {sub ? ` · ${sub}` : ""}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
