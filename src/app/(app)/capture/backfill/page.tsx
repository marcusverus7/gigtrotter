import { Camera } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BackfillScan } from "@/features/capture/backfill-scan";

/**
 * Camera-roll backfill scan (§8.1, MVP).
 *
 * Web fallback: a multi-file picker. The user selects a stack of screenshots
 * and we parse them sequentially, surfacing confirm cards as they complete.
 * The native scan (Expo on-device classifier) lands in V1 — phase 8+.
 *
 * This is the cold-start killer: most people have years of ticket screenshots
 * already on their phone. The map populates in the first ten minutes.
 */
export default function BackfillPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Badge variant="inner">Onboarding</Badge>
          <Badge variant="outline">Web</Badge>
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Backfill from your camera roll
        </h1>
        <p className="text-sm text-muted-foreground">
          Pick the ticket screenshots already on your phone. We&apos;ll parse
          them and you&apos;ll confirm a batch at a time. Your map populates in
          minutes.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Multi-file scan</CardTitle>
              <CardDescription>
                Up to 50 images per batch. Anything that looks like a ticket or
                booking will land as a confirm card on the Capture page.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <BackfillScan />
        </CardContent>
      </Card>
    </div>
  );
}
