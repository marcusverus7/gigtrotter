import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AddFriendForm } from "@/features/friends/add-friend-form";
import { FriendsList } from "@/features/friends/friends-list";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: friendships } = await supabase
    .from("friendships")
    .select("*")
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

  const rows = friendships ?? [];

  const accepted = rows.filter((f) => f.state === "accepted");
  const pendingIncoming = rows.filter(
    (f) => f.state === "pending" && f.requested_by !== user.id,
  );
  const pendingOutgoing = rows.filter(
    (f) => f.state === "pending" && f.requested_by === user.id,
  );

  const otherIds = rows.map((f) =>
    f.user_a === user.id ? f.user_b : f.user_a,
  );

  const profileById: Record<string, any> = {};
  if (otherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, anon_handle")
      .in("id", otherIds);
    for (const p of profiles ?? []) {
      profileById[p.id] = p;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Friends</h1>
          <p className="text-sm text-muted-foreground">
            Add friends by username to see who else is going.
          </p>
        </div>
      </div>

      <AddFriendForm />

      <FriendsList
        currentUserId={user.id}
        accepted={accepted}
        pendingIncoming={pendingIncoming}
        pendingOutgoing={pendingOutgoing}
        profileById={profileById}
      />
    </div>
  );
}
