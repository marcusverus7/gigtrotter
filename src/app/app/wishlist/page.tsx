import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bookmark, MapPin, Music, Hotel, Building2 } from "lucide-react";

export const metadata: Metadata = { title: "Wishlist" };

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { WishlistAdder } from "@/features/wishlist/wishlist-adder";
import { WishlistDeleter } from "@/features/wishlist/wishlist-deleter";

const KIND_META: Record<
  string,
  { icon: typeof Music; label: string; tint: string }
> = {
  artist: { icon: Music, label: "Artist", tint: "text-primary" },
  destination: { icon: MapPin, label: "Destination", tint: "text-secondary" },
  venue: { icon: Building2, label: "Venue", tint: "text-primary" },
  hotel: { icon: Hotel, label: "Hotel", tint: "text-secondary" },
};

export default async function WishlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: items } = await supabase
    .from("wishlist")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const groups = (items ?? []).reduce<Record<string, typeof items>>(
    (acc, it) => {
      const key = (it as { kind: string }).kind;
      const list = acc[key] ?? [];
      list.push(it as never);
      acc[key] = list;
      return acc;
    },
    {},
  );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bookmark className="h-4 w-4 text-primary" />
            The affiliate surface — declared intent, not ads.
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Wishlist</h1>
          <p className="text-sm text-muted-foreground">
            Artists you want to see live. Places you want to go. We&apos;ll
            ping you when something opens up.
          </p>
        </div>
      </header>

      <WishlistAdder />

      {Object.keys(groups).length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Nothing wished for yet</CardTitle>
            <CardDescription>
              Add an artist (we&apos;ll watch setlist.fm for tour
              announcements), a destination (we&apos;ll watch flights), or a
              hotel (we&apos;ll watch room rates).
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        Object.entries(groups).map(([kind, list]) => {
          const meta = KIND_META[kind] ?? KIND_META.artist;
          const Icon = meta.icon;
          return (
            <section key={kind} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${meta.tint}`} />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {meta.label} · {list?.length ?? 0}
                </h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {list?.map((it) => (
                  <Card
                    key={it.id}
                    className="group transition-colors hover:border-primary/40"
                  >
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{it.name}</p>
                        {it.subtitle ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {it.subtitle}
                          </p>
                        ) : null}
                      </div>
                      <WishlistDeleter id={it.id} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
