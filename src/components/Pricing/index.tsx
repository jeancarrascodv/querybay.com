"use client";
import { useState } from "react";
import SectionTitle from "../Common/SectionTitle";
import OfferList from "./OfferList";
import PricingBox from "./PricingBox";

const Pricing = () => {
  const [isMonthly, setIsMonthly] = useState(true);

  return (
    <section id="pricing" className="relative z-10 py-16 md:py-20 lg:py-28">
      <div className="container">
        <SectionTitle
          title="Simple and Transparent Pricing"
          paragraph="We help you hire full-time LATAM talent—from executive assistants to developers—starting at just $700/month. No hidden fees, contracts, or surprises."
          center
          width="665px"
        />

        <div className="w-full">
          <div className="mb-8 flex justify-center md:mb-12 lg:mb-16">
            <span
              onClick={() => setIsMonthly(true)}
              className={`${
                isMonthly
                  ? "pointer-events-none text-primary"
                  : "text-dark dark:text-white"
              } mr-4 cursor-pointer text-base font-semibold`}
            >
              Monthly
            </span>
            <div
              onClick={() => setIsMonthly(!isMonthly)}
              className="flex cursor-pointer items-center"
            >
              <div className="relative">
                <div className="h-5 w-14 rounded-full bg-[#1D2144] shadow-inner"></div>
                <div
                  className={`${
                    isMonthly ? "" : "translate-x-full"
                  } shadow-switch-1 absolute left-0 top-[-4px] flex h-7 w-7 items-center justify-center rounded-full bg-primary transition`}
                >
                  <span className="active h-4 w-4 rounded-full bg-white"></span>
                </div>
              </div>
            </div>
            <span
              onClick={() => setIsMonthly(false)}
              className={`${
                isMonthly
                  ? "text-dark dark:text-white"
                  : "pointer-events-none text-primary"
              } ml-4 cursor-pointer text-base font-semibold`}
            >
              Yearly
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          <PricingBox
            packageName="Executive Assistant"
            price={isMonthly ? "700" : "7500"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="Full-time bilingual admin support. Scheduling, email, project tracking and more."
          >
            <OfferList text="40 hrs/week remote support" status="active" />
            <OfferList text="Same timezone (US hours)" status="active" />
            <OfferList text="English proficiency" status="active" />
            <OfferList text="Payroll & compliance included" status="active" />
            <OfferList text="Dedicated account manager" status="inactive" />
          </PricingBox>

          <PricingBox
            packageName="Full-Stack Developer"
            price={isMonthly ? "1200" : "13000"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="Pre-vetted developers fluent in modern stacks (React, Node, Python, etc)."
          >
            <OfferList text="Senior-level LATAM devs" status="active" />
            <OfferList text="Timezone aligned with US" status="active" />
            <OfferList text="Fast hiring (7-14 days)" status="active" />
            <OfferList text="Payroll & legal included" status="active" />
            <OfferList text="Tech team onboarding support" status="inactive" />
          </PricingBox>

          <PricingBox
            packageName="Customer Support Rep"
            price={isMonthly ? "850" : "9100"}
            duration={isMonthly ? "mo" : "yr"}
            subtitle="Reliable reps to manage tickets, calls, and live chat with empathy."
          >
            <OfferList text="Full-time coverage" status="active" />
            <OfferList text="English + Spanish fluency" status="active" />
            <OfferList text="US timezone availability" status="active" />
            <OfferList text="CRM & ticketing experience" status="active" />
            <OfferList text="Dedicated supervisor" status="inactive" />
          </PricingBox>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 z-[-1]">
        {/* SVG background remains unchanged */}
      </div>
    </section>
  );
};

export default Pricing;
