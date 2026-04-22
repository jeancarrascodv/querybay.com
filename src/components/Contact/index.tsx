"use client";

import Script from "next/script";
import { FormEvent, useState } from "react";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/your-username/30min";

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

const Contact = () => {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("Multichannel outreach");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, interest, message }),
      });
    } catch {
      // Non-blocking: even if lead capture fails, let the user book
    }

    const params = new URLSearchParams();
    if (name) params.set("name", name);
    if (email) params.set("email", email);
    if (company) params.set("a1", company);
    if (interest) params.set("a2", interest);
    if (message) params.set("a3", message);
    params.set("hide_event_type_details", "1");
    params.set("hide_gdpr_banner", "1");
    params.set("primary_color", "a855f7");

    const url = `${CALENDLY_URL}?${params.toString()}`;

    if (typeof window !== "undefined" && window.Calendly) {
      window.Calendly.initPopupWidget({ url });
    } else {
      window.open(url, "_blank");
    }

    setSubmitting(false);
  };

  return (
    <>
      <link
        href="https://assets.calendly.com/assets/external/widget.css"
        rel="stylesheet"
      />
      <Script
        src="https://assets.calendly.com/assets/external/widget.js"
        strategy="lazyOnload"
      />
      <section id="contact" className="relative overflow-hidden py-20 md:py-28 lg:py-32">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute bottom-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(236,72,153,0.1),transparent_70%)] blur-3xl" />
        </div>

        <div className="container">
          <div className="mx-auto max-w-[960px]">
            <div className="relative overflow-hidden rounded-3xl border border-black/10 bg-white/80 p-8 backdrop-blur-xl sm:p-12 lg:p-16 dark:border-white/10 dark:bg-white/5">
              <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.3),transparent_70%)] blur-2xl" />

              <div className="relative grid grid-cols-1 gap-12 lg:grid-cols-2">
                <div>
                  <span className="mb-4 inline-block rounded-full border border-black/10 bg-white/60 px-4 py-1 text-xs font-medium text-black/70 backdrop-blur-md dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                    Get started today
                  </span>
                  <h2 className="mb-5 text-3xl font-bold tracking-tight text-black sm:text-4xl md:text-5xl dark:text-white">
                    Tell us about your{" "}
                    <span className="bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] bg-clip-text text-transparent">
                      project
                    </span>
                  </h2>
                  <p className="mb-8 text-base leading-relaxed text-black/60 sm:text-lg dark:text-white/70">
                    Book a free 30-min call. We&apos;ll audit your funnel, share 3
                    proven templates, and hand you a concrete action plan. No
                    strings attached.
                  </p>

                  <ul className="space-y-3">
                    {[
                      "Audit of your current outreach",
                      "3 personalized templates",
                      "LATAM/Ghana team proposal",
                      "90-day plan with KPIs",
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-center gap-3 text-sm text-black/70 dark:text-white/80"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="company"
                        className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                      >
                        Company
                      </label>
                      <input
                        id="company"
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your company"
                        className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                    >
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="interest"
                      className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                    >
                      I&apos;m interested in
                    </label>
                    <select
                      id="interest"
                      value={interest}
                      onChange={(e) => setInterest(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                    >
                      <option>Multichannel outreach</option>
                      <option>Growth marketing</option>
                      <option>Service outsourcing</option>
                      <option>LATAM / Ghana hiring</option>
                      <option>A combination of these</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="message"
                      className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60"
                    >
                      Message (optional)
                    </label>
                    <textarea
                      id="message"
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us a bit more..."
                      className="w-full resize-none rounded-xl border border-black/10 bg-white/70 px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-6 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)] disabled:opacity-60"
                  >
                    {submitting ? "Opening calendar..." : "Book a free call"}
                    <svg className="h-4 w-4 transition group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Contact;
