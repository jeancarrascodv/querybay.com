import { useCallback } from "react";
import { useCampaignStepStore } from "../store/useCampaignStepStore";
import {
  AddCampaignContact,
  BulkUpdateStepsInput,
  CampaignStepLinkFilterInput,
  CreateCampaignStep,
  CreateCampaignStepLink,
  MutateCampaignStep,
  MutateCampaignStepLink,
} from "../types/campaignStep";
import { createDefaultStepInput } from "@/utils/campaignStep.utils";

export const useCampaignSteps = () => {
  const store = useCampaignStepStore();

  // Campaign Step queries
  const getCampaignSteps = useCallback(
    async (teamId: string, campaignId: string) => {
      return store.getCampaignSteps(campaignId);
    },
    []
  );

  const getCampaignLinks = useCallback(
    async (teamId: string, campaignId: string) => {
      return store.getCampaignLinks(campaignId);
    },
    []
  );

  const getCampaignContacts = useCallback(
    async (teamId: string, campaignId: string) => {
      return store.getCampaignContacts(campaignId);
    },
    []
  );

  // Campaign Step mutations
  const addCampaignStep = useCallback(
    async (teamId: string, campaignId: string, step: CreateCampaignStep) => {
      return store.addCampaignStep(campaignId, step);
    },
    []
  );

  // Add multiple steps at once using bulk update
  const addMultipleCampaignSteps = useCallback(
    async (teamId: string, campaignId: string, steps: CreateCampaignStep[]) => {
      // Use bulkUpdateSteps with only stepCreations parameter
      const bulkInput: BulkUpdateStepsInput = {
        stepCreations: steps,
      };
      return store.bulkUpdateSteps(campaignId, bulkInput);
    },
    []
  );

  const createStepByType = useCallback(
    async (
      teamId: string,
      campaignId: string,
      type: "email" | "linkedin" | "delay" | string,
      priority: number = 1
    ) => {
      const stepInput = createDefaultStepInput(type, priority);
      return store.addCampaignStep(campaignId, stepInput as CreateCampaignStep);
    },
    []
  );

  const modifyStepData = useCallback(
    async (
      teamId: string,
      campaignId: string,
      mutation: MutateCampaignStep
    ) => {
      return store.modifyCampaignStep(campaignId, mutation);
    },
    []
  );

  // Campaign Link mutations
  const addCampaignStepLink = useCallback(
    async (
      teamId: string,
      campaignId: string,
      link: CreateCampaignStepLink
    ) => {
      return store.addCampaignStepLink(campaignId, link);
    },
    []
  );

  const modifyCampaignStepLink = useCallback(
    async (
      teamId: string,
      campaignId: string,
      mutation: MutateCampaignStepLink
    ) => {
      return store.modifyCampaignStepLink(campaignId, mutation);
    },
    []
  );

  // Bulk operations
  const bulkUpdateSteps = useCallback(
    async (teamId: string, campaignId: string, input: BulkUpdateStepsInput) => {
      return store.bulkUpdateSteps(campaignId, input);
    },
    []
  );

  // Contact operations
  const addCampaignContacts = useCallback(
    async (
      teamId: string,
      campaignId: string,
      contacts: AddCampaignContact[]
    ) => {
      return store.addCampaignContacts(campaignId, contacts);
    },
    []
  );

  return {
    // State
    steps: store.steps,
    links: store.links,
    contacts: store.contacts,
    loading: store.isLoading,
    error: store.error,
    currentStep: store.currentStep,
    stepData: store.stepData,
    selectedNode: store.selectedNode,
    focusedField: store.focusedField,
    mode: store.mode,

    // Queries
    getCampaignSteps,
    getCampaignLinks,
    getCampaignContacts,

    // Step mutations
    addCampaignStep,
    addMultipleCampaignSteps,
    modifyStepData,
    createStepByType,

    // Link mutations
    addCampaignStepLink,
    modifyCampaignStepLink,

    // Bulk operations
    bulkUpdateSteps,

    // Contact operations
    addCampaignContacts,

    // UI state management
    setCurrentStep: store.setCurrentStep,
    updateStepData: store.updateStepData,
    setSelectedNode: store.setSelectedNode,
    setFocusedField: store.setFocusedField,
    setMode: store.setMode,
    resetStepData: store.resetStepData,
    clearSteps: store.clearSteps,
  };
};
