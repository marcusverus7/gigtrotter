/**
 * Database type surface used by `@supabase/ssr` clients.
 *
 * Hand-written to mirror `supabase/migrations/*`. When the Supabase project is
 * linked we'll regenerate with `supabase gen types typescript --linked > ...`,
 * but for now this keeps queries typed against the actual schema and is the
 * single source of truth alongside the SQL.
 *
 * Rows are declared as concrete interfaces first, then composed into Database
 * to avoid TS resolving `Database["..."]["Row"]` self-references as `never`.
 */

export type Audience = "vault" | "inner" | "friends" | "open";
export type CircleKind = "inner" | "custom";
export type FriendshipState = "pending" | "accepted" | "blocked";
export type CaptureSource = "screenshot" | "email" | "extension" | "manual";
export type CaptureStatus = "pending" | "confirmed" | "rejected";
export type WalletKind = "ticket" | "flight" | "stay" | "restaurant" | "other";
export type WalletStatus =
  | "wishlist"
  | "going"
  | "tonight"
  | "attended"
  | "archived";
export type VerifiedBy = "none" | "geofence" | "ticket" | "manual";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Row types ─────────────────────────────────────────────────────────────

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  anon_handle: string;
  anon_hash: string;
  anon_revoked: boolean;
  anon_views: number;
  plan: "free" | "plus";
  /** When alert generation last scanned this user's wallet (migration 0017). */
  last_alert_scan_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CircleRow {
  id: string;
  user_id: string;
  name: string;
  kind: CircleKind;
  created_at: string;
}

export interface CircleMemberRow {
  circle_id: string;
  member_id: string;
  added_at: string;
}

export interface FriendshipRow {
  id: string;
  user_a: string;
  user_b: string;
  requested_by: string;
  state: FriendshipState;
  created_at: string;
  accepted_at: string | null;
}

export interface VenueRow {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  city_lat: number | null;
  city_lng: number | null;
  setlistfm_id: string | null;
  mapbox_id: string | null;
  created_at: string;
}

export interface CaptureRow {
  id: string;
  user_id: string;
  source: CaptureSource;
  storage_ref: string | null;
  parse_json: Json | null;
  confidence: number | null;
  vendor: string | null;
  status: CaptureStatus;
  error: string | null;
  created_at: string;
  confirmed_at: string | null;
}

export interface VendorFingerprintRow {
  id: string;
  vendor: string;
  template_hash: string;
  field_map: Json;
  hit_count: number;
  created_at: string;
  last_seen_at: string;
}

export interface TripRow {
  id: string;
  user_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  auto_assembled: boolean;
  created_at: string;
}

export interface WalletItemRow {
  id: string;
  user_id: string;
  capture_id: string | null;
  trip_id: string | null;
  venue_id: string | null;
  kind: WalletKind;
  status: WalletStatus;
  title: string;
  subtitle: string | null;
  starts_at: string | null;
  ends_at: string | null;
  barcode_ref: string | null;
  meta: Json;
  created_at: string;
  updated_at: string;
}

export interface ExperienceRow {
  id: string;
  user_id: string;
  wallet_item_id: string | null;
  capture_id: string | null;
  trip_id: string | null;
  venue_id: string | null;
  kind: WalletKind;
  title: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string;
  audience: Audience;
  verified_by: VerifiedBy;
  rating: number | null;
  review: string | null;
  photos: Json;
  created_at: string;
  updated_at: string;
}

export type WishlistKind = "artist" | "destination" | "venue" | "hotel";
export type AlertKind =
  | "on_sale"
  | "price_drop"
  | "tour_announce"
  | "friend_going"
  /** Added in migration 0017 — the only kind we can raise without a feed. */
  | "doors_tonight";
export type AlertState = "unread" | "read" | "dismissed";

export interface WishlistRow {
  id: string;
  user_id: string;
  kind: WishlistKind;
  name: string;
  subtitle: string | null;
  external_id: string | null;
  meta: Json;
  created_at: string;
}

export interface AlertRow {
  id: string;
  user_id: string;
  wishlist_id: string | null;
  kind: AlertKind;
  title: string;
  body: string | null;
  partner: string | null;
  url: string | null;
  event_at: string | null;
  state: AlertState;
  /** Identifies the thing alerted about, so generation is idempotent (0017). */
  dedupe_key: string | null;
  created_at: string;
}

// ── Database wrapper ──────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & {
          id: string;
          username: string;
          anon_handle: string;
          anon_hash: string;
        };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      circles: {
        Row: CircleRow;
        Insert: Partial<CircleRow> & { user_id: string; name: string };
        Update: Partial<CircleRow>;
      };
      circle_members: {
        Row: CircleMemberRow;
        Insert: Partial<CircleMemberRow> & {
          circle_id: string;
          member_id: string;
        };
        Update: Partial<CircleMemberRow>;
      };
      friendships: {
        Row: FriendshipRow;
        Insert: Partial<FriendshipRow> & {
          user_a: string;
          user_b: string;
          requested_by: string;
        };
        Update: Partial<FriendshipRow>;
      };
      venues: {
        Row: VenueRow;
        Insert: Partial<VenueRow> & { name: string };
        Update: Partial<VenueRow>;
      };
      captures: {
        Row: CaptureRow;
        Insert: Partial<CaptureRow> & { user_id: string; source: CaptureSource };
        Update: Partial<CaptureRow>;
      };
      vendor_fingerprints: {
        Row: VendorFingerprintRow;
        Insert: Partial<VendorFingerprintRow> & {
          vendor: string;
          template_hash: string;
          field_map: Json;
        };
        Update: Partial<VendorFingerprintRow>;
      };
      trips: {
        Row: TripRow;
        Insert: Partial<TripRow> & {
          user_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
        };
        Update: Partial<TripRow>;
      };
      wallet_items: {
        Row: WalletItemRow;
        Insert: Partial<WalletItemRow> & {
          user_id: string;
          kind: WalletKind;
          title: string;
        };
        Update: Partial<WalletItemRow>;
      };
      experiences: {
        Row: ExperienceRow;
        Insert: Partial<ExperienceRow> & {
          user_id: string;
          kind: WalletKind;
          title: string;
          starts_at: string;
          ends_at: string;
        };
        Update: Partial<ExperienceRow>;
      };
      wishlist: {
        Row: WishlistRow;
        Insert: Partial<WishlistRow> & {
          user_id: string;
          kind: WishlistKind;
          name: string;
        };
        Update: Partial<WishlistRow>;
      };
      alerts: {
        Row: AlertRow;
        Insert: Partial<AlertRow> & {
          user_id: string;
          kind: AlertKind;
          title: string;
        };
        Update: Partial<AlertRow>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      anon_board: {
        Args: { handle: string };
        Returns: Array<{
          id: string;
          kind: WalletKind;
          title: string;
          subtitle: string | null;
          month: string;
          city: string | null;
          country: string | null;
          city_lat: number | null;
          city_lng: number | null;
        }>;
      };
      bump_anon_view: { Args: { handle: string }; Returns: void };
      are_friends: { Args: { u1: string; u2: string }; Returns: boolean };
      in_inner_circle: {
        Args: { owner: string; member: string };
        Returns: boolean;
      };
      venue_attendance_stats: {
        Args: { target_venue: string };
        Returns: Array<{ attendees: number; gigs_logged: number }>;
      };
    };
    Enums: {
      alert_kind: AlertKind;
      alert_state: AlertState;
      wishlist_kind: WishlistKind;
      audience: Audience;
      circle_kind: CircleKind;
      friendship_state: FriendshipState;
      capture_source: CaptureSource;
      capture_status: CaptureStatus;
      wallet_kind: WalletKind;
      wallet_status: WalletStatus;
      verified_by: VerifiedBy;
    };
    CompositeTypes: Record<string, never>;
  };
}
