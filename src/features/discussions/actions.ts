"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

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

  const { data: post } = await supabase
    .from("discussion_posts")
    .select("reply_count")
    .eq("id", input.postId)
    .single();
  if (post) {
    await supabase
      .from("discussion_posts")
      .update({ reply_count: (post.reply_count ?? 0) + 1 })
      .eq("id", input.postId);
  }

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
  const path = `discussions/${user.id}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("captures")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from("captures").getPublicUrl(path);

  return publicUrl;
}
