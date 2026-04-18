import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import ScrollUp from "@/components/Common/ScrollUp";
import Contact from "@/components/Contact";
import Features from "@/components/Features";
import Hero from "@/components/Hero";
import Pricing from "@/components/Pricing";
import Testimonials from "@/components/Testimonials";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "QueryBay — Growth, Outreach y Talento LATAM + Ghana",
  description:
    "Outreach multicanal, growth marketing, outsourcing y reclutamiento de talento remoto en LATAM y Ghana. Escala sin fricción.",
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
      <Testimonials />
      <Contact />
    </>
  );
}
