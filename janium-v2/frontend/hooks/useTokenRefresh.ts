import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamStore } from "@/store/useTeamStore";

export const useTokenRefresh = () => {
  const { user, refreshToken: authRefreshToken, refetchUser } = useAuth();
  const { setCurrentTeamId } = useTeamStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshAccessToken = useCallback(
    async (teamId: string) => {
      if (teamId === user?.team_id) return;
      if (!user) {
        throw new Error("No user found");
      }

      setIsRefreshing(true);
      try {
        // Use auth context's refreshToken which calls API with cookies
        await authRefreshToken(teamId);
        // Update the team store's currentTeamId to keep it in sync with the token
        setCurrentTeamId(teamId);
        console.log("Token refreshed successfully for team:", teamId);
      } catch (error) {
        console.error("Error refreshing access token:", error);
        throw error;
      } finally {
        setIsRefreshing(false);
      }
    },
    [user, authRefreshToken, setCurrentTeamId]
  );

  const getCurrentTeam = useCallback(async () => {
    if (!user) {
      throw new Error("No user found");
    }

    try {
      // Refetch user data which includes current team
      await refetchUser();
      return user;
    } catch (error) {
      console.error("Error getting current team:", error);
      throw error;
    }
  }, [user, refetchUser]);

  return { refreshAccessToken, getCurrentTeam, isRefreshing };
};
