"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Bookmark,
  CalendarSearch,
  Compass,
  Download,
  Eye,
  Globe2,
  History,
  Moon,
  Plane,
  Settings,
  ShoppingBag,
  Shirt,
  Ticket,
  Trophy,
  Upload,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

// Flip to true when these surfaces have real data/payments wired.
const SHOW_UNLAUNCHED = false;

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  flag?: boolean;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

const rawNavGroups: NavGroup[] = [
  {
    items: [
      { href: "/app", label: "Wallet", icon: Ticket },
      { href: "/app/night", label: "Tonight", icon: Moon },
      { href: "/app/capture", label: "Capture", icon: Upload },
    ],
  },
  {
    label: "Discover",
    items: [
      { href: "/app/events", label: "Events", icon: CalendarSearch, flag: true },
      { href: "/app/marketplace", label: "Marketplace", icon: ShoppingBag, flag: true },
      { href: "/app/merch", label: "Merch Store", icon: Shirt, flag: true },
      { href: "/app/discover", label: "People", icon: Compass },
    ],
  },
  {
    label: "Your collection",
    items: [
      { href: "/app/map", label: "Map", icon: Globe2 },
      { href: "/app/trips", label: "Trips", icon: Plane },
      { href: "/app/memories", label: "Memories", icon: History },
      { href: "/app/achievements", label: "Achievements", icon: Trophy },
      { href: "/app/anon", label: "Public Board", icon: Eye },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/app/alerts", label: "Alerts", icon: Bell },
      { href: "/app/activity", label: "Activity", icon: Activity },
      { href: "/app/wishlist", label: "Wishlist", icon: Bookmark },
    ],
  },
  {
    items: [
      { href: "/app/import", label: "Import", icon: Download, flag: true },
      { href: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

const navGroups: NavGroup[] = rawNavGroups
  .map((g) => ({
    ...g,
    items: g.items.filter((n) => SHOW_UNLAUNCHED || !n.flag),
  }))
  .filter((g) => g.items.length > 0);

function applyBadges(groups: NavGroup[], alertBadge?: number): NavGroup[] {
  if (!alertBadge) return groups;
  return groups.map((g) => ({
    ...g,
    items: g.items.map((n) =>
      n.href === "/app/alerts" ? { ...n, badge: alertBadge } : n,
    ),
  }));
}

export function SidebarNav({ alertBadge }: { alertBadge?: number }) {
  const pathname = usePathname();
  const groups = applyBadges(navGroups, alertBadge);

  return (
    <nav className="mt-2 flex flex-col gap-3 overflow-y-auto">
      {groups.map((g, gi) => (
        <div key={gi} className="flex flex-col gap-0.5">
          {g.label && (
            <span className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {g.label}
            </span>
          )}
          {g.items.map((n) => {
            const active =
              n.href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                  active
                    ? "bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                )}
              >
                <n.icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-primary" : "group-hover:text-primary",
                  )}
                />
                {n.label}
                {n.badge ? (
                  <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {n.badge > 99 ? "99+" : n.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Everything the sidebar offers that the bottom tab bar does not — the mobile
 * "More" menu renders exactly this list, so a new sidebar destination shows up
 * on phones without anyone remembering to add it twice.
 */
export const mobileOverflowItems: NavItem[] = navGroups
  .flatMap((g) => g.items)
  .filter((n) => !["/app", "/app/night", "/app/capture", "/app/map", "/app/memories"].includes(n.href));

const bottomNavItems: NavItem[] = [
  { href: "/app", label: "Wallet", icon: Ticket },
  { href: "/app/night", label: "Tonight", icon: Moon },
  { href: "/app/capture", label: "Capture", icon: Upload },
  { href: "/app/map", label: "Map", icon: Globe2 },
  { href: "/app/memories", label: "Memories", icon: History },
];

export function BottomNav({ alertBadge }: { alertBadge?: number }) {
  const pathname = usePathname();
  const items = applyBadges(
    [{ items: bottomNavItems }],
    alertBadge,
  ).flatMap((g) => g.items);

  return (
    <nav className="safe-bottom sticky bottom-0 z-40 flex justify-around border-t border-border/40 bg-card/80 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-xl md:hidden">
      {items.map((n) => {
        const active =
          n.href === "/app"
            ? pathname === "/app"
            : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={cn(
              "flex min-h-[44px] flex-1 flex-col items-center gap-0.5 rounded-md px-2 py-2.5 text-xs transition-colors",
              active
                ? "text-primary font-medium"
                : "text-muted-foreground hover:text-primary",
            )}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
