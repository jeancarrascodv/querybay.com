"use client";

import React from "react";
import { Loader } from "@/components/ui/loader";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  /** True when loading for the first time with no cached data */
  isInitialLoading: boolean;
  /** True when refreshing data in the background (has cached data displayed) */
  isBackgroundRefreshing?: boolean;
  /** True when the data array is empty (after loading completes) */
  isEmpty: boolean;
  /** Message to show when data is empty */
  emptyMessage?: string;
  /** Description text below empty message */
  emptyDescription?: string;
  /** Optional action button for empty state */
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  /** Error message if load failed */
  error?: string | null;
  /** Retry handler for error state */
  onRetry?: () => void;
  /** The content to render when data is available */
  children: React.ReactNode;
  /** Custom className for the container */
  className?: string;
}

/**
 * Unified loading state component that handles:
 * - Initial loading (full spinner)
 * - Background refresh (subtle indicator)
 * - Empty state
 * - Error state with retry
 * - Content display
 */
export function LoadingState({
  isInitialLoading,
  isBackgroundRefreshing = false,
  isEmpty,
  emptyMessage = "No data found",
  emptyDescription,
  emptyAction,
  error,
  onRetry,
  children,
  className,
}: LoadingStateProps) {
  // Initial loading - show full loader
  if (isInitialLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full min-h-[200px]", className)}>
        <Loader />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full min-h-[200px] text-destructive", className)}>
        <p className="text-lg font-semibold mb-2">Error Loading Data</p>
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            Retry
          </Button>
        )}
      </div>
    );
  }

  // Empty state (after loading completes with no data)
  if (isEmpty && !isBackgroundRefreshing) {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full min-h-[200px] text-muted-foreground", className)}>
        <p className="text-lg mb-2">{emptyMessage}</p>
        {emptyDescription && (
          <p className="text-sm mb-4">{emptyDescription}</p>
        )}
        {emptyAction && (
          <Button onClick={emptyAction.onClick} className="mt-4">
            {emptyAction.label}
          </Button>
        )}
      </div>
    );
  }

  // Has data - render children directly (no wrapper to preserve flex layout)
  return <>{children}</>;
}

/**
 * Background refresh indicator - subtle indicator shown during background refresh
 * Can be placed in a header or toolbar
 */
export function BackgroundRefreshIndicator({
  isRefreshing,
  className,
}: {
  isRefreshing: boolean;
  className?: string;
}) {
  if (!isRefreshing) return null;

  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <RefreshCw className="h-3 w-3 animate-spin" />
      <span>Refreshing...</span>
    </div>
  );
}
