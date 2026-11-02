/**
 * What the webhook does with a verified Stripe event. PURE apart from the two
 * handlers it is given, so the dispatch can be tested with a signed payload
 * and fake fulfilment, without a database.
 */

export type CheckoutSessionLike = {
  id: string;
  metadata?: Record<string, string> | null;
  payment_status?: string | null;
  payment_intent?: string | { id: string } | null;
  customer_details?: { email?: string | null } | null;
};

export type StripeEventLike = { type: string; data: { object: unknown } };

export type FulfilInput = {
  sessionId: string;
  paymentIntentId: string | null;
  email: string | null;
};

export type StripeHandlers = {
  fulfil: (orderId: string, stripe: FulfilInput) => Promise<unknown>;
  expire: (orderId: string) => Promise<unknown>;
};

export type DispatchResult = {
  action: "fulfilled" | "expired" | "ignored";
  orderId: string | null;
};

export async function dispatchStripeEvent(
  event: StripeEventLike,
  handlers: StripeHandlers,
): Promise<DispatchResult> {
  const s = event.data.object as CheckoutSessionLike;
  const orderId = s?.metadata?.order_id ?? null;
  if (event.type === "checkout.session.completed") {
    if (orderId && s.payment_status === "paid") {
      await handlers.fulfil(orderId, {
        sessionId: s.id,
        paymentIntentId:
          typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
        email: s.customer_details?.email ?? null,
      });
      return { action: "fulfilled", orderId };
    }
    return { action: "ignored", orderId };
  }
  if (event.type === "checkout.session.expired") {
    if (orderId) {
      await handlers.expire(orderId);
      return { action: "expired", orderId };
    }
  }
  return { action: "ignored", orderId };
}
