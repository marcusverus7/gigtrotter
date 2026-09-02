import Link from "next/link";
import { ExternalLink, Mail, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Inbox sync — V1 placeholder.
 *
 * Per §11.3 (Google CASA / Apple review friction): Gmail restricted scopes
 * require CASA assessment, which is a weeks-to-months process. The
 * forwarding-address path is the MVP equivalent — see /app/capture for the
 * user's address. This panel sets expectations and shows the queue.
 */
export function InboxSyncPanel({
  forwardingAddress,
}: {
  /** Null until a real inbound-email domain exists — never show a dead address. */
  forwardingAddress: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-secondary" />
              Inbox sync
            </CardTitle>
            <CardDescription>
              Fully automatic capture from Gmail / Outlook for your bookings,
              tickets and flights.
            </CardDescription>
          </div>
          <Badge variant="outline">V1</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-200" />
          <div>
            <p className="font-medium text-yellow-200">
              Going through Google&apos;s CASA security review.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Gmail restricted scopes require an independent security
              assessment. Until that clears, screenshot capture on the
              Capture page does the same job — same parsing pipeline, zero
              permissions.
            </p>
          </div>
        </div>

        {forwardingAddress ? (
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Your forwarding address
            </p>
            <code className="mt-1 block break-all font-mono text-sm">
              {forwardingAddress}
            </code>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Email forwarding
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Coming soon — your personal forwarding address will appear here.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-9 items-center rounded-md border border-border/60 px-3 text-sm text-muted-foreground opacity-60">
            Gmail &amp; Outlook sync — coming in V1
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/privacy">
              <ExternalLink /> Privacy promise
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
