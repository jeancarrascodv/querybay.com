"use client";

import { useState } from "react";

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

type FAQItem = {
  q: string;
  a: string;
};

const FAQS: FAQItem[] = [
  {
    q: "How quickly will I see booked meetings?",
    a: "Most clients see their first qualified meetings within 2 to 4 weeks. Weeks one and two go to data sourcing, copywriting, domain warmup, and account setup. Replies and booked calls ramp from week three as the sequences mature and we learn what your market responds to.",
  },
  {
    q: "Is this safe for my LinkedIn account?",
    a: "We follow human-pacing patterns proven safe over months of production use: humanized typing speeds, randomized delays between sends, daily caps that respect LinkedIn limits, weekday-only send windows, and full-page scroll-before-action so the activity profile matches a real person. We also support per-account proxies and warmup curves. We don't claim it's risk-free since LinkedIn automation is in a gray area, but our guardrails are stricter than every competitor we've benchmarked.",
  },
  {
    q: "Which channels do you run?",
    a: "LinkedIn, cold email, WhatsApp, and outbound calling, coordinated as one campaign. We start with the two channels that fit your market best and layer in the rest as we see what converts. Every channel feeds the same pipeline so a prospect is reached wherever they actually respond.",
  },
  {
    q: "Who actually runs my campaigns?",
    a: "A dedicated team from LATAM and Ghana: an SDR, a copywriter, and a data researcher, overseen by a campaign manager. They work US-friendly hours and operate the campaigns end to end, from list building to booking the meeting on your calendar.",
  },
  {
    q: "Do I need to provide the lead list?",
    a: "No. Sourcing, enriching, and verifying your ideal customer list is part of the engagement. If you already have a list, we'll clean it, enrich it, and use it. Either way the data is refreshed continuously so campaigns never run on stale contacts.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. No long contracts and no retention calls. Your engagement runs month to month and you can stop at the end of any cycle. We won't pretend we're sad to lose you.",
  },
  {
    q: "Where is my data stored and who has access?",
    a: "All data lives in Supabase (Postgres) with row-level security, so each client only reads its own rows even from the database side. LinkedIn cookies are encrypted at rest and only decrypted in the worker process to drive the browser. Access is limited to the team running your campaigns, with audit logging.",
  },
  {
    q: "How much does it cost?",
    a: "Every engagement is scoped to your market, target list size, and channel mix, so we quote per client rather than list a fixed number. Book a call and we'll build a proposal with clear deliverables and KPIs before you commit to anything.",
  },
];

const FAQ = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="relative overflow-hidden py-20 md:py-28 lg:py-32">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/4 top-1/3 h-[400px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.06),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto mb-12 max-w-[720px] text-center">
          <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
            FAQ
          </span>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
            Questions, answered{" "}
            <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
              honestly
            </span>
          </h2>
          <p className="text-base text-black/60 sm:text-lg dark:text-white/70">
            What we tell you in sales is what you get in production. No
            asterisks.
          </p>
        </div>

        <div className="mx-auto max-w-[820px] space-y-3">
          {FAQS.map((item, i) => {
            const open = openIdx === i;
            return (
              <div
                key={item.q}
                className="overflow-hidden rounded-2xl border border-black/8 bg-white/70 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.03]"
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left text-sm font-semibold text-black transition hover:bg-black/[0.02] dark:text-white dark:hover:bg-white/[0.02]"
                  aria-expanded={open}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-black/45 transition-transform dark:text-white/45 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-5 text-sm leading-relaxed text-black/65 dark:text-white/65">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-black/50 dark:text-white/50">
          Still curious?{" "}
          <a
            href="#contact"
            className="font-semibold text-black underline-offset-4 hover:underline dark:text-white"
          >
            Ask us anything
          </a>
        </p>
      </div>
    </section>
  );
};

export default FAQ;
