import AboutSectionOne from "@/components/About/AboutSectionOne";
import AboutSectionTwo from "@/components/About/AboutSectionTwo";
import Breadcrumb from "@/components/Common/Breadcrumb";

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nosotros | QueryBay",
  description:
    "Somos un equipo multicultural enfocado en growth, outreach y talento remoto en LATAM y Ghana.",
};

const AboutPage = () => {
  return (
    <>
      <Breadcrumb
        pageName="Sobre QueryBay"
        description="Construimos motores de adquisición y equipos remotos para empresas que quieren crecer sin fricción. Operamos entre Latinoamérica y Ghana con un enfoque obsesivo en resultados."
      />
      <AboutSectionOne />
      <AboutSectionTwo />
    </>
  );
};

export default AboutPage;
