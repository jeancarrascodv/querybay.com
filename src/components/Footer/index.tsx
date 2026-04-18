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
              Growth, multichannel outreach, and remote talent in LATAM and
              Ghana. We scale your operation without the friction or overhead.
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
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
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

          {/* Services */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Services
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/#features" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Multichannel Outreach
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
                  LATAM + Ghana Hiring
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Company
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/about" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="/#pricing" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Platform */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-black dark:text-white">
              Platform
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <Link href="/signin" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Create account
                </Link>
              </li>
              <li>
                <Link href="/pagos" className="text-black/60 transition hover:text-black dark:text-white/60 dark:hover:text-white">
                  Checkout
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-black/5 py-8 text-sm text-black/50 sm:flex-row dark:border-white/10 dark:text-white/50">
          <p>© {new Date().getFullYear()} QueryBay. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="#" className="hover:text-black dark:hover:text-white">
              Terms
            </Link>
            <Link href="#" className="hover:text-black dark:hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
