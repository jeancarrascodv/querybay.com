// Session utility functions for updating user session

import { useAuth } from "@/contexts/AuthContext";

/**
 * Refreshes the access token with a new team ID
 * This will get a new access token from the backend with the specified team
 * and reload the page to apply the new token
 */
export const refreshTokenWithTeamId = async (
  teamId: string,
  refreshToken?: string,
): Promise<any> => {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          team_id: teamId,
        }),
      },
    );

    if (!response.ok) {
      throw new Error("Failed to refresh token with team ID");
    }

    const data = await response.json();
    console.log("Token refreshed successfully with new team ID:", data);

    // Reload the page to apply the new token
    if (typeof window !== "undefined") {
      window.location.reload();
    }

    return data;
  } catch (error) {
    console.error("Error refreshing token with team ID:", error);
    return false;
  }
};

/**
 * Hook to get the team ID from the session
 */
export const useSessionTeamId = () => {
  const { user } = useAuth();
  return user?.team_id || null;
};
