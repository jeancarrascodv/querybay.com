import { useCallback } from "react";
import { useCampaignStore } from "../store/useCampaignStore";
import {
  ActionRequestFilter,
  CampaignFilter,
  CampaignInput,
  CampaignUpdateInput,
  NewActionRequest,
} from "../types/campaign.types";

export const useCampaign = () => {
  const store = useCampaignStore();

  // Action Request hooks
  const getActionRequests = useCallback(
    (customerId: string, filter?: ActionRequestFilter) => {
      return store.getActionRequests(customerId, filter);
    },
    []
  );

  const registerNewActionRequest = useCallback(
    (customerId: string, newActionRequest: NewActionRequest) => {
      return store.registerNewActionRequest(customerId, newActionRequest);
    },
    []
  );

  // Campaign hooks
  const getCampaigns = useCallback(async (filter?: CampaignFilter) => {
    return store.getCampaigns(filter);
  }, []);

  const createCampaign = useCallback(async (campaign: CampaignInput) => {
    return store.createCampaign(campaign);
  }, []);

  const updateCampaign = useCallback(
    async (campaignId: string, campaign: CampaignUpdateInput) => {
      return store.updateCampaign(campaignId, campaign);
    },
    []
  );

  // Add other hooks as needed

  return {
    // State
    campaigns: store.campaigns,
    actionRequests: store.actionRequests,
    campaignSteps: store.campaignSteps,
    contacts: store.contacts,
    contactLists: store.contactLists,
    loading: store.loading,
    error: store.error,

    // Actions
    getActionRequests,
    registerNewActionRequest,
    getCampaigns,
    createCampaign,
    updateCampaign,
    // ... other methods
  };
};
