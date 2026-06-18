import Link from "next/link";
import { billingPlans, getBillingPlan } from "@/lib/billing";

type BillingSuccessSearchParams = Promise<{
  demo?: string;
  plan?: string;
  portal?: string;
  session_id?: string;
}>;

export default async function BillingSuccessPage({ searchParams }: { searchParams: BillingSuccessSearchParams }) {
  const params = await searchParams;
  const plan = getBillingPlan(params.plan);
  const isDemo = params.demo === "1";

  return (
    <main className="billing-success">
      <section>
        <div className="eyebrow">{isDemo ? "Demo subscription" : "Subscription active"}</div>
        <h1>{params.portal ? "Billing portal opened" : `${plan.name} is ready`}</h1>
        <p>
          {isDemo
            ? "Stripe demo mode returned a local success state. Add real Stripe keys and annual Price IDs to turn this into a live subscription Checkout."
            : "Stripe Checkout completed and the webhook can persist subscription state into Supabase."}
        </p>
        <div className="billing-success__plans">
          {billingPlans.map((item) => (
            <span key={item.id}>{item.name}</span>
          ))}
        </div>
        <Link href="/#billing">Back to Roomboard</Link>
      </section>
    </main>
  );
}
