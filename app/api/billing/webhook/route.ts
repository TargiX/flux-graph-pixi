import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getBillingPlanByPriceId, getStripeClient, unixToIso } from "@/lib/billing";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_end?: number;
  current_period_start?: number;
};

function objectId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

async function upsertSubscription(subscription: Stripe.Subscription, session?: Stripe.Checkout.Session) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const periodSubscription = subscription as SubscriptionWithPeriods;
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const planId = subscription.metadata.planId || session?.metadata?.planId || getBillingPlanByPriceId(priceId)?.id || null;
  const userId = subscription.metadata.userId || session?.metadata?.userId || null;
  const customerId = objectId(subscription.customer);

  if (!customerId) {
    return;
  }

  if (userId) {
    await supabase
      .from("roomboard_profiles")
      .upsert(
        {
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
          user_id: userId,
        },
        { onConflict: "user_id" },
      )
      .throwOnError();
  }

  await supabase
    .from("billing_subscriptions")
    .upsert(
      {
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: unixToIso(periodSubscription.current_period_end),
        current_period_start: unixToIso(periodSubscription.current_period_start),
        plan_id: planId,
        status: subscription.status,
        stripe_customer_id: customerId,
        stripe_price_id: priceId,
        stripe_subscription_id: subscription.id,
        updated_at: new Date().toISOString(),
        user_id: userId || null,
      },
      { onConflict: "stripe_subscription_id" },
    )
    .throwOnError();
}

async function getSubscriptionFromSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (!session.subscription || typeof session.subscription !== "string") {
    return null;
  }

  return stripe.subscriptions.retrieve(session.subscription);
}

export async function POST(request: Request) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    return NextResponse.json({ demo: true, received: true });
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Stripe webhook";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const subscription = await getSubscriptionFromSession(stripe, session);
      if (subscription) {
        await upsertSubscription(subscription, session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object);
      break;
  }

  return NextResponse.json({ received: true });
}
