"use client";
import Link from "next/link";

const Footer = () => {
  return (
    <footer className="relative overflow-hidden border-t border-black/5 bg-white pt-20 dark:border-white/10 dark:bg-[#0b0d1a]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -bottom-20 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.08),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="grid grid-cols-2 gap-10 pb-16 md:grid-cols-4 lg:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2">
            <Link
              href="/"
              className="mb-5 inline-flex items-center gap-2 text-xl font-bold tracking-tight text-black dark:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </span>
              QueryBay
            </Link>
            <p className="mb-6 max-w-sm text-sm leading-relaxed text-black/60 dark:text-white/60">
              Growth, outreach multicanal y talento remoto en LATAM y Ghana.
              Escalamos tu operación sin fricción ni overhead.
            </p>
            <div className="flex items-center gap-3">
              {[
                {
                  href: "#",
                  label: "LinkedIn",
                  icon: (
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
                  ),
                },
                {
                  href: "#",
                  label: "X",
                  icon: (
                    <path d="M18 4L6 20M6 4l12 16" strokeLinecap="round" />
                  ),
                },
                {
                  href: "#",
                  label: "Instagram",
                  icon: (
                    <>
                      <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17.5" cy="6.5" r="1" />
                    </>
                  ),
                },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-black/60 transition hover:border-black/30 hover:text-black dark:border-white/10 dark:text-white/60 dark:hover:border-white/30 dark:hover:text-white"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    {s.icon}
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Servicios */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Servicios
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/#features" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Outreach Multicanal
                </Link>
              </li>
              <li>
                <Link href="/#features" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Growth Marketing
                </Link>
              </li>
              <li>
                <Link href="/#features" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Outsourcing
                </Link>
              </li>
              <li>
                <Link href="/#features" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Reclutamiento LATAM + Ghana
                </Link>
              </li>
            </ul>
          </div>

          {/* Empresa */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Empresa
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/about" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Nosotros
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Planes
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Contacto
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Plataforma */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Plataforma
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/signin" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Iniciar sesión
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Crear cuenta
                </Link>
              </li>
              <li>
                <Link href="/pagos" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Pagos
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-black/5 py-8 text-sm text-black/50 sm:flex-row dark:border-white/10 dark:text-white/50">
          <p>© {new Date().getFullYear()} QueryBay. Todos los derechos reservados.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-black dark:hover:text-white">
              Términos
            </Link>
            <Link href="#" className="hover:text-black dark:hover:text-white">
              Privacidad
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
