import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import Breadcrumb from "@/components/Common/Breadcrumb";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | QueryBay",
  description:
    "We're a multicultural team focused on growth, outreach, and remote talent across LATAM and Ghana.",
};

const AboutPage = () => {
  return (
    <>
      <Breadcrumb
        pageName="About QueryBay"
        description="We build acquisition engines and remote teams for companies that want to grow without friction. We operate between Latin America and Ghana with an obsessive focus on results."
      />
      <AboutSectionOne />
      <AboutSectionTwo />
    </>
  );
};

export default AboutPage;
