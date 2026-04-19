import { useCallback, useState, useMemo } from "react";
import { useQuery, useMutation, gql, useApolloClient } from "@apollo/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamStore } from "../store/useTeamStore";
import { useContactsStore } from "../store/useContactsStore";
import { useCampaignStore } from "../store/useCampaignStore";
import { Queries, Mutations, TEAMS_QUERY } from "@/graphql/team";
import { refreshTokenWithTeamId } from "@/lib/session";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface User {
  id: string;
  email: string;
  defaultTeamId?: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  company?: string | null;
  timezone?: string | null;
}

export interface Team {
  id: string;
  name: string;
  timeZone: string;
  users: User[];
  allowedMessagingDayTimes?: any;
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

export interface CreateTeamInput {
  name: string;
  timezone: string;
}

export interface MutateTeamInput {
  name?: string;
  timeZone?: string;
  allowedMessagingDayTimes?: any;
}

export interface CreateInviteInput {
  email: string;
  privileges: [string];
}

// ============================================================================
// GraphQL Mutations
// ============================================================================

const MUTATE_TEAM = gql`
  mutation MutateTeam($changes: MutateTeam!) {
    team {
      mutate(changes: $changes) {
        id
        name
        timeZone
        allowedMessagingDayTimes {
          monday {
            startTime
            endTime
          }
          tuesday {
            startTime
            endTime
          }
          wednesday {
            startTime
            endTime
          }
          thursday {
            startTime
            endTime
          }
          friday {
            startTime
            endTime
          }
          saturday {
            startTime
            endTime
          }
          sunday {
            startTime
            endTime
          }
        }
        users {
          id
          email
          firstName
          lastName
          title
        }
      }
    }
  }
`;

// ============================================================================
// Main Hook
// ============================================================================

export interface UseTeamOptions {
  fetchInvites?: boolean;
  fetchUsers?: boolean;
  fetchAllTeams?: boolean;
  fetchDefaultSettings?: boolean;
  fetchTimezones?: boolean;
}

export const useTeam = (teamId?: string, options?: UseTeamOptions) => {
  const { isAuthenticated } = useAuth();
  const apolloClient = useApolloClient();
  const store = useTeamStore();
  const contactsStore = useContactsStore();
  const campaignStore = useCampaignStore();
  const [mutating, setMutating] = useState(false);

  const {
    fetchInvites = false,
    fetchUsers = false,
    fetchAllTeams = false,
    fetchDefaultSettings = false,
    fetchTimezones = false,
  } = options || {};

  // ============================================================================
  // Consolidated Query - replaces GET_TEAMS, GET_TEAM_USERS, GET_TEAM_INVITES
  // ============================================================================

  const {
    data: consolidatedData,
    loading: consolidatedLoading,
    error: consolidatedError,
    refetch: refetchConsolidated,
  } = useQuery(TEAMS_QUERY, {
    variables: {},
    skip: !isAuthenticated || store.isSwitchingTeam,
    fetchPolicy: "cache-first",
    errorPolicy: "all",
    notifyOnNetworkStatusChange: false,
  });

  // Extract data from consolidated response
  const teamsData = { allTeams: consolidatedData?.allTeams || [] };
  const teamUsersData = consolidatedData?.team;
  const invitesData = consolidatedData?.team;
  const teamsLoading = consolidatedLoading;
  const teamsError = consolidatedError;
  const usersLoading = consolidatedLoading;
  const usersError = consolidatedError;
  const invitesLoading = consolidatedLoading;
  const invitesError = consolidatedError;
  const refetchTeams = refetchConsolidated;
  const refetchUsers = refetchConsolidated;
  const refetchInvites = refetchConsolidated;

  // ============================================================================
  // Mutations
  // ============================================================================

  // Create team
  const [createTeamMutation, { loading: creating }] = useMutation(
    Mutations.CREATE_TEAM,
    {
      onCompleted: async (data) => {
        await store.fetchTeams();
        if (data?.createTeam?.id) {
          store.setCurrentTeamId(data.createTeam.id);
          await refreshTokenWithTeamId(data.createTeam.id);
          store.setCurrentTeamName(data.createTeam.name || "");
        }
      },
    },
  );

  // Mutate team
  const [mutateTeamGql] = useMutation(MUTATE_TEAM);

  // Create invite
  const [createInviteMutation, { loading: creatingInvite }] = useMutation(
    Mutations.CREATE_INVITE,
    {
      errorPolicy: "all",
      update: (cache, { data }) => {
        if (data?.team?.createInvite) {
          // Read the current invites from cache
          const existingData: any = cache.readQuery({
            query: Queries.GET_TEAM_INVITES,
            variables: { allTeams: true },
          });

          if (existingData?.team?.invites) {
            // Write the updated invites back to cache
            cache.writeQuery({
              query: Queries.GET_TEAM_INVITES,
              variables: { allTeams: true },
              data: {
                team: {
                  __typename: existingData.team.__typename,
                  id: existingData.team.id,
                  invites: [
                    ...existingData.team.invites,
                    data.team.createInvite,
                  ],
                },
              } as any,
            });
          }
        }
      },
    },
  );

  // Remove invite
  const [removeInviteMutation, { loading: removingInvite }] = useMutation(
    Mutations.REMOVE_INVITE,
    {
      errorPolicy: "all",
      update: (cache, { data }, { variables }) => {
        if (data?.team?.removeInvite && variables?.code) {
          // Read the current invites from cache
          const existingData: any = cache.readQuery({
            query: Queries.GET_TEAM_INVITES,
            variables: { allTeams: true },
          });

          if (existingData?.team?.invites) {
            // Write the updated invites back to cache (without the removed invite)
            cache.writeQuery({
              query: Queries.GET_TEAM_INVITES,
              variables: { allTeams: true },
              data: {
                team: {
                  __typename: existingData.team.__typename,
                  id: existingData.team.id,
                  invites: existingData.team.invites.filter(
                    (invite: Invite) => invite.code !== variables.code,
                  ),
                },
              } as any,
            });
          }
        }
      },
    },
  );

  // ============================================================================
  // Memoized Data
  // ============================================================================

  const teams: Team[] = useMemo(() => {
    return teamsData?.allTeams || [];
  }, [teamsData?.allTeams]);

  const users: User[] = useMemo(() => {
    return teamUsersData?.team?.get?.users || [];
  }, [teamUsersData?.team?.get?.users]);

  const teamInfo = useMemo(() => {
    return teamUsersData?.team?.get
      ? {
          id: teamUsersData.team.get.id,
          name: teamUsersData.team.get.name,
          timeZone: teamUsersData.team.get.timeZone,
        }
      : null;
  }, [teamUsersData?.team?.get]);

  const invites: Invite[] = useMemo(() => {
    return invitesData?.team?.invites || [];
  }, [invitesData?.team?.invites]);

  const filteredError = useMemo(() => {
    if (teamsError && teamsError.message?.toLowerCase().includes("abort")) {
      console.warn("Request aborted, likely due to token expiration");
      return null;
    }
    return teamsError;
  }, [teamsError]);

  // ============================================================================
  // Action Functions
  // ============================================================================

  const createTeam = async (input: CreateTeamInput) => {
    try {
      const result = await createTeamMutation({
        variables: {
          name: input.name,
          timezone: input.timezone,
        },
      });
      if (!result || !result.data) {
        throw new Error("No data returned from createTeam mutation");
      }
      return result.data?.createTeam;
    } catch (error) {
      console.error("Error creating team:", error);
      throw error;
    }
  };

  const mutateTeam = async (changes: MutateTeamInput): Promise<Team> => {
    setMutating(true);
    try {
      const { data } = await mutateTeamGql({
        variables: {
          changes,
        },
      });

      if (!data?.team?.mutate) {
        throw new Error("Failed to update team");
      }

      return data.team.mutate;
    } catch (error) {
      console.error("Error updating team:", error);
      throw error;
    } finally {
      setMutating(false);
    }
  };

  const createInvite = async (
    invite: CreateInviteInput,
    targetTeamId?: string,
  ) => {
    if (!isAuthenticated) {
      throw new Error("You must be signed in to create an invite");
    }

    const inviteTeamId = targetTeamId || teamId;

    if (!inviteTeamId) {
      throw new Error("Team ID is required to create an invite");
    }

    try {
      const result = await createInviteMutation({
        variables: {
          teamId: inviteTeamId,
          invite,
        },
        fetchPolicy: "no-cache",
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const newInvite = result.data?.team?.createInvite;
      return newInvite;
    } catch (err: any) {
      console.error("Error creating invite:", err);
      throw err;
    }
  };

  const removeInvite = async (code: string) => {
    if (!isAuthenticated) {
      throw new Error("You must be signed in to remove an invite");
    }

    if (!teamId) {
      throw new Error("Team ID is required to remove an invite");
    }

    try {
      const result = await removeInviteMutation({
        variables: {
          teamId,
          code,
        },
      });

      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0].message);
      }

      const success = result.data?.team?.removeInvite;
      return success;
    } catch (err: any) {
      console.error("Error removing invite:", err);
      throw err;
    }
  };

  const getTeams = useCallback(
    async (forceRefresh = false) => {
      console.log("Fetching teams from store...");
      return forceRefresh || store.teams.length === 0
        ? await store.fetchTeams()
        : store.teams;
    },
    [store.teams, store.fetchTeams],
  );

  const getContactLists = useCallback(
    async (teamId: string, forceRefresh = false) => {
      if (
        !forceRefresh &&
        teamId === store.currentTeamId &&
        store.contactLists.length > 0
      ) {
        return store.contactLists;
      }
      return await store.fetchContactLists(teamId);
    },
    [store.currentTeamId, store.contactLists, store.fetchContactLists],
  );

  const switchTeam = useCallback(
    async (newTeamId: string) => {
      const currentId = store.currentTeamId;
      if (currentId === newTeamId) return store.contactLists;

      // Set switching flag
      store.setIsSwitchingTeam(true);

      try {
        // 1. DON'T clear store data - load cached data for new team immediately
        // This provides instant display of cached data while we refresh in background
        contactsStore.loadCachedTeamData(newTeamId);
        campaignStore.loadCachedTeamData(newTeamId);

        // 2. Update the current team ID in team store
        store.setCurrentTeamId(newTeamId);

        // 3. Refresh the auth token with the new team ID
        // This ensures the server returns data for the correct team
        await refreshTokenWithTeamId(newTeamId);

        // 4. DON'T clear Apollo cache completely - team-scoped data is handled by stores
        // Only evict team-specific queries if needed
        // apolloClient.clearStore(); // REMOVED - causes jarring UX

        // 5. Background refresh for new team - fetches fresh data silently
        // These will update the cache and view when complete
        contactsStore.getContactLists(newTeamId, true); // forceRefresh
        campaignStore.getCampaigns(undefined, true); // forceRefresh

        return contactsStore.contactLists;
      } finally {
        store.setIsSwitchingTeam(false);
      }
    },
    [store, contactsStore, campaignStore],
  );

  const refreshTeamData = useCallback(async () => {
    try {
      console.log("Fetching teams from store...");
      const freshTeams = await store.fetchTeams();

      if (store.currentTeamId) {
        await store.fetchContactLists(store.currentTeamId);
      } else if (freshTeams.length > 0) {
        const firstTeamId = freshTeams[0].id;
        store.setCurrentTeamId(firstTeamId);
        await store.fetchContactLists(firstTeamId);
      }

      return {
        teams: freshTeams,
        contactLists: store.contactLists,
      };
    } catch (error) {
      console.error("Error refreshing team data:", error);
      return {
        teams: store.teams,
        contactLists: store.contactLists,
      };
    }
  }, [store]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // GraphQL teams data
    teams,
    teamsLoading,
    teamsError: filteredError,
    refetchTeams,

    // Users data
    users,
    teamInfo,
    usersLoading,
    usersError,
    refetchUsers,

    // Invites data
    invites,
    invitesLoading,
    invitesError,
    refetchInvites,

    // Team operations
    createTeam,
    creating,
    mutateTeam,
    mutating,

    // Invite operations
    createInvite,
    creatingInvite,
    removeInvite,
    removingInvite,

    // Store-based operations
    currentTeamId: store.currentTeamId,
    currentTeamName: store.currentTeamName,
    contactLists: store.contactLists,
    isLoading: store.isLoading,
    isSwitchingTeam: store.isSwitchingTeam,
    error: store.error,
    getTeams,
    getContactLists,
    switchTeam,
    refreshTeamData,
    setTeams: store.setTeams,
    setCurrentTeamId: store.setCurrentTeamId,
    setContactLists: store.setContactLists,
    timezones: consolidatedData?.timezones || [],
    defaultSettings: consolidatedData?.defaultSetting,
  };
};
