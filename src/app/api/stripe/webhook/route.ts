import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/// Maps the landing-page plan IDs to the querybay-app `plan_tier` enum
/// (free|pro|enterprise). The landing sells three managed tiers
/// (outreach|growth|talent); the SaaS DB groups them into the existing
/// enum so /billing in app.querybay.com renders something coherent. The
/// exact landing tier is preserved in `stripe_events.metadata` so we can
/// reconstruct ARR/segmentation later without losing fidelity.
function landingPlanToAppTier(plan: string | undefined): "pro" | "enterprise" {
  if (plan === "outreach") return "pro";
  // growth + talent + anything unknown → enterprise (highest tier).
  return "enterprise";
}

// Payload shapes follow the documented Stripe API. We type them loosely
// here because the package's namespace merging doesn't play well with
// our tsconfig (StripeConstructor vs. namespace-merged Stripe). Field
// access is runtime-checked where it matters.
type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};
type CheckoutSession = Record<string, unknown> & {
  id: string;
  customer_email?: string | null;
  customer?: string | null;
  subscription?: string | null;
  metadata?: Record<string, string> | null;
  customer_details?: { email?: string | null } | null;
};
type Subscription = Record<string, unknown> & {
  id: string;
  customer?: string | null;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  items: { data: Array<{ current_period_start?: number; current_period_end?: number }> };
};
type Invoice = Record<string, unknown> & {
  id: string;
  customer?: string | null;
  amount_due: number;
};

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured" },
      { status: 500 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();

  let event: StripeEvent;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      secret,
    ) as unknown as StripeEvent;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe/webhook] signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!supabaseAdmin) {
    console.error("[stripe/webhook] supabaseAdmin not configured");
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 500 },
    );
  }

  // 1. Persist the raw event idempotently. Stripe retries deliveries
  //    on any non-2xx; the unique constraint on event_id makes this a
  //    no-op on retry without us thinking about it.
  const { extracted, ...rest } = extractEventFields(event);
  void rest;
  const { error: insertErr } = await supabaseAdmin
    .from("stripe_events")
    .insert({
      event_id: event.id,
      event_type: event.type,
      customer_email: extracted.customerEmail,
      customer_id: extracted.customerId,
      subscription_id: extracted.subscriptionId,
      metadata: extracted.metadata,
      raw: event as unknown as Record<string, unknown>,
    });
  if (insertErr && insertErr.code !== "23505") {
    // 23505 = unique_violation — Stripe redelivery, expected.
    console.error("[stripe/webhook] failed to log event:", insertErr);
    return NextResponse.json(
      { error: "Database write failed" },
      { status: 500 },
    );
  }

  // 2. Dispatch on event type. Each handler is best-effort: a failure
  //    here doesn't undo the audit log entry, so we can replay.
  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as CheckoutSession);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object as Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Subscription);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Invoice);
        break;
      default:
        // Unhandled events still get logged via the insert above.
        console.log(`[stripe/webhook] unhandled event: ${event.type}`);
    }
    // Mark processed so the unprocessed-events index stays small.
    await supabaseAdmin
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", event.id);
  } catch (err) {
    console.error(`[stripe/webhook] handler ${event.type} failed:`, err);
    // Returning 200 anyway — the event is logged, we'll reprocess
    // manually. Returning 500 would make Stripe retry forever and
    // pile up duplicate audit entries (the insert is no-op'd by the
    // unique constraint, but the side-effect race isn't worth it).
  }

  return NextResponse.json({ received: true });
}

function extractEventFields(event: StripeEvent) {
  const obj = event.data.object as Record<string, unknown>;
  const customerEmail =
    typeof obj["customer_email"] === "string"
      ? (obj["customer_email"] as string)
      : (((obj["customer_details"] as Record<string, unknown> | undefined)
          ?.email as string | undefined) ??
        ((obj["receipt_email"] as string | undefined) ?? null));
  const customerId =
    typeof obj["customer"] === "string"
      ? (obj["customer"] as string)
      : null;
  const subscriptionId =
    typeof obj["subscription"] === "string"
      ? (obj["subscription"] as string)
      : (typeof obj["id"] === "string" && event.type.startsWith("customer.subscription.")
          ? (obj["id"] as string)
          : null);
  const metadata = (obj["metadata"] as Record<string, unknown> | undefined) ?? null;
  return { extracted: { customerEmail, customerId, subscriptionId, metadata } };
}

/// Best-effort lookup: given an email, return the team_id of any team
/// the user owns. Returns null if no match (orphan event — to be
/// resolved when the user signs up).
async function teamIdForEmail(email: string | null): Promise<string | null> {
  if (!email || !supabaseAdmin) return null;
  // First find the auth.user with this email. We can't query auth.users
  // directly from supabase-js; use the admin API.
  const { data: userData, error: userErr } = await supabaseAdmin.auth.admin
    .listUsers({ page: 1, perPage: 200 });
  if (userErr || !userData) return null;
  type AuthUser = { id: string; email?: string | null };
  const users = (userData.users ?? []) as unknown as AuthUser[];
  const match = users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (!match) return null;
  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("user_id", match.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return (membership?.team_id as string | undefined) ?? null;
}

async function handleCheckoutCompleted(session: CheckoutSession) {
  if (!supabaseAdmin) return;
  const email =
    session.customer_email ??
    session.customer_details?.email ??
    null;
  const customerId =
    typeof session.customer === "string" ? session.customer : null;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;
  const metadata = session.metadata ?? {};
  const landingPlan = (metadata.plan as string | undefined) ?? undefined;
  const tier = landingPlanToAppTier(landingPlan);

  console.log("[stripe/webhook] checkout.completed:", {
    sessionId: session.id,
    email,
    customerId,
    subscriptionId,
    landingPlan,
    tier,
  });

  const teamId = await teamIdForEmail(email);

  if (!teamId) {
    // Orphan — the event row is already persisted with customer_email,
    // we'll resolve when the user signs up. Surface clearly in logs so
    // the operator can decide whether to reach out manually.
    console.warn(
      `[stripe/webhook] orphan checkout — no team for email '${email}'. Operator must reach out or wait for signup.`,
    );
    return;
  }

  // Upsert the subscription. team_id is unique so existing free-default
  // rows get replaced cleanly with the paid plan.
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      team_id: teamId,
      plan: tier,
      status: "active",
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
    },
    { onConflict: "team_id" },
  );
  if (error) {
    console.error("[stripe/webhook] subscription upsert failed:", error);
    throw error;
  }

  // Tag the audit entry with the resolved team_id for easy lookups.
  await supabaseAdmin
    .from("stripe_events")
    .update({ team_id: teamId })
    .eq("event_id", session.id)
    .is("team_id", null);
}

async function handleSubscriptionUpdate(sub: Subscription) {
  if (!supabaseAdmin) return;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return;

  // Map Stripe subscription status to our enum (drop unsupported values).
  const supportedStatuses = [
    "trialing",
    "active",
    "past_due",
    "canceled",
    "incomplete",
  ] as const;
  const status = supportedStatuses.includes(sub.status as typeof supportedStatuses[number])
    ? (sub.status as typeof supportedStatuses[number])
    : "active";

  // Stripe v2026 renamed period fields to live on items[]; fall back to
  // the deprecated top-level fields for older API versions.
  const periodStartTs =
    (sub as unknown as { current_period_start?: number }).current_period_start ??
    sub.items.data[0]?.current_period_start ??
    null;
  const periodEndTs =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      current_period_start: periodStartTs
        ? new Date(periodStartTs * 1000).toISOString()
        : null,
      current_period_end: periodEndTs
        ? new Date(periodEndTs * 1000).toISOString()
        : null,
      stripe_subscription_id: sub.id,
    })
    .eq("stripe_customer_id", customerId);
  if (error) {
    console.error("[stripe/webhook] subscription update failed:", error);
    throw error;
  }
}

async function handleSubscriptionDeleted(sub: Subscription) {
  if (!supabaseAdmin) return;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : null;
  if (!customerId) return;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "canceled", cancel_at_period_end: true })
    .eq("stripe_customer_id", customerId);
  if (error) {
    console.error("[stripe/webhook] subscription delete failed:", error);
    throw error;
  }
}

async function handlePaymentFailed(invoice: Invoice) {
  if (!supabaseAdmin) return;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  if (!customerId) return;
  console.warn("[stripe/webhook] payment failed:", {
    invoiceId: invoice.id,
    customerId,
    amount: invoice.amount_due,
  });
  // Mark subscription past_due. Stripe will follow with the
  // customer.subscription.updated event itself, but flagging early
  // means /billing in the app reflects reality before the next event.
  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_customer_id", customerId);
}
