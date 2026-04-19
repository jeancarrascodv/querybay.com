"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

function RefreshingContent() {
  const router = useRouter();
  const returnUrl = "/integrations";
  const { user, refreshToken, logout } = useAuth();
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    async function refreshAccessToken() {
      if (refreshed) return;
      if (!user) return;
      try {
        // Use the refreshToken method from AuthContext
        await refreshToken();
        setRefreshed(true);

        // Navigate after successful refresh
        window.location.href = returnUrl
          ? `${window.location.origin}${returnUrl.startsWith("/") ? returnUrl : "/" + returnUrl}`
          : `${window.location.origin}/teams`;
      } catch (error) {
        console.error("Error refreshing access token", error);
        logout();
      }
    }

    // Wait a moment before attempting refresh to ensure cookies are set
    if (user && !refreshed) {
      refreshAccessToken();
    }
  }, [returnUrl, user, refreshed, refreshToken, logout]);
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0f172a]">
      <p className="mt-4 text-white text-lg">Refreshing your session...</p>
      <p className="mt-2 text-gray-400 text-sm">Please wait a moment</p>
    </div>
  );
}

export default function RefreshingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0f172a]">
          <p className="mt-4 text-white text-lg">Loading...</p>
        </div>
      }
    >
      <RefreshingContent />
    </Suspense>
  );
}
