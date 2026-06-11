import {
  Cloud,
  Mail,
  Music2,
  Radar,
  Ticket as TicketIcon,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type ImportSourceId =
  | "setlistfm"
  | "spotify"
  | "songkick"
  | "bandsintown"
  | "lastfm"
  | "eventbrite"
  | "apple_wallet"
  | "google_wallet"
  | "gmail_backfill";

export type ImportSource = {
  id: ImportSourceId;
  name: string;
  blurb: string;
  /** "live" = wireable now, "soon" = scaffolded but needs creds, "stub" = stand-by */
  state: "live" | "soon" | "stub";
  icon: LucideIcon;
  /** Roughly what you get from the source */
  yields: string;
  /** OAuth or API-key requirement note */
  needs: string;
};

export const IMPORT_SOURCES: ImportSource[] = [
  {
    id: "setlistfm",
    name: "Setlist.fm",
    blurb: "Your attended-concerts history — every show you've logged.",
    state: "soon",
    icon: Music2,
    yields: "Past gigs with venue, date, setlist.",
    needs: "Setlist.fm API key + your username.",
  },
  {
    id: "spotify",
    name: "Spotify",
    blurb:
      "Top artists + saved tracks. Cross-referenced with setlist.fm to surface 'did you see these live?'",
    state: "soon",
    icon: Music2,
    yields: "Top artists list; backfill candidates.",
    needs: "Spotify OAuth (Client ID + Secret).",
  },
  {
    id: "songkick",
    name: "Songkick",
    blurb: "Tracked artists and your concert calendar.",
    state: "soon",
    icon: Radar,
    yields: "Tracked artists + attended events.",
    needs: "Songkick API key.",
  },
  {
    id: "bandsintown",
    name: "Bandsintown",
    blurb: "Tracked artists, attended events, RSVPs.",
    state: "soon",
    icon: Radar,
    yields: "Tracked artists + 'going' RSVPs.",
    needs: "Bandsintown app id.",
  },
  {
    id: "lastfm",
    name: "Last.fm",
    blurb: "Scrobble history — strong proxy for taste; weaker for live attendance.",
    state: "soon",
    icon: Music2,
    yields: "Top artists / listening history.",
    needs: "Last.fm API key + your username.",
  },
  {
    id: "eventbrite",
    name: "Eventbrite",
    blurb: "Your purchased tickets — direct OAuth import.",
    state: "soon",
    icon: TicketIcon,
    yields: "Past + upcoming tickets.",
    needs: "Eventbrite OAuth.",
  },
  {
    id: "apple_wallet",
    name: "Apple Wallet",
    blurb: "Export your Wallet passes as .pkpass — we parse them like screenshots.",
    state: "stub",
    icon: Wallet,
    yields: "Active flight/ticket passes.",
    needs: "Manual export (file upload).",
  },
  {
    id: "google_wallet",
    name: "Google Wallet",
    blurb: "Same — export and we'll parse.",
    state: "stub",
    icon: Wallet,
    yields: "Active flight/ticket passes.",
    needs: "Manual export (file upload).",
  },
  {
    id: "gmail_backfill",
    name: "Gmail backfill",
    blurb:
      "A one-shot historical sweep of confirmation emails — separate from live sync.",
    state: "stub",
    icon: Mail,
    yields: "Years of confirmation emails.",
    needs: "Google CASA review (V1).",
  },
];
