import { createClient, getSessionUser } from "@/lib/supabase/server";
import { DEFAULT_DURATION_MS, effectiveEnd } from "@/lib/wallet/lifecycle";

import { MorningAfterPrompt } from "./morning-after";

/**
 * Surfaces a morning-after prompt for every recently-attended wallet item
 * the user hasn't responded to or dismissed yet. Renders nothing when
 * the queue is empty (the default case).
 */
export async function MorningAfterQueue() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  // Gigs that ended in the last 36h. Most wallet items have no ends_at —
  // tickets rarely print one — so the old `ends_at` window excluded nearly
  // everything and the "how was it?" prompt almost never fired. The query
  // narrows by start time; the window is applied to the EFFECTIVE end in
  // code. Flights and stays are not asked about, nor is a wishlist item the
  // user never had a ticket for.
  const now = Date.now();
  const windowMs = 36 * 3600_000;
  const earliestStart = new Date(now - windowMs - DEFAULT_DURATION_MS).toISOString();

  const { data: items } = await supabase
    .from("wallet_items")
    .select(
      "id, title, subtitle, ends_at, starts_at, experiences(id, rating), morning_after_log(responded_at, dismissed)",
    )
    .eq("user_id", user.id)
    .in("status", ["going", "tonight", "attended"])
    .not("kind", "in", "(flight,stay)")
    .gte("starts_at", earliestStart)
    .lte("starts_at", new Date(now).toISOString());

  if (!items) return null;

  const queue = items.filter((i) => {
    if (!i.starts_at) return false;
    const end = effectiveEnd(i.starts_at, i.ends_at);
    if (end >= now || end < now - windowMs) return false;
    const exp = (i as { experiences: Array<{ rating: number | null }> | null }).experiences;
    const log = (i as { morning_after_log: Array<{ responded_at: string | null; dismissed: boolean }> | null })
      .morning_after_log;
    const alreadyRated = Array.isArray(exp) && exp.some((e) => e.rating != null);
    const alreadyResponded =
      Array.isArray(log) && log.some((l) => l.responded_at != null || l.dismissed);
    return !alreadyRated && !alreadyResponded;
  });

  if (queue.length === 0) return null;

  return (
    <div className="space-y-3">
      {queue.slice(0, 3).map((i) => {
        const exp = (i as { experiences: Array<{ id: string }> | null }).experiences;
        const expId = Array.isArray(exp) && exp[0] ? exp[0].id : null;
        return (
          <MorningAfterPrompt
            key={i.id}
            walletItemId={i.id}
            experienceId={expId}
            title={i.title}
            subtitle={i.subtitle}
          />
        );
      })}
    </div>
  );
}
