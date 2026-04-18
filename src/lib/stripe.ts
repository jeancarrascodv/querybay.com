import Stripe from "stripe";

let stripeSingleton: InstanceType<typeof Stripe> | null = null;

export function getStripe(): InstanceType<typeof Stripe> {
  if (stripeSingleton) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  stripeSingleton = new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
  });
  return stripeSingleton;
}

export type PlanId = "outreach" | "growth" | "talent";
export type Billing = "monthly" | "yearly";

const PRICE_ENV_MAP: Record<PlanId, Record<Billing, string>> = {
  outreach: {
    monthly: "STRIPE_PRICE_OUTREACH_MONTHLY",
    yearly: "STRIPE_PRICE_OUTREACH_YEARLY",
  },
  growth: {
    monthly: "STRIPE_PRICE_GROWTH_MONTHLY",
    yearly: "STRIPE_PRICE_GROWTH_YEARLY",
  },
  talent: {
    monthly: "STRIPE_PRICE_TALENT_MONTHLY",
    yearly: "STRIPE_PRICE_TALENT_YEARLY",
  },
};

export function getPriceId(plan: PlanId, billing: Billing): string {
  const envKey = PRICE_ENV_MAP[plan]?.[billing];
  const priceId = envKey ? process.env[envKey] : undefined;
  if (!priceId || priceId.startsWith("price_REPLACE")) {
    throw new Error(`Missing ${envKey} env var`);
  }
  return priceId;
}
