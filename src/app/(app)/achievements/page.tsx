import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ACHIEVEMENTS } from "@/features/achievements/achievements";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const TIER_STYLE: Record<
  number,
  { ring: string; chip: "outline" | "inner" | "friends" | "verified" | "open" }
> = {
  1: { ring: "from-muted to-transparent", chip: "outline" },
  2: { ring: "from-circle-friends/30 to-transparent", chip: "friends" },
  3: { ring: "from-circle-inner/40 to-transparent", chip: "inner" },
  4: { ring: "from-circle-open/40 to-transparent", chip: "open" },
  5: { ring: "from-primary/60 via-secondary/40 to-transparent", chip: "verified" },
};

export default async function AchievementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: counts }, { data: profile }] = await Promise.all([
    supabase
      .from("achievements")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("created_at")
      .eq("id", user.id)
      .single(),
  ]);

  const ctx = {
    gigs: counts?.gig_count ?? 0,
    flights: counts?.flight_count ?? 0,
    countries: counts?.country_count ?? 0,
    veteran:
      !!profile?.created_at &&
      Date.now() - new Date(profile.created_at).getTime() >
        30 * 86400_000,
  };

  const unlocked = ACHIEVEMENTS.filter((a) => a.unlocked(ctx));
  const locked = ACHIEVEMENTS.filter((a) => !a.unlocked(ctx));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Verified-only
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Achievements</h1>
        <p className="text-sm text-muted-foreground">
          Earned only via verified pins — geofence, ticket scan, or manual
          confirmation. Type-in history doesn&apos;t count.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        <StatTile label="Gigs" value={ctx.gigs} />
        <StatTile label="Flights" value={ctx.flights} />
        <StatTile label="Countries" value={ctx.countries} />
        <StatTile label="Unlocked" value={unlocked.length} highlight />
        <StatTile label="Total" value={ACHIEVEMENTS.length} />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Unlocked · {unlocked.length}
        </h2>
        {unlocked.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No badges yet. Confirm an attended item to unlock your first pin.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {unlocked.map((a) => (
              <BadgeCard
                key={a.id}
                achievement={a}
                ctx={ctx}
                unlocked
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Locked · {locked.length}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {locked.map((a) => (
            <BadgeCard
              key={a.id}
              achievement={a}
              ctx={ctx}
              unlocked={false}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/60 p-3 text-center",
        highlight && "border-primary/40 bg-primary/5",
      )}
    >
      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-2xl font-bold tnum">{value}</p>
    </div>
  );
}

function BadgeCard({
  achievement,
  ctx,
  unlocked,
}: {
  achievement: (typeof ACHIEVEMENTS)[number];
  ctx: { gigs: number; flights: number; countries: number };
  unlocked: boolean;
}) {
  const Icon = achievement.icon;
  const style = TIER_STYLE[achievement.tier];
  const prog = achievement.progress?.(ctx);

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-all",
        unlocked
          ? "border-primary/30 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.4)]"
          : "border-border/40 opacity-70 grayscale",
      )}
    >
      {unlocked ? (
        <div
          className={cn(
            "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl",
            style.ring,
          )}
        />
      ) : null}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl",
              unlocked
                ? "bg-primary/15 text-primary"
                : "bg-muted/30 text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          {unlocked ? (
            <Badge variant={style.chip} className="text-[10px]">
              Tier {achievement.tier}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-base">{achievement.title}</CardTitle>
        <CardDescription className="text-xs">{achievement.blurb}</CardDescription>
      </CardHeader>
      {prog ? (
        <CardContent className="pt-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono tnum">
              {prog[0]} / {prog[1]}
            </span>
            <span>{Math.round((prog[0] / prog[1]) * 100)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-primary to-secondary transition-all"
              style={{ width: `${Math.min(100, (prog[0] / prog[1]) * 100)}%` }}
            />
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
