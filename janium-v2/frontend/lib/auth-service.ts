/**
 * Authentication Service
 * Handles login, signup, token refresh, and session management
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export interface LoginRequest {
  email: string;
  password: string;
  team_id?: string | null;
}

export interface SignupRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  title: string;
  company: string;
  timezone: string;
  invite_code?: string | null;
}

export interface RefreshTokenRequest {
  team_id: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: UserInfo;
}

export interface UserInfo {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  team_id: string | null;
  teams?: Array<{
    id: string;
    name: string;
    role: string;
  }>;
}

export interface ApiError {
  message: string;
  code?: string;
}

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    // Initialize tokens from session storage on client side
    if (typeof window !== "undefined") {
      this.accessToken = sessionStorage.getItem("access_token");
      this.refreshToken = sessionStorage.getItem("refresh_token");
    }
  }

  /**
   * Sign up a new user
   */
  async signup(data: SignupRequest): Promise<AuthResponse> {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Remove invite_code from body since it goes in the URL path
      const { invite_code, ...body } = data;

      const response = await fetch(`${API_BASE_URL}/signup/${invite_code}`, {
        method: "POST",
        headers,
        credentials: "include", // Include cookies in request/response
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Signup failed");
      }

      const authResponse: AuthResponse = await response.json();
      return authResponse;
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  }

  /**
   * Login a user
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies in request/response
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      const authResponse: AuthResponse = await response.json();
      return authResponse;
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  }

  /**
   * Refresh the access token using the refresh token
   */
  async refreshAccessToken(
    refreshToken?: string,
    teamId?: string | null
  ): Promise<AuthResponse> {
    const tokenToUse = refreshToken || this.refreshToken;

    if (!tokenToUse) {
      throw new Error("No refresh token available");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenToUse}`,
        },
        credentials: "include", // Include cookies in request/response
        body: JSON.stringify({ team_id: teamId }),
      });

      if (!response.ok) {
        // If refresh fails, clear tokens and redirect to login

        throw new Error("Token refresh failed");
      }

      const authResponse: AuthResponse = await response.json();

      return authResponse;
    } catch (error) {
      console.error("Token refresh error:", error);

      throw error;
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(access_token?: string): Promise<UserInfo> {
    if (!this.accessToken) {
      throw new Error("No access token available");
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken || access_token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Try to refresh the token
          await this.refreshAccessToken();
          return this.getCurrentUser(); // Retry with new token
        }
        throw new Error("Failed to get user info");
      }

      return await response.json();
    } catch (error) {
      console.error("Get current user error:", error);
      throw error;
    }
  }

  /**
   * Logout the user
   */
  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.refreshToken}`,
        },
        credentials: "include", // Include cookies so backend can clear them
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }
}

// Export a singleton instance
export const authService = new AuthService();
