import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Admin allowlist for internal surfaces (/app/admin/*).
 *
 * `ADMIN_EMAIL` wins when set so the allowlist is configurable per environment;
 * it falls back to the founder account so the admin surfaces keep working in
 * environments where the var hasn't been set yet.
 *
 * Existing admin pages (metrics, feedback) each rolled their own gate — new
 * surfaces should use this so the check can't drift between them.
 */
export function adminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAIL?.trim();
  return fromEnv ? [fromEnv] : ["markloughran7@gmail.com"];
}

/** Returns the signed-in user if they're an admin, otherwise null. */
export async function getAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return adminEmails().includes(user.email ?? "") ? user : null;
}

/** Throws unless the caller is an admin. Use at the top of admin server actions. */
export async function requireAdmin() {
  const user = await getAdminUser();
  if (!user) throw new Error("Not authorised.");
  return user;
}
