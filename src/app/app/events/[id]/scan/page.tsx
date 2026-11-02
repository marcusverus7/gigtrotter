import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { checkInRights } from "@/features/ticketing/actions";
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
  // Promoter or a named door operator (event_staff, PAY-04); decided in the database.
  const rights = await checkInRights(id);
  if (!rights) redirect(`/app/events/${id}`);
  const isPromoter = event.promoter_id === user.id;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href={isPromoter ? `/app/events/${id}/tickets` : `/app/events/${id}`}>
          <ArrowLeft /> {isPromoter ? "Sales" : event.title}
        </Link>
      </Button>
      <h1 className="text-2xl font-bold tracking-tight">Door</h1>
      <Scanner eventId={id} eventTitle={event.title} />
    </div>
  );
}
