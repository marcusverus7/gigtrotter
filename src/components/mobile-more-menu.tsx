"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type NavItem } from "@/components/app-nav";

/**
 * The rest of the app, on a phone.
 *
 * The sidebar is `hidden md:flex` and the bottom tab bar holds five items, so
 * on the primary surface — the Capacitor shells — Alerts, Wishlist, Trips,
 * People, Settings and SIGN OUT were simply unreachable: the avatar in the
 * header was decoration, and the command palette only opens on Cmd+K, which a
 * phone does not have. Tapping the avatar is where people look for "the rest",
 * so that is what opens this.
 */
export function MobileMoreMenu({
  items,
  avatarUrl,
  initials,
  alertBadge,
  signOutAction,
}: {
  items: NavItem[];
  avatarUrl: string | null;
  initials: string;
  alertBadge?: number;
  signOutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative rounded-full outline-none ring-primary/60 focus-visible:ring-2"
        aria-label="Account and more"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {alertBadge ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-primary"
          />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((n) => (
          <DropdownMenuItem key={n.href} asChild>
            {/* min-h keeps every row a real thumb target. */}
            <Link href={n.href} className="flex min-h-[44px] items-center gap-3">
              <n.icon className="h-4 w-4 text-muted-foreground" />
              {n.label}
              {n.href === "/app/alerts" && alertBadge ? (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {alertBadge > 99 ? "99+" : alertBadge}
                </span>
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={signOutAction} className="w-full">
            <button
              type="submit"
              className="flex min-h-[44px] w-full items-center gap-3 text-left"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
