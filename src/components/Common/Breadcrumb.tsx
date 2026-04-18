import Link from "next/link";

const Breadcrumb = ({
  pageName,
  description,
}: {
  pageName: string;
  description: string;
}) => {
  return (
    <section className="relative overflow-hidden pt-32 pb-8 md:pt-36 lg:pt-40">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[420px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.15),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto max-w-[720px] text-center">
          <ul className="mb-6 flex items-center justify-center gap-2 text-xs font-medium text-black/50 dark:text-white/50">
            <li>
              <Link href="/" className="hover:text-black dark:hover:text-white">
                Inicio
              </Link>
            </li>
            <li>/</li>
            <li className="text-black dark:text-white">{pageName}</li>
          </ul>
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              {pageName}
            </span>
          </h1>
          <p className="text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/70">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
};

export default Breadcrumb;
