import type { Metadata } from "next";
import Link from "next/link";
import { Forward, Mail, ScanLine } from "lucide-react";

export const metadata: Metadata = { title: "Capture" };

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CaptureDropzone } from "@/features/capture/dropzone";
import { PendingCaptures } from "@/features/capture/pending-captures";
import { createClient } from "@/lib/supabase/server";
import { publicEnv, serverEnv } from "@/lib/env";

export default async function CapturePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("anon_handle")
    .eq("id", user.id)
    .single();

  // Forwarding domain is server-only; fall back to a placeholder for the UI.
  const forwardingDomain =
    process.env.FORWARDING_DOMAIN ?? "capture.gigtrotter.example";
  const forwardAddress = `${profile?.anon_handle}@${forwardingDomain}`;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Capture</h1>
        <p className="text-sm text-muted-foreground">
          Screenshot, share, or forward — the app does the rest.
        </p>
      </header>

      <CaptureDropzone />

      <PendingCaptures />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
              <Forward className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Your forwarding address</CardTitle>
              <CardDescription>
                Forward any confirmation email. Parsed the same way.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <code className="block w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {forwardAddress}
          </code>
          <p className="text-xs text-muted-foreground">
            Tip: add this to your contacts as &quot;GigTrotter&quot; — your
            phone&apos;s &quot;share&quot; sheet will offer it on every email.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Camera-roll backfill</CardTitle>
              <CardDescription>
                Scan years of ticket screenshots in minutes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/app/capture/backfill">Open backfill scan</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
