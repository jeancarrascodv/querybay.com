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
    q: "Is QueryBay safe for my LinkedIn account?",
    a: "We follow the same human-pacing patterns proven safe over 6+ months of production use: humanized typing speeds, randomized delays between sends, daily caps that respect LinkedIn limits, weekday-only send windows, and full-page scroll-before-action so the activity profile matches a real person. We also support per-account proxies and warmup curves. Most operators run with zero issues. We don't claim it's risk-free since LinkedIn automation is in a gray area, but our guardrails are stricter than every competitor we've benchmarked.",
  },
  {
    q: "What's the difference between the SaaS and the Done-for-you services?",
    a: "Self-serve plans (Free / Pro $99 per seat / Agency $249 per seat) give your team direct access to the dashboard. Connect your LinkedIn cookie, build campaigns, and run them yourself. Done-for-you (Outreach / Growth / Talent) is when our team operates the campaigns for you end-to-end: we connect the accounts, write the copy, monitor replies, and report monthly. Pick self-serve if you have an SDR; pick Done-for-you if you want results without owning the workflow.",
  },
  {
    q: "How does per-seat billing work?",
    a: "On Pro and Agency plans you pay per active team member, billed monthly. Add a seat and your bill goes up by the per-user price; remove a seat and it drops at the next cycle. There's no minimum seat count. A solo operator on Pro pays $99/mo; a 5-person team on Pro pays $495/mo. Your active LinkedIn account count doesn't change the price, since operators are the bottleneck, not agents.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Self-serve cancel from /billing in the app. Your subscription stops at the end of the current period and you can keep using it until then. No retention call, no email-only support tier. We won't pretend we're sad to lose you.",
  },
  {
    q: "Where is my data stored and who has access?",
    a: "All data lives in Supabase (Postgres) hosted in AWS us-west-2. Row-level security means each team only reads its own rows, even from the database side. Stripe handles payments, so we never see card numbers. LinkedIn cookies are encrypted at rest and only decrypted in the worker process to drive the browser. Jean is the only person with admin DB access; we'll add team operators as we grow with audit logging.",
  },
  {
    q: "What happens if LinkedIn flags my account?",
    a: "First, the runner pauses the integration so we don't keep poking it. Second, the operator gets a notification (in-app and email if enabled). Third, our diagnostic dump captures the page state at the time of the flag so we can identify whether it was a captcha, an auth wall, or a hard restriction. Most flags are recoverable by a human login; we'll guide you through it. We don't refund based on this since LinkedIn's platform decisions are outside our control, but we cap any new caps automatically when warming back up.",
  },
  {
    q: "Do you offer a free trial?",
    a: "The Free plan is the trial. It's not time-limited. 1 LinkedIn account, 100 actions per month, basic AI chat. Most operators upgrade once they need a second account or hit the action ceiling, which usually happens in week 2-3. No credit card required to start.",
  },
  {
    q: "How do you stay updated when LinkedIn changes their UI?",
    a: "Selectors are versioned, the executor walks several fallback paths per click, and we run end-to-end smoke tests after every release. When LinkedIn ships a structural change (the SDUI variant rollout in late 2026 is a recent example) we patch within hours, not weeks. The architecture is built around the assumption that LinkedIn churn is constant.",
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
