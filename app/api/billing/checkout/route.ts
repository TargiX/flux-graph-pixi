import { NextResponse } from "next/server";
import { getAppOrigin, getBillingPlan, getStripeClient } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckoutPayload = {
  email?: string;
  planId?: string;
  userId?: string;
};

export async function POST(request: Request) {
  const origin = getAppOrigin(request);
  const payload = (await request.json().catch(() => ({}))) as CheckoutPayload;
  const plan = getBillingPlan(payload.planId);
  const stripe = getStripeClient();

  if (!stripe || !plan.stripePriceId) {
    return NextResponse.json({
      demo: true,
      mode: "demo",
      url: `${origin}/billing/success?demo=1&plan=${plan.id}`,
    });
  }

  const session = await stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    customer_email: payload.email || undefined,
    line_items: [
      {
        price: plan.stripePriceId,
        quantity: 1,
      },
    ],
    metadata: {
      planId: plan.id,
      userId: payload.userId ?? "",
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        planId: plan.id,
        userId: payload.userId ?? "",
      },
    },
    success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#billing`,
  });

  return NextResponse.json({ demo: false, mode: "stripe", url: session.url });
}
