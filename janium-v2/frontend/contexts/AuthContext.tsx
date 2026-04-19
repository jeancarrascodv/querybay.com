/**
 * Authentication Context Provider
 * Provides auth state and methods throughout the app
 * Uses cookie-based authentication with Rust backend
 */

"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { authClient, AuthUser, AuthResponse } from "@/lib/auth-client";
import { useTeamStore } from "@/store/useTeamStore";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    email: string,
    password: string,
    teamId?: string
  ) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshToken: (teamId?: string) => Promise<AuthResponse>;
  refetchUser: () => Promise<void>;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  /**
   * Logout user
   */
  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await authClient.logout();
      // Clear all tokens from storage
      authClient.clearAllTokens();
      setUser(null);
      router.push("/sign-in");
    } catch (err) {
      console.error("Logout error:", err);
      setError(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setIsLoading(false);
    }
  }, [router]);
  /**
   * Check if user is authenticated on mount
   */
  const checkAuth = useCallback(async () => {
    try {

      const currentUser = await authClient.getCurrentUser();
      if( pathname === "/auth/refreshing" || pathname === "/sign-in" || pathname === "/sign-up" || pathname.startsWith("/sign-up")) return;
      if (!currentUser ) {
        logout();
      }

      setUser(currentUser);
    } catch (err) {
      console.error("Auth check failed:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);
  /**
   * Auto-refresh token 1 minute before expiry
   */
  const autoRefreshToken = useCallback(async () => {
    if (!user) return;

    try {
      const expiry = authClient.getTokenExpiry();
      if (!expiry) return;

      const now = Date.now();
      const timeUntilExpiry = expiry - now;
      const oneMinute = 60 * 1000;

      // If token expires in less than 1 minute, refresh immediately
      if (timeUntilExpiry <= oneMinute) {
        console.log("Token expiring soon, refreshing...");
        const response = await authClient.refreshToken();
        setUser(response.user);
        authClient.setAccessToken(response.access_token, response.expires_in);
        authClient.setRefreshToken(response.refresh_token);
      }
    } catch (err) {
      console.error("Auto token refresh failed:", err);
      // If refresh fails, logout user
      await logout();
    }
  }, [user, logout]);

  useEffect(() => {
    console.log("AuthProvider mounted, checking auth...", pathname);
    if (
      pathname === "/sign-in" ||
      pathname === "/sign-up" ||
      pathname.startsWith("/sign-up/")
    )
      return;
    checkAuth();
  }, [checkAuth, pathname]);

  /**
   * Set up automatic token refresh timer
   * Check every 30 seconds if token needs refresh
   */
  useEffect(() => {
    if (!user) return;

    const checkInterval = 30 * 1000; // Check every 30 seconds
    const intervalId = setInterval(autoRefreshToken, checkInterval);

    // Also check immediately
    autoRefreshToken();

    return () => clearInterval(intervalId);
  }, [user, autoRefreshToken]);

  /**
   * Login user
   */
  const login = useCallback(
    async (
      email: string,
      password: string,
      teamId?: string
    ): Promise<AuthResponse> => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await authClient.login(email, password, teamId);
        setUser(response.user);
        // Store both tokens for API requests

        authClient.setAccessToken(response.access_token, response.expires_in);
        authClient.setRefreshToken(response.refresh_token);
        authClient.setCurrentTeamId(response.user.team_id);

        await useTeamStore.getState().setCurrentTeamId(response.user.team_id);
        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Login failed";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Refresh access token (e.g., when switching teams)
   */
  const refreshToken = useCallback(
    async (teamId?: string): Promise<AuthResponse> => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await authClient.refreshToken(teamId);
        setUser(response.user);
        // Store both new tokens
        authClient.setAccessToken(response.access_token, response.expires_in);
        authClient.setRefreshToken(response.refresh_token);
        return response;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Token refresh failed";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Manually refetch user data
   */
  const refetchUser = useCallback(async () => {
    try {
      const currentUser = await authClient.getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      console.error("Failed to refetch user:", err);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshToken,
    refetchUser,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Backward compatibility alias
export function useAuthContext() {
  return useAuth();
}
