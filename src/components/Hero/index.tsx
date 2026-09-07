import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";

const Hero = () => (
  <>
    <section id="home" className="qb-hero" aria-labelledby="hero-title">
      <Image
        src="/images/hero/workspace.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="qb-hero-image"
      />
      <div className="qb-hero-shade" />
      <div className="qb-hero-inner container">
        <div className="qb-eyebrow qb-hero-eyebrow">
          <span className="qb-status-dot" /> HUMAN-LED. MULTICHANNEL. BUILT FOR
          B2B.
        </div>
        <h1 id="hero-title">
          B2B lead
          <br />
          <span>generation.</span>
        </h1>
        <p className="qb-hero-description">
          Your next great client starts with a conversation.
          <br className="qb-desktop-break" /> We find the right people, start
          the conversation,
          <br className="qb-desktop-break" /> and get the meeting on your
          calendar.
        </p>
        <div className="qb-hero-actions">
          <Link href="/#contact" className="qb-button qb-button-lime">
            Let&apos;s build your pipeline <ArrowUpRight size={18} />
          </Link>
          <Link href="/#features" className="qb-hero-secondary">
            Explore our services <ArrowDown size={16} />
          </Link>
        </div>
        <div className="qb-hero-bottom">
          <div className="qb-hero-promise">
            <Check size={15} /> Dedicated people. No long-term contracts.
          </div>
          <div className="qb-hero-channels" aria-label="Outreach channels">
            <span>
              <b className="qb-linkedin-icon" aria-hidden="true">
                in
              </b>{" "}
              LinkedIn
            </span>
            <span>
              <Mail size={15} /> Email
            </span>
            <span>
              <MessageCircle size={15} /> WhatsApp
            </span>
            <span>
              <Phone size={15} /> Calls
            </span>
          </div>
        </div>
      </div>
    </section>
    <section className="qb-facts" aria-label="Working with QueryBay">
      <div className="qb-facts-grid container">
        <div>
          <strong>4 channels</strong>
          <span>One connected outreach strategy</span>
        </div>
        <div>
          <strong>7–14 days</strong>
          <span>From kickoff to campaign launch</span>
        </div>
        <div>
          <strong>Your team</strong>
          <span>Dedicated specialists, fully managed</span>
        </div>
        <div>
          <strong>Month to month</strong>
          <span>Built on results, not long contracts</span>
        </div>
      </div>
    </section>
  </>
);

export default Hero;
