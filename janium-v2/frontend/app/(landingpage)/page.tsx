import Image from "next/image";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LandingHero } from "@/components/landing-hero";

import { LandingNavbar } from "@/components/landing-navbar";
import { LandingContent } from "@/components/landing-content";

// Force dynamic rendering
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LandingPage() {
  return (
    <div className="h-full ">
      <LandingNavbar />
      <LandingHero />
      <LandingContent />
    </div>
  );
}
