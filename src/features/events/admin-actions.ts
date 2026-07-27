"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Approve or reject a user-submitted event.
 *
 * Uses the service client deliberately: the reviewer is not the event's
 * promoter, so the "promoter manages own" RLS policy would block the update.
 * `requireAdmin()` is the authorisation boundary here — never call this without
 * it, and never expose the service client to a user-driven path.
 */
export async function setEventModerationStatus(
  eventId: string,
  status: "approved" | "rejected",
) {
  await requireAdmin();

  const service = createServiceClient();
  const { data, error } = await service
    .from("events")
    .update({ status } as never)
    .eq("id", eventId)
    .select("id");

  if (error) throw error;
  // `.select()` guard — an empty result means the row didn't exist or the write
  // was silently blocked, which must surface rather than look like success.
  if (!data || data.length === 0) {
    throw new Error("Event not found, or the update was blocked.");
  }

  revalidatePath("/app/admin/events");
  revalidatePath("/app/events");
}
