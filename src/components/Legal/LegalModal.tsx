"use client";
import { useEffect } from "react";
import { LegalContent } from "@/data/legalContent";

type Props = {
  content: LegalContent | null;
  onClose: () => void;
};

const LegalModal = ({ content, onClose }: Props) => {
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-full w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f1220]">
        <div className="flex items-start justify-between gap-4 border-b border-black/5 px-6 py-5 dark:border-white/10">
          <div>
            <h2
              id="legal-modal-title"
              className="text-lg font-semibold text-black sm:text-xl dark:text-white"
            >
              {content.pageName}
            </h2>
            <p className="mt-1 text-xs text-black/50 dark:text-white/50">
              Last updated: {content.lastUpdated}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-black/60 transition hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
          <div className="space-y-4 text-sm leading-relaxed text-black/70 dark:text-white/70">
            {content.intro}
          </div>
          <ol className="mt-8 space-y-8">
            {content.sections.map((s, i) => (
              <li key={s.heading}>
                <h3 className="mb-3 text-base font-semibold text-black sm:text-lg dark:text-white">
                  <span className="mr-2 text-[#a855f7]">{i + 1}.</span>
                  {s.heading}
                </h3>
                <div className="space-y-3 text-sm leading-relaxed text-black/70 dark:text-white/70">
                  {s.body}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
