import Link from "next/link";
import {
  ArrowUpRight,
  CalendarCheck,
  ChartNoAxesCombined,
  Database,
  MessagesSquare,
  Users,
  Workflow,
} from "lucide-react";
import featuresData from "./featuresData";

const icons = [
  MessagesSquare,
  Database,
  ChartNoAxesCombined,
  CalendarCheck,
  Users,
  Workflow,
];

const Features = () => (
  <section
    id="features"
    className="qb-section"
    aria-labelledby="services-title"
  >
    <div className="container">
      <div className="qb-section-heading">
        <div>
          <span className="qb-eyebrow">01 / WHAT WE DO</span>
          <h2 id="services-title">
            Good conversations.
            <br />
            <span className="qb-muted">Great opportunities.</span>
          </h2>
        </div>
        <p>
          From finding your next customer to booking the first call. We take
          care of the work that keeps your pipeline moving.
        </p>
      </div>
      <div className="qb-services-grid">
        {featuresData.map((feature, i) => {
          const Icon = icons[i];
          return (
            <article key={feature.id} className="qb-service">
              <div className="qb-service-top">
                <Icon size={27} strokeWidth={1.5} />
                <span>0{feature.id}</span>
              </div>
              <h3>{feature.title}</h3>
              <p>{feature.paragraph}</p>
              <Link
                href="/#contact"
                className="qb-service-link"
                aria-label={`Discuss ${feature.title}`}
              >
                Let&apos;s talk <ArrowUpRight size={17} />
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);

export default Features;
