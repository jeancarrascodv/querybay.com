"use client";
import Link from "next/link";
import TypewriterComponent from "typewriter-effect";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export const LandingHero = () => {
  const { isAuthenticated } = useAuth();
  return (
    <div className="text-white font-bold py-36 text-center space-y-5 ">
      <div className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl space-y-5 font-extrabold">
        <h1>
          Supercharge Lead Generation
          <br /> with
        </h1>
        <div className="text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-600">
          <TypewriterComponent
            options={{
              strings: [
                "Autopilot.",
                "Scheduled Messaging.",
                "CSV Analyzer.",
                "Profile Scanner.",
                "Task Manager.",
              ],
              autoStart: true,
              loop: true,
            }}
          />
        </div>
      </div>
      <div className="text-sm md:text-xl font-light text-zinc-400">
        works while you sleep
      </div>
      <div>
        <Link href={isAuthenticated ? "/integrations" : "/sign-in"}>
          <Button
            variant="premium"
            className="md:text-lg font-semibold p-4 md:p-6 rounded-full"
          >
            Start Generating Free
          </Button>
        </Link>
      </div>
      <div className="text-zinc-400 text-xs md:text-sm font-normal ">
        {" "}
        No credit card requried
      </div>
    </div>
  );
};
