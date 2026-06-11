"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(formData: FormData) {
  const message = formData.get("message") as string;
  const pageUrl = formData.get("pageUrl") as string;
  const category = (formData.get("category") as string) || "general";

  if (!message?.trim()) return { error: "Message is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("feedback").insert({
    user_id: user?.id ?? null,
    page_url: pageUrl,
    category,
    message: message.trim(),
  });

  if (error) return { error: "Failed to submit feedback" };
  return { success: true };
}
