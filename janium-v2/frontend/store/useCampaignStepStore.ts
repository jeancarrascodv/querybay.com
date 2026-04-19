import { create } from "zustand";
import {
  AddCampaignContact,
  BulkUpdateStepsInput,
  CampaignContact,
  CampaignStep,
  CampaignStepFilter,
  CampaignStepLink,
  CreateCampaignStep,
  CreateCampaignStepLink,
  MutateCampaignStep,
  MutateCampaignStepLink,
} from "@/types/campaignStep";
import { campaignStepServices } from "@/services/campaignStep.services";

interface CampaignStepStore {
  steps: CampaignStep[];
  links: CampaignStepLink[];
  contacts: CampaignContact[];
  isLoading: boolean;
  saved: boolean;
  error: string | null;

  // Query methods
  getCampaignFlow: (
    campaignId: string
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  getCampaignSteps: (
    campaignId: string,
    filter?: CampaignStepFilter
  ) => Promise<CampaignStep[]>;

  getCampaignLinks: (campaignId: string) => Promise<CampaignStepLink[]>;

  getCampaignContacts: (campaignId: string) => Promise<CampaignContact[]>;

  // Step mutation methods
  addCampaignStep: (
    campaignId: string,
    step: CreateCampaignStep
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  modifyCampaignStep: (
    campaignId: string,
    mutation: MutateCampaignStep
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  // Link mutation methods
  addCampaignStepLink: (
    campaignId: string,
    link: CreateCampaignStepLink
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  modifyCampaignStepLink: (
    campaignId: string,
    mutation: MutateCampaignStepLink
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  // Bulk updates
  bulkUpdateSteps: (
    campaignId: string,
    input: BulkUpdateStepsInput
  ) => Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }>;

  // Contact methods
  addCampaignContacts: (
    campaignId: string,
    contacts: AddCampaignContact[]
  ) => Promise<CampaignContact[]>;

  setSaved: (saved: boolean) => void;

  // Helper methods
  setSteps: (steps: CampaignStep[]) => void;
  setLinks: (links: CampaignStepLink[]) => void;
  setContacts: (contacts: CampaignContact[]) => void;
  clearSteps: () => void;

  currentStep: "setup" | "configure" | "test";
  stepData: import("@/types/campaignStepUI").StepUIData;
  selectedNode: string | null;
  selectedEdge: string | null;
  focusedField: string | null;
  mode: "add" | "edit" | "view";
  setCurrentStep: (step: "setup" | "configure" | "test") => void;
  updateStepData: (
    data:
      | Partial<import("@/types/campaignStepUI").StepUIData>
      | ((
          prevData: import("@/types/campaignStepUI").StepUIData
        ) => import("@/types/campaignStepUI").StepUIData)
  ) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setSelectedEdge: (edgeId: string | null) => void;
  setFocusedField: (field: string | null) => void;
  setMode: (mode: "add" | "edit" | "view") => void;
  resetStepData: () => void;
  loadNodeData: (nodeId: string) => void;
  updateNodeById: (
    nodeId: string,
    data: Partial<import("@/types/campaignStepUI").StepUIData>
  ) => void;
}

export const useCampaignStepStore = create<CampaignStepStore>((set) => ({
  steps: [],
  links: [],
  contacts: [],
  isLoading: false,
  saved: false,
  error: null,

  // Combined flow query
  getCampaignFlow: async (campaignId: string) => {
    try {
      set({ isLoading: true, error: null });
      const { steps, links } =
        await campaignStepServices.getCampaignFlow(campaignId);
      set({ steps, links, isLoading: false });
      return { steps, links };
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return { steps: [], links: [] };
    }
  },

  // Step queries
  getCampaignSteps: async (campaignId: string, filter?: CampaignStepFilter) => {
    try {
      set({ isLoading: true, error: null });
      const steps = await campaignStepServices.getCampaignSteps(
        campaignId,
        filter
      );
      set({ steps, isLoading: false });
      return steps;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return [];
    }
  },

  getCampaignLinks: async (campaignId: string) => {
    try {
      set({ isLoading: true, error: null });
      const links = await campaignStepServices.getCampaignLinks(campaignId);
      set({ links, isLoading: false });
      return links;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return [];
    }
  },

  getCampaignContacts: async (campaignId: string) => {
    try {
      set({ isLoading: true, error: null });
      const contacts =
        await campaignStepServices.getCampaignContacts(campaignId);
      set({ contacts, isLoading: false });
      return contacts;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      return [];
    }
  },

  // Step mutations
  addCampaignStep: async (campaignId: string, step: CreateCampaignStep) => {
    try {
      set({ isLoading: true, error: null });
      const result = await campaignStepServices.addCampaignStep(
        campaignId,
        step
      );
      set({
        steps: result.steps,
        links: result.links,
        isLoading: false,
      });
      return result;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  modifyCampaignStep: async (
    campaignId: string,
    mutation: MutateCampaignStep
  ) => {
    try {
      set({ isLoading: true, error: null });
      const result = await campaignStepServices.modifyCampaignStep(
        campaignId,
        mutation
      );
      set({
        steps: result.steps,
        links: result.links,
        isLoading: false,
      });
      return result;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Link mutations
  addCampaignStepLink: async (
    campaignId: string,
    link: CreateCampaignStepLink
  ) => {
    try {
      set({ isLoading: true, error: null });
      const result = await campaignStepServices.addCampaignStepLink(
        campaignId,
        link
      );
      set({
        steps: result.steps,
        links: result.links,
        isLoading: false,
      });
      return result;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  modifyCampaignStepLink: async (
    campaignId: string,
    mutation: MutateCampaignStepLink
  ) => {
    try {
      set({ isLoading: true, error: null });
      const result = await campaignStepServices.modifyCampaignStepLink(
        campaignId,
        mutation
      );
      set({
        steps: result.steps,
        links: result.links,
        isLoading: false,
      });
      return result;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Bulk operations
  bulkUpdateSteps: async (campaignId: string, input: BulkUpdateStepsInput) => {
    try {
      set({ isLoading: true, error: null });
      const results = await campaignStepServices.bulkUpdateSteps(
        campaignId,
        input
      );
      console.log("Updated steps:", results);
      set((state) => ({
        steps: results.steps,
        links: results.links,
        isLoading: false,
        saved: true,
      }));
      return results;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },
  setSaved: (saved: boolean) => set({ saved }),

  // Contact operations
  addCampaignContacts: async (
    campaignId: string,
    contacts: AddCampaignContact[]
  ) => {
    try {
      set({ isLoading: true, error: null });
      const newContacts = await campaignStepServices.addCampaignContacts(
        campaignId,
        contacts
      );
      set((state) => ({
        contacts: [...state.contacts, ...newContacts],
        isLoading: false,
      }));
      return newContacts;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  setSteps: (steps: CampaignStep[]) => set({ steps }),
  setLinks: (links: CampaignStepLink[]) => set({ links }),
  setContacts: (contacts: CampaignContact[]) => set({ contacts }),
  clearSteps: () => set({ steps: [], links: [], contacts: [], error: null }),

  currentStep: "setup",
  stepData: {} as import("@/types/campaignStepUI").StepUIData,
  selectedNode: null,
  selectedEdge: null,
  focusedField: null,
  mode: "add",

  setCurrentStep: (step) => set({ currentStep: step }),
  updateStepData: (data) =>
    set((state) => {
      // Check if data is a function
      if (typeof data === "function") {
        const updatedData = data(state.stepData);
        return { stepData: updatedData } as Partial<CampaignStepStore>;
      }

      let updatedStepData: any;

      // If we're in edit mode, preserve any existing data not specified in the update
      if (state.mode === "edit") {
        const currentStepData = state.stepData || {};

        // Merge current data with new data to ensure we don't lose any fields
        updatedStepData = { ...currentStepData, ...data };
      } else {
        // In add mode or for complete replacements
        updatedStepData = { ...state.stepData, ...data };
      }

      // Auto-update the selected step in the steps array when in edit mode
      // This ensures the changes are reflected in the stored steps immediately
      if (state.mode === "edit" && state.selectedNode) {
        const updatedSteps = state.steps.map((step) => {
          if (step.id === state.selectedNode) {
            // Create an updated step with the new data
            return {
              ...step,
              ...updatedStepData,
            };
          }
          return step;
        });

        return {
          steps: updatedSteps,
          stepData:
            updatedStepData as import("@/types/campaignStepUI").StepUIData,
        } as Partial<CampaignStepStore>;
      }

      return {
        stepData:
          updatedStepData as import("@/types/campaignStepUI").StepUIData,
      } as Partial<CampaignStepStore>;
    }),
  setSelectedNode: (nodeId) => {
    if (nodeId) {
      // When selecting a node, automatically set mode to edit
      set((state) => {
        // Find the selected step if it exists in our steps array
        const selectedStep = state.steps.find((step) => step.id === nodeId);

        if (selectedStep) {
          // Convert API step to UI format if needed
          const stepUIData =
            selectedStep as unknown as import("@/types/campaignStepUI").StepUIData;

          // Set the selected node, mode to edit, and load the step data
          return {
            selectedNode: nodeId,
            mode: "edit",
            stepData: stepUIData,
          } as Partial<CampaignStepStore>;
        }

        // If step not found, just set the selected node and mode
        return {
          selectedNode: nodeId,
          mode: "edit",
        } as Partial<CampaignStepStore>;
      });
    } else {
      // When deselecting, reset to add mode
      set({ selectedNode: null, mode: "add" });
    }
  },
  setSelectedEdge: (edgeId) => set({ selectedEdge: edgeId }),
  setFocusedField: (field) => set({ focusedField: field }),
  setMode: (mode) => set({ mode }),
  resetStepData: () =>
    set({
      stepData: {
        __typename: "SendEmail",
      },
      selectedNode: null,
      mode: "add",
    }),

  // New method to load data for a specific node
  loadNodeData: (nodeId: string) => {
    set((state) => {
      // Find the selected step in our steps array
      const selectedStep = state.steps.find((step) => step.id === nodeId);

      if (selectedStep) {
        // Convert API step to UI format
        const stepUIData =
          selectedStep as unknown as import("@/types/campaignStepUI").StepUIData;

        // Return the updated state with the loaded step data
        return {
          stepData: stepUIData,
          selectedNode: nodeId,
          mode: "edit",
        } as Partial<CampaignStepStore>;
      }

      // If step not found, don't change anything
      return {} as Partial<CampaignStepStore>;
    });
  },

  // Method to update a specific step by ID
  updateNodeById: (
    nodeId: string,
    data: Partial<import("@/types/campaignStepUI").StepUIData>
  ) => {
    set((state) => {
      // Update the step in the steps array
      const updatedSteps = state.steps.map((step) => {
        if (step.id === nodeId) {
          return {
            ...step,
            ...data,
          };
        }
        return step;
      });

      // If this is the selected node, also update stepData
      if (state.selectedNode === nodeId) {
        return {
          steps: updatedSteps,
          stepData: {
            ...state.stepData,
            ...data,
          } as import("@/types/campaignStepUI").StepUIData,
        } as Partial<CampaignStepStore>;
      }

      return {
        steps: updatedSteps,
      } as Partial<CampaignStepStore>;
    });
  },
}));
