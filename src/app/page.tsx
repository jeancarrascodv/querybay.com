import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import { FadeIn } from "@/components/Common/FadeIn";
import ScrollUp from "@/components/Common/ScrollUp";
import Contact from "@/components/Contact";
import FAQ from "@/components/FAQ";
import Features from "@/components/Features";
import Hero from "@/components/Hero";
import Pricing from "@/components/Pricing";
import TrustStrip from "@/components/TrustStrip";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "QueryBay: Growth, Outreach & Remote Talent from LATAM + Ghana",
  description:
    "Multichannel outreach, growth marketing, outsourcing, and remote talent hiring across LATAM and Ghana. Scale your business without the overhead.",
};

export default function Home() {
  // Hero stays un-faded — it's already in view on page load and
  // hiding it for 0.7s would tank LCP. Everything below the fold
  // gets the scroll-fade.
  return (
    <>
      <ScrollUp />
      <Hero />
      <FadeIn>
        <Features />
      </FadeIn>
      <FadeIn>
        <AboutSectionOne />
      </FadeIn>
      <FadeIn>
        <AboutSectionTwo />
      </FadeIn>
      <FadeIn>
        <Pricing />
      </FadeIn>
      <FadeIn>
        <TrustStrip />
      </FadeIn>
      <FadeIn>
        <FAQ />
      </FadeIn>
      <FadeIn>
        <Contact />
      </FadeIn>
    </>
  );
}
