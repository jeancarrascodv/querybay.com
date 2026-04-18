const OfferList = ({
  text,
  status,
}: {
  text: string;
  status: "active" | "inactive";
}) => {
  return (
    <div className="mb-3 flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          status === "active"
            ? "bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white"
            : "bg-black/5 text-black/30 dark:bg-white/10 dark:text-white/30"
        }`}
      >
        {status === "active" ? (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        )}
      </span>
      <p
        className={`text-sm ${
          status === "active"
            ? "text-black/80 dark:text-white/80"
            : "text-black/40 line-through dark:text-white/40"
        }`}
      >
        {text}
      </p>
    </div>
  );
};

export default OfferList;
