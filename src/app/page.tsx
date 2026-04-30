import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
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
  return (
    <>
      <ScrollUp />
      <Hero />
      <Features />
      <AboutSectionOne />
      <AboutSectionTwo />
      <Pricing />
      <TrustStrip />
      <FAQ />
      <Contact />
    </>
  );
}
