import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Contact, ContactFilter, ContactsResponse } from "@/types/contact";
import { contactServices } from "@/services/contact.services";
import { client } from "@/lib/apollo-client";

// Cache configuration
const CONTACTS_CACHE_TTL = 30 * 1000; // 30 seconds for contacts (external changes possible)
const MAX_CACHED_TEAMS = 5; // Limit cache to prevent memory bloat

// Updated to match the GraphQL schema
export interface ContactList {
  id: string;
  name: string;
  salesNavQuery?: string;
  count?: number;
  lastImported?: string;
  customerId?: string;
  contactListName?: string;
  campaignId?: string;
  createdDate?: string;
  contacts?: Contact[]; // Ensure this is explicitly typed as Contact[]
  linkedinId?: string;
}

interface TeamCache {
  contactLists: ContactList[];
  contacts: Contact[];
  timestamp: number;
}

// Campaign-specific cache for campaign contacts
interface CampaignContactsCache {
  contacts: any[]; // CampaignContact array
  timestamp: number;
}

interface ContactsStore {
  // Team-keyed cache
  cacheByTeam: Record<string, TeamCache>;
  currentTeamId: string | null;

  // Campaign-specific cache - keyed by "teamId:campaignId"
  campaignContactsCache: Record<string, CampaignContactsCache>;
  currentCampaignId: string | null;

  // Current view (derived from cache for current team)
  contacts: Contact[];
  campaignContacts: any[]; // CampaignContact array
  selectedContacts: Set<string>;
  contactLists: ContactList[];
  selectedListId: string | null;

  // Loading states - distinguishes initial load vs background refresh
  isInitialLoading: boolean; // First load, no cache available
  isBackgroundRefreshing: boolean; // Has cache, fetching fresh data
  loading: boolean; // Legacy: true when either initial or refreshing

  importModalOpen: boolean;
  addToCampaignModalOpen: boolean;
  currentPage: number;
  searchQuery: string;
  error: string | null;

  // Actions
  getContacts: (customerId: string, filter?: ContactFilter) => Promise<void>;
  getCampaignContacts: (
    teamId: string,
    campaignId: string,
    forceRefresh?: boolean,
  ) => Promise<void>;
  getContactLists: (teamId: string, forceRefresh?: boolean) => Promise<void>;
  setContacts: (contacts: Contact[]) => void;
  setCampaignContacts: (campaignContacts: any[]) => void;
  setContactLists: (contactLists: ContactList[]) => void;
  setTeamData: (teamId: string, contactLists: ContactList[]) => void;
  loadCachedTeamData: (teamId: string) => void;
  clearTeamCache: (teamId: string) => void;
  clearTeamData: () => void;
  selectContact: (contactId: string) => void;
  selectAllContacts: (contactIds: string[]) => void;
  clearSelectedContacts: () => void;
  setSelectedListId: (listId: string | null) => void;
  setImportModalOpen: (isOpen: boolean) => void;
  setAddToCampaignModalOpen: (isOpen: boolean) => void;
  setSearchQuery: (query: string) => void;
  setCurrentPage: (page: number) => void;
  importContacts: (
    customerId: string,
    listName: string,
    fileOrUrl: File | string,
    source: "csv" | "salesNav",
  ) => Promise<void>;
  addContactsToCampaign: (
    campaignId: string,
    contactIds: string[],
    teamId?: string, // Added teamId parameter
    extraData?: Record<string, any>,
  ) => Promise<{ added: number; skipped: number; total: number }>;
  // Helper method to check for duplicates without adding
  checkContactDuplicates: (
    campaignId: string,
    contactIds: string[],
    teamId: string,
  ) => Promise<{ existing: string[]; new: string[] }>;
}

// Helper to manage cache size
const pruneCache = (
  cache: Record<string, TeamCache>,
  currentTeamId: string | null,
): Record<string, TeamCache> => {
  const teamIds = Object.keys(cache);
  if (teamIds.length <= MAX_CACHED_TEAMS) return cache;

  // Sort by timestamp (oldest first), but keep current team
  const sortedIds = teamIds
    .filter((id) => id !== currentTeamId)
    .sort((a, b) => (cache[a]?.timestamp || 0) - (cache[b]?.timestamp || 0));

  // Remove oldest teams until we're at the limit
  const newCache = { ...cache };
  while (
    Object.keys(newCache).length > MAX_CACHED_TEAMS &&
    sortedIds.length > 0
  ) {
    const oldestId = sortedIds.shift();
    if (oldestId) delete newCache[oldestId];
  }
  return newCache;
};

// Helper to generate campaign cache key
const getCampaignCacheKey = (teamId: string, campaignId: string): string =>
  `${teamId}:${campaignId}`;

export const useContactsStore = create<ContactsStore>()(
  persist(
    (set, get) => ({
      // Team-keyed cache
      cacheByTeam: {},
      currentTeamId: null,

      // Campaign-specific cache
      campaignContactsCache: {},
      currentCampaignId: null,

      // Current view state
      contacts: [],
      campaignContacts: [],
      selectedContacts: new Set<string>(),
      contactLists: [],
      selectedListId: null,

      // Loading states
      isInitialLoading: false,
      isBackgroundRefreshing: false,
      loading: false,

      importModalOpen: false,
      addToCampaignModalOpen: false,
      currentPage: 1,
      searchQuery: "",
      error: null,

      setContacts: (contacts: Contact[]) => {
        set({ contacts });
      },

      setCampaignContacts: (campaignContacts: any[]) => {
        set({ campaignContacts });
      },

      setContactLists: (contactLists: ContactList[]) => {
        // Also extract all contacts from the contact lists
        const allContacts = contactLists.flatMap((list) => list.contacts || []);
        set({
          contactLists,
          contacts: allContacts,
        });
      },

      // Set data for a specific team and update cache
      setTeamData: (teamId: string, contactLists: ContactList[]) => {
        const allContacts = contactLists.flatMap((list) => list.contacts || []);
        const sortedLists = contactLists.sort((a, b) => {
          return (
            new Date(b.createdDate || 0).getTime() -
            new Date(a.createdDate || 0).getTime()
          );
        });

        const newCache: TeamCache = {
          contactLists: sortedLists,
          contacts: allContacts,
          timestamp: Date.now(),
        };

        set((state) => {
          const updatedCache = pruneCache(
            { ...state.cacheByTeam, [teamId]: newCache },
            state.currentTeamId,
          );

          // Only update current view if this is the current team
          if (teamId === state.currentTeamId) {
            return {
              cacheByTeam: updatedCache,
              contactLists: sortedLists,
              contacts: allContacts,
            };
          }
          return { cacheByTeam: updatedCache };
        });
      },

      // Load cached data for a team into current view
      loadCachedTeamData: (teamId: string) => {
        const cache = get().cacheByTeam[teamId];
        set({
          currentTeamId: teamId,
          contactLists: cache?.contactLists || [],
          contacts: cache?.contacts || [],
          // Reset UI state when switching teams
          selectedContacts: new Set(),
          selectedListId: null,
          currentPage: 1,
          searchQuery: "",
          error: null,
        });
      },

      // Clear cache for a specific team
      clearTeamCache: (teamId: string) => {
        set((state) => {
          const newCache = { ...state.cacheByTeam };
          delete newCache[teamId];
          return { cacheByTeam: newCache };
        });
      },

      // Clear current view but keep cache
      clearTeamData: () => {
        set({
          contacts: [],
          campaignContacts: [],
          contactLists: [],
          selectedContacts: new Set(),
          selectedListId: null,
          currentPage: 1,
          searchQuery: "",
          error: null,
        });
      },

      getContacts: async (customerId: string, filter?: ContactFilter) => {
        try {
          set({ loading: true, isInitialLoading: true, error: null });

          // Note: This method is deprecated in favor of getContactLists
          // which fetches contact lists with all contacts from GraphQL
          console.warn(
            "getContacts is deprecated. Use getContactLists instead.",
          );

          set({
            contacts: [],
            loading: false,
            isInitialLoading: false,
            error: null,
          });
        } catch (error) {
          set({
            loading: false,
            isInitialLoading: false,
            error: error instanceof Error ? error.message : "An error occurred",
          });
        }
      },

      getContactLists: async (teamId: string, forceRefresh?: boolean) => {
        const state = get();
        const cachedData = state.cacheByTeam[teamId];
        const now = Date.now();
        const cacheAge = cachedData ? now - cachedData.timestamp : Infinity;
        const hasFreshCache =
          cachedData && cacheAge < CONTACTS_CACHE_TTL && !forceRefresh;

        // Update current team ID
        if (state.currentTeamId !== teamId) {
          set({ currentTeamId: teamId });
        }

        // If we have fresh cache for this team, just use it
        if (hasFreshCache) {
          set({
            contactLists: cachedData.contactLists,
            contacts: cachedData.contacts,
            loading: false,
            isInitialLoading: false,
            isBackgroundRefreshing: false,
            error: null,
          });
          return;
        }

        // Determine if this is initial load (no cache) or background refresh (has cache)
        const hasCache = !!cachedData;

        // Show cached data immediately if available
        if (hasCache) {
          set({
            contactLists: cachedData.contactLists,
            contacts: cachedData.contacts,
            isBackgroundRefreshing: true,
            isInitialLoading: false,
            loading: true,
            error: null,
          });
        } else {
          set({
            isInitialLoading: true,
            isBackgroundRefreshing: false,
            loading: true,
            error: null,
          });
        }

        try {
          // Fetch contact lists with full contact data from GraphQL
          const rawContactLists: ContactList[] =
            await contactServices.getContactLists(client, teamId);

          // Normalize contact data to ensure backward compatibility
          const contactLists = rawContactLists.map((list) => ({
            ...list,
            contacts: list.contacts?.map((contact) => ({
              ...contact,
              // Add companyName for backward compatibility
              companyName: contact.company?.name || contact.companyName,
              // Ensure location is properly set
              location:
                contact.location ||
                [contact.city, contact.state].filter(Boolean).join(", ") ||
                undefined,
            })),
          }));

          // Extract all contacts from all lists for the contacts array
          const allContacts = contactLists.flatMap(
            (list) => list.contacts || [],
          );

          const sortedLists = contactLists.sort((a, b) => {
            return (
              new Date(b.createdDate || 0).getTime() -
              new Date(a.createdDate || 0).getTime()
            );
          });

          // Update cache and current view
          const newCache: TeamCache = {
            contactLists: sortedLists,
            contacts: allContacts,
            timestamp: Date.now(),
          };

          set((currentState) => {
            const updatedCache = pruneCache(
              { ...currentState.cacheByTeam, [teamId]: newCache },
              currentState.currentTeamId,
            );

            // Only update view if still on same team
            if (currentState.currentTeamId === teamId) {
              return {
                cacheByTeam: updatedCache,
                contactLists: sortedLists,
                contacts: allContacts,
                loading: false,
                isInitialLoading: false,
                isBackgroundRefreshing: false,
                error: null,
              };
            }
            // Team changed during fetch, just update cache
            return {
              cacheByTeam: updatedCache,
              loading: false,
              isInitialLoading: false,
              isBackgroundRefreshing: false,
            };
          });
        } catch (error) {
          console.error("Error in getContactLists:", error);

          // On error, keep showing cached data if available
          const currentCache = get().cacheByTeam[teamId];
          set({
            contactLists: currentCache?.contactLists || [],
            contacts: currentCache?.contacts || [],
            loading: false,
            isInitialLoading: false,
            isBackgroundRefreshing: false,
            error: error instanceof Error ? error.message : "An error occurred",
          });
        }
      },

      getCampaignContacts: async (
        teamId: string,
        campaignId: string,
        forceRefresh?: boolean,
      ) => {
        const cacheKey = getCampaignCacheKey(teamId, campaignId);
        const cachedData = get().campaignContactsCache[cacheKey];
        const now = Date.now();
        const cacheAge = cachedData ? now - cachedData.timestamp : Infinity;
        const hasFreshCache =
          cachedData && cacheAge < CONTACTS_CACHE_TTL && !forceRefresh;

        // Update current IDs
        if (
          get().currentTeamId !== teamId ||
          get().currentCampaignId !== campaignId
        ) {
          set({ currentTeamId: teamId, currentCampaignId: campaignId });
        }

        // If we have fresh cache, use it immediately
        if (hasFreshCache) {
          set({
            campaignContacts: cachedData.contacts,
            loading: false,
            isInitialLoading: false,
            isBackgroundRefreshing: false,
            error: null,
          });
          return;
        }

        // Determine if this is initial load or background refresh
        const hasCache = !!cachedData;

        // Show cached data immediately if available
        if (hasCache) {
          set({
            campaignContacts: cachedData.contacts,
            isBackgroundRefreshing: true,
            isInitialLoading: false,
            loading: true,
            error: null,
          });
        } else {
          set({
            isInitialLoading: true,
            isBackgroundRefreshing: false,
            loading: true,
            error: null,
          });
        }

        try {
          const campaignContacts = await contactServices.getCampaignContacts(
            client,
            teamId,
            campaignId,
          );

          // Update cache and current view
          const newCache: CampaignContactsCache = {
            contacts: campaignContacts,
            timestamp: Date.now(),
          };

          set((currentState) => {
            // Only update view if still on same team and campaign
            if (
              currentState.currentTeamId === teamId &&
              currentState.currentCampaignId === campaignId
            ) {
              return {
                campaignContactsCache: {
                  ...currentState.campaignContactsCache,
                  [cacheKey]: newCache,
                },
                campaignContacts,
                loading: false,
                isInitialLoading: false,
                isBackgroundRefreshing: false,
                error: null,
              };
            }
            // Campaign changed during fetch, just update cache
            return {
              campaignContactsCache: {
                ...currentState.campaignContactsCache,
                [cacheKey]: newCache,
              },
              loading: false,
              isInitialLoading: false,
              isBackgroundRefreshing: false,
            };
          });
        } catch (error) {
          console.error("Error fetching campaign contacts:", error);

          // On error, keep showing cached data if available
          const currentCache = get().campaignContactsCache[cacheKey];
          set({
            campaignContacts: currentCache?.contacts || [],
            loading: false,
            isInitialLoading: false,
            isBackgroundRefreshing: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch campaign contacts",
          });
        }
      },

      selectContact: (contactId: string) => {
        set((state) => {
          const newSelection = new Set(state.selectedContacts);
          if (newSelection.has(contactId)) {
            newSelection.delete(contactId);
          } else {
            newSelection.add(contactId);
          }
          return { selectedContacts: newSelection };
        });
      },

      selectAllContacts: (contactIds: string[]) => {
        set((state) => {
          const newSelection = new Set(state.selectedContacts);
          contactIds.forEach((id) => newSelection.add(id));
          return { selectedContacts: newSelection };
        });
      },

      clearSelectedContacts: () => {
        set({ selectedContacts: new Set() });
      },

      setSelectedListId: (listId: string | null) => {
        set({
          selectedListId: listId,
          currentPage: 1,
          selectedContacts: new Set(),
        });
      },

      setImportModalOpen: (isOpen: boolean) => {
        set({ importModalOpen: isOpen });
      },

      setAddToCampaignModalOpen: (isOpen: boolean) => {
        set({ addToCampaignModalOpen: isOpen });
      },

      setSearchQuery: (query: string) => {
        set({
          searchQuery: query,
          currentPage: 1,
        });
      },

      setCurrentPage: (page: number) => {
        set({ currentPage: page });
      },

      importContacts: async (
        teamId: string,
        listName: string,
        fileOrUrl: File | string,
        source: "csv" | "salesNav",
      ) => {
        try {
          set({ loading: true });

          // Only handle File uploads for now
          if (!(fileOrUrl instanceof File) || source !== "csv") {
            throw new Error("Only CSV file uploads are supported");
          }

          // Use GraphQL to upload contacts
          const result = await contactServices.uploadContactsCsv(
            client,
            teamId,
            fileOrUrl,
            listName,
          );

          if (result?.contactList) {
            // Create a new list from the returned data
            const newList: ContactList = {
              id: result.contactList.id,
              name: result.contactList.name,
              salesNavQuery: result.contactList.salesNavQuery,
              count: result.contacts?.length || 0,
              lastImported: new Date().toISOString(),
              customerId: teamId,
            };

            // Update the contact lists with the new one
            set((state) => ({
              contactLists: [...state.contactLists, newList],
              loading: false,
              importModalOpen: false,
              error: null,
            }));

            return Promise.resolve();
          } else {
            throw new Error("Failed to upload contacts");
          }
        } catch (error) {
          console.error("Import error:", error);
          set({
            loading: false,
            error: error instanceof Error ? error.message : "Import failed",
          });
          return Promise.reject(error);
        }
      },

      // Helper method to check for duplicates without adding
      checkContactDuplicates: async (
        campaignId: string,
        contactIds: string[],
        teamId: string,
      ) => {
        try {
          // Get existing campaign contacts
          const existingContacts = await contactServices.getCampaignContacts(
            client,
            teamId,
            campaignId,
          );
          const existingContactIds = new Set(
            existingContacts.map(
              (contact: any) => contact.contactId || contact.id,
            ),
          );

          // Separate existing and new contacts
          const existing = contactIds.filter((id) =>
            existingContactIds.has(id),
          );
          const newContacts = contactIds.filter(
            (id) => !existingContactIds.has(id),
          );

          return { existing, new: newContacts };
        } catch (error) {
          console.error("Error checking contact duplicates:", error);
          // If we can't check duplicates, assume all are new
          return { existing: [], new: contactIds };
        }
      },

      addContactsToCampaign: async (
        campaignId: string,
        contactIds: string[],
        teamId?: string, // Added teamId parameter
        extraData = {},
      ) => {
        if (!teamId) {
          console.error("teamId is required for addContactsToCampaign");
          return Promise.reject(new Error("teamId is required"));
        }

        try {
          set({ loading: true, error: null });

          // First, fetch existing campaign contacts to check for duplicates
          const existingCampaignContacts =
            await contactServices.getCampaignContacts(
              client,
              teamId,
              campaignId,
            );

          // Extract existing contact IDs from campaign contacts
          const existingContactIds = new Set(
            existingCampaignContacts.map(
              (campaignContact: any) => campaignContact.contactId,
            ),
          );

          // Filter out contacts that are already in the campaign
          const newContactIds = contactIds.filter(
            (contactId) => !existingContactIds.has(contactId),
          );

          if (newContactIds.length === 0) {
            set({ loading: false });
            return Promise.resolve({
              added: 0,
              skipped: contactIds.length,
              total: contactIds.length,
            });
          }

          // Transform filtered contactIds to AddCampaignContact format
          const contacts = newContactIds.map((contactId) => ({
            contactId,
            extraData:
              Object.keys(extraData).length > 0 ? extraData : undefined,
          }));

          // Add the new contacts to the campaign
          await contactServices.addContactsToCampaign(
            client,
            teamId,
            campaignId,
            contacts,
          );

          set({
            loading: false,
            selectedContacts: new Set(), // Clear selection after adding
          });

          // Refresh campaign contacts to show the newly added ones
          // Use forceRefresh=true to bypass cache and get fresh data
          await get().getCampaignContacts(teamId, campaignId, true);

          return Promise.resolve({
            added: newContactIds.length,
            skipped: contactIds.length - newContactIds.length,
            total: contactIds.length,
          });
        } catch (error) {
          console.error("Error adding contacts to campaign:", error);
          set({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Failed to add contacts to campaign",
          });
          return Promise.reject(error);
        }
      },
    }),
    {
      name: "contacts-storage",
      version: 1, // Bumped to clear old large cacheByTeam/campaignContactsCache data from localStorage
      migrate: (persistedState: any) => ({
        selectedListId: persistedState?.selectedListId ?? null,
        currentTeamId: persistedState?.currentTeamId ?? null,
        currentCampaignId: persistedState?.currentCampaignId ?? null,
      }),
      partialize: (state) => ({
        selectedListId: state.selectedListId,
        currentTeamId: state.currentTeamId,
        currentCampaignId: state.currentCampaignId,
      }),
    },
  ),
);
