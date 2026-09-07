"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useState } from "react";
import { ArrowUpRight, Check, LoaderCircle } from "lucide-react";

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL || "https://calendly.com/querybay/30min";

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (options: { url: string }) => void };
  }
}

const Contact = () => {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("Multichannel outreach");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");

  const openCalendly = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback("");
    const url = new URL(CALENDLY_URL);
    url.searchParams.set("name", name);
    url.searchParams.set("email", email);
    url.searchParams.set("hide_gdpr_banner", "1");
    url.searchParams.set("primary_color", "476b20");
    setCalendarUrl(url.toString());

    // Open during the user gesture so the fallback is not blocked after a fetch.
    try {
      if (window.Calendly)
        window.Calendly.initPopupWidget({ url: url.toString() });
      else window.open(url.toString(), "_blank", "noopener,noreferrer");
    } catch {
      // The persistent calendar link below also works if the widget is unavailable.
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, interest, message }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Contact request failed");
      const result = await response.json();
      if (!result.persisted) throw new Error("Contact details were not saved");
      setFeedback(
        "Your details are saved. Choose a time in the calendar to confirm your call.",
      );
    } catch {
      setFeedback(
        "We couldn't save your details. You can still book your call directly using the calendar link below.",
      );
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
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
      <section
        id="contact"
        className="qb-section qb-contact"
        aria-labelledby="contact-title"
      >
        <div className="qb-contact-layout container">
          <div className="qb-contact-copy">
            <span className="qb-eyebrow">
              <span className="qb-status-dot" /> YOUR NEXT CHAPTER STARTS HERE
            </span>
            <h2 id="contact-title">
              Let&apos;s make
              <br />
              some <span>introductions.</span>
            </h2>
            <p>
              Tell us where you want to go. We&apos;ll map out how to get your
              next customers into the conversation.
            </p>
            <ul>
              {[
                "An audit of your current outreach",
                "Personalized messaging templates",
                "A dedicated team proposal",
                "A 90-day plan with clear KPIs",
              ].map((item) => (
                <li key={item}>
                  <Check size={17} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="qb-contact-note">
              A real conversation. A concrete plan.
              <br />
              No commitment required.
            </div>
          </div>
          <form
            onSubmit={openCalendly}
            className="qb-contact-form"
            aria-label="Book a discovery call"
          >
            <div className="qb-form-heading">
              <h3>A little about you</h3>
              <span>Let&apos;s start here</span>
            </div>
            <div className="qb-form-row">
              <div className="qb-field">
                <label htmlFor="name">
                  Full name <span>*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </div>
              <div className="qb-field">
                <label htmlFor="company">Company</label>
                <input
                  id="company"
                  name="company"
                  autoComplete="organization"
                  maxLength={200}
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company name"
                />
              </div>
            </div>
            <div className="qb-field">
              <label htmlFor="email">
                Work email <span>*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={320}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex@company.com"
              />
            </div>
            <div className="qb-field">
              <label htmlFor="interest">What can we help with?</label>
              <select
                id="interest"
                name="interest"
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              >
                {[
                  "Multichannel outreach",
                  "Lead generation",
                  "Growth marketing",
                  "Appointment setting",
                  "A combination of these",
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="qb-field">
              <label htmlFor="message">
                Anything else?{" "}
                <span className="qb-field-optional">(optional)</span>
              </label>
              <textarea
                id="message"
                name="message"
                rows={3}
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Your goals, your market, your next big move..."
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="qb-button qb-button-lime qb-submit"
            >
              {submitting ? (
                <>
                  Saving your details{" "}
                  <LoaderCircle className="qb-spin" size={18} />
                </>
              ) : (
                <>
                  Book a free discovery call <ArrowUpRight size={18} />
                </>
              )}
            </button>
            <p className="qb-form-privacy">
              Your information stays between us.{" "}
              <Link href="/privacy">Privacy policy</Link>
            </p>
            <div className="qb-form-feedback" role="status" aria-live="polite">
              {feedback}
              {calendarUrl && (
                <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
                  Open the booking calendar <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </form>
        </div>
      </section>
    </>
  );
};

export default Contact;
