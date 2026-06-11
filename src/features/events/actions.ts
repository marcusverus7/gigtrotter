"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export async function toggleEventInterest(
  eventId: string,
  interestType: "interested" | "going",
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("event_interests")
    .select("id, interest_type")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.interest_type === interestType) {
      await supabase
        .from("event_interests")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", user.id);
    } else {
      await supabase
        .from("event_interests")
        .update({ interest_type: interestType })
        .eq("id", existing.id)
        .eq("user_id", user.id);
    }
  } else {
    await supabase.from("event_interests").insert({
      event_id: eventId,
      user_id: user.id,
      interest_type: interestType,
    });
  }

  revalidatePath(`/app/events/${eventId}`);
  revalidatePath("/app/events");
}

export async function trackOutboundClick(
  eventId: string,
  ticketLinkId: string,
  provider: string,
  eventTitle: string,
  eventCity: string | null,
  eventCategory: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("event_outbound_clicks").insert({
    event_id: eventId,
    ticket_link_id: ticketLinkId,
    user_id: user?.id ?? null,
    provider,
    event_title: eventTitle,
    event_city: eventCity,
    event_category: eventCategory,
  });
}

export async function submitEvent(input: {
  title: string;
  description: string | null;
  category: string;
  headliner: string | null;
  artistNames: string[];
  venueName: string | null;
  venueCity: string | null;
  venueCountry: string | null;
  startsAt: string | null;
  doorsAt: string | null;
  imageUrl: string | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  tags: string[];
  ticketUrl: string | null;
  ticketProvider: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (!input.title.trim()) throw new Error("Title is required.");
  if (!input.startsAt) throw new Error("Start time is required.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      title: input.title.trim(),
      description: input.description,
      category: input.category,
      headliner: input.headliner,
      artist_names: input.artistNames,
      venue_name: input.venueName,
      venue_city: input.venueCity,
      venue_country: input.venueCountry,
      starts_at: input.startsAt,
      doors_at: input.doorsAt,
      image_url: input.imageUrl,
      min_price_cents: input.minPriceCents,
      max_price_cents: input.maxPriceCents,
      tags: input.tags,
      source: "manual",
      promoter_id: user.id,
      promoter_name: profile?.display_name ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.ticketUrl && input.ticketProvider) {
    await supabase.from("event_ticket_links").insert({
      event_id: event.id,
      provider: input.ticketProvider.toLowerCase().replace(/\s+/g, "_"),
      provider_label: `Buy on ${input.ticketProvider}`,
      url: input.ticketUrl,
      min_price_cents: input.minPriceCents,
      max_price_cents: input.maxPriceCents,
    });
  }

  revalidatePath("/app/events");
  return { eventId: event.id };
}

export async function addToWalletFromEvent(eventId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: event } = await supabase
    .from("events")
    .select("title, headliner, venue_name, venue_city, venue_country, venue_id, starts_at, ends_at, category")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) throw new Error("Event not found.");

  const { data: existing } = await supabase
    .from("wallet_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("title", event.title)
    .eq("starts_at", event.starts_at)
    .maybeSingle();
  if (existing) throw new Error("This event is already in your wallet.");

  const { data: item, error } = await supabase
    .from("wallet_items")
    .insert({
      user_id: user.id,
      kind: "ticket",
      title: event.title,
      subtitle: event.headliner ?? event.venue_name,
      venue_id: event.venue_id,
      starts_at: event.starts_at,
      ends_at: event.ends_at,
      status: "going",
    })
    .select("id")
    .single();
  if (error) throw error;

  await supabase.from("experiences").insert({
    user_id: user.id,
    wallet_item_id: item.id,
    audience: "inner",
  });

  revalidatePath("/app");
  revalidatePath(`/app/events/${eventId}`);
  return { walletItemId: item.id };
}

export async function searchEvents(query: string, city?: string) {
  const supabase = await createClient();

  let q = supabase
    .from("events")
    .select(
      "id, title, headliner, artist_names, category, venue_name, venue_city, venue_country, starts_at, image_url, min_price_cents, currency, is_sold_out, tags",
    )
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(30);

  if (query) {
    q = q.or(
      `title.ilike.%${query}%,headliner.ilike.%${query}%,venue_name.ilike.%${query}%,artist_names.cs.{${query}}`,
    );
  }
  if (city) {
    q = q.ilike("venue_city", `%${city}%`);
  }

  const { data } = await q;
  return data ?? [];
}
