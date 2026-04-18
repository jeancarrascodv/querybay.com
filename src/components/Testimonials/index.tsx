import { Testimonial } from "@/types/testimonial";
import SingleTestimonial from "./SingleTestimonial";

const testimonialData: Testimonial[] = [
  {
    id: 1,
    name: "Mariana Ruiz",
    designation: "Head of Growth · SaaS B2B",
    content:
      "Pasamos de 3 a 27 reuniones calificadas al mes en 90 días. La orquestación multicanal les da una ventaja real sobre agencias que sólo hacen LinkedIn.",
    image: "/images/testimonials/auth-01.png",
    star: 5,
  },
  {
    id: 2,
    name: "Kwame Boateng",
    designation: "COO · FinTech Accra",
    content:
      "Contratamos 6 SDRs bilingües en 12 días. El vetting técnico y cultural fue impecable; onboarding y payroll se resolvieron solos.",
    image: "/images/testimonials/auth-02.png",
    star: 5,
  },
  {
    id: 3,
    name: "Diego Fernández",
    designation: "Founder · Agencia de performance",
    content:
      "El equipo de LATAM que armaron trabaja en mi zona horaria y a una fracción del costo. Liberamos 40h/semana para enfocarnos en estrategia.",
    image: "/images/testimonials/auth-03.png",
    star: 5,
  },
];

const Testimonials = () => {
  return (
    <section className="relative overflow-hidden py-20 md:py-28 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-1/4 h-[400px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto mb-16 max-w-[720px] text-center">
          <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            Clientes
          </span>
          <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Historias reales de{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              crecimiento
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            Equipos que escalaron outreach y contrataron talento con nosotros.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonialData.map((testimonial) => (
            <SingleTestimonial key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
