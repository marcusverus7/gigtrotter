import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Perk click-through — logs the claim and tags the partner URL the same way
 * the alert affiliate route does. Plus-only gate enforced server-side.
 */
function tagUrl(partner: string, raw: string, claimId: string) {
  try {
    const u = new URL(raw);
    const p = partner.toLowerCase();
    switch (p) {
      case "ticketmaster":
        u.searchParams.set("irgwc", "1");
        u.searchParams.set("clickid", `gt_perk_${claimId}`);
        break;
      case "dice":
      case "eventbrite":
        u.searchParams.set("utm_source", "gigtrotter");
        u.searchParams.set("utm_campaign", "perk");
        break;
      case "skyscanner":
      case "kiwi":
        u.searchParams.set("associateID", "GIGTROTTER");
        break;
      case "booking":
      case "airbnb":
      case "expedia":
        u.searchParams.set("aid", "GIGTROTTER");
        u.searchParams.set("label", `perk_${claimId}`);
        break;
      default:
        u.searchParams.set("utm_source", "gigtrotter");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const perkId = url.searchParams.get("perk");
  if (!perkId) {
    return NextResponse.redirect(new URL("/app/perks", request.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const [{ data: profile }, { data: perk }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", user.id).single(),
    supabase.from("pro_perks").select("*").eq("id", perkId).maybeSingle(),
  ]);

  if (!perk?.cta_url) {
    return NextResponse.redirect(new URL("/app/perks", request.url));
  }
  if (profile?.plan !== "plus") {
    return NextResponse.redirect(
      new URL("/app/settings?upgrade=1", request.url),
    );
  }

  // Log the claim.
  const { data: claim } = await supabase
    .from("pro_perk_claims")
    .insert({ perk_id: perkId, user_id: user.id })
    .select("id")
    .single();

  return NextResponse.redirect(
    tagUrl(perk.partner, perk.cta_url, claim?.id ?? "anon"),
  );
}
