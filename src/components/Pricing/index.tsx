import Link from "next/link";
import OfferList from "./OfferList";
import PricingBox from "./PricingBox";
import { ArrowUpRight, Check } from "lucide-react";

const plans = [
  {
    name: "Outreach",
    subtitle:
      "A focused outbound engine for teams ready to start more conversations.",
    offers: [
      "Managed LinkedIn + Email",
      "AI-personalized copy",
      "Up to 1,000 leads/month",
      "Weekly reporting",
    ],
    note: "Start with the essentials.",
  },
  {
    name: "Growth",
    subtitle:
      "A connected acquisition strategy, with a dedicated team behind every channel.",
    offers: [
      "Everything in Outreach",
      "WhatsApp + cold calling",
      "Paid ads: Meta, LinkedIn, Google",
      "Landing pages + CRO",
      "Up to 5,000 leads/month",
      "Dedicated account manager",
    ],
    note: "Bring your whole pipeline together.",
    highlighted: true,
  },
  {
    name: "Dedicated Team",
    subtitle:
      "Your own outbound specialists, embedded in your business and managed end to end.",
    offers: [
      "Full-time outbound team",
      "Sourcing + data included",
      "Live in 7–14 days",
      "All tooling managed",
      "Weekly meetings + reporting",
      "Replacement guarantee",
    ],
    note: "Make our team your team.",
  },
];

const Pricing = () => (
  <section
    id="pricing"
    className="qb-section qb-pricing"
    aria-labelledby="pricing-title"
  >
    <div className="container">
      <div className="qb-section-heading">
        <div>
          <span className="qb-eyebrow">03 / FIND YOUR FIT</span>
          <h2 id="pricing-title">
            Your ambition.
            <br />
            <span className="qb-muted">Our next plan.</span>
          </h2>
        </div>
        <p>
          Different teams need different things. We scope every engagement
          around your market, goals, and channel mix.
        </p>
      </div>
      <div className="qb-pricing-grid">
        {plans.map((plan) => (
          <PricingBox
            key={plan.name}
            packageName={plan.name}
            subtitle={plan.subtitle}
            highlighted={plan.highlighted}
          >
            <p className="qb-plan-note">{plan.note}</p>
            <ul>
              {plan.offers.map((offer) => (
                <OfferList key={offer} text={offer} status="active" />
              ))}
            </ul>
          </PricingBox>
        ))}
      </div>
      <div className="qb-pricing-bottom">
        <span>
          <Check size={16} /> Clear scope. Custom quote. Month-to-month
          flexibility.
        </span>
        <Link href="/#contact" className="qb-text-link">
          Find the right fit <ArrowUpRight size={17} />
        </Link>
      </div>
    </div>
  </section>
);

export default Pricing;
