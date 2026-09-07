import Link from "next/link";
import { Zap } from "lucide-react";

export default function Brand() {
  return (
    <Link href="/" className="qb-brand" aria-label="QueryBay home">
      <span className="qb-brand-mark">
        <Zap size={23} strokeWidth={2.2} />
      </span>
      QueryBay<span className="qb-brand-period">.</span>
    </Link>
  );
}
