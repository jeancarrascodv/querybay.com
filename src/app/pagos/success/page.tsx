import Link from "next/link";

type SearchParams = { session_id?: string };

const SuccessPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const { session_id } = await searchParams;

  return (
    <section className="relative min-h-screen overflow-hidden pt-28 pb-20 md:pt-32 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.2),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto max-w-[600px] rounded-3xl border border-black/10 bg-white/80 p-8 text-center backdrop-blur-xl sm:p-12 dark:border-white/10 dark:bg-[#0f1220]/80">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-black sm:text-4xl dark:text-white">
            Payment confirmed!
          </h1>
          <p className="mb-8 text-sm text-black/60 sm:text-base dark:text-white/60">
            Thanks for your subscription. We&apos;ve emailed your receipt and our
            team will reach out within the next 24 hours to kick off your
            onboarding.
          </p>
          {session_id && (
            <p className="mb-8 font-mono text-xs text-black/40 dark:text-white/40">
              Ref: {session_id}
            </p>
          )}
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-8 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
};

export default SuccessPage;
