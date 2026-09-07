import Link from "next/link";
import { ArrowRight } from "lucide-react";

const Breadcrumb = ({
  pageName,
  description,
}: {
  pageName: string;
  description: string;
}) => (
  <section className="qb-page-heading">
    <div className="container">
      <nav aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <ArrowRight size={13} />
        <span aria-current="page">{pageName}</span>
      </nav>
      <h1>{pageName}</h1>
      <p>{description}</p>
    </div>
  </section>
);

export default Breadcrumb;
