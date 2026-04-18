import { NextRequest, NextResponse } from "next/server";
import { stripe, getPriceId, type PlanId, type Billing } from "@/lib/stripe";

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
        { error: "plan y billing son requeridos" },
        { status: 400 },
      );
    }

    const priceId = getPriceId(plan, billing);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "required",
      success_url: `${siteUrl}/pagos/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/pagos?canceled=true`,
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
      err instanceof Error ? err.message : "Error creando sesión de checkout";
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
