"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/** Public bucket — these are social photos shown to other attendees, so they
 *  must not live in `captures`, which is private and holds encrypted source
 *  artefacts. See migration 0013. */
const DISCUSSION_PHOTO_BUCKET = "discussion-photos";

export async function createDiscussionPost(input: {
  eventId: string;
  body: string | null;
  photos: string[];
  postType?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!input.body?.trim() && input.photos.length === 0) {
    throw new Error("Post needs text or at least one photo.");
  }

  const { error } = await supabase.from("discussion_posts").insert({
    event_id: input.eventId,
    author_id: user.id,
    body: input.body?.trim() || null,
    photos: input.photos,
    post_type: input.photos.length > 0 && !input.body?.trim() ? "photo_dump" : "post",
  });

  if (error) {
    if (error.code === "42501") {
      throw new Error(
        "Only ticket holders who purchased through GigTrotter can post. Your ticket needs the purple tick.",
      );
    }
    throw error;
  }

  revalidatePath(`/app/events/${input.eventId}/discussion`);
}

export async function createDiscussionReply(input: {
  postId: string;
  eventId: string;
  body: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!input.body.trim()) throw new Error("Reply can't be empty.");

  const { error } = await supabase.from("discussion_replies").insert({
    post_id: input.postId,
    author_id: user.id,
    body: input.body.trim(),
  });

  if (error) {
    if (error.code === "42501") {
      throw new Error("Only platform purchasers can reply.");
    }
    throw error;
  }

  // Recompute from the source of truth rather than read-then-increment: that
  // pattern loses counts under concurrent replies and drifts if an insert was
  // silently blocked. A direct count is race-safe and self-healing.
  const { count } = await supabase
    .from("discussion_replies")
    .select("id", { count: "exact", head: true })
    .eq("post_id", input.postId);
  await supabase
    .from("discussion_posts")
    .update({ reply_count: count ?? 0 })
    .eq("id", input.postId);

  revalidatePath(`/app/events/${input.eventId}/discussion`);
}

export async function toggleReaction(input: {
  postId: string;
  eventId: string;
  reaction?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("discussion_reactions")
    .select("id")
    .eq("post_id", input.postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("discussion_reactions")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", user.id);
  } else {
    await supabase.from("discussion_reactions").insert({
      post_id: input.postId,
      user_id: user.id,
      reaction: input.reaction ?? "fire",
    });
  }

  revalidatePath(`/app/events/${input.eventId}/discussion`);
}

export async function deleteDiscussionPost(postId: string, eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("discussion_posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id);

  revalidatePath(`/app/events/${eventId}/discussion`);
}

export async function createPromoterAnnouncement(input: {
  eventId: string;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  isPinned: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: event } = await supabase
    .from("events")
    .select("promoter_id")
    .eq("id", input.eventId)
    .maybeSingle();

  if (!event || event.promoter_id !== user.id) {
    throw new Error("Only the event promoter can send announcements.");
  }

  const { error } = await supabase.from("promoter_announcements").insert({
    event_id: input.eventId,
    promoter_id: user.id,
    title: input.title.trim(),
    body: input.body.trim(),
    cta_label: input.ctaLabel?.trim() || null,
    cta_url: input.ctaUrl?.trim() || null,
    is_pinned: input.isPinned,
  });

  if (error) throw error;
  revalidatePath(`/app/events/${input.eventId}/discussion`);
}

export async function uploadDiscussionPhoto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const file = formData.get("photo") as File;
  if (!file) throw new Error("No file provided.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Max 5MB per photo.");

  const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
  const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXT.has(rawExt) || !ALLOWED_MIME.has(file.type))
    throw new Error("Only jpg, png, webp, and gif images are allowed.");
  const ext = rawExt;
  // The uid MUST be the first path segment: the storage policy checks
  // `auth.uid()::text = (storage.foldername(name))[1]`. This previously wrote to
  // `discussions/<uid>/...` in the private `captures` bucket, so the upload was
  // denied by RLS and the returned public URL answered 400 — see migration 0013.
  const path = `${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(DISCUSSION_PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(DISCUSSION_PHOTO_BUCKET).getPublicUrl(path);

  return publicUrl;
}
