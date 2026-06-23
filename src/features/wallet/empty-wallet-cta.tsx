import Link from "next/link";
import { ScanLine, PenLine, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

/**
 * First-run empty state for the wallet page. Shown when the user has no
 * wallet items yet. Guides them to Capture (screenshot scan) or the manual
 * add form.
 */
export function EmptyWalletCta() {
  return (
    <Card className="mx-auto mt-12 max-w-md overflow-hidden border-primary/30">
      <CardHeader className="bg-gradient-to-br from-primary/15 via-card to-secondary/10">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Ticket className="h-6 w-6" />
        </div>
        <CardTitle className="text-xl">
          Your wallet is empty — let&apos;s fix that
        </CardTitle>
        <CardDescription className="text-sm">
          Scan a ticket screenshot and GigTrotter automatically builds your
          gig map, countdown, and trip plan. Every scan is editable before it
          saves.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 pt-6">
        <Button asChild className="w-full gap-2">
          <Link href="/app/capture">
            <ScanLine className="h-4 w-4" />
            Scan your first ticket
          </Link>
        </Button>

        <Button asChild variant="outline" className="w-full gap-2">
          <Link href="/app/capture/manual">
            <PenLine className="h-4 w-4" />
            Add one manually
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
