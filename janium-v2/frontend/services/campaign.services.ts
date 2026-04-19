import { ApolloClient, NormalizedCacheObject } from "@apollo/client";
import { Queries, Mutations } from "../graphql/campaign";
import {
  ActionRequest,
  ActionRequestFilter,
  Campaign,
  CampaignFilter,
  CampaignInput,
  CampaignUpdateInput,
  NewActionRequest,
} from "../types/campaign.types";

// Note: These action request methods still use REST API as GraphQL endpoints are not yet available
// TODO: Convert to GraphQL when backend supports action requests queries/mutations
export const campaignServices = {
  // Action Requests - still using REST API (no GraphQL equivalent yet)
  getActionRequest: async (
    customerId: string,
    filter?: ActionRequestFilter
  ) => {
    const params = new URLSearchParams({ customerId });
    if (filter) params.append("filter", JSON.stringify(filter));

    const response = await fetch(`/api/action-requests?${params}`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch action requests: ${response.statusText}`
      );
    }
    return response.json();
  },

  registerNewActionRequest: async (
    customerId: string,
    newActionRequest: NewActionRequest
  ) => {
    const response = await fetch("/api/action-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId, newActionRequest }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to register action request: ${response.statusText}`
      );
    }
    return response.json();
  },

  // Campaigns - now using GraphQL
  getCampaigns: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    filter?: CampaignFilter
  ) => {
    const { data } = await apolloClient.query({
      query: Queries.GET_CAMPAIGNS,
      variables: {},
      fetchPolicy: "network-only",
    });
    return data.team.campaigns;
  },

  getCampaignsWithContacts: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    filter?: CampaignFilter
  ) => {
    const { data } = await apolloClient.query({
      query: Queries.GET_CAMPAIGNS_WITH_CONTACTS,
      variables: {},
      fetchPolicy: "network-only",
    });

    return data.team.campaigns.get;
  },

  createCampaign: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    campaign: CampaignInput
  ) => {
    const { data } = await apolloClient.mutate({
      mutation: Mutations.CREATE_CAMPAIGN,
      variables: { campaign },
    });
    return data.team.createCampaign;
  },

  updateCampaign: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    campaignId: string,
    changes: CampaignUpdateInput
  ) => {
    const { data } = await apolloClient.mutate({
      mutation: Mutations.UPDATE_CAMPAIGN,
      variables: { campaignId, changes },
    });
    return data.team.campaign.modify;
  },
};
