import Link from "next/link";

const PricingBox = (props: {
  price: string;
  duration: string;
  packageName: string;
  subtitle: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) => {
  const { price, duration, packageName, subtitle, highlighted, children } =
    props;

  return (
    <div className="relative h-full">
      {highlighted && (
        <>
          <div className="absolute -inset-px rounded-3xl bg-[linear-gradient(140deg,#6366f1,#a855f7,#ec4899)] blur-sm" />
          <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-4 py-1 text-xs font-semibold text-white shadow-lg">
            Most popular
          </div>
        </>
      )}
      <div
        className={`relative flex h-full flex-col rounded-3xl border p-8 backdrop-blur-md ${
          highlighted
            ? "border-transparent bg-white dark:bg-[#0f1220]"
            : "border-black/5 bg-white/70 dark:border-white/10 dark:bg-white/5"
        }`}
      >
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-black/50 dark:text-white/60">
            {packageName}
          </h4>
          <div className="mb-3 flex items-baseline gap-1">
            <span className="text-5xl font-bold text-black dark:text-white">
              ${price}
            </span>
            <span className="text-base font-medium text-black/50 dark:text-white/50">
              /{duration}
            </span>
          </div>
          <p className="text-sm text-black/60 dark:text-white/70">{subtitle}</p>
        </div>

        <Link
          href="/checkout"
          className={`mb-8 flex w-full items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition duration-300 ${
            highlighted
              ? "bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)]"
              : "border border-black/10 bg-white text-black hover:border-black/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30"
          }`}
        >
          Choose plan
        </Link>

        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
};

export default PricingBox;
