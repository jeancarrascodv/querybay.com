import { create } from "zustand";
import { persist } from "zustand/middleware";
import { client } from "../lib/apollo-client";
import { campaignServices } from "../services/campaign.services";
import {
  ActionRequest,
  ActionRequestFilter,
  CampaignFilter,
  CampaignInput,
  CampaignUpdateInput,
  Contact,
  Campaign,
  NewActionRequest,
} from "../types/campaign.types";
import { CampaignStep } from "../types/campaignStep";
import { Node, Edge } from "reactflow";

// Cache configuration - campaigns only change through app mutations, no auto-refresh needed
const MAX_CACHED_TEAMS = 5; // Limit cache to prevent memory bloat

interface CampaignTeamCache {
  campaigns: Campaign[];
  timestamp: number;
}

interface StepData {
  id: string;
  type: string;
  stepType?: string;
  timeWindow?: [number, number];
  selectedDays?: Record<string, boolean>;
  body?: string;
  name?: string;
  description?: string;
  testName?: string;
  enabled?: boolean;
  subject?: string;
  label?: string;
  delay?: number;
  daystoWait?: number;
}

const getStepTypeLabel = (type: string) => {
  const types: Record<string, string> = {
    email: "Email",
    linkedin: "LinkedIn",
    webhook: "Webhook",
    delay: "Delay",
    // Add more step types here
  };
  return types[type] || "Unknown";
};

interface DelaySettings {
  delay: number;
  daysToWait: number;
}

interface CampaignState {
  currentStep: "setup" | "configure" | "test";
  stepData: StepData;
  selectedNode: string | null;
  selectedEdge: string | null;

  customerId: string;
  editingStep: any | null;
  focusedField: string | null;
  nodeDelays: Record<string, DelaySettings>;
  mode: "view" | "edit" | "add";
  isSidePanelOpen: boolean;
  // Actions
  setCurrentStep: (step: "setup" | "configure" | "test") => void;
  updateStepData: (data: Partial<StepData>) => void;
  resetStepData: () => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setEditingStep: (step: any | null) => void;
  setFocusedField: (field: string | null) => void;
  updateNodeDelay: (nodeId: string, settings: DelaySettings) => void;
  setMode: (mode: "view" | "edit" | "add") => void;
  setIsSidePanelOpen: (isOpen: boolean) => void;
}

const initialStepData: StepData = {
  id: "",
  type: "",
  stepType: "",
  timeWindow: [9, 17],
  selectedDays: {
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
  },
  body: "",
  name: "",
  description: "",
  testName: "",
  enabled: false,
  subject: "",
  delay: 0,
  daystoWait: 0,
};

interface CampaignStore {
  // Team-keyed cache
  cacheByTeam: Record<string, CampaignTeamCache>;
  currentTeamId: string | null;

  // Current view state
  campaigns: Campaign[];
  actionRequests: ActionRequest[];
  campaignSteps: CampaignStep[];
  contacts: Contact[];
  contactLists: Contact[];

  // Loading states - distinguishes initial load vs background refresh
  isInitialLoading: boolean; // First load, no cache available
  isBackgroundRefreshing: boolean; // Has cache, fetching fresh data
  loading: boolean; // Legacy: true when either initial or refreshing

  error: any;
  mode: "view" | "edit" | "add";
  selectedCampaign: Campaign | null;
  setSelectedCampaign: (campaign: Campaign | null) => void;
  nodes: Node[];
  edges: Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNode: (nodeId: string, data: any) => void;
  updateEdge: (edgeId: string, data: any) => void;
  addNode: (node: Node) => void;
  addEdge: (edge: Edge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;

  // Team data management
  setTeamData: (teamId: string, campaigns: Campaign[]) => void;
  loadCachedTeamData: (teamId: string) => void;
  clearTeamCache: (teamId: string) => void;
  clearTeamData: () => void;

  // Actions
  getActionRequests: (
    customerId: string,
    filter?: ActionRequestFilter,
  ) => Promise<void>;
  registerNewActionRequest: (
    customerId: string,
    newActionRequest: NewActionRequest,
  ) => Promise<void>;
  getCampaigns: (
    filter?: CampaignFilter,
    forceRefresh?: boolean,
  ) => Promise<Campaign[]>;
  createCampaign: (campaign: CampaignInput) => Promise<Campaign>;
  updateCampaign: (
    campaignId: string,
    campaign: CampaignUpdateInput,
  ) => Promise<Campaign>;
  setMode: (mode: "view" | "edit" | "add") => void;
  // ... other actions
}

// Helper to manage cache size
const pruneCampaignCache = (
  cache: Record<string, CampaignTeamCache>,
  currentTeamId: string | null,
): Record<string, CampaignTeamCache> => {
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

export const useCampaignStore = create<CampaignStore & CampaignState>()(
  persist(
    (set, get) => ({
      // Team-keyed cache
      cacheByTeam: {},
      currentTeamId: null,

      // Current view state
      campaigns: [],
      customerId: "",
      actionRequests: [],
      campaignSteps: [],
      contacts: [],
      contactLists: [],

      // Loading states
      isInitialLoading: false,
      isBackgroundRefreshing: false,
      loading: false,

      error: null,
      mode: "view",
      selectedCampaign: null,

      // Set data for a specific team and update cache
      setTeamData: (teamId: string, campaigns: Campaign[]) => {
        const newCache: CampaignTeamCache = {
          campaigns,
          timestamp: Date.now(),
        };

        set((state) => {
          const updatedCache = pruneCampaignCache(
            { ...state.cacheByTeam, [teamId]: newCache },
            state.currentTeamId,
          );

          // Only update current view if this is the current team
          if (teamId === state.currentTeamId) {
            return {
              cacheByTeam: updatedCache,
              campaigns,
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
          campaigns: cache?.campaigns || [],
          // Reset related state
          actionRequests: [],
          selectedCampaign: null,
          nodes: [],
          edges: [],
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
          campaigns: [],
          actionRequests: [],
          campaignSteps: [],
          contacts: [],
          contactLists: [],
          selectedCampaign: null,
          nodes: [],
          edges: [],
          error: null,
        });
      },

      getActionRequests: async (customerId, filter) => {
        set({ loading: true });
        try {
          const response = await campaignServices.getActionRequest(
            customerId,
            filter,
          );
          if (response?.data?.getActionRequest) {
            set({
              actionRequests: response.data.getActionRequest,
              loading: false,
            });
          } else {
            set({ actionRequests: [], loading: false });
          }
        } catch (error) {
          set({ error, loading: false });
        }
      },

      registerNewActionRequest: async (customerId, newActionRequest) => {
        set({ loading: true });
        try {
          await campaignServices.registerNewActionRequest(
            customerId,
            newActionRequest,
          );
          // Refresh action requests list
          const response = await campaignServices.getActionRequest(customerId);
          set({
            actionRequests: response.data.getActionRequest,
            loading: false,
          });
        } catch (error) {
          set({ error, loading: false });
        }
      },

      getCampaigns: async (filter, forceRefresh?: boolean) => {
        const state = get();
        // Extract teamId from filter if available
        const teamId = (filter as any)?.teamId || state.currentTeamId;
        const cachedData = teamId ? state.cacheByTeam[teamId] : null;

        // Update current team ID if provided
        if (teamId && state.currentTeamId !== teamId) {
          set({ currentTeamId: teamId });
        }

        // Determine if this is initial load (no cache) or background refresh (has cache)
        const hasCache = !!cachedData;

        // Show cached data immediately if available (campaigns don't auto-refresh, only on mutation)
        if (hasCache && !forceRefresh) {
          set({
            campaigns: cachedData.campaigns,
            isBackgroundRefreshing: false,
            isInitialLoading: false,
            loading: false,
            error: null,
          });
          return cachedData.campaigns;
        }

        // Set loading state
        if (hasCache) {
          set({
            campaigns: cachedData.campaigns,
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
          const campaigns = await campaignServices.getCampaigns(client, filter);
          const campaignsFiltered = campaigns.map(
            (campaign: any) => campaign.get,
          );

          // Update cache and current view
          if (teamId) {
            const newCache: CampaignTeamCache = {
              campaigns: campaignsFiltered,
              timestamp: Date.now(),
            };

            set((currentState) => {
              const updatedCache = pruneCampaignCache(
                { ...currentState.cacheByTeam, [teamId]: newCache },
                currentState.currentTeamId,
              );

              // Only update view if still on same team
              if (currentState.currentTeamId === teamId) {
                return {
                  cacheByTeam: updatedCache,
                  campaigns: campaignsFiltered,
                  loading: false,
                  isInitialLoading: false,
                  isBackgroundRefreshing: false,
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
          } else {
            set({
              campaigns: campaignsFiltered,
              loading: false,
              isInitialLoading: false,
              isBackgroundRefreshing: false,
            });
          }

          return campaigns;
        } catch (error) {
          // On error, keep showing cached data if available
          const currentCache = teamId ? get().cacheByTeam[teamId] : null;
          set({
            campaigns: currentCache?.campaigns || [],
            error,
            loading: false,
            isInitialLoading: false,
            isBackgroundRefreshing: false,
          });
          throw error;
        }
      },

      createCampaign: async (campaign) => {
        set({ loading: true });
        try {
          const newCampaign = await campaignServices.createCampaign(
            client,
            campaign,
          );

          if (newCampaign) {
            set((state) => ({
              campaigns: [...state.campaigns, newCampaign],
              loading: false,
            }));
          }

          return newCampaign;
        } catch (error) {
          set({ error, loading: false });
          throw error;
        }
      },

      updateCampaign: async (campaignId, campaign) => {
        // Optimistically update the campaign in the local state
        const previousCampaigns = get().campaigns;

        set({
          campaigns: previousCampaigns.map((c) =>
            c.id === campaignId
              ? ({
                  ...c,
                  ...campaign,
                  name: campaign.name || c.name,
                  active:
                    typeof campaign.active === "boolean"
                      ? campaign.active
                      : c.active,
                  allowedMessagingDayTimes:
                    campaign.allowedMessagingDayTimes ||
                    c.allowedMessagingDayTimes,
                  // Keep the existing steps if new steps aren't provided
                  // This preserves the CampaignStep type structure
                  steps: campaign.steps
                    ? (campaign.steps as unknown as CampaignStep[])
                    : c.steps,
                } as Campaign)
              : c,
          ),
        });

        try {
          // Remove internal properties
          delete (campaign as any).__typename;

          const updatedCampaign = await campaignServices.updateCampaign(
            client,
            campaignId,
            campaign,
          );

          // Silently refresh campaigns in the background
          const campaigns = await campaignServices.getCampaigns(client);
          console.log("Refreshed campaigns after update:", campaigns);
          if (campaigns?.length > 0) {
            set({ campaigns: campaigns.map((campaign: any) => campaign.get) });
          }

          return updatedCampaign;
        } catch (error) {
          // Revert to previous state if the update fails
          set({ campaigns: previousCampaigns, error });
          throw error;
        }
      },

      currentStep: "setup",
      stepData: initialStepData,
      selectedNode: null,
      selectedEdge: null,
      editingStep: null,
      focusedField: null,
      nodeDelays: {},

      setCurrentStep: (step) => set({ currentStep: step }),

      updateStepData: (data) =>
        set((state) => ({
          stepData: {
            ...state.stepData,
            ...data,
            label: data.stepType
              ? getStepTypeLabel(data.stepType)
              : state.stepData.label,
          },
        })),

      resetStepData: () => {
        set({
          stepData: initialStepData,
          currentStep: "setup",
          editingStep: null,
          mode: "view",
        });
      },

      setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),
      setSelectedEdge: (edgeId) => set({ selectedEdge: edgeId }),

      setEditingStep: (step) => {
        if (step) {
          set({ editingStep: step, mode: "view" });
        } else {
          set({ editingStep: null, mode: "add" });
        }
      },

      setFocusedField: (field) => set({ focusedField: field }),

      setMode: (mode) => {
        set({ mode });
      },

      isSidePanelOpen: false,
      setIsSidePanelOpen: (isOpen) => set({ isSidePanelOpen: isOpen }),

      setSelectedCampaign: (campaign) => set({ selectedCampaign: campaign }),

      updateNodeDelay: (nodeId, settings) =>
        set((state) => ({
          nodeDelays: {
            ...state.nodeDelays,
            [nodeId]: settings,
          },
        })),

      nodes: [],
      edges: [],

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      updateNode: (nodeId, data) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...data } }
              : node,
          ),
        })),

      updateEdge: (edgeId, data) =>
        set((state) => ({
          edges: state.edges.map((edge) =>
            edge.id === edgeId
              ? { ...edge, data: { ...edge.data, ...data } }
              : edge,
          ),
        })),

      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
        })),

      addEdge: (edge) =>
        set((state) => ({
          edges: [...state.edges, edge],
        })),

      removeNode: (nodeId) =>
        set((state) => ({
          nodes: state.nodes.filter((node) => node.id !== nodeId),
          edges: state.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          ),
        })),

      removeEdge: (edgeId) =>
        set((state) => ({
          edges: state.edges.filter((edge) => edge.id !== edgeId),
        })),
    }),
    {
      name: "campaign-storage",
      partialize: (state) => ({
        currentTeamId: state.currentTeamId,
        cacheByTeam: state.cacheByTeam,
        // Don't persist UI state or flow data
      }),
    },
  ),
);
