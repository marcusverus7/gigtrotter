# Schema map

A quick tour of the tables. Authoritative SQL lives in `supabase/migrations/`.

## Identity & social

| Table | Owner | What it is |
| --- | --- | --- |
| `profiles` | `auth.users.id` | Public-readable identity card. Also holds the `anon_handle`, `anon_hash`, `anon_views`, `anon_revoked` for the anonymous-board layer. |
| `circles` | `user_id` | Each user has an auto-created `kind='inner'` row. Custom circles are V1+. |
| `circle_members` | via `circles.user_id` | Who's in a circle. The owner can manage; members can see their own membership rows. |
| `friendships` | `user_a`, `user_b` (normalised `a < b`) | Bilateral. `state` transitions `pending → accepted`. |

## Capture pipeline

| Table | Owner | What it is |
| --- | --- | --- |
| `captures` | `user_id` | Every inbound artefact. `parse_json` holds the structured extraction; `status ∈ {pending,confirmed,rejected}`; `confidence` drives the confirm-vs-review UX. |
| `vendor_fingerprints` | service only | Parsing cache. `template_hash → field_map`. Second sighting of a Ryanair template is near-zero cost. |

## Lifecycle & memory

| Table | Owner | What it is |
| --- | --- | --- |
| `venues` | service / RPC | Canonical venues. `city_lat/city_lng` are the centroid used for the anon board's city-fuzzed pins. |
| `trips` | `user_id` | Auto-assembled clusters of flight + hotel + event captures in the same date range. |
| `wallet_items` | `user_id` | The lifecycle object: `wishlist → going → tonight → attended → archived`. Encrypted `barcode_ref` for live tickets. |
| `experiences` | `user_id` | The confirmed memory — what the map renders. `audience ∈ {vault,inner,friends,open}` and `verified_by ∈ {none,geofence,ticket,manual}`. |

## The time-shift rule

The single most load-bearing line in the codebase lives in `experiences`' SELECT policy:

```sql
audience <> 'vault'
and auth.uid() is not null
and auth.uid() <> user_id
and (
  (ends_at < now() and (
    audience = 'open'
    or (audience = 'friends' and public.are_friends(user_id, auth.uid()))
    or (audience = 'inner'   and public.in_inner_circle(user_id, auth.uid()))
  ))
  or
  (ends_at >= now() and public.in_inner_circle(user_id, auth.uid()))
)
```

Future events are visible **only** to inner-circle members, regardless of the pin's audience tier. This removes the worst risk class in the entire concept (stalking, empty-house inference).

## RPCs

| Function | Caller | What it does |
| --- | --- | --- |
| `anon_board(handle text)` | anon / auth | Returns city-fuzzed past+open pins for a public board. SECURITY DEFINER so it works for unauthenticated visitors. |
| `bump_anon_view(handle text)` | anon / auth | Increments view counter. |
| `are_friends(u1, u2)` | RLS internals | Helper used by experiences SELECT policy. |
| `in_inner_circle(owner, member)` | RLS internals | Helper used by the time-shift branch. |

## Storage buckets

| Bucket | Public | Notes |
| --- | --- | --- |
| `captures` | false | Encrypted source artefacts. Path `<user_id>/<uuid>.enc`. RLS limits read/write to owner. |
| `avatars` | true | Profile pictures. |
| `shares` | false | Generated share-card SVG/PNG (signed URLs only). Phase 5 renders these on the fly via `/share/[id]` instead. |
