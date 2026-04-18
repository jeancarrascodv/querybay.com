#!/usr/bin/env node
// Crea los 3 productos de Querybay en Stripe con sus precios mensual/anual
// y escribe los Price IDs resultantes en .env.local.
//
// Uso:
//   node scripts/setup-stripe.mjs
//
// Requiere STRIPE_SECRET_KEY válida en .env.local (empezando con sk_test_ o sk_live_).

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
    "\x1b[31m[error]\x1b[0m STRIPE_SECRET_KEY en .env.local no tiene un formato válido.",
  );
  console.error(
    "       Debe empezar con 'sk_test_' (recomendado) o 'sk_live_'.",
  );
  console.error(`       Valor actual: ${secretKey ?? "(vacío)"}`);
  process.exit(1);
}

const isLive = secretKey.startsWith("sk_live_");
if (isLive) {
  console.log("\x1b[33m[warn]\x1b[0m Estás usando una clave LIVE. Creará productos reales.");
  console.log("       Cancela con Ctrl+C si no era la intención. Esperando 5s...");
  await new Promise((r) => setTimeout(r, 5000));
}

const stripe = new Stripe(secretKey, { apiVersion: "2026-03-25.dahlia" });

// --- Definición de productos ---
// Precios mensuales base; el anual aplica 15% descuento sobre 12 meses.
const PLANS = [
  {
    key: "OUTREACH",
    name: "Outreach",
    description: "Campañas multicanal gestionadas",
    monthly: 1490,
  },
  {
    key: "GROWTH",
    name: "Growth",
    description: "Stack completo: outreach + ads + CRO",
    monthly: 3490,
  },
  {
    key: "TALENT",
    name: "Talent",
    description: "Contratación full-time LATAM / Ghana",
    monthly: 1200,
  },
];

const CURRENCY = "usd";

const results = {}; // { OUTREACH_MONTHLY: "price_...", ... }

for (const plan of PLANS) {
  console.log(`\n→ Creando producto: ${plan.name}`);
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
    nickname: `${plan.name} mensual`,
  });
  console.log(`  price mensual: ${monthlyPrice.id} ($${plan.monthly}/mes)`);

  const yearlyAmount = Math.round(plan.monthly * 12 * 0.85);
  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: yearlyAmount * 100,
    currency: CURRENCY,
    recurring: { interval: "year" },
    nickname: `${plan.name} anual`,
  });
  console.log(`  price anual:   ${yearlyPrice.id} ($${yearlyAmount}/año, 15% off)`);

  results[`${plan.key}_MONTHLY`] = monthlyPrice.id;
  results[`${plan.key}_YEARLY`] = yearlyPrice.id;
}

// --- Escribir de vuelta a .env.local ---
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

console.log("\n\x1b[32m✓\x1b[0m Price IDs escritos en .env.local");
console.log("\nResumen:");
for (const [k, v] of Object.entries(results)) {
  console.log(`  STRIPE_PRICE_${k}=${v}`);
}
console.log("\nSiguiente: npm run dev y prueba el checkout.");
