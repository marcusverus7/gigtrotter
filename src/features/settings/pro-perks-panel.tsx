import { Crown, Plane, Shield, Sparkles, Ticket } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PlusMembershipCta } from "./plus-membership-cta";

/**
 * GigTrotter+ as a perks club — NOT a feature paywall.
 *
 * Per Mark's call: free tier loses nothing. Pro is value-add above the
 * product. Revenue plays are the resale marketplace booking fees and
 * affiliate commissions; the membership exists to gather the audience that
 * commands those affiliate deals.
 */
export function ProPerksPanel({ isPlus }: { isPlus: boolean }) {
  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card to-secondary/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-primary" />
              GigTrotter+
            </CardTitle>
            <CardDescription>
              A members&apos; club. Free tier never gets worse — Plus adds
              perks on top.
            </CardDescription>
          </div>
          <Badge variant={isPlus ? "verified" : "outline"}>
            {isPlus ? "Active" : "Not subscribed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-2 sm:grid-cols-2">
          <PerkRow
            icon={Ticket}
            title="Promoter discounts"
            body="Partner ticket discounts on shows you wishlist."
          />
          <PerkRow
            icon={Plane}
            title="Flight & stay perks"
            body="Discounted flights and rooms from partner brands."
          />
          <PerkRow
            icon={Sparkles}
            title="VIP access & prize draws"
            body="Members&apos;-only ballots for sold-out shows."
          />
          <PerkRow
            icon={Shield}
            title="Marketplace fee waiver"
            body="Skip the buyer booking fee on resale tickets."
          />
        </ul>

        <PlusMembershipCta />
      </CardContent>
    </Card>
  );
}

function PerkRow({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}
