import Breadcrumb from "@/components/Common/Breadcrumb";
import Contact from "@/components/Contact";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact | QueryBay",
  description:
    "Talk to our team. We'll audit your funnel for free and give you a 90-day plan.",
};

const ContactPage = () => {
  return (
    <>
      <Breadcrumb
        pageName="Contact"
        description="Book a 30-minute call. We'll audit your outreach, share proven templates, and build a 90-day plan. No commitment."
      />
      <Contact />
    </>
  );
};

export default ContactPage;
