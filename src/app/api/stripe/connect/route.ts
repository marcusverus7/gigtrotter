import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe/client";
import { createServiceClient, getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Promoter payouts: create (or resume) a Stripe Connect Express account and
 * send the promoter to Stripe's hosted onboarding — identity, bank account,
 * the lot, none of it touching our servers. Express means Stripe hosts the
 * payout dashboard too. `?return=1` is the way back: refresh the account's
 * state and record whether charges and payouts are enabled.
 */
export async function GET(request: NextRequest) {
  const stripe = getStripe();
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!stripe) return NextResponse.redirect(new URL("/app/settings?payouts=unconfigured", request.url));

  const service = createServiceClient();
  const { data: existing } = await service
    .from("promoter_accounts")
    .select("stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const url = new URL(request.url);
  const site = publicEnv.siteUrl;

  if (url.searchParams.get("return") === "1" && existing?.stripe_account_id) {
    const acct = await stripe.accounts.retrieve(existing.stripe_account_id);
    await service
      .from("promoter_accounts")
      .update({
        charges_enabled: !!acct.charges_enabled,
        payouts_enabled: !!acct.payouts_enabled,
        details_submitted: !!acct.details_submitted,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id", user.id);
    return NextResponse.redirect(new URL(`/app/settings?payouts=${acct.charges_enabled ? "ready" : "incomplete"}`, request.url));
  }

  let accountId = existing?.stripe_account_id ?? null;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      country: "GB",
      email: user.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { product_description: "Event tickets sold through GigTrotter" },
      metadata: { user_id: user.id },
    });
    accountId = acct.id;
    await service
      .from("promoter_accounts")
      .upsert({ user_id: user.id, stripe_account_id: accountId } as never, { onConflict: "user_id" });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${site}/api/stripe/connect`,
    return_url: `${site}/api/stripe/connect?return=1`,
    type: "account_onboarding",
  });
  return NextResponse.redirect(link.url);
}
