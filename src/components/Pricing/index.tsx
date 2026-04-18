"use client";
import { useState } from "react";
import OfferList from "./OfferList";
import PricingBox from "./PricingBox";

const Pricing = () => {
  const [isMonthly, setIsMonthly] = useState(true);

  return (
    <section
      id="pricing"
      className="relative overflow-hidden py-20 md:py-28 lg:py-32"
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.1),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto mb-12 max-w-[720px] text-center">
          <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            Pricing
          </span>
          <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Simple, transparent{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              pricing
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            Pick the plan that fits your business. No long contracts, no
            surprises. Cancel anytime.
          </p>
        </div>

        <div className="mb-12 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-black/10 bg-white/60 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => setIsMonthly(true)}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition ${
                isMonthly
                  ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white shadow-lg"
                  : "text-black/60 dark:text-white/60"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsMonthly(false)}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition ${
                !isMonthly
                  ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white shadow-lg"
                  : "text-black/60 dark:text-white/60"
              }`}
            >
              Yearly{" "}
              <span className="ml-1 text-xs opacity-80">-15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          <PricingBox
            packageName="Outreach"
            price={isMonthly ? "390" : "3,978"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="Managed multichannel campaigns that book qualified meetings every month."
          >
            <OfferList text="Managed LinkedIn + Email" status="active" />
            <OfferList text="AI-personalized copy" status="active" />
            <OfferList text="Up to 1,000 leads/month" status="active" />
            <OfferList text="Weekly reporting" status="active" />
            <OfferList text="WhatsApp + cold calling" status="inactive" />
            <OfferList text="Dedicated account manager" status="inactive" />
          </PricingBox>

          <PricingBox
            packageName="Growth"
            price={isMonthly ? "650" : "6,630"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="The full growth stack: outreach + ads + CRO + analytics with a dedicated team."
            highlighted
          >
            <OfferList text="Everything in Outreach" status="active" />
            <OfferList text="WhatsApp + cold calling" status="active" />
            <OfferList text="Paid ads (Meta, LinkedIn, Google)" status="active" />
            <OfferList text="Landing pages + CRO" status="active" />
            <OfferList text="Up to 5,000 leads/month" status="active" />
            <OfferList text="Dedicated account manager" status="active" />
          </PricingBox>

          <PricingBox
            packageName="Talent"
            price={isMonthly ? "from 1,200" : "from 12,240"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="Full-time remote professionals from LATAM and Ghana, payroll included."
          >
            <OfferList text="Sourcing + vetting included" status="active" />
            <OfferList text="Hired in 7-14 days" status="active" />
            <OfferList text="Global payroll & compliance" status="active" />
            <OfferList text="Benefits and contracts" status="active" />
            <OfferList text="90-day replacement guarantee" status="active" />
            <OfferList text="No sourcing fees" status="active" />
          </PricingBox>
        </div>

        <p className="mt-10 text-center text-sm text-black/50 dark:text-white/50">
          Need something custom?{" "}
          <a
            href="#contact"
            className="font-semibold text-black underline-offset-4 hover:underline dark:text-white"
          >
            Talk to our team
          </a>
        </p>
      </div>
    </section>
  );
};

export default Pricing;
