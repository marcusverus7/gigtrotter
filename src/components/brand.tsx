import { cn } from "@/lib/utils";

/**
 * GigTrotter glyph — ticket stub with a map pin rising from the top.
 * Pure violet gradient to match the brand identity. SVG renders crisp
 * on share cards, pin popovers and app icons.
 */
export function GigTrotterGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-7", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="gt-grad" x1="16" y1="0" x2="16" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="hsl(270 70% 65%)" />
          <stop offset="100%" stopColor="hsl(262 83% 50%)" />
        </linearGradient>
      </defs>
      {/* Map pin */}
      <path
        d="M16 0c4.418 0 8 3.582 8 8 0 5.2-8 13-8 13S8 13.2 8 8c0-4.418 3.582-8 8-8Z"
        fill="url(#gt-grad)"
      />
      <circle cx="16" cy="8" r="3.2" fill="hsl(222 47% 4%)" />
      <circle cx="16" cy="8" r="1.4" fill="url(#gt-grad)" />
      {/* Ticket stub body */}
      <rect x="6" y="19" width="20" height="18" rx="3" fill="url(#gt-grad)" />
      {/* Scallop notches on ticket sides */}
      <circle cx="6" cy="26" r="2.5" fill="hsl(222 47% 4%)" />
      <circle cx="26" cy="26" r="2.5" fill="hsl(222 47% 4%)" />
      {/* Ticket detail lines */}
      <rect x="11" y="25" width="10" height="1.6" rx="0.8" fill="hsl(222 47% 4%)" opacity="0.6" />
      <rect x="11" y="29" width="10" height="1.6" rx="0.8" fill="hsl(222 47% 4%)" opacity="0.6" />
    </svg>
  );
}

export function GigTrotterMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold", className)}>
      <GigTrotterGlyph />
      <span className="text-lg tracking-tight">GigTrotter</span>
    </span>
  );
}
