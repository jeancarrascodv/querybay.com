import LegalPage from "@/components/Legal/LegalPage";
import { termsContent } from "@/data/legalContent";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | QueryBay",
  description:
    "The terms that govern your use of QueryBay's growth, outreach, and remote talent services.",
};

const TermsPage = () => <LegalPage {...termsContent} />;

export default TermsPage;
