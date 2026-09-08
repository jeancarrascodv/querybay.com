"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  Mail,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";

const channels = [
  {
    name: "LinkedIn",
    icon: Send,
    title: "Make the right first connection.",
    description:
      "Get in front of the decision-makers who matter. We build relevant prospect lists and turn thoughtful introductions into real business conversations.",
    steps: [
      "Find your ideal decision-makers",
      "Send a personal introduction",
      "Follow up with something valuable",
      "Move the conversation to a meeting",
    ],
    tone: "blue",
    tag: "RELATIONSHIPS FIRST",
    note: "Connection requests, InMail, and personalized follow-ups.",
  },
  {
    name: "Email",
    icon: Mail,
    title: "An inbox is a place to start.",
    description:
      "Reach your next customer with a message that feels relevant. We manage your domains, deliverability, copy, and follow-ups from the first send to the reply.",
    steps: [
      "Source and verify the right contacts",
      "Prepare domains and mailboxes",
      "Launch personalized sequences",
      "Qualify replies and book the call",
    ],
    tone: "coral",
    tag: "RELEVANCE AT SCALE",
    note: "Verified data, warmed-up domains, and considered copy.",
  },
  {
    name: "WhatsApp",
    icon: MessageCircle,
    title: "Keep the conversation going.",
    description:
      "Meet interested prospects where they already communicate. Our team handles conversational nurturing, timely follow-ups, and the details that move an opportunity forward.",
    steps: [
      "Identify the right conversations",
      "Start a relevant, personal exchange",
      "Answer questions and qualify interest",
      "Confirm the next step together",
    ],
    tone: "green",
    tag: "A MORE PERSONAL FOLLOW-UP",
    note: "Conversational nurturing and direct, human follow-ups.",
  },
  {
    name: "Calls",
    icon: Phone,
    title: "Put a human voice to your offer.",
    description:
      "Some opportunities need a real conversation. Dedicated callers introduce your business, understand the prospect's needs, and set up your sales team for the next step.",
    steps: [
      "Research the account and contact",
      "Prepare a tailored talking track",
      "Connect and qualify the opportunity",
      "Book a meeting with your team",
    ],
    tone: "yellow",
    tag: "REAL PEOPLE. REAL CONVERSATIONS.",
    note: "Outbound calling, qualification, and appointment setting.",
  },
];

export default function AboutSectionOne() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % channels.length;
    else if (event.key === "ArrowLeft")
      next = (index + channels.length - 1) % channels.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = channels.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section
      id="about"
      className="qb-section qb-channels"
      aria-labelledby="channels-title"
    >
      <div className="container">
        <div className="qb-section-heading">
          <div>
            <span className="qb-eyebrow">02 / HOW IT WORKS</span>
            <h2 id="channels-title">
              More ways in.
              <br />
              <span>One connected strategy.</span>
            </h2>
          </div>
          <p>
            Your prospects don&apos;t live on one platform. We coordinate the
            right channels around one goal: your next qualified meeting.
          </p>
        </div>
        <div
          className="qb-channel-tabs"
          role="tablist"
          aria-label="Outreach channels"
        >
          {channels.map((item, index) => (
            <button
              key={item.name}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              role="tab"
              id={`channel-tab-${index}`}
              aria-selected={active === index}
              aria-controls={`channel-panel-${index}`}
              tabIndex={active === index ? 0 : -1}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => setActive(index)}
              className={active === index ? "is-active" : ""}
            >
              <item.icon size={19} />
              {item.name}
              <ArrowUpRight className="qb-tab-arrow" size={17} />
            </button>
          ))}
        </div>
        {channels.map((item, index) => (
          <div
            key={item.name}
            id={`channel-panel-${index}`}
            role="tabpanel"
            aria-labelledby={`channel-tab-${index}`}
            hidden={active !== index}
            tabIndex={0}
            className="qb-channel-panel"
          >
            <div className="qb-channel-copy">
              <span className={`qb-channel-label qb-tone-${item.tone}`}>
                {item.tag}
              </span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <Link href="/#contact" className="qb-text-link">
                Build my outreach plan <ArrowUpRight size={18} />
              </Link>
            </div>
            <div
              className="qb-sequence"
              aria-label={`${item.name} campaign process`}
            >
              <div className="qb-sequence-header">
                <span>
                  <item.icon size={17} /> {item.name} outreach
                </span>
                <span className="qb-sequence-caption">THE SEQUENCE</span>
              </div>
              <ol>
                {item.steps.map((step, i) => (
                  <li key={step}>
                    <span
                      className={`qb-step-marker ${i === 3 ? "qb-step-complete" : ""}`}
                    >
                      {i === 3 ? (
                        <CalendarCheck size={18} />
                      ) : (
                        String(i + 1).padStart(2, "0")
                      )}
                    </span>
                    <span>{step}</span>
                    {i === 3 ? (
                      <Check size={16} className="qb-step-check" />
                    ) : (
                      <ArrowRight size={15} className="qb-step-arrow" />
                    )}
                  </li>
                ))}
              </ol>
              <p>{item.note}</p>
            </div>
          </div>
        ))}
        <div className="qb-process">
          <div>
            <span>01</span>
            <h3>Align on your goals</h3>
            <p>
              We define your ideal customer, offer, and what a qualified meeting
              looks like.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>Build and launch</h3>
            <p>
              Your team prepares the data, messaging, and channels. Launch in
              7–14 days.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Learn. Refine. Grow.</h3>
            <p>
              We work the replies, book the meetings, and improve the campaign
              week by week.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
