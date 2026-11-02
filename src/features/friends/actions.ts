"use server";

import { revalidatePath } from "next/cache";

import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Tell the OTHER person. alerts is owner-only RLS, so a row for someone else
 * needs the service client — the one place in this file that uses it, for a
 * single insert whose user_id is the counterparty of a friendship the caller
 * is in. Best-effort: the enum value arrives with migration 0027, and a
 * missing kind must not fail the request itself.
 */
async function notify(
  userId: string,
  kind: "friend_request",
  title: string,
  body: string,
  dedupeKey: string,
) {
  try {
    await createServiceClient()
      .from("alerts")
      .upsert(
        { user_id: userId, kind, title, body, url: "/app/discover", dedupe_key: dedupeKey } as never,
        { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
      );
  } catch (err) {
    console.error("[friends] alert insert failed", err instanceof Error ? err.message : String(err));
  }
}

/**
 * Send a friend request by username. We normalise (user_a, user_b) so
 * (a < b) — the unique constraint on the table guarantees one row per pair.
 */
export async function sendFriendRequest(username: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const u = username.toLowerCase().trim().replace(/^@/, "");
  if (!u || u.length < 3) throw new Error("Username too short.");

  const { data: target } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", u)
    .maybeSingle();

  if (!target) throw new Error("No one with that username.");
  if (target.id === user.id) throw new Error("That's you.");

  const [a, b] =
    user.id < target.id ? [user.id, target.id] : [target.id, user.id];

  const { data: created, error } = await supabase
    .from("friendships")
    .insert({
      user_a: a,
      user_b: b,
      requested_by: user.id,
      state: "pending",
    })
    .select("id")
    .single();
  if (error) {
    // Likely unique-violation — friendship already exists in some state.
    if (error.code === "23505") throw new Error("Already requested or friends.");
    throw error;
  }
  const { data: me } = await supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle();
  const myName = me?.display_name?.trim() || (me?.username ? `@${me.username}` : "Someone");
  await notify(target.id, "friend_request", `${myName} wants to be friends`, "Accept on the People page to share past gigs.", `freq:${created?.id ?? `${a}:${b}`}`);
  revalidatePath("/app/discover");
}

export async function acceptFriendRequest(friendshipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("friendships")
    .update({
      state: "accepted",
      accepted_at: new Date().toISOString(),
    })
    .eq("id", friendshipId)
    .eq("state", "pending")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    // The RLS policy is symmetric -- both sides of a friendship can update the
    // row -- so without this the requester could accept their own request and
    // unlock the other person's audience='friends' pins unilaterally.
    .neq("requested_by", user.id)
    .select("id, requested_by");
  if (error) throw error;
  if (!data || data.length === 0)
    throw new Error("Couldn't accept (not yours, or already updated).");
  const { data: me } = await supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle();
  const myName = me?.display_name?.trim() || (me?.username ? `@${me.username}` : "Someone");
  await notify(data[0].requested_by, "friend_request", `${myName} accepted your request`, "You can see each other's past gigs now. Add them to your Inner Circle to share upcoming ones.", `facc:${friendshipId}`);
  revalidatePath("/app/discover");
}

/**
 * Inner Circle membership — the one privacy tier that was otherwise dead.
 *
 * Every pin defaults to audience 'inner' and the time-shift rule shows a
 * friend's FUTURE plans only to inner-circle members, yet nothing in the app
 * ever wrote a circle_members row — so 'Inner' behaved exactly like 'Vault'
 * and "who else is going" could never match a future gig. Only an accepted
 * friend can be added; the owner-only policy on circle_members does the
 * rest, and .select() guards surface a silently denied write.
 */
export async function setInnerCircle(memberId: string, inCircle: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (memberId === user.id) throw new Error("That is you.");

  const [{ data: circle }, { data: friendship }] = await Promise.all([
    supabase.from("circles").select("id").eq("user_id", user.id).eq("kind", "inner").maybeSingle(),
    supabase
      .from("friendships")
      .select("id")
      .eq("state", "accepted")
      .or(
        `and(user_a.eq.${user.id},user_b.eq.${memberId}),and(user_a.eq.${memberId},user_b.eq.${user.id})`,
      )
      .maybeSingle(),
  ]);
  if (!circle) throw new Error("No Inner Circle found for your account.");
  if (!friendship) throw new Error("Only an accepted friend can join your Inner Circle.");

  if (inCircle) {
    const { data, error } = await supabase
      .from("circle_members")
      .upsert({ circle_id: circle.id, member_id: memberId }, { onConflict: "circle_id,member_id" })
      .select("member_id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Could not add to your Inner Circle.");
  } else {
    const { data, error } = await supabase
      .from("circle_members")
      .delete()
      .eq("circle_id", circle.id)
      .eq("member_id", memberId)
      .select("member_id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("They were not in your Inner Circle.");
  }
  revalidatePath("/app/discover");
  revalidatePath("/app");
}

export async function removeFriend(friendshipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId)
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
  if (error) throw error;
  revalidatePath("/app/discover");
}
