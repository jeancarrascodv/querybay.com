#!/usr/bin/env node
// Creates the 3 Querybay products in Stripe with monthly and yearly prices,
// and writes the resulting Price IDs back to .env.local.
//
// Usage:
//   node scripts/setup-stripe.mjs
//
// Requires a valid STRIPE_SECRET_KEY in .env.local (starting with sk_test_ or sk_live_).

import Stripe from "stripe";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");

// --- Parse .env.local ---
const envRaw = readFileSync(ENV_PATH, "utf8");
const envLines = envRaw.split("\n");
const env = {};
for (const line of envLines) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const secretKey = env.STRIPE_SECRET_KEY;
if (!secretKey || !/^sk_(test|live)_/.test(secretKey)) {
  console.error(
    "\x1b[31m[error]\x1b[0m STRIPE_SECRET_KEY in .env.local is not valid.",
  );
  console.error(
    "       It must start with 'sk_test_' (recommended) or 'sk_live_'.",
  );
  console.error(`       Current value: ${secretKey ?? "(empty)"}`);
  process.exit(1);
}

const isLive = secretKey.startsWith("sk_live_");
if (isLive) {
  console.log("\x1b[33m[warn]\x1b[0m You're using a LIVE key. Real products will be created.");
  console.log("       Cancel with Ctrl+C if this was not intended. Waiting 5s...");
  await new Promise((r) => setTimeout(r, 5000));
}

const stripe = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });

// --- Product definitions ---
// Monthly base prices; yearly applies a 15% discount over 12 months.
const PLANS = [
  {
    key: "OUTREACH",
    name: "Outreach",
    description: "Managed multichannel outbound campaigns",
    monthly: 390,
  },
  {
    key: "GROWTH",
    name: "Growth",
    description: "Full growth stack: outreach + paid ads + CRO",
    monthly: 650,
  },
  {
    key: "TALENT",
    name: "Talent",
    description: "Full-time remote hiring in LATAM & Ghana",
    monthly: 1200,
  },
];

const CURRENCY = "usd";

const results = {}; // { OUTREACH_MONTHLY: "price_...", ... }

for (const plan of PLANS) {
  console.log(`\n→ Creating product: ${plan.name}`);
  const product = await stripe.products.create({
    name: plan.name,
    description: plan.description,
    metadata: { plan_key: plan.key.toLowerCase() },
  });
  console.log(`  product: ${product.id}`);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: plan.monthly * 100,
    currency: CURRENCY,
    recurring: { interval: "month" },
    nickname: `${plan.name} monthly`,
  });
  console.log(`  monthly price: ${monthlyPrice.id} ($${plan.monthly}/mo)`);

  const yearlyAmount = Math.round(plan.monthly * 12 * 0.85);
  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: yearlyAmount * 100,
    currency: CURRENCY,
    recurring: { interval: "year" },
    nickname: `${plan.name} yearly`,
  });
  console.log(`  yearly price:  ${yearlyPrice.id} ($${yearlyAmount}/yr, 15% off)`);

  results[`${plan.key}_MONTHLY`] = monthlyPrice.id;
  results[`${plan.key}_YEARLY`] = yearlyPrice.id;
}

// --- Write back to .env.local ---
let updatedEnv = envRaw;
for (const [suffix, priceId] of Object.entries(results)) {
  const key = `STRIPE_PRICE_${suffix}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(updatedEnv)) {
    updatedEnv = updatedEnv.replace(regex, `${key}=${priceId}`);
  } else {
    updatedEnv += `\n${key}=${priceId}`;
  }
}

writeFileSync(ENV_PATH, updatedEnv);

console.log("\n\x1b[32m✓\x1b[0m Price IDs written to .env.local");
console.log("\nSummary:");
for (const [k, v] of Object.entries(results)) {
  console.log(`  STRIPE_PRICE_${k}=${v}`);
}
console.log("\nNext: npm run dev and test the checkout flow.");
