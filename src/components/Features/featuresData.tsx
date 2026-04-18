import { Feature } from "@/types/feature";

const iconClass = "h-6 w-6";

const featuresData: Feature[] = [
  {
    id: 1,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    title: "Outreach Multicanal",
    paragraph:
      "Campañas coordinadas en LinkedIn, email frío, WhatsApp y llamadas. Mensajes personalizados con IA y secuencias probadas que generan respuestas reales.",
  },
  {
    id: 2,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Growth Marketing",
    paragraph:
      "Funnels, analítica y optimización de conversión. Diseñamos motores de adquisición predecibles: SEO, paid ads, CRO y nurturing automatizado.",
  },
  {
    id: 3,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Outsourcing de Servicios",
    paragraph:
      "Equipos dedicados de asistentes ejecutivos, SDRs, customer support y desarrolladores. Tú defines el alcance, nosotros ejecutamos y gestionamos.",
  },
  {
    id: 4,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "Reclutamiento LATAM + Ghana",
    paragraph:
      "Sourcing, vetting y hiring de talento bilingüe en Latinoamérica y Ghana. Zonas horarias compatibles con EE.UU. y Europa, tarifas competitivas.",
  },
  {
    id: 5,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    title: "Payroll & Compliance",
    paragraph:
      "Contratos, nómina internacional, beneficios y cumplimiento legal incluido. Tú pagas una sola factura mensual; nosotros nos encargamos de todo.",
  },
  {
    id: 6,
    icon: (
      <svg className={iconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    title: "Plantillas & Automatización",
    paragraph:
      "Biblioteca de scripts, secuencias y templates probados. Integramos Instantly, Smartlead, Apollo, HubSpot y tu CRM para operar a escala.",
  },
];
export default featuresData;
