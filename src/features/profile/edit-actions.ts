"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const ProfileInput = z.object({
  display_name: z.string().max(60).optional().nullable(),
  username: z.string().regex(/^[a-z0-9_]{3,30}$/),
});

export async function updateProfile(input: z.infer<typeof ProfileInput>) {
  const parsed = ProfileInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.display_name?.trim() || null,
      username: parsed.username,
    })
    .eq("id", user.id)
    .select("id");

  if (error) {
    if (error.code === "23505") throw new Error("Username already taken.");
    throw error;
  }
  if (!data || data.length === 0) throw new Error("Update was blocked.");

  revalidatePath("/app/settings");
}

/**
 * Upload an avatar to the public `avatars` bucket and stamp the URL onto
 * the profile. We use a per-user path so the storage RLS policy (defined
 * in 0002) treats subsequent uploads as owner writes.
 */
export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const file = formData.get("avatar");
  if (!(file instanceof Blob)) throw new Error("file required");
  if (file.size > 4 * 1024 * 1024) {
    throw new Error("Avatar must be under 4MB.");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const key = `${user.id}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(key, file, { upsert: true, contentType: file.type });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(key);
  // Cache-bust so the new image actually appears.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
}
