import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Brand from "@/components/Common/Brand";

const columns = [
  {
    title: "Explore",
    links: [
      ["Services", "/#features"],
      ["How it works", "/#about"],
      ["Pricing", "/#pricing"],
      ["FAQ", "/#faq"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About QueryBay", "/about"],
      ["Contact", "/contact"],
      ["Blog", "/blog"],
    ],
  },
  {
    title: "Your workspace",
    links: [
      ["Sign in", "https://app.querybay.com/signin"],
      ["Create account", "https://app.querybay.com/signup"],
      ["Get a proposal", "/#contact"],
    ],
  },
];

const Footer = () => (
  <footer className="qb-footer">
    <div className="container">
      <div className="qb-footer-top">
        <div className="qb-footer-brand">
          <Brand />
          <p>
            Good people. Better conversations.
            <br />
            Your next stage of growth.
          </p>
          <span>Based in LATAM & Ghana. Connected everywhere.</span>
        </div>
        {columns.map((column) => (
          <div className="qb-footer-column" key={column.title}>
            <h2>{column.title}</h2>
            <ul>
              {column.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href}>
                    {label}
                    {href.startsWith("https") && <ArrowUpRight size={13} />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="qb-footer-bottom">
        <p>© {new Date().getFullYear()} QueryBay. All rights reserved.</p>
        <div>
          <Link href="/terms">Terms of service</Link>
          <Link href="/privacy">Privacy policy</Link>
          <a href="#main-content" className="qb-back-top">
            Back to top <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </div>
  </footer>
);

export default Footer;
