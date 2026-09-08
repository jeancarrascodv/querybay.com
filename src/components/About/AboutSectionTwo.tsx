import Link from "next/link";
import { ArrowUpRight, Check, Globe2 } from "lucide-react";

const regions = [
  {
    name: "Latin America",
    countries: "Mexico · Colombia · Argentina · Peru · Chile",
    description:
      "Bilingual specialists, working in step with US business hours.",
  },
  {
    name: "Ghana",
    countries: "Accra · Kumasi · Takoradi",
    description:
      "English-speaking talent with working hours that overlap the US and Europe.",
  },
];
const benefits = [
  [
    "Live in 7–14 days",
    "We prepare your prospect data, copy, domains, and accounts for launch.",
  ],
  [
    "Dedicated specialists",
    "SDRs, copywriters, data researchers, and campaign managers who do outbound full-time.",
  ],
  [
    "Fully managed",
    "We handle your tooling, deliverability, data, and reporting.",
  ],
  [
    "Replacement guarantee",
    "If a team member isn't the right fit, we arrange a replacement.",
  ],
];

const AboutSectionTwo = () => (
  <section className="qb-section qb-team" aria-labelledby="team-title">
    <div className="container">
      <div className="qb-section-heading">
        <div>
          <span className="qb-eyebrow">THE PEOPLE BEHIND THE PIPELINE</span>
          <h2 id="team-title">
            Different places.
            <br />
            <span className="qb-muted">A shared ambition.</span>
          </h2>
        </div>
        <p>
          Your campaigns are run by dedicated specialists in Latin America and
          Ghana. A connected team, focused on your next conversation.
        </p>
      </div>
      <div className="qb-team-layout">
        <div className="qb-regions">
          {regions.map((region) => (
            <article key={region.name}>
              <Globe2 size={27} strokeWidth={1.5} />
              <h3>{region.name}</h3>
              <span>{region.countries}</span>
              <p>{region.description}</p>
            </article>
          ))}
        </div>
        <div className="qb-team-benefits">
          {benefits.map(([title, description]) => (
            <div key={title}>
              <Check size={18} />
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </div>
          ))}
          <Link href="/#contact" className="qb-text-link">
            Build your dedicated team <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  </section>
);

export default AboutSectionTwo;
