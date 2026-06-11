import {
  Award,
  Flame,
  Globe2,
  MapPin,
  Music,
  Plane,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/**
 * Achievement definitions (§8.3 "earned only via verified pins to keep them
 * meaningful"). Each one is computed against the `achievements` SQL view's
 * verified-only counts so badges can't be farmed by typing in fake history.
 */

export type AchievementId =
  | "first-pin"
  | "ten-gigs"
  | "fifty-gigs"
  | "century-club"
  | "first-flight"
  | "frequent-flier"
  | "globetrotter-10"
  | "globetrotter-25"
  | "explorer-5"
  | "explorer-15"
  | "founding-trotter";

export type Achievement = {
  id: AchievementId;
  title: string;
  blurb: string;
  icon: LucideIcon;
  /** 1 = common, 5 = legendary — shades the badge glow */
  tier: 1 | 2 | 3 | 4 | 5;
  /** Predicate over the achievements row + user context */
  unlocked: (ctx: {
    gigs: number;
    flights: number;
    countries: number;
    /** True if user's account is older than 30 days. */
    veteran: boolean;
  }) => boolean;
  /** Optional progress bar — returns [current, target] */
  progress?: (ctx: {
    gigs: number;
    flights: number;
    countries: number;
  }) => [number, number];
};

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first-pin",
    title: "First pin",
    blurb: "The map begins.",
    icon: MapPin,
    tier: 1,
    unlocked: ({ gigs, flights, countries }) =>
      gigs + flights + countries > 0,
  },
  {
    id: "ten-gigs",
    title: "Ten and counting",
    blurb: "Ten verified gigs.",
    icon: Music,
    tier: 2,
    unlocked: ({ gigs }) => gigs >= 10,
    progress: ({ gigs }) => [Math.min(gigs, 10), 10],
  },
  {
    id: "fifty-gigs",
    title: "Fifty",
    blurb: "Fifty verified gigs.",
    icon: Flame,
    tier: 3,
    unlocked: ({ gigs }) => gigs >= 50,
    progress: ({ gigs }) => [Math.min(gigs, 50), 50],
  },
  {
    id: "century-club",
    title: "Century Club",
    blurb: "One hundred verified gigs.",
    icon: Trophy,
    tier: 5,
    unlocked: ({ gigs }) => gigs >= 100,
    progress: ({ gigs }) => [Math.min(gigs, 100), 100],
  },
  {
    id: "first-flight",
    title: "Wheels up",
    blurb: "First verified flight.",
    icon: Plane,
    tier: 1,
    unlocked: ({ flights }) => flights >= 1,
  },
  {
    id: "frequent-flier",
    title: "Frequent flier",
    blurb: "Twenty-five verified flights.",
    icon: Plane,
    tier: 3,
    unlocked: ({ flights }) => flights >= 25,
    progress: ({ flights }) => [Math.min(flights, 25), 25],
  },
  {
    id: "explorer-5",
    title: "Explorer",
    blurb: "Five countries.",
    icon: Globe2,
    tier: 2,
    unlocked: ({ countries }) => countries >= 5,
    progress: ({ countries }) => [Math.min(countries, 5), 5],
  },
  {
    id: "explorer-15",
    title: "Continental",
    blurb: "Fifteen countries.",
    icon: Globe2,
    tier: 3,
    unlocked: ({ countries }) => countries >= 15,
    progress: ({ countries }) => [Math.min(countries, 15), 15],
  },
  {
    id: "globetrotter-10",
    title: "Globetrotter",
    blurb: "Ten countries.",
    icon: Star,
    tier: 3,
    unlocked: ({ countries }) => countries >= 10,
    progress: ({ countries }) => [Math.min(countries, 10), 10],
  },
  {
    id: "globetrotter-25",
    title: "World over",
    blurb: "Twenty-five countries.",
    icon: Award,
    tier: 5,
    unlocked: ({ countries }) => countries >= 25,
    progress: ({ countries }) => [Math.min(countries, 25), 25],
  },
  {
    id: "founding-trotter",
    title: "Founding trotter",
    blurb: "Here from the start.",
    icon: Sparkles,
    tier: 4,
    // Veteran flag is computed server-side from profile.created_at
    unlocked: ({ veteran }) => veteran,
  },
];
