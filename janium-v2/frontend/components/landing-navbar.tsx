"use client";

import { Montserrat } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const font = Montserrat({ weight: "600", subsets: ["latin"] });

export const LandingNavbar = () => {
  const { isAuthenticated } = useAuth();

  return (
    <nav className="p-4 bg-transparent flex items-center justify-between">
      <Link href="/" className="flex items-center">
        <div className="relative mr-4">
          <Image
            width={100}
            height={100} // Adjusted height based on the aspect ratio
            objectFit="cover"
            alt="logo"
            src="/Janium.png"
          />
        </div>
        <h1 className={cn("text-2xl font-bold text-white ", font.className)}>
          {/* Janium */}
        </h1>
      </Link>
      <div className="flex items-center gap-x-2">
        <Link href={isAuthenticated ? "/integrations" : "/sign-in"}>
          <Button variant="premium" className="rounded-full">
            Get Started
          </Button>
        </Link>
      </div>
    </nav>
  );
};
