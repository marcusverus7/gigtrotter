-- Where a listing's face value came from
--
-- The anti-scalper rule is a real database constraint
-- (`asking_price_cents <= face_value_cents`, migration 0006), and
-- `createListing` now cross-checks the DECLARED face value against the price
-- the parser read off the seller's own ticket. But that check can only fire
-- when there is something to check against, and it is silent about itself:
--
--   * A manually added gig, or a ticket with no printed price, has no
--     evidence at all — the seller's number is taken on trust, and a buyer
--     cannot tell that apart from a verified one.
--   * `price_total_cents` is the total for the ORDER. Four tickets bought for
--     £200 currently permit one of them to be listed at £200.
--
-- Neither is fixed by hiding it. Recording where the number came from lets the
-- listing say so plainly, which is the difference between a guarantee and a
-- claim — and it means the strong copy can be earned by the listings that
-- deserve it rather than applied to all of them.
--
-- Purely additive. Existing rows become 'declared', which is what they are.

alter table public.listings
  add column if not exists face_value_source text not null default 'declared'
  check (face_value_source in ('ticket', 'declared'));

-- What the artefact actually showed, when it showed anything. Kept alongside
-- the source so a buyer-facing surface can explain the number rather than just
-- assert it, and so the multi-ticket gap above is visible in the data rather
-- than buried in a comparison that already happened.
alter table public.listings
  add column if not exists face_value_evidence_cents integer
  check (face_value_evidence_cents is null or face_value_evidence_cents >= 0);

comment on column public.listings.face_value_source is
  'ticket = cross-checked against the price parsed from the seller''s own capture; declared = no evidence available, seller''s number taken on trust.';
