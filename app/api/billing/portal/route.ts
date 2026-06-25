import { NextResponse } from "next/server";
import { getAppOrigin, getStripeClient } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PortalPayload = {
  customerId?: string;
};

export async function POST(request: Request) {
  const origin = getAppOrigin(request);
  const payload = (await request.json().catch(() => ({}))) as PortalPayload;
  const stripe = getStripeClient();

  if (!stripe || !payload.customerId) {
    return NextResponse.json({
      demo: true,
      url: `${origin}/billing/success?demo=1&portal=1`,
    });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: payload.customerId,
    return_url: origin,
  });

  return NextResponse.json({ demo: false, url: session.url });
}
