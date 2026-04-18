import { Feature } from "@/types/feature";

const SingleFeature = ({ feature }: { feature: Feature }) => {
  const { icon, title, paragraph } = feature;
  return (
    <div className="group relative h-full">
      <div className="absolute -inset-px rounded-2xl bg-[linear-gradient(140deg,#6366f1,#a855f7,#ec4899)] opacity-0 blur-md transition duration-500 group-hover:opacity-60" />
      <div className="relative flex h-full flex-col rounded-2xl border border-black/5 bg-white/70 p-7 backdrop-blur-md transition duration-300 group-hover:-translate-y-1 dark:border-white/10 dark:bg-white/5">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)]">
          {icon}
        </div>
        <h3 className="mb-3 text-xl font-bold text-black dark:text-white">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-black/60 dark:text-white/70">
          {paragraph}
        </p>
      </div>
    </div>
  );
};

export default SingleFeature;
