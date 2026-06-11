import { redirect } from "next/navigation";

import { FriendsList } from "@/features/friends/friends-list";
import { AddFriendForm } from "@/features/friends/add-friend-form";
import { createClient } from "@/lib/supabase/server";

/**
 * /app/discover — friends. Bilateral by exact username (§8.1, MVP scope).
 * Friend connections are minimal here on purpose: density before discovery.
 */
export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pull all friendships the user is in.
  const { data: friendships } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

  // For accepted friendships, fetch the counterparty profiles.
  const accepted = friendships?.filter((f) => f.state === "accepted") ?? [];
  const pending = friendships?.filter((f) => f.state === "pending") ?? [];

  const otherIds = (friendships ?? []).map((f) =>
    f.user_a === user.id ? f.user_b : f.user_a,
  );
  const { data: profiles } = otherIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, anon_handle")
        .in("id", otherIds)
    : { data: [] };

  const profileById = new Map(profiles?.map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground">
          Bilateral friends. Past pins flow through their audience tier.
        </p>
      </header>

      <AddFriendForm />

      <FriendsList
        currentUserId={user.id}
        accepted={accepted}
        pendingIncoming={pending.filter((f) => f.requested_by !== user.id)}
        pendingOutgoing={pending.filter((f) => f.requested_by === user.id)}
        profileById={Object.fromEntries(profileById)}
      />
    </div>
  );
}
