import { Testimonial } from "@/types/testimonial";
import SingleTestimonial from "./SingleTestimonial";

const testimonialData: Testimonial[] = [
  {
    id: 1,
    name: "Mariana Ruiz",
    designation: "Head of Growth · B2B SaaS",
    content:
      "We went from 3 to 27 qualified meetings per month in 90 days. Their multichannel orchestration gives them a real edge over agencies that only do LinkedIn.",
    image: "/images/testimonials/auth-01.png",
    star: 5,
  },
  {
    id: 2,
    name: "Kwame Boateng",
    designation: "COO · FinTech Accra",
    content:
      "We hired 6 bilingual SDRs in 12 days. Their technical and cultural vetting was flawless; onboarding and payroll just worked.",
    image: "/images/testimonials/auth-02.png",
    star: 5,
  },
  {
    id: 3,
    name: "Diego Fernández",
    designation: "Founder · Performance Agency",
    content:
      "The LATAM team they put together works in my time zone at a fraction of the cost. We freed up 40 hours a week to focus on strategy.",
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
            Customers
          </span>
          <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Real stories of{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              growth
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            Teams that scaled their outreach and hired remote talent with us.
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
