import { Testimonial } from "@/types/testimonial";

const starIcon = (
  <svg width="16" height="16" viewBox="0 0 18 16" className="fill-current">
    <path d="M9.09815 0.361679L11.1054 6.06601H17.601L12.3459 9.59149L14.3532 15.2958L9.09815 11.7703L3.84309 15.2958L5.85035 9.59149L0.595291 6.06601H7.0909L9.09815 0.361679Z" />
  </svg>
);

const SingleTestimonial = ({ testimonial }: { testimonial: Testimonial }) => {
  const { star, name, content, designation } = testimonial;

  const ratingIcons = [];
  for (let index = 0; index < star; index++) {
    ratingIcons.push(
      <span key={index} className="text-amber-400">
        {starIcon}
      </span>,
    );
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="group relative h-full">
      <div className="absolute -inset-px rounded-2xl bg-[linear-gradient(140deg,#6366f1,#a855f7,#ec4899)] opacity-0 blur-md transition duration-500 group-hover:opacity-40" />
      <div className="relative flex h-full flex-col rounded-2xl border border-black/5 bg-white/70 p-7 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center gap-1">{ratingIcons}</div>
        <p className="mb-8 flex-1 text-base leading-relaxed text-black/80 dark:text-white/90">
          “{content}”
        </p>
        <div className="flex items-center gap-3 border-t border-black/5 pt-6 dark:border-white/10">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-sm font-bold text-white">
            {initials}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-black dark:text-white">
              {name}
            </h3>
            <p className="text-xs text-black/50 dark:text-white/50">
              {designation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleTestimonial;
