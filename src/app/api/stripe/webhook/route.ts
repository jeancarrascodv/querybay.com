import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

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
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe/webhook] signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      console.log("[stripe/webhook] checkout completed:", {
        id: session.id,
        customer: session.customer,
        subscription: session.subscription,
        metadata: session.metadata,
      });
      // TODO: persist to database once it exists (user → subscription)
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      console.log(`[stripe/webhook] ${event.type}:`, {
        id: sub.id,
        status: sub.status,
        customer: sub.customer,
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      console.warn("[stripe/webhook] payment failed:", {
        id: invoice.id,
        customer: invoice.customer,
      });
      break;
    }
    default:
      console.log(`[stripe/webhook] unhandled event: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
