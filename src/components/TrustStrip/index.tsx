import {
  ArrowUpRight,
  FileCheck2,
  HeartHandshake,
  LockKeyhole,
  Users,
} from "lucide-react";

const promises = [
  {
    icon: Users,
    title: "People in your corner",
    body: "Dedicated specialists in LATAM and Ghana, working US-friendly hours.",
  },
  {
    icon: FileCheck2,
    title: "Clarity from day one",
    body: "Exact deliverables and KPIs in your proposal, before you commit.",
  },
  {
    icon: HeartHandshake,
    title: "A real human reply",
    body: "Questions go to a real person on our team, with a reply within 24 hours.",
  },
  {
    icon: LockKeyhole,
    title: "Your data stays yours",
    body: "Export your contacts, campaigns, and message history whenever you need.",
  },
];

const TrustStrip = () => (
  <section className="qb-section qb-trust" aria-labelledby="trust-title">
    <div className="container">
      <div className="qb-trust-intro">
        <div>
          <span className="qb-eyebrow">A TEAM, NOT JUST A TOOL</span>
          <h2 id="trust-title">
            Technology makes it possible.
            <br />
            People make it happen.
          </h2>
        </div>
        <a href="/about" className="qb-text-link">
          Get to know QueryBay <ArrowUpRight size={18} />
        </a>
      </div>
      <div className="qb-trust-grid">
        {promises.map((promise) => (
          <div key={promise.title}>
            <promise.icon size={25} strokeWidth={1.5} />
            <h3>{promise.title}</h3>
            <p>{promise.body}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default TrustStrip;
