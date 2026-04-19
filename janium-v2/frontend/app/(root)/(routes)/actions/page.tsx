"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ExternalLink,
  RotateCcw,
  Linkedin,
  UserCircle,
  Search,
} from "lucide-react";
import {
  LoadingState,
  BackgroundRefreshIndicator,
} from "@/components/ui/loading-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useLinkedInActions,
  LinkedInActionRequest,
  LinkedInActionHistory,
  LinkedInActionFailure,
  LinkedInActionType,
  useLinkedInIntegrations,
} from "@/hooks/useLinkedInIntegrations";
import { authClient } from "@/lib/auth-client";
import { useContactsStore, ContactList } from "@/store/useContactsStore";
import { useTeamStore } from "@/store/useTeamStore";
import { useApolloClient, useMutation } from "@apollo/client";
import { Mutations, LINKEDIN_ACTIONS_QUERY } from "@/graphql/team";
import { LogsViewer } from "@/components/logs-viewer";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

// Helper to format action type for display
const formatActionType = (actionType: LinkedInActionType): string => {
  switch (actionType) {
    case "SEND_CONNECTION_REQUEST":
      return "Connection Request";
    case "SCRAPE_SALES_NAV_QUERY":
      return "Import Sales Nav Search";
    case "SYNC_CONNECTIONS":
      return "Sync Connections";
    default:
      return actionType;
  }
};

// Helper to get action name/label
const getActionName = (
  action: LinkedInActionRequest | LinkedInActionHistory | LinkedInActionFailure,
  contactLists?: ContactList[],
): string => {
  // if (action.linkedinId && integrations) {
  //   return (
  //     integrations?.find((integration) => integration.id === action.linkedinId)
  //       ?.fullName || "Unknown"
  //   );
  // }
  if (action.linkedIn?.get?.fullName) {
    return action.linkedIn.get.fullName;
  }
  if (action.action.profileUrl) {
    // Extract name from LinkedIn profile URL
    const urlParts = action.action.profileUrl.split("/");
    const profileSlug =
      urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
    return profileSlug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  }
  if (action.action.salesNavigatorUrl) {
    // Look up contact list name if available
    if (action.action.contactListId && contactLists) {
      const list = contactLists.find(
        (l) => l.id === action.action.contactListId,
      );
      if (list?.name) {
        return list.name;
      }
    }
    return "Sales Navigator Import";
  }
  if (action.action.fullSync !== undefined) {
    return action.action.fullSync ? "Full Sync" : "Partial Sync";
  }
  return "Unknown Action";
};

// Helper to get LinkedIn URL from action
const getLinkedInUrl = (
  action: LinkedInActionRequest | LinkedInActionHistory | LinkedInActionFailure,
): string => {
  return action.action.profileUrl || action.action.salesNavigatorUrl || "#";
};

// Helper to format campaign step type for display
const formatCampaignStepType = (
  action: LinkedInActionRequest | LinkedInActionHistory | LinkedInActionFailure,
): string => {
  const stepTypeName = action.campaignStep?.stepData?.__typename;
  if (!stepTypeName) return "-";

  switch (stepTypeName) {
    case "SendLinkedInConnectionRequest":
      return "Send Connection Request";
    case "SendLinkedInMessage":
      return "Send Message";
    case "SendEmail":
      return "Send Email";
    default:
      return stepTypeName;
  }
};

// Action Details Popup Component
interface ActionDetailsPopupProps {
  failure: LinkedInActionFailure | null;
  linkedinId: string | null;
  actionId: string | null;
  actionType: string;
  actionName: string;
  status: "Success" | "Error";
  date: string;
  description: string;
  linkedInAccountName?: string;
  connectionMessage?: string;
  salesNavUrl?: string;
  open: boolean;
  onClose: () => void;
}

function ActionDetailsPopup({
  failure,
  linkedinId,
  actionId,
  actionType,
  actionName,
  status,
  date,
  description,
  linkedInAccountName,
  connectionMessage,
  salesNavUrl,
  open,
  onClose,
}: ActionDetailsPopupProps) {
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // Load screenshot when popup opens
  useEffect(() => {
    if (!failure || !open || !failure.hasScreenshot) {
      setScreenshotUrl(null);
      setScreenshotError(null);
      return;
    }

    let cancelled = false;

    const loadScreenshot = async () => {
      setScreenshotLoading(true);
      setScreenshotError(null);

      try {
        const response = await fetch(
          process.env.NEXT_PUBLIC_API_URL +
            `/api/v1/linkedin/action/failure/${failure.id}/screenshot`,
          {
            headers: {
              Authorization: `Bearer ${authClient.getAccessToken()}`,
            },
          },
        );
        if (cancelled) return;

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setScreenshotUrl(url);
        } else {
          setScreenshotError("Failed to load screenshot");
        }
      } catch (error) {
        if (!cancelled) {
          setScreenshotError("Failed to load screenshot");
        }
      } finally {
        if (!cancelled) {
          setScreenshotLoading(false);
        }
      }
    };

    loadScreenshot();

    return () => {
      cancelled = true;
      if (screenshotUrl) {
        URL.revokeObjectURL(screenshotUrl);
      }
    };
  }, [failure?.id, open, failure?.hasScreenshot]);

  const handleDownloadHtml = async () => {
    if (!failure || !failure.hasHtml) return;

    try {
      const response = await fetch(
        process.env.NEXT_PUBLIC_API_URL +
          `/api/v1/linkedin/action/failure/${failure.id}/html`,
        {
          headers: {
            Authorization: `Bearer ${authClient.getAccessToken()}`,
          },
        },
      );
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `failure-${failure.id}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Failed to download HTML:", error);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center justify-between mt-2">
            <div className="flex flex-col">
              <DialogTitle>Action Details</DialogTitle>
              <DialogDescription>{actionType}</DialogDescription>
            </div>

            {failure?.hasHtml && (
              <Button variant="outline" onClick={handleDownloadHtml}>
                <Download className="h-4 w-4 mr-2" />
                Download HTML
              </Button>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Status & Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm w-full">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <span
                  className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    status === "Success"
                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                  }`}
                >
                  {status}
                </span>
              </div>
              <div className="col-span-1 flex justify-end">
                <span className="text-muted-foreground">Date:</span>
                <span className="ml-2">{date}</span>
              </div>
              {linkedInAccountName && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    LinkedIn Account:
                  </span>
                  <span className="ml-2 font-medium">
                    {linkedInAccountName}
                  </span>
                </div>
              )}
              {connectionMessage && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    Connection Message:
                  </span>
                  <p className="mt-1 p-2 bg-muted rounded text-sm whitespace-pre-line">
                    {connectionMessage}
                  </p>
                </div>
              )}
              {salesNavUrl && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    Sales Navigator URL:
                  </span>
                  <a
                    href={salesNavUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary hover:underline break-all"
                  >
                    {salesNavUrl}
                  </a>
                </div>
              )}
              {description && description !== "-" && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="ml-2">{description}</span>
                </div>
              )}
              {failure && (
                <div>
                  <span className="text-muted-foreground">Attempts:</span>
                  <span className="ml-2">{failure.attempts}</span>
                </div>
              )}
            </div>

            {/* Error Message (failure only) */}
            {failure && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <h4 className="font-medium text-destructive mb-1">Error</h4>
                <p className="text-sm text-muted-foreground">{failure.error}</p>
              </div>
            )}

            {/* Screenshot (failure only) */}
            {failure?.hasScreenshot && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Screenshot at time of failure
                  </h4>
                  {screenshotUrl && !screenshotLoading && !screenshotError && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsFullscreen(true)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Maximize2 className="h-4 w-4 mr-1" />
                      View Fullscreen
                    </Button>
                  )}
                </div>
                <div className="border rounded-lg overflow-hidden bg-muted">
                  {screenshotLoading ? (
                    <div className="h-64 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : screenshotError ? (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      {screenshotError}
                    </div>
                  ) : screenshotUrl ? (
                    <img
                      src={screenshotUrl}
                      alt="Screenshot at time of failure"
                      className="w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setIsFullscreen(true)}
                    />
                  ) : (
                    <div className="h-64 flex items-center justify-center text-muted-foreground">
                      Loading...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Logs */}
          <LogsViewer
            asModal={false}
            compactFilters
            initialFilters={actionId ? { actionId } : undefined}
            title="Action Logs"
            height="180px"
            defaultShowHistory
          />

          <DialogFooter className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Screenshot Dialog */}
      <Dialog
        open={isFullscreen}
        onOpenChange={(open) => {
          setIsFullscreen(open);
          if (!open) setZoomLevel(1); // Reset zoom when closing
        }}
      >
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden">
          <div className="relative w-full h-[95vh] flex flex-col">
            {/* Controls */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 rounded-full px-4 py-2">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.25, z - 0.25))}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="text-white text-sm min-w-[60px] text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(4, z + 0.25))}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors text-white"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <div className="w-px h-5 bg-white/30 mx-1" />
              <button
                onClick={() => setZoomLevel(1)}
                className="px-2 py-1 rounded hover:bg-white/20 transition-colors text-white text-sm"
              >
                Reset
              </button>
            </div>

            {/* Image container */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
              {screenshotUrl && (
                <img
                  src={screenshotUrl}
                  alt="Screenshot at time of failure (fullscreen)"
                  className="max-w-none"
                  style={{
                    width: `${zoomLevel * 100}%`,
                    height: "auto",
                  }}
                  draggable={false}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ActionsPage() {
  const { toast } = useToast();

  // Selected LinkedIn account
  const [selectedLinkedInId, setSelectedLinkedInId] = useState<string | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [retryingActionId, setRetryingActionId] = useState<string | null>(null);
  const [openingBrowserFor, setOpeningBrowserFor] = useState<string | null>(
    null,
  );
  const apolloClient = useApolloClient();
  const { currentTeamId } = useTeamStore();

  // Fetch actions - this also gives us the integrations list
  const {
    allIntegrations,
    actionRequests,
    actionRequestHistory,
    actionRequestFailures,
    loading: actionsLoading,
    refetch,
  } = useLinkedInActions(selectedLinkedInId, 100);

  // Get contact lists for looking up names
  const { contactLists } = useContactsStore();
  const { startBrowser } = useLinkedInIntegrations();

  // Retry action failure mutation
  const [retryActionFailureMutation] = useMutation(
    Mutations.RETRY_ACTION_FAILURE,
  );

  // Handle manual refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle retry action failure
  const handleRetryAction = async (failure: LinkedInActionFailure) => {
    setRetryingActionId(failure.id);
    try {
      await retryActionFailureMutation({
        variables: {
          linkedInId: failure.linkedinId,
          actionRequestId: failure.id,
        },
      });
      toast({
        title: "Success",
        description: "Action has been queued for retry",
      });
      // Refresh to update the lists
      await refetch();
    } catch (error) {
      console.error("Failed to retry action:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to retry action",
      });
    } finally {
      setRetryingActionId(null);
    }
  };

  // Handle open LinkedIn browser
  const handleOpenBrowser = async (linkedInId: string) => {
    setOpeningBrowserFor(linkedInId);
    try {
      const url = await startBrowser(linkedInId);
      if (url) {
        const newURL = process.env.NEXT_PUBLIC_API_URL + url;
        window.open(newURL, "_blank");
        toast({
          title: "Success",
          description: "LinkedIn browser opened successfully!",
        });
      }
    } catch (error) {
      console.error("Error opening LinkedIn browser:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to open LinkedIn browser",
      });
    } finally {
      setOpeningBrowserFor(null);
    }
  };

  // State for action details popup
  const [selectedFailure, setSelectedFailure] =
    useState<LinkedInActionFailure | null>(null);
  const [actionPopupOpen, setActionPopupOpen] = useState(false);
  const [selectedActionInfo, setSelectedActionInfo] = useState<{
    id: string;
    linkedinId: string;
    actionType: string;
    actionName: string;
    status: "Success" | "Error";
    date: string;
    description: string;
    connectionMessage?: string;
    salesNavUrl?: string;
    linkedInAccountName?: string;
  } | null>(null);

  // State for retry confirmation dialog
  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);
  const [failureToRetry, setFailureToRetry] =
    useState<LinkedInActionFailure | null>(null);

  // Pagination
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [finishedPage, setFinishedPage] = useState(1);
  const itemsPerPage = 100;

  // Filters
  const [upcomingActionTypeFilter, setUpcomingActionTypeFilter] =
    useState<string>("all");
  const [finishedActionTypeFilter, setFinishedActionTypeFilter] =
    useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Track if this is initial load vs background refresh
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if we have cached data in Apollo
  const hasCachedData = useMemo(() => {
    try {
      const cacheData = apolloClient.readQuery({
        query: LINKEDIN_ACTIONS_QUERY,
        variables: { historyLimit: 100, _teamId: currentTeamId },
      });
      return !!cacheData?.team?.linkedInIntegrations;
    } catch {
      return false;
    }
  }, [apolloClient, currentTeamId]);

  // Track when data has loaded at least once
  useEffect(() => {
    if (!actionsLoading && !hasLoadedOnce) {
      setHasLoadedOnce(true);
    }
  }, [actionsLoading, hasLoadedOnce]);

  // Show initial loading only if no cached data and still loading
  const isInitialLoading = actionsLoading && !hasLoadedOnce && !hasCachedData;
  const isBackgroundRefreshing =
    actionsLoading && (hasLoadedOnce || hasCachedData);

  // Auto-refresh every 30 seconds when no popups are open (actions can change externally)
  // useEffect(() => {
  //   // Clear any existing interval
  //   if (refreshIntervalRef.current) {
  //     clearInterval(refreshIntervalRef.current);
  //   }

  //   // Only set up interval if no dialogs are open
  //   if (!actionPopupOpen && !retryConfirmOpen) {
  //     refreshIntervalRef.current = setInterval(() => {
  //       if (!isRefreshing && hasLoadedOnce) {
  //         refetch();
  //       }
  //     }, 30000);
  //   }

  //   return () => {
  //     if (refreshIntervalRef.current) {
  //       clearInterval(refreshIntervalRef.current);
  //     }
  //   };
  // }, [
  //   actionPopupOpen,
  //   retryConfirmOpen,
  //   isRefreshing,
  //   hasLoadedOnce,
  //   refetch,
  // ]);

  // Open retry confirmation dialog
  const handleRetryClick = (failure: LinkedInActionFailure) => {
    setFailureToRetry(failure);
    setRetryConfirmOpen(true);
  };

  // Confirm retry
  const confirmRetry = async () => {
    if (failureToRetry) {
      setRetryConfirmOpen(false);
      await handleRetryAction(failureToRetry);
      setFailureToRetry(null);
    }
  };

  // Map action requests to display format
  const upcomingActions = useMemo(() => {
    return actionRequests.map((request, index) => ({
      id: request.id,
      actionType: request.actionType,
      name: getActionName(request, contactLists),
      linkedinUrl: getLinkedInUrl(request),
      placeInQueue:
        request.lastAttemptStatus === "IN_PROGRESS"
          ? ("In Progress" as const)
          : index + 1,
      status:
        request.lastAttemptStatus === "IN_PROGRESS"
          ? ("in-progress" as const)
          : ("pending" as const),
      contactName:
        request.contact?.fullName || request.contact?.firstName || "-",
      contactId: request.contact?.id,
      liProfileHandle: request.contact?.liProfileHandle,
      liSalesNavProfileId: request.contact?.liSalesNavProfileId,
      campaignName: request.campaign?.get?.name || "-",
      campaignStepName: formatCampaignStepType(request),

      campaignId: request.campaignId,
      salesNavigatorSearchId: request.action.salesNavigatorUrl,
      linkedinId: request.linkedinId,
      nextAttemptAt: request.nextAttemptAt,
      connectionMessage: request.action.message,
      salesNavUrl: request.action.salesNavigatorUrl,
      linkedInAccountName: request.linkedIn?.get?.fullName,
    }));
  }, [actionRequests, contactLists]);

  // Map history and failures to display format
  const finishedActions = useMemo(() => {
    const completed = actionRequestHistory.map((history) => ({
      id: history.id,
      rawActionType: history.actionType,
      actionType: formatActionType(history.actionType),
      name: getActionName(history, contactLists),
      linkedinUrl: getLinkedInUrl(history),
      status: "Success" as const,
      date: new Date(history.completedAt).toLocaleString(),
      failure: null as LinkedInActionFailure | null,
      description: history.description || "-",
      contactName:
        history.contact?.fullName || history.contact?.firstName || "-",
      contactId: history.contact?.id,
      liProfileHandle: history.contact?.liProfileHandle,
      liSalesNavProfileId: history.contact?.liSalesNavProfileId,
      campaignName: history.campaign?.get?.name || "-",
      campaignStepName: formatCampaignStepType(history),
      campaignId: history.campaignId,
      linkedinId: history.linkedinId,
      connectionMessage: history.action.message,
      salesNavUrl: history.action.salesNavigatorUrl,
      linkedInAccountName: history.linkedIn?.get?.fullName,
    }));

    const failed = actionRequestFailures.map((failure) => ({
      id: failure.id,
      rawActionType: failure.actionType,
      actionType: formatActionType(failure.actionType),
      name: getActionName(failure, contactLists),
      linkedinUrl: getLinkedInUrl(failure),
      status: "Error" as const,
      date: new Date(failure.failedAt).toLocaleString(),
      failure: failure,
      description: failure.description || "-",
      contactName:
        failure.contact?.fullName || failure.contact?.firstName || "-",
      contactId: failure.contact?.id,
      liProfileHandle: failure.contact?.liProfileHandle,
      liSalesNavProfileId: failure.contact?.liSalesNavProfileId,
      campaignName: failure.campaign?.get?.name || "-",
      campaignStepName: formatCampaignStepType(failure),
      campaignId: failure.campaignId,
      linkedinId: failure.linkedinId,
      connectionMessage: failure.action.message,
      salesNavUrl: failure.action.salesNavigatorUrl,
      linkedInAccountName: failure.linkedIn?.get?.fullName,
    }));

    // Sort by date, most recent first
    return [...completed, ...failed].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [actionRequestHistory, actionRequestFailures, contactLists]);

  // Get unique action types for filters
  const actionTypes = useMemo(() => {
    const types = new Set([
      ...upcomingActions.map((a) => a.actionType),
      ...finishedActions.map((a) => a.actionType),
    ]);
    return Array.from(types);
  }, [upcomingActions, finishedActions]);

  // Filter upcoming actions
  const filteredUpcomingActions = upcomingActions.filter((action) => {
    if (
      upcomingActionTypeFilter !== "all" &&
      action.actionType !== upcomingActionTypeFilter
    )
      return false;
    return true;
  });

  // Filter finished actions
  const filteredFinishedActions = finishedActions.filter((action) => {
    if (statusFilter !== "all" && action.status !== statusFilter) return false;
    if (
      finishedActionTypeFilter !== "all" &&
      action.actionType !== finishedActionTypeFilter
    )
      return false;
    return true;
  });

  // Pagination calculations
  const upcomingTotalPages = Math.ceil(
    filteredUpcomingActions.length / itemsPerPage,
  );
  const finishedTotalPages = Math.ceil(
    filteredFinishedActions.length / itemsPerPage,
  );
  const upcomingPaginatedActions = filteredUpcomingActions.slice(
    (upcomingPage - 1) * itemsPerPage,
    upcomingPage * itemsPerPage,
  );
  const finishedPaginatedActions = filteredFinishedActions.slice(
    (finishedPage - 1) * itemsPerPage,
    finishedPage * itemsPerPage,
  );

  const upcomingStart = (upcomingPage - 1) * itemsPerPage + 1;
  const upcomingEnd = Math.min(
    upcomingPage * itemsPerPage,
    filteredUpcomingActions.length,
  );
  const finishedStart = (finishedPage - 1) * itemsPerPage + 1;
  const finishedEnd = Math.min(
    finishedPage * itemsPerPage,
    filteredFinishedActions.length,
  );

  const handleRowClick = (action: (typeof finishedActions)[number]) => {
    setSelectedActionInfo({
      id: action.id,
      linkedinId: action.linkedinId,
      actionType: action.actionType,
      actionName:
        action.status === "Error"
          ? getActionName(action.failure!, contactLists)
          : action.name,
      status: action.status,
      date: action.date,
      description: action.description,
      connectionMessage: action.connectionMessage,
      salesNavUrl: action.salesNavUrl,
      linkedInAccountName: action.linkedInAccountName,
    });
    setSelectedFailure(action.failure);
    setActionPopupOpen(true);
  };

  const loading = actionsLoading;
  const hasData =
    actionRequests.length > 0 ||
    actionRequestHistory.length > 0 ||
    actionRequestFailures.length > 0;

  return (
    <div className="flex flex-col h-full m-8 mt-5">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Actions</h1>
            <BackgroundRefreshIndicator isRefreshing={isBackgroundRefreshing} />
          </div>
          <p className="text-muted-foreground">
            Manage your automated actions and workflows
          </p>
        </div>
      </div>

      <LoadingState
        isInitialLoading={isInitialLoading}
        isBackgroundRefreshing={isBackgroundRefreshing}
        isEmpty={!hasData}
        emptyMessage="No actions yet"
        emptyDescription="Actions will appear here when campaigns start running"
      >
        <Tabs defaultValue="finished" className="w-full">
          {/* All controls - wrap on small screens */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <TabsList>
                <TabsTrigger value="finished">
                  Finished / Error ({filteredFinishedActions.length})
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming / In Progress ({filteredUpcomingActions.length})
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-3">
                {/* LinkedIn Account Selector */}
                {allIntegrations.length > 1 && (
                  <Select
                    value={selectedLinkedInId || "all"}
                    onValueChange={(value) =>
                      setSelectedLinkedInId(value === "all" ? null : value)
                    }
                  >
                    <SelectTrigger className="w-[200px] text-sm">
                      <SelectValue placeholder="All Accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Accounts</SelectItem>
                      {allIntegrations.map((integration) => (
                        <SelectItem key={integration.id} value={integration.id}>
                          {integration.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Success">Success</SelectItem>
                  <SelectItem value="Error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={finishedActionTypeFilter}
                onValueChange={setFinishedActionTypeFilter}
              >
                <SelectTrigger className="w-[180px] text-sm">
                  <SelectValue placeholder="Action Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {actionTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || loading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`}
                />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground mr-4">
                Showing {filteredFinishedActions.length > 0 ? finishedStart : 0}
                -{finishedEnd} of {filteredFinishedActions.length}
              </span>
              <button
                onClick={() => setFinishedPage((p) => Math.max(1, p - 1))}
                disabled={finishedPage === 1}
                className="flex items-center justify-center w-9 h-9 rounded bg-muted border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center justify-center w-9 h-9 rounded bg-accent border font-medium">
                {finishedPage}
              </div>
              <button
                onClick={() =>
                  setFinishedPage((p) => Math.min(finishedTotalPages, p + 1))
                }
                disabled={finishedPage >= finishedTotalPages}
                className="flex items-center justify-center w-9 h-9 rounded bg-muted border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <TabsContent value="upcoming" className="mt-0">
            <div className="flex flex-col h-[calc(100vh-260px)]">
              <div className="flex-1 overflow-hidden border rounded-xl">
                <div className="h-full overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted z-10 border-b">
                      <tr>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Action Type
                        </th>
                        <th className="text-left p-4 font-medium text-sm w-[250px] min-w-[250px] max-w-[250px]">
                          Name
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Account
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Campaign
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Campaign Step
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Scheduled For
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Place in Queue
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingPaginatedActions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="text-center py-12 text-muted-foreground"
                          >
                            No upcoming actions
                          </td>
                        </tr>
                      ) : (
                        upcomingPaginatedActions.map((action) => (
                          <tr
                            key={action.id}
                            className={`border-b hover:bg-muted/50 transition-colors h-[50px] group/row cursor-pointer ${
                              action.status === "in-progress"
                                ? "bg-muted/30"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedActionInfo({
                                id: action.id,
                                linkedinId: action.linkedinId,
                                actionType: formatActionType(action.actionType),
                                actionName:
                                  action.contactName !== "-"
                                    ? action.contactName
                                    : action.name,
                                status: "Success",
                                date: action.nextAttemptAt
                                  ? new Date(
                                      action.nextAttemptAt,
                                    ).toLocaleString()
                                  : "-",
                                description:
                                  action.status === "in-progress"
                                    ? "In Progress"
                                    : `Queue position: ${action.placeInQueue}`,
                                connectionMessage: action.connectionMessage,
                                salesNavUrl: action.salesNavUrl,
                                linkedInAccountName: action.linkedInAccountName,
                              });
                              setSelectedFailure(null);
                              setActionPopupOpen(true);
                            }}
                          >
                            <td className="px-4 text-sm leading-5">
                              {formatActionType(action.actionType)}
                            </td>
                            <td className="px-4 text-sm leading-5 w-[250px] min-w-[250px] max-w-[250px] overflow-hidden">
                              {action.actionType ===
                              "SCRAPE_SALES_NAV_QUERY" ? (
                                <a
                                  href={action.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline truncate block"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.name}
                                </a>
                              ) : (
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate min-w-0">
                                    {action.contactName}
                                  </span>
                                  <div className="hidden group-hover/row:flex items-center gap-1 flex-shrink-0">
                                    {action.liProfileHandle && (
                                      <a
                                        href={
                                          "https://www.linkedin.com/in/" +
                                          action.liProfileHandle
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-muted"
                                        title="LinkedIn Profile"
                                      >
                                        <Linkedin className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </a>
                                    )}
                                    {action.liSalesNavProfileId && (
                                      <a
                                        href={`https://www.linkedin.com/sales/lead/${action.liSalesNavProfileId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-muted"
                                        title="Sales Navigator"
                                      >
                                        <Search className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </a>
                                    )}
                                    {action.contactId && (
                                      <Link
                                        href={`/contacts?contactId=${action.contactId}`}
                                        className="p-1 rounded hover:bg-muted"
                                        title="View Contact"
                                      >
                                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <a
                                  href={action.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>{action.linkedInAccountName}</span>
                                </a>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-white bg-transparent hover:bg-secondary h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenBrowser(action.linkedinId);
                                  }}
                                  disabled={
                                    openingBrowserFor === action.linkedinId
                                  }
                                >
                                  {openingBrowserFor === action.linkedinId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      Open
                                      <ExternalLink className="h-3 w-3 ml-1" />
                                    </>
                                  )}
                                </Button>
                              </div>
                            </td>
                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              {action.actionType ===
                              "SCRAPE_SALES_NAV_QUERY" ? (
                                "-"
                              ) : (
                                <a
                                  href={`/campaigns/${action.campaignId}`}
                                  className="text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.campaignName}
                                </a>
                              )}
                            </td>
                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              {action.campaignStepName}
                            </td>
                            <td className="px-4 text-sm  leading-5 text-muted-foreground">
                              {action.nextAttemptAt
                                ? new Date(action.nextAttemptAt).toLocaleString(
                                    "en-US",
                                    {
                                      month: "2-digit",
                                      day: "2-digit",
                                      year: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : "-"}
                            </td>
                            <td className="px-4 text-sm leading-5">
                              {action.placeInQueue === "In Progress" ? (
                                <span className="font-semibold text-primary">
                                  In Progress
                                </span>
                              ) : (
                                action.placeInQueue
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="finished" className="mt-0">
            <div className="flex flex-col h-[calc(100vh-260px)]">
              <div className="flex-1 overflow-hidden border rounded-xl">
                <div className="h-full overflow-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-muted z-10 border-b">
                      <tr>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Action Type
                        </th>
                        <th className="text-left p-4 font-medium text-sm w-[250px] min-w-[250px] max-w-[250px]">
                          Name
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Account
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Campaign
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Campaign Step
                        </th>
                        <th className="text-left p-4 font-medium text-sm w-[100px] min-w-[100px]">
                          Status
                        </th>
                        <th className="text-left p-4 font-medium text-sm whitespace-nowrap">
                          Date
                        </th>
                        <th className="text-center p-4 font-medium text-sm w-[60px] min-w-[60px]">
                          Retry
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {finishedPaginatedActions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={8}
                            className="text-center py-12 text-muted-foreground"
                          >
                            No finished actions
                          </td>
                        </tr>
                      ) : (
                        finishedPaginatedActions.map((action) => (
                          <tr
                            key={action.id}
                            className="border-b hover:bg-muted/50 transition-colors h-[50px] group/row cursor-pointer"
                            onClick={() => handleRowClick(action)}
                          >
                            <td className="px-4 text-sm leading-5">
                              {action.actionType}
                            </td>
                            <td className="px-4 text-sm leading-5 w-[250px] min-w-[250px] max-w-[250px] overflow-hidden">
                              {action.rawActionType ===
                              "SCRAPE_SALES_NAV_QUERY" ? (
                                <a
                                  href={action.linkedinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline truncate block"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.name}
                                </a>
                              ) : (
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="truncate min-w-0">
                                    {action.contactName}
                                  </span>
                                  <div className="hidden group-hover/row:flex items-center gap-1 flex-shrink-0">
                                    {action.liProfileHandle && (
                                      <a
                                        href={
                                          "https://www.linkedin.com/in/" +
                                          action.liProfileHandle
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-muted"
                                        title="LinkedIn Profile"
                                      >
                                        <Linkedin className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </a>
                                    )}
                                    {action.liSalesNavProfileId && (
                                      <a
                                        href={`https://www.linkedin.com/sales/lead/${action.liSalesNavProfileId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-muted"
                                        title="Sales Navigator"
                                      >
                                        <Search className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </a>
                                    )}
                                    {action.contactId && (
                                      <Link
                                        href={`/contacts?contactId=${action.contactId}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1 rounded hover:bg-muted"
                                        title="View Contact"
                                      >
                                        <UserCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                      </Link>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              <a
                                href={action.linkedinUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {action.linkedInAccountName}
                              </a>
                            </td>
                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              {action.rawActionType ===
                              "SCRAPE_SALES_NAV_QUERY" ? (
                                "-"
                              ) : (
                                <a
                                  href={`/campaigns/${action.campaignId}`}
                                  className="text-primary hover:underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {action.campaignName}
                                </a>
                              )}
                            </td>
                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              {action.campaignStepName}
                            </td>
                            <td className="px-4 text-sm leading-5">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                  action.status === "Success"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                }`}
                              >
                                {action.status}
                              </span>
                            </td>
                            <td className="px-4 text-sm leading-5 text-muted-foreground">
                              {action.date}
                            </td>
                            <td className="px-4 text-center">
                              {action.status === "Error" && action.failure && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRetryClick(action.failure!);
                                  }}
                                  disabled={retryingActionId === action.id}
                                >
                                  {retryingActionId === action.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <>
                                      <RotateCcw className="h-3 w-3 mr-1" />
                                    </>
                                  )}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </LoadingState>

      {/* Action Details Popup */}
      <ActionDetailsPopup
        failure={selectedFailure}
        linkedinId={selectedActionInfo?.linkedinId ?? null}
        actionId={selectedActionInfo?.id ?? null}
        actionType={selectedActionInfo?.actionType ?? ""}
        actionName={selectedActionInfo?.actionName ?? ""}
        status={selectedActionInfo?.status ?? "Success"}
        date={selectedActionInfo?.date ?? ""}
        description={selectedActionInfo?.description ?? ""}
        linkedInAccountName={selectedActionInfo?.linkedInAccountName}
        connectionMessage={selectedActionInfo?.connectionMessage}
        salesNavUrl={selectedActionInfo?.salesNavUrl}
        open={actionPopupOpen}
        onClose={() => {
          setActionPopupOpen(false);
          setSelectedFailure(null);
          setSelectedActionInfo(null);
        }}
      />

      {/* Retry Confirmation Dialog */}
      <Dialog open={retryConfirmOpen} onOpenChange={setRetryConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retry Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to retry this action?
              {failureToRetry && (
                <span className="block mt-2 font-medium text-foreground">
                  {formatActionType(failureToRetry.actionType)} -{" "}
                  {getActionName(failureToRetry, contactLists)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRetryConfirmOpen(false);
                setFailureToRetry(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={confirmRetry}>Retry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
