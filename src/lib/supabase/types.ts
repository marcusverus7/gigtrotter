/**
 * Database type surface used by `@supabase/ssr` clients.
 *
 * Hand-written to mirror `supabase/migrations/*`. When the Supabase project is
 * linked we'll regenerate with `supabase gen types typescript --linked > ...`,
 * but for now this keeps queries typed against the actual schema and is the
 * single source of truth alongside the SQL.
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

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          anon_handle: string;
          anon_hash: string;
          anon_revoked: boolean;
          anon_views: number;
          plan: "free" | "plus";
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          username: string;
          anon_handle: string;
          anon_hash: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      circles: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: CircleKind;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["circles"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["circles"]["Row"]>;
      };
      circle_members: {
        Row: { circle_id: string; member_id: string; added_at: string };
        Insert: { circle_id: string; member_id: string; added_at?: string };
        Update: Partial<Database["public"]["Tables"]["circle_members"]["Row"]>;
      };
      friendships: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          requested_by: string;
          state: FriendshipState;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["friendships"]["Row"],
          "id" | "created_at" | "accepted_at"
        > & { id?: string; created_at?: string; accepted_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["friendships"]["Row"]>;
      };
      venues: {
        Row: {
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
        };
        Insert: Omit<
          Database["public"]["Tables"]["venues"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["venues"]["Row"]>;
      };
      captures: {
        Row: {
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
        };
        Insert: Omit<
          Database["public"]["Tables"]["captures"]["Row"],
          "id" | "created_at" | "confirmed_at"
        > & { id?: string; created_at?: string; confirmed_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["captures"]["Row"]>;
      };
      vendor_fingerprints: {
        Row: {
          id: string;
          vendor: string;
          template_hash: string;
          field_map: Json;
          hit_count: number;
          created_at: string;
          last_seen_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vendor_fingerprints"]["Row"],
          "id" | "created_at" | "last_seen_at" | "hit_count"
        > & {
          id?: string;
          created_at?: string;
          last_seen_at?: string;
          hit_count?: number;
        };
        Update: Partial<
          Database["public"]["Tables"]["vendor_fingerprints"]["Row"]
        >;
      };
      trips: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          auto_assembled: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["trips"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["trips"]["Row"]>;
      };
      wallet_items: {
        Row: {
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
        };
        Insert: Omit<
          Database["public"]["Tables"]["wallet_items"]["Row"],
          "id" | "created_at" | "updated_at" | "meta"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          meta?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["wallet_items"]["Row"]>;
      };
      experiences: {
        Row: {
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
        };
        Insert: Omit<
          Database["public"]["Tables"]["experiences"]["Row"],
          "id" | "created_at" | "updated_at" | "photos"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
          photos?: Json;
        };
        Update: Partial<Database["public"]["Tables"]["experiences"]["Row"]>;
      };
    };
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
    };
    Enums: {
      audience: Audience;
      circle_kind: CircleKind;
      friendship_state: FriendshipState;
      capture_source: CaptureSource;
      capture_status: CaptureStatus;
      wallet_kind: WalletKind;
      wallet_status: WalletStatus;
      verified_by: VerifiedBy;
    };
  };
}
