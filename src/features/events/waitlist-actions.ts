"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export async function toggleWaitlist(eventId: string, wanted: boolean) {
  const id = z.string().uuid().parse(eventId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (wanted) {
    const { error } = await supabase
      .from("event_waitlist")
      .upsert({ user_id: user.id, event_id: id } as never, { onConflict: "user_id,event_id", ignoreDuplicates: true });
    if (error) throw new Error(error.code === "42P01" ? "Waitlist is not switched on yet." : error.message);
  } else {
    const { data, error } = await supabase
      .from("event_waitlist")
      .delete()
      .eq("user_id", user.id)
      .eq("event_id", id)
      .select("event_id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("You were not on the list.");
  }
  revalidatePath(`/app/events/${id}`);
}
