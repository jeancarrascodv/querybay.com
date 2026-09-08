"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Minus, Plus } from "lucide-react";

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
    <section id="faq" className="qb-section qb-faq" aria-labelledby="faq-title">
      <div className="qb-faq-layout container">
        <div className="qb-faq-intro">
          <span className="qb-eyebrow">04 / A LITTLE MORE CLARITY</span>
          <h2 id="faq-title">
            Good questions.
            <br />
            <span className="qb-muted">Straight answers.</span>
          </h2>
          <p>Here&apos;s what to know before we get started.</p>
          <Link href="/#contact" className="qb-text-link">
            Ask us anything <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="qb-faq-list">
          {FAQS.map((item, i) => {
            const open = openIdx === i;
            return (
              <div
                className={`qb-faq-item ${open ? "is-open" : ""}`}
                key={item.q}
              >
                <h3>
                  <button
                    type="button"
                    id={`faq-question-${i}`}
                    aria-expanded={open}
                    aria-controls={`faq-answer-${i}`}
                    onClick={() => setOpenIdx(open ? null : i)}
                  >
                    <span className="qb-faq-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{item.q}</span>
                    {open ? <Minus size={18} /> : <Plus size={18} />}
                  </button>
                </h3>
                <div
                  id={`faq-answer-${i}`}
                  role="region"
                  aria-labelledby={`faq-question-${i}`}
                  hidden={!open}
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
