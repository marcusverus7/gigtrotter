"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-2 flex flex-col gap-0.5">
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
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-40 flex justify-around border-t border-border/40 bg-card/80 p-2 backdrop-blur-xl md:hidden">
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
              "flex flex-1 flex-col items-center gap-0.5 rounded-md p-2 text-xs transition-colors",
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
