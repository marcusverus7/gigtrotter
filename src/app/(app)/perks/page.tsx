import { redirect } from "next/navigation";
import { Calendar, Crown, ExternalLink } from "lucide-react";

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
 * /app/perks — live partner perks catalogue.
 *
 * Free tier sees the cards as previews (cta_url hidden). Plus members get
 * the live link. The preview/upsell happens naturally on the perk — never
 * as an interruption — per the perks-club model.
 */
export default async function PerksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: perks }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    supabase
      .from("pro_perks")
      .select("*")
      .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
      .order("created_at", { ascending: false }),
  ]);

  const isPlus = profile?.plan === "plus";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Crown className="h-4 w-4 text-primary" />
          Member perks.
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          GigTrotter+ perks
        </h1>
        <p className="text-sm text-muted-foreground">
          Discounts, VIP access, prize draws — partner-supplied. We earn an
          affiliate cut on every claim.
        </p>
      </header>

      {!perks || perks.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Catalogue empty</CardTitle>
            <CardDescription>
              We&apos;re signing partners. Check back during private beta — or
              join the waitlist in settings to be notified at launch.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {perks.map((p) => (
            <PerkCard key={p.id} perk={p} unlocked={isPlus} />
          ))}
        </div>
      )}
    </div>
  );
}

function PerkCard({
  perk,
  unlocked,
}: {
  perk: {
    id: string;
    kind: string;
    partner: string;
    title: string;
    body: string;
    cta_url: string | null;
    ends_at: string | null;
    region: string | null;
  };
  unlocked: boolean;
}) {
  const ending = perk.ends_at
    ? new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
      }).format(new Date(perk.ends_at))
    : null;

  const kindVariant: Record<string, "inner" | "friends" | "open" | "verified"> = {
    discount: "inner",
    vip_access: "verified",
    prize_draw: "open",
    fee_waiver: "friends",
  };
  const variant = kindVariant[perk.kind] ?? "outline";

  return (
    <Card className="group h-full transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_20px_60px_-15px_rgba(124,58,237,0.3)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <Badge variant={variant} className="text-[10px] capitalize">
            {perk.kind.replace("_", " ")}
          </Badge>
          {ending ? (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Until {ending}
            </span>
          ) : null}
        </div>
        <CardTitle className="mt-2 text-base">{perk.title}</CardTitle>
        <CardDescription className="text-xs">{perk.body}</CardDescription>
      </CardHeader>
      <CardContent>
        {unlocked && perk.cta_url ? (
          <Button asChild size="sm" variant="outline" className="w-full">
            <a
              href={`/api/affiliate/perk?perk=${perk.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Claim with {perk.partner}
              <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button size="sm" variant="ghost" className="w-full" disabled>
            <Crown /> Plus members only
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
