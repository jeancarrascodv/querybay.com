import Breadcrumb from "@/components/Common/Breadcrumb";
import Contact from "@/components/Contact";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contacto | QueryBay",
  description:
    "Habla con nuestro equipo. Auditamos tu funnel gratis y te damos un plan a 90 días.",
};

const ContactPage = () => {
  return (
    <>
      <Breadcrumb
        pageName="Contacto"
        description="Agenda una llamada de 30 minutos. Auditamos tu outreach, te compartimos plantillas y armamos un plan a 90 días — sin compromiso."
      />
      <Contact />
    </>
  );
};

export default ContactPage;
