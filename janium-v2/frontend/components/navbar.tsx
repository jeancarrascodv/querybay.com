"use client";

import { Menu, Sparkles } from "lucide-react";
import { Poppins } from "next/font/google";
import Link from "next/link";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { MobileSidebar } from "@/components/mobile-sidebar";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/hooks/useTeam";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMemo } from "react";

const font = Poppins({ weight: "600", subsets: ["latin"] });

export const Navbar = () => {
  const { theme } = useTheme();
  const showDevExtras = process.env.NEXT_PUBLIC_NODE_ENV === "development";

  const { user, logout } = useAuth();
  const { teamsLoading: loading, teams: allTeams } = useTeam(undefined, {
    fetchAllTeams: true,
  });
  const { refreshAccessToken, isRefreshing } = useTokenRefresh();

  const currentTeamId = user?.team_id;

  const handleTeamChange = async (teamId: string) => {
    await refreshAccessToken(teamId);
  };

  const currentTeamName = useMemo(
    () => allTeams.find((a) => a.id == currentTeamId)?.name,
    [allTeams, currentTeamId],
  );

  return (
    <div className="fixed w-full z-50 flex justify-between items-center py-2 px-4 border-b border-primatry/10 bg-secondary h-16">
      <div className="flex items-center gap-x-4">
        <MobileSidebar />
        <Link href="/">
          <Image
            src={"/Janium.png"}
            alt="Janium.io"
            className="hidden md:block"
            width={100}
            height={100}
            objectFit="cover"
          />
        </Link>
      </div>
      <div className="flex items-center gap-x-3">
        {allTeams.length > 0 && (
          <Select
            value={
              currentTeamName ||
              allTeams.find((a) => a.id == currentTeamId)?.name ||
              ""
            }
            onValueChange={handleTeamChange}
            disabled={loading || isRefreshing}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select a team">
                {isRefreshing || loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                    Switching team...
                  </span>
                ) : currentTeamId ? (
                  `Team: ${currentTeamName}`
                ) : (
                  "Select a team"
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {[...allTeams]
                .sort((a, b) =>
                  a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
                )
                .map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {/* <Button size="sm" variant="premium">
          Upgrade
          <Sparkles className="h-4 w-4 fill-white text-white ml-2" />
        </Button> */}
        <Button size="sm" variant="secondary" onClick={() => logout()}>
          Log Out
        </Button>
      </div>
    </div>
  );
};
