import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Scanner } from "@/features/ticketing/scanner";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Door scanner" };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { data: event } = await supabase.from("events").select("id, title, promoter_id").eq("id", id).maybeSingle();
  if (!event) notFound();
  if (event.promoter_id !== user.id) redirect(`/app/events/${id}`);
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/app/events/${id}/tickets`}>
          <ArrowLeft /> Sales
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">Door</h1>
      <Scanner eventId={id} eventTitle={event.title} />
    </div>
  );
}
