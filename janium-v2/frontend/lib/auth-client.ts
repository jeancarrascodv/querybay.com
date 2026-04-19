/**
 * Auth Client for browser-side authentication
 * Communicates directly with Rust backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  timezone: string;
  team_id: string;
  privileges: string[];
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export class AuthClient {
  /**
   * Login user and receive auth cookies from backend
   */
  async login(
    email: string,
    password: string,
    teamId?: string
  ): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // Important: allows cookies
      body: JSON.stringify({ email, password, team_id: teamId }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Login failed" }));
      throw new Error(error.message || "Login failed");
    }

    return response.json();
  }

  /**
   * Refresh access token (e.g., when switching teams)
   * Uses refresh token from sessionStorage and sends to backend
   */
  async refreshToken(teamId?: string): Promise<AuthResponse> {
    // const refreshToken = this.getRefreshToken();
    // if (!refreshToken) {
    //   throw new Error("No refresh token available");
    // }

    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: `Bearer ${refreshToken}`,
      },
      credentials: "include",
      body: JSON.stringify({ team_id: teamId }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: "Token refresh failed" }));
      throw new Error(error.message || "Token refresh failed");
    }

    return response.json();
  }

  /**
   * Logout user and revoke refresh token
   */
  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logout: true }),
        credentials: "include",
      });
    }
  }

  /**
   * Get current authenticated user
   * Tries Bearer token first, falls back to cookies
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const accessToken = this.getAccessToken();

      const headers: HeadersInit = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers,
        credentials: "include", // Send cookies as fallback
      });

      if (!response.ok) {
        return null;
      }

      return response.json();
    } catch (error) {
      console.error("Error getting current user:", error);
      return null;
    }
  }

  /**
   * Get access token from sessionStorage
   * Used for GraphQL requests that need Bearer token
   */
  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("access_token");
  }

  /**
   * Store access token in sessionStorage
   * Called after successful login or token refresh
   */
  setAccessToken(token: string, expiresIn?: number): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("access_token", token);

    // Store expiry timestamp if provided
    if (expiresIn) {
      const expiryTime = Date.now() + expiresIn * 1000;
      sessionStorage.setItem("token_expiry", expiryTime.toString());
    }

    // Also set in a client-side cookie for middleware access
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    document.cookie = `janium_client_token=${token}; path=/; max-age=${maxAge}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
  }

  /**
   * Clear access token from sessionStorage
   * Called on logout
   */
  clearAccessToken(): void {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("token_expiry");
    // Clear the client-side cookie
    document.cookie = "janium_client_token=; path=/; max-age=0";
  }

  /**
   * Get token expiry time
   * Returns timestamp in milliseconds
   */
  getTokenExpiry(): number | null {
    if (typeof window === "undefined") return null;
    const expiry = sessionStorage.getItem("token_expiry");
    return expiry ? parseInt(expiry, 10) : null;
  }

  /**
   * Check if token will expire soon (within 1 minute)
   */
  willExpireSoon(): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return false;
    const oneMinute = 60 * 1000;
    return expiry - Date.now() <= oneMinute;
  }

  /**
   * Get refresh token from sessionStorage
   * Used for token refresh and logout
   */
  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("refresh_token");
  }

  /**
   * Store refresh token in sessionStorage
   * Called after successful login or token refresh
   */
  setRefreshToken(token: string): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("refresh_token", token);
  }
  setCurrentTeamId(teamId: string): void {
    if (typeof window === "undefined") return;
    sessionStorage.setItem("current_team_id", teamId);
  }

  /**
   * Clear refresh token from sessionStorage
   * Called on logout
   */
  clearRefreshToken(): void {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem("refresh_token");
  }

  /**
   * Clear all tokens from sessionStorage
   * Called on logout
   */
  clearAllTokens(): void {
    this.clearAccessToken();
    this.clearRefreshToken();
  }
}

export const authClient = new AuthClient();
