"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

type Admin = ReturnType<typeof createServiceClient>;

/** Every bucket a user can write into, keyed on `<user id>/…`. */
const USER_BUCKETS = ["captures", "avatars", "discussion-photos"] as const;

/** `<uid>/photos/<experienceId>/<file>` is the deepest path we write. */
const MAX_PURGE_DEPTH = 6;

/**
 * Delete everything under a storage prefix, however deep and however many.
 *
 * `list()` is NOT recursive and caps at 1,000 entries: a folder comes back as
 * a single entry with a null id, and removing that path does nothing. Account
 * erasure used one flat `list(userId, { limit: 1000 })`, so every photo under
 * `<uid>/photos/<experienceId>/…` survived deletion — the pictures people
 * attached to their memories, the one thing they would most expect to go —
 * along with any captures past the first thousand.
 */
async function purgePrefix(
  admin: Admin,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<void> {
  if (depth > MAX_PURGE_DEPTH) {
    console.error("[account] purge depth exceeded", JSON.stringify({ bucket, prefix }));
    return;
  }
  const PAGE = 1000;
  const files: string[] = [];
  const folders: string[] = [];

  // Enumerate the whole prefix BEFORE deleting anything. Paging with a
  // growing offset while removing the page you just listed is the classic
  // shrinking-collection bug: the survivors slide down into positions the
  // next offset has already passed, so with 2,500 objects a thousand of them
  // are never listed again — and the loop then exits looking successful.
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    if (error) {
      console.error(
        "[account] purge list failed",
        JSON.stringify({ bucket, prefix, offset, message: error.message }),
      );
      break; // break, not return: the folders found so far still get walked
    }
    if (!data || data.length === 0) break;
    // A folder entry has no id; a file has one.
    for (const e of data) {
      if (e.id) files.push(`${prefix}/${e.name}`);
      else folders.push(`${prefix}/${e.name}`);
    }
    if (data.length < PAGE) break;
  }

  for (let i = 0; i < files.length; i += PAGE) {
    const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + PAGE));
    if (error) {
      console.error(
        "[account] purge remove failed",
        JSON.stringify({ bucket, prefix, count: files.length, message: error.message }),
      );
    }
  }
  for (const folder of folders) await purgePrefix(admin, bucket, folder, depth + 1);
}

/**
 * GDPR — full account erasure. Deletes the auth user via the service-role
 * admin API, which cascades through every `references auth.users on delete
 * cascade` (profiles, captures, wallet_items, experiences, friendships,
 * circles…). Storage objects don't cascade, so every bucket the user can
 * write to is purged first. This is irreversible.
 */
export async function deleteMyAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createServiceClient();

  // 1) Storage, recursively, across all three buckets: encrypted captures and
  //    memory photos (captures), the avatar (avatars), and anything posted to
  //    a discussion (discussion-photos). Best-effort — a storage hiccup must
  //    not block the erasure itself, which the DB cascade guarantees.
  for (const bucket of USER_BUCKETS) {
    try {
      await purgePrefix(admin, bucket, user.id);
    } catch (err) {
      console.error(
        "[account] storage purge failed",
        JSON.stringify({ bucket, userId: user.id, message: String(err) }),
      );
    }
  }

  // 2) events.promoter_id is ON DELETE SET NULL, but promoter_name is plain
  //    text copied from the display name — so without this the deleted
  //    person's name stays on public event rows after the account is gone.
  const { error: promoterErr } = await admin
    .from("events")
    .update({ promoter_name: null } as never)
    .eq("promoter_id", user.id)
    .select("id");
  if (promoterErr) {
    console.error("[account] promoter_name clear failed", promoterErr.message);
  }

  // 3) Delete the auth user → cascades to every owned row in public.*.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Account deletion failed: ${error.message}`);

  // 4) Clear the session and leave.
  await supabase.auth.signOut();
  redirect("/");
}
