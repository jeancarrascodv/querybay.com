import LegalPage from "@/components/Legal/LegalPage";
import { privacyContent } from "@/data/legalContent";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | QueryBay",
  description:
    "How QueryBay collects, uses, shares, and protects your personal information.",
};

const PrivacyPage = () => <LegalPage {...privacyContent} />;

export default PrivacyPage;
