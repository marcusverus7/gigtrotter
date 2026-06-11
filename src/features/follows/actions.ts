"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const FollowInput = z.object({
  kind: z.enum(["artist", "promoter", "venue"]),
  name: z.string().min(1).max(120),
  externalId: z.string().optional().nullable(),
});

export async function follow(input: z.infer<typeof FollowInput>) {
  const parsed = FollowInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase.from("follows").insert({
    user_id: user.id,
    kind: parsed.kind,
    name: parsed.name.trim(),
    external_id: parsed.externalId ?? null,
  });
  if (error) {
    if (error.code === "23505") throw new Error("Already followed.");
    throw error;
  }
  revalidatePath("/app/discover");
}

export async function unfollow(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await supabase
    .from("follows")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/app/discover");
}
