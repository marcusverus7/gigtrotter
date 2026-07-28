import { z } from "zod";

/**
 * The structured shape we coerce every capture into. This is the contract
 * between the vision parser (Claude) and the rest of the app — the wallet,
 * the map, the share card all read from this.
 *
 * Designed to be the lowest-common-denominator across tickets, flights,
 * stays, and restaurants. Confidence per field lets the UI route uncertain
 * extractions to a manual-review surface instead of writing silently.
 */

export const CaptureKindSchema = z.enum([
  "ticket",
  "flight",
  "stay",
  "restaurant",
  "other",
]);

export const ParsedLocationSchema = z.object({
  name: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  iata: z.string().length(3).nullable().optional(),
});

export const ParsedCaptureSchema = z.object({
  kind: CaptureKindSchema,
  title: z.string().min(1, "Title is required"),
  // ISO 8601 — local time as captured on the artefact. Timezone may be null
  // when not present on the source; the app stores in UTC and renders local.
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  origin: ParsedLocationSchema.nullable().optional(),
  destination: ParsedLocationSchema.nullable().optional(),
  vendor: z.string().nullable(),
  /**
   * Total price printed on the artefact, in minor units (pence/cents), plus its
   * currency. Extracted so the resale marketplace can cross-check a seller's
   * DECLARED face value against the ticket they actually hold — without it, the
   * anti-scalper constraint (`asking <= face_value`) is satisfied by simply
   * declaring a higher face value. Null whenever no price is visible; a null
   * here means "no evidence", never "free".
   */
  price_total_cents: z.number().int().min(0).nullable().default(null),
  currency: z.string().length(3).nullable().default(null),
  // Encrypted on store; the parser only ever sees the raw value briefly.
  barcode_present: z.boolean().default(false),
  // 0..1 — overall confidence; below 0.6 routes to manual review.
  confidence: z.number().min(0).max(1),
  // Free-form notes the parser surfaces ("seat 12A, gate B27").
  details: z.array(z.string()).default([]),
  // True if the parser detected something that looks like an identity doc.
  // We DROP these — see §11.4 the honeypot problem.
  pii_detected: z.boolean().default(false),
});

export type ParsedCapture = z.infer<typeof ParsedCaptureSchema>;
export type CaptureKind = z.infer<typeof CaptureKindSchema>;

/** Heuristic vendor → kind mapping for the few we cache aggressively. */
export const KNOWN_VENDORS: Record<string, CaptureKind> = {
  ticketmaster: "ticket",
  dice: "ticket",
  eventbrite: "ticket",
  axs: "ticket",
  seetickets: "ticket",
  skiddle: "ticket",
  ryanair: "flight",
  easyjet: "flight",
  britishairways: "flight",
  ba: "flight",
  jet2: "flight",
  klm: "flight",
  lufthansa: "flight",
  booking: "stay",
  airbnb: "stay",
  hotels: "stay",
  expedia: "stay",
  opentable: "restaurant",
  resy: "restaurant",
};
