"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const ReviewInput = z.object({
  experienceId: z.string().uuid(),
  rating: z.number().int().min(0).max(5),
  review: z.string().max(1500).nullable(),
});

export async function saveReview(input: z.infer<typeof ReviewInput>) {
  const parsed = ReviewInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("experiences")
    .update({
      rating: parsed.rating === 0 ? null : parsed.rating,
      review: parsed.review,
    })
    .eq("id", parsed.experienceId)
    .eq("user_id", user.id)
    .select("id");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Review update was blocked.");
  }
  revalidatePath(`/app/item`);
}

/**
 * Photos live in the `captures` bucket under a `<user_id>/photos/<id>/`
 * prefix. We store the storage refs as a JSONB array on experiences.photos.
 */
export async function uploadExperiencePhoto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const experienceId = formData.get("experienceId");
  const file = formData.get("photo");
  if (typeof experienceId !== "string" || !(file instanceof Blob)) {
    throw new Error("missing fields");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Photo must be under 8MB.");
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const key = `${user.id}/photos/${experienceId}/${crypto.randomUUID()}.${ext}`;

  // Read the existing list BEFORE uploading. The other order left an orphaned
  // object in the private bucket whenever the experience turned out not to be
  // yours, and — worse — if this select failed while the update succeeded, the
  // array was replaced by a single key and the previous photos were gone.
  const { data: existing, error: readErr } = await supabase
    .from("experiences")
    .select("photos")
    .eq("id", experienceId)
    .eq("user_id", user.id)
    .single();
  if (readErr || !existing) throw new Error("Experience not found.");

  const { error: upErr } = await supabase.storage
    .from("captures")
    .upload(key, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(upErr.message);

  const photos = Array.isArray(existing.photos)
    ? (existing.photos as string[])
    : [];
  photos.push(key);

  const { data: saved, error: saveErr } = await supabase
    .from("experiences")
    .update({ photos })
    .eq("id", experienceId)
    .eq("user_id", user.id)
    .select("id");
  if (saveErr || !saved || saved.length === 0) {
    // The object is already in the bucket; leaving it there while telling the
    // user the photo was added is the one outcome worth avoiding.
    await supabase.storage.from("captures").remove([key]);
    throw new Error("Couldn't attach the photo.");
  }

  revalidatePath(`/app/item`);
}

export async function removeExperiencePhoto(
  experienceId: string,
  key: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: existing } = await supabase
    .from("experiences")
    .select("photos")
    .eq("id", experienceId)
    .eq("user_id", user.id)
    .single();
  const photos = Array.isArray(existing?.photos)
    ? (existing.photos as string[])
    : [];
  await supabase.storage.from("captures").remove([key]);
  await supabase
    .from("experiences")
    .update({ photos: photos.filter((p) => p !== key) })
    .eq("id", experienceId)
    .eq("user_id", user.id);
  revalidatePath(`/app/item`);
}
