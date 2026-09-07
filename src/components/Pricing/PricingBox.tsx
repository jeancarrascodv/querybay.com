import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

const PricingBox = ({
  packageName,
  subtitle,
  highlighted,
  children,
}: {
  packageName: string;
  subtitle: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) => (
  <article className={`qb-plan ${highlighted ? "qb-plan-featured" : ""}`}>
    <div className="qb-plan-heading">
      <h3>{packageName}</h3>
      {highlighted && <span>FULL FUNNEL</span>}
    </div>
    <p className="qb-plan-description">{subtitle}</p>
    <div className="qb-plan-price">
      Custom pricing<span>Built around your goals</span>
    </div>
    <Link
      href="/#contact"
      className={`qb-button ${highlighted ? "qb-button-lime" : "qb-button-outline"}`}
    >
      Get a proposal <ArrowUpRight size={17} />
    </Link>
    <div className="qb-plan-offers">{children}</div>
  </article>
);

export default PricingBox;
