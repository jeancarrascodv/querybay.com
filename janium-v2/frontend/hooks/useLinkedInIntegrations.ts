import { useMutation, useQuery } from "@apollo/client";
import { useCallback } from "react";
import {
  Mutations,
  LINKEDIN_INTEGRATIONS_QUERY,
  LINKEDIN_ACTIONS_QUERY,
} from "@/graphql/team";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamStore } from "@/store/useTeamStore";

// ============================================================================
// LinkedIn Integration Types
// ============================================================================

export interface WeeklyRestrictions {
  monday?: { startTime: string; endTime: string };
  tuesday?: { startTime: string; endTime: string };
  wednesday?: { startTime: string; endTime: string };
  thursday?: { startTime: string; endTime: string };
  friday?: { startTime: string; endTime: string };
  saturday?: { startTime: string; endTime: string };
  sunday?: { startTime: string; endTime: string };
}

export interface LinkedInIntegration {
  id: string;
  primaryUserId: string;
  teamId: string;
  linkedinProfileUrl: string;
  fullName: string;
  maxPendingConnectionRequests: number;
  maxConnectionRequestsPerWeek: number;
  maxConnectionRequestsPerDay: number;
  dailyConnectionRequestsVariationPct: number;
  minimumDelayBetweenConnectionRequestsMs: number;
  weeklyRestrictions: WeeklyRestrictions;
  warmupEnabled: boolean;
  warmupPeriodDays?: number;
  warmupStartingConnectionRequestsPerDay?: number;
  maxConsecutiveErrors?: number;
  todayMaxConnectionRequests: number;
  todayExecutableWindowStart: string;
  todayExecutableWindowEnd: string;
  todayOptionsUpdated: string;
  connections: number;
  loginActiveLastValidated?: string;
  salesNavigatorActiveLastValidated?: string;
  proxyUrl?: string;
  timezone?: string;
}

// ============================================================================
// LinkedIn Action Types
// ============================================================================

export type LinkedInActionType =
  | "SCRAPE_SALES_NAV_QUERY"
  | "SEND_CONNECTION_REQUEST"
  | "SYNC_CONNECTIONS"
  | "DOWNLOAD_INBOX";

export type LinkedInActionRequestStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED";

export interface LinkedInAction {
  // SendConnectionRequest
  profileUrl?: string;
  message?: string;
  // ScrapeSalesNavQuery
  salesNavigatorUrl?: string;
  contactListId?: string;
  // SyncConnections
  fullSync?: boolean;
}

export interface ActionContact {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  liSalesNavProfileId?: string;
  liProfileHandle?: string;
}

export interface ActionCampaign {
  get?: {
    id: string;
    name: string;
  };
}

export interface ActionCampaignStep {
  id: string;
  stepData?: {
    __typename: string;
  };
}

export interface LinkedInActionRequest {
  id: string;
  actionType: LinkedInActionType;
  action: LinkedInAction;
  teamId: string;
  linkedinId: string;
  campaignId?: string;
  campaignStepId?: string;
  contactId?: string;
  expiresAt: string;
  priority: number;
  nextAttemptAt: string;
  lastAttemptStatus: LinkedInActionRequestStatus;
  attempts: number;
  contact?: ActionContact;
  linkedIn?: {
    get?: {
      id: string;
      fullName: string;
    };
  };
  campaign?: ActionCampaign;
  campaignStep?: ActionCampaignStep;
}

export interface LinkedInActionHistory {
  id: string;
  actionType: LinkedInActionType;
  action: LinkedInAction;
  teamId: string;
  linkedinId: string;
  campaignId?: string;
  campaignStepId?: string;
  contactId?: string;
  priority: number;
  startedAt: string;
  completedAt: string;
  attempts: number;
  description?: string;
  contact?: ActionContact;
  linkedIn?: {
    get?: {
      id: string;
      fullName: string;
    };
  };
  campaign?: ActionCampaign;
  campaignStep?: ActionCampaignStep;
}

export interface LinkedInActionFailure {
  id: string;
  actionType: LinkedInActionType;
  action: LinkedInAction;
  teamId: string;
  linkedinId: string;
  campaignId?: string;
  campaignStepId?: string;
  contactId?: string;
  priority: number;
  failedAt: string;
  linkedIn?: {
    get?: {
      id: string;
      fullName: string;
    };
  };
  attempts: number;
  error: string;
  hasHtml: boolean;
  hasScreenshot: boolean;
  description?: string;
  contact?: ActionContact;
  campaign?: ActionCampaign;
  campaignStep?: ActionCampaignStep;
}

export interface CreateLinkedInInput {
  primaryUserId?: string;
  linkedinProfileUrl: string;
  fullName: string;
  maxPendingConnectionRequests: number;
  maxConnectionRequestsPerWeek: number;
  maxConnectionRequestsPerDay: number;
  dailyConnectionRequestsVariationPct: number;
  maxConsecutiveErrors?: number;
  minimumDelayBetweenConnectionRequestsMs: number;
  weeklyRestrictions: {
    sunday?: { startTime: string; endTime: string };
    monday?: { startTime: string; endTime: string };
    tuesday?: { startTime: string; endTime: string };
    wednesday?: { startTime: string; endTime: string };
    thursday?: { startTime: string; endTime: string };
    friday?: { startTime: string; endTime: string };
    saturday?: { startTime: string; endTime: string };
  };
  warmupEnabled: boolean;
  warmupPeriodDays?: number;
  warmupStartingConnectionRequestsPerDay?: number;
  proxyUrl?: string;
}

export interface UpdateLinkedInInput {
  primaryUserId?: string;
  maxPendingConnectionRequests?: number;
  maxConnectionRequestsPerWeek?: number;
  maxConnectionRequestsPerDay?: number;
  dailyConnectionRequestsVariationPct?: number;
  minimumDelayBetweenConnectionRequestsMs?: number;
  weeklyRestrictions?: {
    sunday?: { startTime: string; endTime: string };
    monday?: { startTime: string; endTime: string };
    tuesday?: { startTime: string; endTime: string };
    wednesday?: { startTime: string; endTime: string };
    thursday?: { startTime: string; endTime: string };
    friday?: { startTime: string; endTime: string };
    saturday?: { startTime: string; endTime: string };
  } | null;
  warmupEnabled?: boolean;
  warmupPeriodDays?: number;
  warmupStartingConnectionRequestsPerDay?: number;
  maxConsecutiveErrors?: number;
  proxyUrl?: string | null;
  todayMaxConnectionRequests?: number;
  todayExecutableWindowStart?: string;
  todayExecutableWindowEnd?: string;
}

export const useLinkedInIntegrations = (skip: boolean = false) => {
  const { isAuthenticated } = useAuth();
  const { currentTeamId, isSwitchingTeam } = useTeamStore();

  // Use LinkedIn integrations query with cache-and-network for regular refresh
  const {
    data,
    loading,
    error,
    refetch: rawRefetch,
  } = useQuery(LINKEDIN_INTEGRATIONS_QUERY, {
    variables: {
      // Include teamId so Apollo refetches when team changes
      _teamId: currentTeamId,
    },
    skip: skip || !isAuthenticated || !currentTeamId || isSwitchingTeam,
    fetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: false,
  });

  // Wrapper function that always uses network-only for fresh data
  const refetchIntegrations = useCallback(async () => {
    return await rawRefetch({
      fetchPolicy: "network-only",
    });
  }, [rawRefetch]);

  // Mutation to create LinkedIn integration
  const [createLinkedInMutation, { loading: creating }] = useMutation(
    Mutations.CREATE_LINKEDIN,
    {
      onCompleted: () => {
        // Use network-only to bypass cache and get fresh data after mutation
        refetchIntegrations();
      },
    },
  );

  // Mutation to update LinkedIn integration
  const [updateLinkedInMutation, { loading: updating }] = useMutation(
    Mutations.UPDATE_LINKEDIN,
    {
      onCompleted: () => {
        // Use network-only to bypass cache and get fresh data after mutation
        refetchIntegrations();
      },
    },
  );

  // Mutation to start LinkedIn browser
  const [startBrowserMutation, { loading: startingBrowser }] = useMutation(
    Mutations.START_LINKEDIN_BROWSER,
  );
  const [stopBrowserMutation, { loading: stoppingBrowser }] = useMutation(
    Mutations.STOP_LINKEDIN_BROWSER,
  );
  const [stopContainerMutation, { loading: stoppingContainer }] = useMutation(
    Mutations.STOP_LINKEDIN_CONTAINER,
  );
  const [cleanContainerMutation, { loading: cleaningContainer }] = useMutation(
    Mutations.CLEAN_LINKEDIN_CONTAINER,
  );
  const [createContactListMutation, { loading: creatingContactList }] =
    useMutation(Mutations.CREATE_LINKEDIN_CONTACT_LIST);
  const [syncConnectionsMutation, { loading: syncingConnections }] =
    useMutation(Mutations.SYNC_CONNECTIONS);

  const createLinkedIn = async (linkedin: CreateLinkedInInput) => {
    try {
      const result = await createLinkedInMutation({
        variables: {
          linkedin,
        },
      });
      console.log("Created LinkedIn integration:", result);
      return result.data?.team?.createLinkedin;
    } catch (err) {
      console.error("Error creating LinkedIn integration:", err);
      throw err;
    }
  };

  const updateLinkedIn = async (
    linkedInId: string,
    mutation: UpdateLinkedInInput,
  ) => {
    try {
      console.log("Updating LinkedIn integration:", linkedInId, mutation);
      const result = await updateLinkedInMutation({
        variables: {
          linkedInId,
          mutation,
        },
      });
      console.log("Updated LinkedIn integration:", result);
      return result.data?.team?.linkedin?.modify;
    } catch (err) {
      console.error("Error updating LinkedIn integration:", err);
      throw err;
    }
  };

  const startBrowser = async (linkedInId: string) => {
    try {
      const result = await startBrowserMutation({
        variables: {
          linkedInId,
        },
      });
      return result.data?.team?.linkedin?.startBrowser;
    } catch (err) {
      console.error("Error starting LinkedIn browser:", err);
      throw err;
    }
  };
  const stopBrowser = async (linkedInId: string) => {
    try {
      const result = await stopBrowserMutation({
        variables: {
          linkedInId,
        },
      });
      return result.data?.team?.linkedin?.stopBrowser;
    } catch (err) {
      console.error("Error stopping LinkedIn browser:", err);
      throw err;
    }
  };

  const stopContainer = async (linkedInId: string) => {
    try {
      const result = await stopContainerMutation({
        variables: {
          linkedInId,
        },
      });
      return result.data?.team?.linkedin?.stopContainer;
    } catch (err) {
      console.error("Error stopping LinkedIn container:", err);
      throw err;
    }
  };

  const cleanContainer = async (linkedInId: string) => {
    try {
      const result = await cleanContainerMutation({
        variables: {
          linkedInId,
        },
      });
      return result.data?.team?.linkedin?.cleanContainer;
    } catch (err) {
      console.error("Error cleaning LinkedIn container:", err);
      throw err;
    }
  };

  const createContactList = async (
    linkedInId: string,
    listName: string,
    salesNavQuery: string,
  ) => {
    try {
      const result = await createContactListMutation({
        variables: {
          linkedInId,
          listName,
          salesNavQuery,
        },
      });
      return result.data?.team?.linkedin?.createContactList;
    } catch (err) {
      console.error("Error creating LinkedIn contact list:", err);
      throw err;
    }
  };

  const syncConnections = async (
    linkedInId: string,
    fullSync: boolean = false,
  ) => {
    try {
      const result = await syncConnectionsMutation({
        variables: {
          linkedInId,
          fullSync,
        },
      });
      return result.data?.team?.linkedin?.syncConnections;
    } catch (err) {
      console.error("Error syncing LinkedIn connections:", err);
      throw err;
    }
  };

  const integrations: LinkedInIntegration[] =
    data?.team?.linkedInIntegrations?.map((item: any) => item.get) || [];

  const teamWeeklyRestrictions: WeeklyRestrictions | null =
    data?.team?.get?.allowedMessagingDayTimes || null;

  return {
    integrations,
    teamWeeklyRestrictions,
    loading,
    error,
    creating,
    updating,
    startingBrowser,
    stoppingBrowser,
    stoppingContainer,
    cleaningContainer,
    creatingContactList,
    syncingConnections,
    createLinkedIn,
    updateLinkedIn,
    startBrowser,
    stopBrowser,
    stopContainer,
    cleanContainer,
    createContactList,
    syncConnections,
    refetchIntegrations,
  };
};

// ============================================================================
// useLinkedInActions Hook
// ============================================================================
// Hook to fetch action requests, history, and failures for LinkedIn integrations

interface LinkedInWithActions {
  id: string;
  fullName: string;
  email: string;
  actionRequests: LinkedInActionRequest[];
  actionRequestHistory: LinkedInActionHistory[];
  actionRequestFailures: LinkedInActionFailure[];
}

export const useLinkedInActions = (
  linkedInId?: string | null,
  historyLimit: number = 50,
) => {
  const { isAuthenticated } = useAuth();
  const { currentTeamId, isSwitchingTeam } = useTeamStore();

  const { data, loading, error, refetch } = useQuery(LINKEDIN_ACTIONS_QUERY, {
    variables: {
      historyLimit,
      // Include teamId so Apollo refetches when team changes
      _teamId: currentTeamId,
    },
    skip: !isAuthenticated || !currentTeamId || isSwitchingTeam,
    fetchPolicy: "cache-and-network",
  });

  // Parse all integrations with their action data
  const allIntegrations: LinkedInWithActions[] = (
    data?.team?.linkedInIntegrations || []
  ).map((integration: any) => ({
    id: integration.get?.id,
    fullName: integration.get?.fullName,
    email: integration.get?.email,
    actionRequests: integration.actionRequests || [],
    actionRequestHistory: integration.actionRequestHistory || [],
    actionRequestFailures: integration.actionRequestFailures || [],
  }));

  // Filter by linkedInId if provided, otherwise aggregate all
  let actionRequests: LinkedInActionRequest[] = [];
  let actionRequestHistory: LinkedInActionHistory[] = [];
  let actionRequestFailures: LinkedInActionFailure[] = [];

  if (linkedInId) {
    const selectedIntegration = allIntegrations.find(
      (i) => i.id === linkedInId,
    );
    if (selectedIntegration) {
      actionRequests = selectedIntegration.actionRequests;
      actionRequestHistory = selectedIntegration.actionRequestHistory;
      actionRequestFailures = selectedIntegration.actionRequestFailures;
    }
  } else {
    // Aggregate from all integrations
    allIntegrations.forEach((integration) => {
      actionRequests.push(...integration.actionRequests);
      actionRequestHistory.push(...integration.actionRequestHistory);
      actionRequestFailures.push(...integration.actionRequestFailures);
    });
  }

  return {
    allIntegrations,
    actionRequests,
    actionRequestHistory,
    actionRequestFailures,
    loading,
    error,
    refetch,
  };
};
