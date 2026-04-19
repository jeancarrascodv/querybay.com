import Breadcrumb from "@/components/Common/Breadcrumb";
import { ReactNode } from "react";

type Section = {
  heading: string;
  body: ReactNode;
};

type Props = {
  pageName: string;
  description: string;
  lastUpdated: string;
  intro?: ReactNode;
  sections: Section[];
};

const LegalPage = ({ pageName, description, lastUpdated, intro, sections }: Props) => {
  return (
    <>
      <Breadcrumb pageName={pageName} description={description} />
      <section className="pb-24">
        <div className="container">
          <div className="mx-auto max-w-[820px] rounded-3xl border border-black/10 bg-white/70 p-8 backdrop-blur-xl sm:p-12 dark:border-white/10 dark:bg-white/5">
            <p className="mb-8 text-xs font-medium uppercase tracking-wider text-black/50 dark:text-white/50">
              Last updated: {lastUpdated}
            </p>
            {intro && (
              <div className="mb-10 space-y-4 text-base leading-relaxed text-black/70 dark:text-white/70">
                {intro}
              </div>
            )}
            <ol className="space-y-10">
              {sections.map((s, i) => (
                <li key={s.heading}>
                  <h2 className="mb-4 text-xl font-semibold text-black sm:text-2xl dark:text-white">
                    <span className="mr-2 text-[#a855f7]">{i + 1}.</span>
                    {s.heading}
                  </h2>
                  <div className="space-y-4 text-sm leading-relaxed text-black/70 sm:text-base dark:text-white/70">
                    {s.body}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
};

export default LegalPage;
