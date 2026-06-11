import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { SubmitEventForm } from "@/features/events/submit-event-form";

export const metadata: Metadata = { title: "Submit an Event" };

export default async function SubmitEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/app/events">
          <ArrowLeft /> Back to events
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl">Submit an event</CardTitle>
          </div>
          <CardDescription>
            Add your event to GigTrotter. Users can discover it, mark
            interest, and click through to your ticket link. All outbound
            clicks are tracked.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmitEventForm promoterName={profile?.display_name ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
