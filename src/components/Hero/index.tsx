import Link from "next/link";

const Hero = () => {
  return (
    <section
      id="home"
      className="relative z-10 overflow-hidden bg-white pt-[120px] pb-20 md:pb-28 md:pt-[150px] xl:pt-[180px] dark:bg-[#0b0d1a]"
    >
      {/* Ambient gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.35),transparent_70%)] blur-3xl" />
        <div className="absolute top-40 -left-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.28),transparent_70%)] blur-3xl" />
        <div className="absolute -right-40 bottom-0 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.25),transparent_70%)] blur-3xl" />
      </div>

      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage:
            "radial-gradient(ellipse at center, black 40%, transparent 75%)",
        }}
      />

      <div className="container">
        <div className="mx-auto max-w-[920px] text-center">
          {/* Eyebrow pill */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-1.5 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Growth · Multichannel Outreach · Remote Talent from LATAM + Ghana
          </div>

          <h1 className="mb-6 text-4xl font-bold leading-[1.05] tracking-tight text-black sm:text-5xl md:text-6xl lg:text-7xl dark:text-white">
            Outreach that converts.
            <br />
            <span className="bg-[linear-gradient(110deg,#6366f1_0%,#a855f7_45%,#ec4899_100%)] bg-clip-text text-transparent">
              Talent that scales.
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-[680px] text-base leading-relaxed text-black/60 sm:text-lg md:text-xl dark:text-white/70">
            We book qualified meetings with coordinated campaigns across
            LinkedIn, email, WhatsApp, and calls. Then we build your team with
            top-tier talent from LATAM and Ghana — no friction, no HR hassle,
            no long commitments.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/checkout"
              className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-8 py-4 text-base font-semibold text-white shadow-[0_10px_40px_-10px_rgba(168,85,247,0.6)] transition-all duration-300 hover:shadow-[0_20px_50px_-10px_rgba(168,85,247,0.8)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                Get started
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
            <Link
              href="/signin"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-black/15 bg-white/40 px-8 py-4 text-base font-semibold text-black backdrop-blur-md transition-all duration-300 hover:border-black/30 hover:bg-white/70 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
              Sign in
            </Link>
          </div>

          {/* Trust metrics */}
          <div className="mt-16 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: "+12k", label: "meetings booked" },
              { value: "7-14 days", label: "turnkey hiring" },
              { value: "2 continents", label: "LATAM + Ghana" },
              { value: "4 channels", label: "LinkedIn · Email · WhatsApp · Call" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-2xl border border-black/5 bg-white/40 px-4 py-5 backdrop-blur-md dark:border-white/10 dark:bg-white/5"
              >
                <div className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-2xl font-bold text-transparent sm:text-3xl">
                  {m.value}
                </div>
                <div className="mt-1 text-xs text-black/60 sm:text-sm dark:text-white/60">
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
