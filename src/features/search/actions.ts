"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchHit = {
  kind: "wallet" | "experience" | "wishlist" | "friend" | "trip";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  date?: string | null;
};

const MAX_PER_KIND = 6;

/**
 * Search across wallet items, experiences, wishlist, accepted friends, trips.
 * Plain ILIKE for now — pg_trgm is available on Supabase and we can lift this
 * to similarity ranking later without changing the call site.
 */
function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9 '\-]/g, "").slice(0, 200);
}

export async function search(query: string): Promise<SearchHit[]> {
  const q = sanitize(query.trim());
  if (q.length < 2) return [];
  const like = `%${q}%`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [wallet, experiences, wishlist, friendIds, trips] = await Promise.all([
    supabase
      .from("wallet_items")
      .select("id, title, subtitle, starts_at")
      .eq("user_id", user.id)
      .ilike("title", like)
      .limit(MAX_PER_KIND),
    supabase
      .from("experiences")
      .select("id, title, subtitle, starts_at")
      .eq("user_id", user.id)
      .ilike("title", like)
      .limit(MAX_PER_KIND),
    supabase
      .from("wishlist")
      .select("id, name, subtitle, kind")
      .eq("user_id", user.id)
      .ilike("name", like)
      .limit(MAX_PER_KIND),
    supabase
      .from("friendships")
      .select("user_a, user_b")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .eq("state", "accepted"),
    supabase
      .from("trips")
      .select("id, title, starts_at, ends_at")
      .eq("user_id", user.id)
      .ilike("title", like)
      .limit(MAX_PER_KIND),
  ]);

  // Friends — search profile fields among accepted friend ids only.
  const counterpartyIds = (friendIds.data ?? []).map((r) =>
    r.user_a === user.id ? r.user_b : r.user_a,
  );
  const { data: friends } = counterpartyIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", counterpartyIds)
        .or(`username.ilike.${like},display_name.ilike.${like}`)
        .limit(MAX_PER_KIND)
    : { data: [] };

  const hits: SearchHit[] = [];

  for (const w of wallet.data ?? []) {
    hits.push({
      kind: "wallet",
      id: w.id,
      title: w.title,
      subtitle: w.subtitle ?? null,
      href: `/app/item/${w.id}`,
      date: w.starts_at,
    });
  }
  for (const e of experiences.data ?? []) {
    // Skip if we already have the same id from wallet
    if (hits.find((h) => h.id === e.id && h.kind === "wallet")) continue;
    hits.push({
      kind: "experience",
      id: e.id,
      title: e.title,
      subtitle: e.subtitle ?? null,
      href: `/app/map`,
      date: e.starts_at,
    });
  }
  for (const w of wishlist.data ?? []) {
    hits.push({
      kind: "wishlist",
      id: w.id,
      title: w.name,
      subtitle: w.subtitle ?? (w.kind as string),
      href: `/app/wishlist`,
    });
  }
  for (const f of friends ?? []) {
    hits.push({
      kind: "friend",
      id: f.id,
      title: f.display_name ?? `@${f.username}`,
      subtitle: `@${f.username}`,
      href: `/app/u/${f.username}`,
    });
  }
  for (const t of trips.data ?? []) {
    hits.push({
      kind: "trip",
      id: t.id,
      title: t.title,
      subtitle: null,
      href: `/app/trips/${t.id}`,
      date: t.starts_at,
    });
  }

  return hits.slice(0, 20);
}
