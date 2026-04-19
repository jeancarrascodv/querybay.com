import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPriceId, type PlanId, type Billing } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      plan: PlanId;
      billing: Billing;
      email?: string;
      name?: string;
      company?: string;
    };

    const { plan, billing, email, name, company } = body;

    if (!plan || !billing) {
      return NextResponse.json(
        { error: "plan and billing are required" },
        { status: 400 },
      );
    }

    const priceId = getPriceId(plan, billing);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout?canceled=true`,
      subscription_data: {
        metadata: {
          plan,
          billing,
          name: name ?? "",
          company: company ?? "",
        },
      },
      metadata: {
        plan,
        billing,
        name: name ?? "",
        company: company ?? "",
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error creating checkout session";
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
