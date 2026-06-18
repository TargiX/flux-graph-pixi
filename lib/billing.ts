import Stripe from "stripe";

export type BillingPlanId = "team-annual" | "studio-annual";

export type BillingPlan = {
  id: BillingPlanId;
  annualCents: number;
  description: string;
  envVar: string;
  name: string;
  roomLimit: string;
  stripePriceId?: string;
};

export const billingPlans: BillingPlan[] = [
  {
    annualCents: 19000,
    description: "For client reviews, async creative direction, and small product teams.",
    envVar: "STRIPE_TEAM_ANNUAL_PRICE_ID",
    id: "team-annual",
    name: "Team Annual",
    roomLimit: "Unlimited rooms",
    stripePriceId: process.env.STRIPE_TEAM_ANNUAL_PRICE_ID,
  },
  {
    annualCents: 49000,
    description: "For studios that need shared room history and higher file volume.",
    envVar: "STRIPE_STUDIO_ANNUAL_PRICE_ID",
    id: "studio-annual",
    name: "Studio Annual",
    roomLimit: "Studio workspace",
    stripePriceId: process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID,
  },
];

let stripeClient: Stripe | null | undefined;

export function formatAnnualPrice(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function getBillingPlan(planId?: string | null) {
  return billingPlans.find((plan) => plan.id === planId) ?? billingPlans[0];
}

export function getBillingPlanByPriceId(priceId?: string | null) {
  return billingPlans.find((plan) => plan.stripePriceId === priceId) ?? null;
}

export function getStripeClient() {
  if (stripeClient !== undefined) {
    return stripeClient;
  }

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    stripeClient = null;
    return stripeClient;
  }

  stripeClient = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
  });

  return stripeClient;
}

export function getAppOrigin(request: Request) {
  return (
    request.headers.get("origin") ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
    new URL(request.url).origin
  );
}

export function unixToIso(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}
