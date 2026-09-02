import { createClient, getSessionUser } from "@/lib/supabase/server";

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

  // Items that ended in the last 36h.
  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const now = new Date().toISOString();

  const { data: items } = await supabase
    .from("wallet_items")
    .select(
      "id, title, subtitle, ends_at, starts_at, experiences(id, rating), morning_after_log(responded_at, dismissed)",
    )
    .eq("user_id", user.id)
    .lt("ends_at", now)
    .gte("ends_at", since);

  if (!items) return null;

  const queue = items.filter((i) => {
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
