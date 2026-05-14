import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import Breadcrumb from "@/components/Common/Breadcrumb";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "About | QueryBay",
  description:
    "We're a multicultural team focused on lead generation and multichannel outreach across LATAM and Ghana.",
};

const AboutPage = () => {
  return (
    <>
      <Breadcrumb
        pageName="About QueryBay"
        description="We build lead generation engines for companies that want predictable pipeline. We operate between Latin America and Ghana with an obsessive focus on booked meetings."
      />
      <AboutSectionOne />
      <AboutSectionTwo />
    </>
  );
};

export default AboutPage;
