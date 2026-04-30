/// Honest trust signals while we don't have real customer testimonials
/// to feature yet. Lists the platforms QueryBay is built on (so visitors
/// know payment + data live in vetted infra) plus the operator promises
/// we can actually keep (cancel anytime, no setup fee, real human reply).
///
/// Replaces a fake-testimonials section that risked GDPR/likeness issues.
/// When we have real customer logos with permission, swap this for a
/// proper logo wall.

const STACK = [
  { name: "Stripe", caption: "Payments & PCI-compliant checkout" },
  { name: "Supabase", caption: "Database & auth · row-level security" },
  { name: "Vercel", caption: "Edge delivery · 99.99% uptime" },
  { name: "Caddy", caption: "TLS end-to-end · Let’s Encrypt auto-renew" },
];

const PROMISES = [
  {
    title: "Cancel anytime",
    body: "Self-serve cancellation from your dashboard. No retention calls, no questions.",
  },
  {
    title: "No setup fee",
    body: "What you see on the pricing card is what you pay. Onboarding included.",
  },
  {
    title: "Real human reply within 24h",
    body: "Email support is read by Jean, not a chatbot. Priority chat on Pro and above.",
  },
  {
    title: "Your data stays yours",
    body: "Export contacts, campaigns, and message history any time. We don't sell, share, or profile.",
  },
];

const TrustStrip = () => {
  return (
    <section className="relative overflow-hidden py-20 md:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-1/4 top-1/4 h-[400px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.06),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto mb-12 max-w-[720px] text-center">
          <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            Built on infra you trust
          </span>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Boring{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              where it matters
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            We use proven platforms for payments, data, and delivery so you
            don&apos;t have to wonder whether your card or your contacts are safe.
          </p>
        </div>

        {/* Stack badges */}
        <div className="mx-auto mb-16 grid max-w-[1000px] grid-cols-2 gap-4 sm:grid-cols-4">
          {STACK.map((s) => (
            <div
              key={s.name}
              className="rounded-2xl border border-black/5 bg-white/70 p-5 text-center backdrop-blur-md dark:border-white/8 dark:bg-white/[0.03]"
            >
              <p className="mb-1 text-base font-semibold text-black dark:text-white">
                {s.name}
              </p>
              <p className="text-xs text-black/55 dark:text-white/55">
                {s.caption}
              </p>
            </div>
          ))}
        </div>

        {/* Operator promises */}
        <div className="mx-auto grid max-w-[1100px] gap-4 sm:grid-cols-2">
          {PROMISES.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-black/5 bg-white/70 p-6 backdrop-blur-md dark:border-white/8 dark:bg-white/[0.03]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-500">
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <h3 className="text-sm font-semibold text-black dark:text-white">
                  {p.title}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-black/65 dark:text-white/65">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
