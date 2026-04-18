"use client";
import { useState } from "react";
import OfferList from "./OfferList";
import PricingBox from "./PricingBox";

const Pricing = () => {
  const [isMonthly, setIsMonthly] = useState(true);

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
            Planes
          </span>
          <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Precios simples y{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              transparentes
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            Elige el plan que mejor se ajusta a tu negocio. Sin contratos
            largos, sin sorpresas. Cancelación flexible.
          </p>
        </div>

        <div className="mb-12 flex justify-center">
          <div className="inline-flex items-center rounded-full border border-black/10 bg-white/60 p-1 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
            <button
              onClick={() => setIsMonthly(true)}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition ${
                isMonthly
                  ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white shadow-lg"
                  : "text-black/60 dark:text-white/60"
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setIsMonthly(false)}
              className={`cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition ${
                !isMonthly
                  ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white shadow-lg"
                  : "text-black/60 dark:text-white/60"
              }`}
            >
              Anual{" "}
              <span className="ml-1 text-xs opacity-80">-15%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          <PricingBox
            packageName="Outreach"
            price={isMonthly ? "1,490" : "15,200"}
            duration={isMonthly ? "mes" : "año"}
            subtitle="Campañas multicanal gestionadas para agendar reuniones calificadas todos los meses."
          >
            <OfferList text="LinkedIn + Email gestionados" status="active" />
            <OfferList text="Copy personalizado con IA" status="active" />
            <OfferList text="Hasta 1.000 leads/mes" status="active" />
            <OfferList text="Reporting semanal" status="active" />
            <OfferList text="WhatsApp + cold calling" status="inactive" />
            <OfferList text="Account manager dedicado" status="inactive" />
          </PricingBox>

          <PricingBox
            packageName="Growth"
            price={isMonthly ? "3,490" : "35,600"}
            duration={isMonthly ? "mes" : "año"}
            subtitle="Stack completo de growth: outreach + ads + CRO + analítica con un equipo dedicado."
            highlighted
          >
            <OfferList text="Todo lo de Outreach" status="active" />
            <OfferList text="WhatsApp + cold calling" status="active" />
            <OfferList text="Paid ads (Meta, LinkedIn, Google)" status="active" />
            <OfferList text="Landing pages + CRO" status="active" />
            <OfferList text="Hasta 5.000 leads/mes" status="active" />
            <OfferList text="Account manager dedicado" status="active" />
          </PricingBox>

          <PricingBox
            packageName="Talent"
            price={isMonthly ? "desde 1,200" : "desde 13,000"}
            duration={isMonthly ? "mes" : "año"}
            subtitle="Contratación de profesionales remotos full-time en LATAM y Ghana con payroll incluido."
          >
            <OfferList text="Sourcing + vetting incluido" status="active" />
            <OfferList text="Contratación en 7-14 días" status="active" />
            <OfferList text="Payroll y compliance global" status="active" />
            <OfferList text="Beneficios y contratos" status="active" />
            <OfferList text="Reemplazo garantizado 90 días" status="active" />
            <OfferList text="Sin fee de sourcing" status="active" />
          </PricingBox>
        </div>

        <p className="mt-10 text-center text-sm text-black/50 dark:text-white/50">
          ¿Necesitas algo a medida?{" "}
          <a
            href="#contact"
            className="font-semibold text-black underline-offset-4 hover:underline dark:text-white"
          >
            Habla con nuestro equipo
          </a>
        </p>
      </div>
    </section>
  );
};

export default Pricing;
