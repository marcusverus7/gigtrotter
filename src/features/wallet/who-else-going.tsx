import { Users } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Surfaced on the wallet item detail page. Shows accepted friends whose
 * wallet item with the same title overlaps within ±24h.
 *
 * Privacy: respects the time-shift rule via the RPC (future overlaps require
 * mutual Inner Circle membership).
 */
export async function WhoElseGoing({ walletItemId }: { walletItemId: string }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return null;

  const { data } = await supabase.rpc("who_else_going", {
    target_user: user.id,
  });

  const overlaps = (data ?? []).filter(
    (r: { wallet_item_id: string }) => r.wallet_item_id === walletItemId,
  ) as Array<{
    friend_id: string;
    friend_username: string;
    friend_display_name: string | null;
  }>;

  if (overlaps.length === 0) return null;

  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-secondary" />
        <span className="text-sm font-semibold">Who else is going</span>
        <Badge variant="friends" className="text-xs">
          {overlaps.length}
        </Badge>
      </div>
      <ul className="space-y-2">
        {overlaps.map((o) => {
          const initials = (o.friend_display_name ?? o.friend_username)
            .slice(0, 2)
            .toUpperCase();
          return (
            <li key={o.friend_id} className="flex items-center gap-2 text-sm">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="font-medium">
                {o.friend_display_name ?? `@${o.friend_username}`}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                @{o.friend_username}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
