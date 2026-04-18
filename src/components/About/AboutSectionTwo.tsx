const regions = [
  {
    flag: "🌎",
    name: "LATAM",
    countries: "Mexico · Colombia · Argentina · Peru · Chile",
    tagline: "Same time zone as the US, fluent bilingual talent.",
  },
  {
    flag: "🌍",
    name: "Ghana",
    countries: "Accra · Kumasi · Takoradi",
    tagline: "English-speaking African talent hub, EU + US overlap.",
  },
];

const benefits = [
  {
    title: "Hired in 7-14 days",
    desc: "Sourcing, technical and cultural vetting, coordinated interviews, and onboarding ready in under two weeks.",
  },
  {
    title: "40-70% lower cost",
    desc: "Access senior talent at a fraction of US or European rates — without compromising on quality or seniority.",
  },
  {
    title: "HR, payroll & legal included",
    desc: "We handle local contracts, international payments, benefits, and compliance. You pay a single invoice.",
  },
  {
    title: "Replacement guarantee",
    desc: "If someone isn't the right fit, we replace them at no extra cost within the first 90 days.",
  },
];

const AboutSectionTwo = () => {
  return (
    <section className="relative overflow-hidden py-20 md:py-28 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-1/2 bottom-0 h-[400px] w-[600px] translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.12),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          {/* Visual: Regions */}
          <div className="order-2 lg:order-1">
            <div className="grid gap-4 sm:grid-cols-2">
              {regions.map((r) => (
                <div
                  key={r.name}
                  className="group relative overflow-hidden rounded-3xl border border-black/10 bg-white/70 p-6 backdrop-blur-md transition hover:-translate-y-1 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="absolute -top-10 -right-10 text-[140px] opacity-20 transition group-hover:scale-110 group-hover:opacity-30">
                    {r.flag}
                  </div>
                  <div className="relative">
                    <div className="mb-3 text-4xl">{r.flag}</div>
                    <h4 className="mb-2 text-xl font-bold text-black dark:text-white">
                      {r.name}
                    </h4>
                    <p className="mb-3 text-sm text-black/50 dark:text-white/60">
                      {r.countries}
                    </p>
                    <p className="text-sm text-black/70 dark:text-white/80">
                      {r.tagline}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-black/10 bg-[linear-gradient(135deg,rgba(99,102,241,0.08),rgba(236,72,153,0.08))] p-6 backdrop-blur-md dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.15),rgba(236,72,153,0.15))]">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-black dark:text-white">
                    Roles we hire
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  "SDR / BDR",
                  "Executive Assistant",
                  "Full-Stack Dev",
                  "Customer Support",
                  "Marketing Ops",
                  "Appointment Setter",
                  "Data Analyst",
                  "Design / UI",
                  "Media Buyer",
                ].map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-black/80 dark:bg-white/10 dark:text-white/80"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
              Remote talent
            </span>
            <h2 className="mb-6 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
              Dedicated teams across{" "}
              <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
                LATAM and Ghana
              </span>
            </h2>
            <p className="mb-10 text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/70">
              We build your team with pre-vetted bilingual professionals from
              Latin America and Ghana. You focus on growing; we handle
              sourcing, hiring, payroll, and compliance.
            </p>

            <div className="space-y-5">
              {benefits.map((b) => (
                <div key={b.title} className="flex gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.5)]">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="mb-1 text-lg font-semibold text-black dark:text-white">
                      {b.title}
                    </h4>
                    <p className="text-sm text-black/60 dark:text-white/70">
                      {b.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSectionTwo;
