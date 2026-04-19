import { client } from "@/lib/apollo-client";
import { Queries, Mutations } from "@/graphql/campaignStep";
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

export const campaignStepServices = {
  // Combined query for steps and links
  getCampaignFlow: async (
    campaignId: string
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.query({
        query: Queries.GET_CAMPAIGN_FLOW,
        variables: { campaignId },
        fetchPolicy: "cache-first",
      });

      return {
        steps: data?.team?.campaign?.steps || [],
        links: data?.team?.campaign?.links || [],
      };
    } catch (error) {
      console.error("Error fetching campaign flow:", error);
      throw new Error("Failed to fetch campaign flow");
    }
  },

  // Step queries
  getCampaignSteps: async (
    campaignId: string,
    filter?: CampaignStepFilter
  ): Promise<CampaignStep[]> => {
    try {
      const { data } = await client.query({
        query: Queries.GET_CAMPAIGN_STEPS,
        variables: { campaignId },
        fetchPolicy: "cache-first",
      });

      return data?.team?.campaign?.steps || [];
    } catch (error) {
      console.error("Error fetching campaign steps:", error);
      throw new Error("Failed to fetch campaign steps");
    }
  },

  getCampaignLinks: async (campaignId: string): Promise<CampaignStepLink[]> => {
    try {
      const { data } = await client.query({
        query: Queries.GET_CAMPAIGN_FLOW,
        variables: { campaignId },
        fetchPolicy: "cache-first",
      });

      return data?.team?.campaign?.links || [];
    } catch (error) {
      console.error("Error fetching campaign links:", error);
      throw new Error("Failed to fetch campaign links");
    }
  },

  getCampaignContacts: async (
    campaignId: string
  ): Promise<CampaignContact[]> => {
    try {
      const { data } = await client.query({
        query: Queries.GET_CAMPAIGN_CONTACTS,
        variables: { campaignId },
        fetchPolicy: "cache-first",
      });

      return data?.team?.campaign?.contacts || [];
    } catch (error) {
      console.error("Error fetching campaign contacts:", error);
      throw new Error("Failed to fetch campaign contacts");
    }
  },

  // Step mutations
  addCampaignStep: async (
    campaignId: string,
    step: CreateCampaignStep
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.ADD_CAMPAIGN_STEP,
        variables: {
          campaignId,
          stepCreations: [step],
        },
      });

      return {
        steps: data?.team?.campaign?.modifySteps?.steps || [],
        links: data?.team?.campaign?.modifySteps?.links || [],
      };
    } catch (error) {
      console.error("Error adding campaign step:", error);
      throw new Error("Failed to add campaign step");
    }
  },

  modifyCampaignStep: async (
    campaignId: string,
    mutation: MutateCampaignStep
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.MODIFY_CAMPAIGN_STEP,
        variables: {
          campaignId,
          stepMutations: [mutation],
        },
      });

      return {
        steps: data?.team?.campaign?.modifySteps?.steps || [],
        links: data?.team?.campaign?.modifySteps?.links || [],
      };
    } catch (error) {
      console.error("Error modifying campaign step:", error);
      throw new Error("Failed to modify campaign step");
    }
  },

  // Link mutations
  addCampaignStepLink: async (
    campaignId: string,
    link: CreateCampaignStepLink
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.ADD_CAMPAIGN_STEP_LINK,
        variables: {
          campaignId,
          linkCreations: [link],
        },
      });

      return {
        steps: data?.team?.campaign?.modifySteps?.steps || [],
        links: data?.team?.campaign?.modifySteps?.links || [],
      };
    } catch (error) {
      console.error("Error adding campaign step link:", error);
      throw new Error("Failed to add campaign step link");
    }
  },

  modifyCampaignStepLink: async (
    campaignId: string,
    mutation: MutateCampaignStepLink
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.MODIFY_CAMPAIGN_STEP_LINK,
        variables: {
          campaignId,
          linkMutations: [mutation],
        },
      });

      return {
        steps: data?.team?.campaign?.modifySteps?.steps || [],
        links: data?.team?.campaign?.modifySteps?.links || [],
      };
    } catch (error) {
      console.error("Error modifying campaign step link:", error);
      throw new Error("Failed to modify campaign step link");
    }
  },

  // Bulk operations
  bulkUpdateSteps: async (
    campaignId: string,
    input: BulkUpdateStepsInput
  ): Promise<{ steps: CampaignStep[]; links: CampaignStepLink[] }> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.BULK_UPDATE_STEPS,
        variables: {
          campaignId,
          stepCreations: input.stepCreations || [],
          stepMutations: input.stepMutations || [],
          stepDeletions: input.stepDeletions || [],
          linkCreations: input.linkCreations || [],
          linkMutations: input.linkMutations || [],
          linkDeletions: input.linkDeletions || [],
        },
      });

      return {
        steps: data?.team?.campaign?.modifySteps?.steps || [],
        links: data?.team?.campaign?.modifySteps?.links || [],
      };
    } catch (error) {
      console.error("Error performing bulk update:", error);
      throw new Error("Failed to perform bulk update");
    }
  },

  // Contact operations
  addCampaignContacts: async (
    campaignId: string,
    contacts: AddCampaignContact[]
  ): Promise<CampaignContact[]> => {
    try {
      const { data } = await client.mutate({
        mutation: Mutations.ADD_CAMPAIGN_CONTACTS,
        variables: {
          campaignId,
          contacts,
        },
      });

      return data?.team?.campaign?.addCampaignContact || [];
    } catch (error) {
      console.error("Error adding campaign contacts:", error);
      throw new Error("Failed to add campaign contacts");
    }
  },

  // For backwards compatibility
  createCampaignStep: async (campaignId: string, step: CreateCampaignStep) => {
    return campaignStepServices.addCampaignStep(campaignId, step);
  },

  updateCampaignStep: async (campaignId: string, stepId: string, step: any) => {
    const mutation: MutateCampaignStep = {
      id: stepId,
      ...step,
    };
    return campaignStepServices.modifyCampaignStep(campaignId, mutation);
  },
};
