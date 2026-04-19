import { create } from "zustand";
import { Queries } from "@/graphql/team";
import { persist } from "zustand/middleware";
import { getCookie, setCookie } from "@/lib/cookies";
import { client } from "@/lib/apollo-client";
import { refreshTokenWithTeamId } from "@/lib/session";

export interface Team {
  id: string;
  name: string;
  [key: string]: any;
}

export interface ContactList {
  id: string;
  name: string;
  [key: string]: any;
}

interface TeamStore {
  teams: Team[];
  currentTeamId: string | null;
  currentTeamName: string | null;
  contactLists: ContactList[];
  isLoading: boolean;
  isSwitchingTeam: boolean;
  error: string | null;

  // Actions
  setTeams: (teams: Team[]) => void;
  setCurrentTeamId: (teamId: string | null) => void;
  setCurrentTeamName: (teamName: string | null) => void;
  setContactLists: (contactLists: ContactList[]) => void;
  setIsSwitchingTeam: (isSwitching: boolean) => void;
  clearTeamData: () => void;
  fetchTeams: () => Promise<Team[]>;
  fetchContactLists: (teamId: string) => Promise<ContactList[]>;
}

export const useTeamStore = create<TeamStore>()(
  persist(
    (set, get) => ({
      teams: [],
      currentTeamId: null,
      currentTeamName: null,
      contactLists: [],
      isLoading: false,
      isSwitchingTeam: false,
      error: null,

      setTeams: (teams) => set({ teams }),
      setCurrentTeamId: async (teamId) => {
        // Set the team ID in the cookie when it's updated
        const currentTeamId = get().currentTeamId;
        if (currentTeamId === teamId) return; // No change
        set({ currentTeamId: teamId });
        // if (!currentTeamId) return;
        // await refreshTokenWithTeamId(teamId!);
      },
      setCurrentTeamName: (teamName) => set({ currentTeamName: teamName }),
      setContactLists: (contactLists) => set({ contactLists }),
      setIsSwitchingTeam: (isSwitching) =>
        set({ isSwitchingTeam: isSwitching }),

      clearTeamData: () => {
        set({
          contactLists: [],
          error: null,
        });
      },

      fetchTeams: async () => {
        try {
          set({ isLoading: true, error: null });

          const { data } = await client.query({
            query: Queries.GET_TEAMS,
            fetchPolicy: "network-only", // Always fetch fresh data
          });

          const teams = data?.allTeams || [];
          set({ teams, isLoading: false });

          return teams;
        } catch (error) {
          console.error("Error fetching teams:", error);
          const errorMessage =
            (error as Error).message || "Failed to fetch teams";
          set({ error: errorMessage, isLoading: false });
          // Keep existing teams in state if available
          return get().teams;
        }
      },

      fetchContactLists: async (teamId) => {
        try {
          set({ isLoading: true, error: null });

          const response = await fetch(`/api/teams/${teamId}/contacts`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(
              `Failed to fetch contact lists: ${response.statusText}`,
            );
          }

          const data = await response.json();
          const contactLists = data?.contactLists || [];
          set({ contactLists, isLoading: false });
          return contactLists;
        } catch (error) {
          console.error(
            `Error fetching contact lists for team ${teamId}:`,
            error,
          );
          const errorMessage =
            (error as Error).message || "Failed to fetch contact lists";
          set({ error: errorMessage, isLoading: false });
          // Keep existing contact lists if available
          return get().contactLists;
        }
      },
    }),
    {
      name: "team-storage", // unique name for localStorage
      partialize: (state) => ({
        teams: state.teams,
        currentTeamId: state.currentTeamId,
        currentTeamName: state.currentTeamName,
        contactLists: state.contactLists,
      }),
    },
  ),
);
