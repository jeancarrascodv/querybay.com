import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set in .env.local");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

export type PlanId = "outreach" | "growth" | "talent";
export type Billing = "monthly" | "yearly";

const PRICE_MAP: Record<PlanId, Record<Billing, string | undefined>> = {
  outreach: {
    monthly: process.env.STRIPE_PRICE_OUTREACH_MONTHLY,
    yearly: process.env.STRIPE_PRICE_OUTREACH_YEARLY,
  },
  growth: {
    monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    yearly: process.env.STRIPE_PRICE_GROWTH_YEARLY,
  },
  talent: {
    monthly: process.env.STRIPE_PRICE_TALENT_MONTHLY,
    yearly: process.env.STRIPE_PRICE_TALENT_YEARLY,
  },
};

export function getPriceId(plan: PlanId, billing: Billing): string {
  const priceId = PRICE_MAP[plan]?.[billing];
  if (!priceId || priceId.startsWith("price_REPLACE")) {
    throw new Error(
      `Missing STRIPE_PRICE_${plan.toUpperCase()}_${billing.toUpperCase()} in .env.local`,
    );
  }
  return priceId;
}
