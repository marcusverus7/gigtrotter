import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Affiliate click-through.
 *
 * Reads the alert, tags the destination URL with our partner code, marks the
 * alert as read, and 302s the user out. The UK ASA-compliant disclosure
 * lives in-product (next to the link copy), per §9.
 *
 * Partner tag scheme (placeholder — wire real partner ids in V1):
 *   ticketmaster:  ?irgwc=1&clickid=gt_<alert_id>
 *   dice:          ?utm_source=gigtrotter&utm_campaign=alert
 *   skyscanner:    &associateID=GIGTROTTER
 *   booking:       &aid=GIGTROTTER&label=alert_<alert_id>
 */
function tagUrl(partner: string | null, raw: string, alertId: string): string {
  try {
    const u = new URL(raw);
    const p = (partner ?? "").toLowerCase();
    switch (p) {
      case "ticketmaster":
        u.searchParams.set("irgwc", "1");
        u.searchParams.set("clickid", `gt_${alertId}`);
        break;
      case "dice":
      case "eventbrite":
        u.searchParams.set("utm_source", "gigtrotter");
        u.searchParams.set("utm_campaign", "alert");
        break;
      case "skyscanner":
      case "kiwi":
        u.searchParams.set("associateID", "GIGTROTTER");
        break;
      case "booking":
      case "airbnb":
      case "expedia":
        u.searchParams.set("aid", "GIGTROTTER");
        u.searchParams.set("label", `alert_${alertId}`);
        break;
      default:
        u.searchParams.set("utm_source", "gigtrotter");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", _req.url));
  }

  const { data: alert } = await supabase
    .from("alerts")
    .select("partner, url")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!alert?.url) {
    return NextResponse.redirect(new URL("/app/alerts", _req.url));
  }

  // Mark read on click-through.
  await supabase
    .from("alerts")
    .update({ state: "read" })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.redirect(tagUrl(alert.partner, alert.url, id));
}
