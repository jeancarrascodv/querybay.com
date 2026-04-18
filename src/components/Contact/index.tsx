const Contact = () => {
  return (
    <section id="contact" className="relative overflow-hidden py-20 md:py-28 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute bottom-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.1),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto max-w-[960px]">
          <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-white/80 p-8 backdrop-blur-xl sm:p-12 lg:p-16 dark:border-white/10 dark:bg-white/5">
            <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.3),transparent_70%)] blur-2xl" />

            <div className="relative grid grid-cols-1 gap-12 lg:grid-cols-2">
              <div>
                <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                  Empieza hoy
                </span>
                <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
                  Cuéntanos de tu{" "}
                  <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
                    proyecto
                  </span>
                </h2>
                <p className="mb-8 text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/70">
                  Agenda una llamada gratis de 30 min. Auditamos tu funnel, te
                  damos 3 plantillas probadas y un plan de acción concreto —
                  sin compromiso.
                </p>

                <ul className="space-y-3">
                  {[
                    "Auditoría de outreach actual",
                    "3 plantillas personalizadas",
                    "Propuesta de equipo LATAM/Ghana",
                    "Plan a 90 días con KPIs",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-3 text-sm text-black/70 dark:text-white/80"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <form className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="name"
                      className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                    >
                      Nombre
                    </label>
                    <input
                      id="name"
                      type="text"
                      placeholder="Tu nombre"
                      className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="company"
                      className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                    >
                      Empresa
                    </label>
                    <input
                      id="company"
                      type="text"
                      placeholder="Tu empresa"
                      className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="tu@empresa.com"
                    className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                  />
                </div>
                <div>
                  <label
                    htmlFor="interest"
                    className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                  >
                    Me interesa
                  </label>
                  <select
                    id="interest"
                    className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  >
                    <option>Outreach multicanal</option>
                    <option>Growth Marketing</option>
                    <option>Outsourcing de servicios</option>
                    <option>Reclutamiento LATAM / Ghana</option>
                    <option>Una combinación</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="message"
                    className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                  >
                    Mensaje (opcional)
                  </label>
                  <textarea
                    id="message"
                    rows={3}
                    placeholder="Cuéntanos un poco más..."
                    className="w-full resize-none rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                  />
                </div>
                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-6 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)]"
                >
                  Agendar llamada gratis
                  <svg className="h-4 w-4 transition group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Contact;
