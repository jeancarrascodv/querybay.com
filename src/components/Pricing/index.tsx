import OfferList from "./OfferList";
import PricingBox from "./PricingBox";

const Pricing = () => {
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
            Plans
          </span>
          <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Plans that scale with your{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              pipeline
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            Every engagement is scoped to your market, target list, and channel
            mix. No long contracts, no surprises. Tell us what you need and
            we&apos;ll build a quote.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          <PricingBox
            packageName="Outreach"
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
            subtitle="The full lead generation engine: outreach, data, ads, and CRO with a dedicated team."
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
            packageName="Dedicated Team"
            subtitle="A full-time outbound team embedded in your pipeline, managed end to end."
          >
            <OfferList text="Full-time outbound team" status="active" />
            <OfferList text="Sourcing + data included" status="active" />
            <OfferList text="Live in 7-14 days" status="active" />
            <OfferList text="All tooling managed" status="active" />
            <OfferList text="Weekly meetings + reporting" status="active" />
            <OfferList text="Replacement guarantee" status="active" />
          </PricingBox>
        </div>

        <p className="mt-10 text-center text-sm text-black/50 dark:text-white/50">
          Not sure which fits?{" "}
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
