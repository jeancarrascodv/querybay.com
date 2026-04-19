import { useQuery } from "@apollo/client";
import { useMemo } from "react";
import { TEAM_DATA_QUERY } from "@/graphql/team";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamStore } from "@/store/useTeamStore";

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company?: string | null;
  timezone?: string | null;
  defaultTeamId?: string;
}

export interface DayRestriction {
  startTime: string;
  endTime: string;
}

export interface WeeklyRestrictions {
  sunday?: DayRestriction;
  monday?: DayRestriction;
  tuesday?: DayRestriction;
  wednesday?: DayRestriction;
  thursday?: DayRestriction;
  friday?: DayRestriction;
  saturday?: DayRestriction;
}

export interface LinkedInIntegration {
  id: string;
  primaryUserId: string;
  teamId: string;
  email: string;
  linkedinProfileUrl: string;
  fullName: string;
  maxPendingConnectionRequests: number;
  maxConnectionRequestsPerWeek: number;
  dailyConnectionRequestsVariationPct: number;
  minimumDelayBetweenConnectionRequestsMs: number;
  weeklyRestrictions: WeeklyRestrictions;
  warmupEnabled: boolean;
  warmupPeriodDays: number;
  warmupStartingConnectionRequestsPerDay: number;
  maxConsecutiveErrors: number;
  connections: number;
  loginActiveLastValidated?: string;
  salesNavigatorActiveLastValidated?: string;
  proxyUrl?: string;
}

export interface Campaign {
  id: string;
  name: string;
  active: boolean;
  linkedinIds?: string[];
  allowedMessagingDayTimes?: WeeklyRestrictions;
}

export interface ContactList {
  id: string;
  name: string;
}

export interface Invite {
  code: string;
  email: string;
  teamId: string;
  privileges: string;
  createdAt: string;
  createdById: string;
  expiresAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface TeamInfo {
  id: string;
  name: string;
  timeZone: string;
}

export interface Team {
  id: string;
  name: string;
  timeZone: string;
  allowedMessagingDayTimes?: WeeklyRestrictions;
  users: User[];
}

// ============================================================================
// Hook Options
// ============================================================================

export interface UseTeamDataOptions {
  /** Include all teams (for team management pages) */
  includeAllTeams?: boolean;
  /** Include team users in the query */
  includeUsers?: boolean;
  /** Include LinkedIn integrations in the query */
  includeLinkedIn?: boolean;
  /** Include campaigns in the query */
  includeCampaigns?: boolean;
  /** Include contact lists in the query */
  includeContactLists?: boolean;
  /** Include team invites in the query */
  includeInvites?: boolean;
  /** Skip the query entirely */
  skip?: boolean;
}

// ============================================================================
// Hook Return Type
// ============================================================================

export interface UseTeamDataReturn {
  // Team info (always included)
  team: TeamInfo | null;

  // All teams (for team management)
  allTeams: Team[];

  // Conditional data (only present if requested)
  users: User[];
  linkedInIntegrations: LinkedInIntegration[];
  campaigns: Campaign[];
  contactLists: ContactList[];
  invites: Invite[];

  // Query state
  loading: boolean;
  error: Error | undefined;

  // Refetch function
  refetch: () => Promise<any>;
}

// ============================================================================
// Main Hook
// ============================================================================

/**
 * Unified hook to fetch team data with conditional field inclusion.
 *
 * Uses Apollo's @include directive to only fetch the data you need,
 * reducing over-fetching and combining multiple queries into one.
 *
 * @example
 * // Fetch just LinkedIn integrations
 * const { team, linkedInIntegrations, loading } = useTeamData({
 *   includeLinkedIn: true
 * });
 *
 * @example
 * // Fetch users and campaigns
 * const { users, campaigns, loading } = useTeamData({
 *   includeUsers: true,
 *   includeCampaigns: true
 * });
 */
export function useTeamData(
  options: UseTeamDataOptions = {},
): UseTeamDataReturn {
  const { isAuthenticated } = useAuth();
  const { currentTeamId, isSwitchingTeam } = useTeamStore();

  const {
    includeAllTeams = false,
    includeUsers = false,
    includeLinkedIn = false,
    includeCampaigns = false,
    includeContactLists = false,
    includeInvites = false,
    skip = false,
  } = options;

  const { data, loading, error, refetch } = useQuery(TEAM_DATA_QUERY, {
    variables: {
      includeAllTeams,
      includeUsers,
      includeLinkedIn,
      includeCampaigns,
      includeContactLists,
      includeInvites,
      // Include teamId so Apollo refetches when team changes
      _teamId: currentTeamId,
    },
    skip: skip || !isAuthenticated || !currentTeamId || isSwitchingTeam,
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-and-network",
    notifyOnNetworkStatusChange: false,
  });

  // Memoize the parsed data to avoid unnecessary re-renders
  const team: TeamInfo | null = useMemo(() => {
    if (!data?.team?.get) return null;
    return {
      id: data.team.get.id,
      name: data.team.get.name,
      timeZone: data.team.get.timeZone,
    };
  }, [data?.team?.get]);

  const allTeams: Team[] = useMemo(() => {
    return data?.allTeams || [];
  }, [data?.allTeams]);

  const users: User[] = useMemo(() => {
    return data?.team?.get?.users || [];
  }, [data?.team?.get?.users]);

  const linkedInIntegrations: LinkedInIntegration[] = useMemo(() => {
    return data?.team?.linkedInIntegrations?.map((item: any) => item.get) || [];
  }, [data?.team?.linkedInIntegrations]);

  const campaigns: Campaign[] = useMemo(() => {
    return data?.team?.campaigns?.map((item: any) => item.get) || [];
  }, [data?.team?.campaigns]);

  const contactLists: ContactList[] = useMemo(() => {
    return data?.team?.contactLists || [];
  }, [data?.team?.contactLists]);

  const invites: Invite[] = useMemo(() => {
    return data?.team?.invites || [];
  }, [data?.team?.invites]);

  return {
    team,
    allTeams,
    users,
    linkedInIntegrations,
    campaigns,
    contactLists,
    invites,
    loading,
    error,
    refetch,
  };
}

// ============================================================================
// Convenience Hooks (for backward compatibility / simpler usage)
// ============================================================================

/**
 * Fetch just LinkedIn integrations
 */
export function useLinkedInData(skip = false) {
  return useTeamData({ includeLinkedIn: true, skip });
}

/**
 * Fetch just campaigns
 */
export function useCampaignData(skip = false) {
  return useTeamData({ includeCampaigns: true, skip });
}

/**
 * Fetch team users
 */
export function useTeamUsersData(skip = false) {
  return useTeamData({ includeUsers: true, skip });
}

/**
 * Fetch everything (for dashboard/overview pages)
 */
export function useFullTeamData(skip = false) {
  return useTeamData({
    includeUsers: true,
    includeLinkedIn: true,
    includeCampaigns: true,
    includeContactLists: true,
    includeInvites: true,
    skip,
  });
}
