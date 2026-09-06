"use client";

import { useTransition } from "react";
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
  const [signingOut, startSignOut] = useTransition();

  return (
    <DropdownMenu>
      {/* The avatar stays 32px, but the TARGET is 44 — this is the only way
          into six destinations and sign-out on a phone, and it was a 32px
          tap area in the corner of the header. */}
      <DropdownMenuTrigger
        className="-mr-1.5 flex h-11 w-11 items-center justify-center rounded-full outline-none ring-primary/60 focus-visible:ring-2"
        aria-label="Account and more"
      >
        <span className="relative">
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
        </span>
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
        {/* onSelect, not a nested <form>. With `asChild` Radix puts its
            role=menuitem and key handlers on the FORM, and its Enter/Space
            handler calls currentTarget.click() — a synthetic click on a form
            element does not submit it, so a keyboard or switch-control user
            just closed the menu. Tap and click happened to work because the
            press landed on the inner button. One path now for all of them. */}
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault();
            startSignOut(async () => {
              await signOutAction();
            });
          }}
          className="flex min-h-[44px] items-center gap-3"
        >
          <LogOut className="h-4 w-4 text-muted-foreground" />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
