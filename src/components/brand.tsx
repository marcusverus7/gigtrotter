import { cn } from "@/lib/utils";

/**
 * The GigTrotter wordmark + glyph. The glyph is a map pin whose "drop" is a
 * ticket stub — capture-first concept distilled into one mark. Pure SVG so it
 * renders crisp on the most-screenshotted surfaces (share cards, pin popover).
 */
export function GigTrotterGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-7", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="gt-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="hsl(262 83% 62%)" />
          <stop offset="100%" stopColor="hsl(189 94% 48%)" />
        </linearGradient>
      </defs>
      <path
        d="M16 2c5.523 0 10 4.477 10 10 0 6.5-10 18-10 18S6 18.5 6 12C6 6.477 10.477 2 16 2Z"
        fill="url(#gt-grad)"
      />
      <circle cx="16" cy="12" r="4.2" fill="hsl(222 47% 4%)" />
      <circle cx="16" cy="12" r="1.6" fill="url(#gt-grad)" />
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
