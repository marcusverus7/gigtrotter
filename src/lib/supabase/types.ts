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
  /** 0031 (CAP-03): which CAPTURE_MASTER_KEY version encrypted storage_ref. */
  key_version: number;
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
  /** Migration 0028 — setlist.fm songs, id and credit URL. */
  setlist: Json | null;
  setlistfm_id: string | null;
  setlist_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TicketTierStatus = "draft" | "on_sale" | "paused" | "sold_out" | "ended";
export type OrderStatus = "pending" | "paid" | "expired" | "cancelled" | "refunded";
export type TicketStatus = "valid" | "used" | "transferred" | "refunded" | "void";

export interface PromoterAccountRow {
  user_id: string;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  fee_bps: number;
  fee_fixed_cents: number;
  created_at: string;
  updated_at: string;
}

export interface TicketTierRow {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  quantity: number;
  sold: number;
  reserved: number;
  max_per_order: number;
  sales_start: string | null;
  sales_end: string | null;
  status: TicketTierStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  user_id: string;
  event_id: string;
  status: OrderStatus;
  currency: string;
  face_cents: number;
  fee_cents: number;
  total_cents: number;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  buyer_email: string | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
  /** Set on a face-value resale order (migration 0030). */
  listing_id: string | null;
  /** 0031: local fulfilment is a separate fact from Stripe's payment. */
  fulfilled_at: string | null;
  fulfilment_outcome: "issued" | "stale_listing_refund" | null;
  fulfilment_error: string | null;
  stock_committed_at: string | null;
  last_reconciled_at: string | null;
  reconcile_note: string | null;
}

export interface OrderItemRow {
  order_id: string;
  tier_id: string;
  quantity: number;
  unit_price_cents: number;
}

export interface TicketRow {
  id: string;
  order_id: string | null;
  event_id: string;
  tier_id: string;
  owner_id: string;
  wallet_item_id: string | null;
  code: string;
  status: TicketStatus;
  used_at: string | null;
  checked_in_by: string | null;
  transferred_from: string | null;
  issued_as: string;
  /** 0031: 1..quantity within (order, tier); the idempotency boundary of fulfilment. */
  unit_no: number | null;
  created_at: string;
}

export type RefundStatus = "requested" | "pending" | "succeeded" | "failed";

/** 0031: the refund ledger. Service-role writes; buyers read their own. */
export interface RefundRow {
  id: string;
  order_id: string;
  related_order_id: string | null;
  reason: "resale_seller" | "resale_buyer_stale" | "promoter_refund" | "transfer_reversal" | "operator";
  payment_intent_id: string | null;
  amount_cents: number;
  currency: string;
  reverse_transfer: boolean;
  status: RefundStatus;
  idempotency_key: string;
  stripe_refund_id: string | null;
  stripe_reversal_id: string | null;
  attempts: number;
  last_error: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  succeeded_at: string | null;
}

/** 0031: webhook inbox. Service-role only. */
export interface StripeEventRow {
  id: string;
  type: string;
  order_id: string | null;
  received_at: string;
  processed_at: string | null;
  attempts: number;
  last_error: string | null;
  payload: Record<string, unknown>;
}

/** 0031: named door operators per event. */
export interface EventStaffRow {
  event_id: string;
  user_id: string;
  role: "door";
  added_by: string | null;
  created_at: string;
}

/** 0031: operator audit trail. Service-role only. */
export interface OpsActionRow {
  id: string;
  actor: string | null;
  action: string;
  target: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export type ListingStatus = "open" | "reserved" | "sold" | "withdrawn";

/** Migration 0032: per-user (and platform, nil uuid) daily capture budget. Service-role only. */
export interface CaptureBudgetRow {
  user_id: string;
  day: string;
  used: number;
  updated_at: string;
}

export interface TicketListingRow {
  id: string;
  ticket_id: string;
  seller_id: string;
  event_id: string;
  tier_id: string;
  price_cents: number;
  currency: string;
  status: ListingStatus;
  buyer_order_id: string | null;
  reserved_until: string | null;
  created_at: string;
  sold_at: string | null;
}

export interface EventWaitlistRow {
  user_id: string;
  event_id: string;
  created_at: string;
}

export type EventCategory =
  | "concert"
  | "festival"
  | "club_night"
  | "theatre"
  | "comedy"
  | "sport"
  | "other";
export type EventStatus = "pending" | "approved" | "rejected";

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  artist_names: string[];
  headliner: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  lat: number | null;
  lng: number | null;
  starts_at: string | null;
  ends_at: string | null;
  doors_at: string | null;
  image_url: string | null;
  min_price_cents: number | null;
  max_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  source: string | null;
  external_id: string | null;
  external_url: string | null;
  promoter_id: string | null;
  promoter_name: string | null;
  tags: string[];
  status: EventStatus;
  /** Added in migration 0021 — feed columns. */
  on_sale_at: string | null;
  last_seen_at: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventTicketLinkRow {
  id: string;
  event_id: string;
  provider: string;
  provider_label: string;
  url: string;
  min_price_cents: number | null;
  max_price_cents: number | null;
  currency: string;
  is_sold_out: boolean;
  is_affiliate: boolean;
  sort_order: number;
  created_at: string;
}

export interface FeedSyncRunRow {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  api_calls: number;
  upserted: number;
  skipped: number;
  errors: number;
  notes: string | null;
}

export type WishlistKind = "artist" | "destination" | "venue" | "hotel";
export type AlertKind =
  | "on_sale"
  | "price_drop"
  | "tour_announce"
  | "friend_going"
  /** Added in migration 0017 — the only kind we can raise without a feed. */
  | "doors_tonight"
  /** Added in migration 0027. */
  | "anniversary"
  | "friend_request"
  /** Added in migration 0030. */
  | "resale";
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
      events: {
        Row: EventRow;
        Insert: Partial<EventRow> & { title: string };
        Update: Partial<EventRow>;
      };
      event_ticket_links: {
        Row: EventTicketLinkRow;
        Insert: Partial<EventTicketLinkRow> & {
          event_id: string;
          provider: string;
          provider_label: string;
          url: string;
        };
        Update: Partial<EventTicketLinkRow>;
      };
      feed_sync_runs: {
        Row: FeedSyncRunRow;
        Insert: Partial<FeedSyncRunRow> & { source: string };
        Update: Partial<FeedSyncRunRow>;
      };
      event_waitlist: {
        Row: EventWaitlistRow;
        Insert: Partial<EventWaitlistRow> & { user_id: string; event_id: string };
        Update: Partial<EventWaitlistRow>;
      };
      promoter_accounts: {
        Row: PromoterAccountRow;
        Insert: Partial<PromoterAccountRow> & { user_id: string };
        Update: Partial<PromoterAccountRow>;
      };
      ticket_tiers: {
        Row: TicketTierRow;
        Insert: Partial<TicketTierRow> & { event_id: string; name: string; price_cents: number; quantity: number };
        Update: Partial<TicketTierRow>;
      };
      orders: {
        Row: OrderRow;
        Insert: Partial<OrderRow> & { user_id: string; event_id: string };
        Update: Partial<OrderRow>;
      };
      order_items: {
        Row: OrderItemRow;
        Insert: OrderItemRow;
        Update: Partial<OrderItemRow>;
      };
      tickets: {
        Row: TicketRow;
        Insert: Partial<TicketRow> & { event_id: string; tier_id: string; owner_id: string; code: string };
        Update: Partial<TicketRow>;
      };
      capture_budget: {
        Row: CaptureBudgetRow;
        Insert: Partial<CaptureBudgetRow> & { user_id: string; day: string };
        Update: Partial<CaptureBudgetRow>;
      };
      ticket_listings: {
        Row: TicketListingRow;
        Insert: Partial<TicketListingRow> & { ticket_id: string; seller_id: string; event_id: string; tier_id: string; price_cents: number };
        Update: Partial<TicketListingRow>;
      };
      refunds: {
        Row: RefundRow;
        Insert: Partial<RefundRow> & { order_id: string; reason: RefundRow["reason"]; amount_cents: number };
        Update: Partial<RefundRow>;
      };
      stripe_events: {
        Row: StripeEventRow;
        Insert: Partial<StripeEventRow> & { id: string; type: string; payload: Record<string, unknown> };
        Update: Partial<StripeEventRow>;
      };
      event_staff: {
        Row: EventStaffRow;
        Insert: Partial<EventStaffRow> & { event_id: string; user_id: string };
        Update: Partial<EventStaffRow>;
      };
      ops_actions: {
        Row: OpsActionRow;
        Insert: Partial<OpsActionRow> & { action: string };
        Update: Partial<OpsActionRow>;
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
      /** Migration 0026 — public totals now that rows are friends-only. */
      event_interest_counts: {
        Args: { target_event: string };
        Returns: Array<{ interested: number; going: number }>;
      };
      event_waitlist_count: { Args: { target_event: string }; Returns: number };
      reserve_capture_slot: { Args: { target_user: string; daily_limit: number }; Returns: boolean };
      release_capture_slot: { Args: { target_user: string }; Returns: void };
      reserve_tier: { Args: { target_tier: string; qty: number }; Returns: boolean };
      release_tier: { Args: { target_tier: string; qty: number }; Returns: void };
      commit_tier: { Args: { target_tier: string; qty: number }; Returns: void };
      /** 0031: transactional issuance; see src/lib/tickets/fulfil.ts. */
      fulfil_order_tx: {
        Args: { target_order: string; units: Array<{ tier_id: string; unit_no: number; code: string }>; wallet_status: string };
        Returns: Record<string, unknown>;
      };
      fulfil_resale_tx: {
        Args: { target_order: string; new_code: string; wallet_status: string };
        Returns: Record<string, unknown>;
      };
      request_order_refund_tx: {
        Args: { target_order: string; actor: string; why: string };
        Returns: Record<string, unknown>;
      };
      can_check_in: { Args: { target_event: string }; Returns: boolean };
      /** 0033: atomic issue / transfer (service role). */
      issue_ticket_tx: {
        Args: { target_event: string; target_tier: string; new_owner: string; new_code: string; issued_as: string; from_user: string | null; for_order: string | null; wallet_status: string; note?: string | null };
        Returns: Record<string, unknown>;
      };
      transfer_ticket_tx: {
        Args: { target_ticket: string; current_owner: string; new_owner: string; new_code: string; wallet_status: string };
        Returns: Record<string, unknown>;
      };
      /** 0033: the owner's private profile columns (anonymous-board handle, plan). */
      my_profile_private: {
        Args: Record<string, never>;
        Returns: Array<{
          anon_handle: string;
          anon_hash: string;
          anon_revoked: boolean;
          anon_views: number;
          plan: "free" | "plus";
          last_alert_scan_at: string | null;
        }>;
      };
      tier_availability: { Args: { target_event: string }; Returns: Array<{ tier_id: string; remaining: number }> };
      event_interest_counts_for: {
        Args: { target_events: string[] };
        Returns: Array<{ event_id: string; interested: number; going: number }>;
      };
      venue_attendance_stats: {
        Args: { target_venue: string };
        Returns: Array<{ attendees: number; gigs_logged: number }>;
      };
    };
    Enums: {
      event_category: EventCategory;
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
