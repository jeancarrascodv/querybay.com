import {
  Contact,
  ContactFilter,
  AddCampaignContact,
  CampaignContact,
} from "@/types/contact";
import {
  useMutation,
  useQuery,
  ApolloClient,
  NormalizedCacheObject,
} from "@apollo/client";
import { ContactMutations, ContactQueries } from "@/graphql/mutations/contacts";
import { client } from "@/lib/apollo-client";

export const contactServices = {
  // Note: getContacts still uses REST API as there's no direct GraphQL equivalent
  // that matches the customerId-based filter. Consider migrating to team-based queries.
  // TODO: Migrate to GET_CONTACT_LISTS GraphQL query when backend supports customerId filter
  getContacts: async (customerId: string, filter?: ContactFilter) => {
    const params = new URLSearchParams({ customerId });
    if (filter) params.append("filter", JSON.stringify(filter));

    const response = await fetch(`/api/contacts?${params}`, {
      // This makes the fetch work on both client and server side
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch contacts");
    }

    return response.json() as Promise<Contact[]>;
  },

  // GraphQL query for getting contact lists by team
  getContactLists: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    teamId: string
  ) => {
    try {
      const { data } = await apolloClient.query({
        query: ContactQueries.GET_CONTACT_LISTS,
        variables: { teamId },
        fetchPolicy: "network-only",
      });

      return data?.team?.contactLists || [];
    } catch (error) {
      console.error("Error fetching contact lists:", error);
      throw new Error("Failed to fetch contact lists");
    }
  },

  // GraphQL mutation for adding contacts to campaign
  addContactsToCampaign: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    teamId: string,
    campaignId: string,
    contacts: AddCampaignContact[]
  ): Promise<CampaignContact[]> => {
    try {
      const { data } = await apolloClient.mutate({
        mutation: ContactMutations.ADD_CONTACTS_TO_CAMPAIGN,
        variables: {
          teamId,
          campaignId,
          contacts,
        },
      });

      return data?.team?.campaign?.addCampaignContact || [];
    } catch (error) {
      console.error("Error adding contacts to campaign:", error);
      throw new Error("Failed to add contacts to campaign");
    }
  },

  // GraphQL mutation for uploading contacts via CSV
  uploadContactsCsv: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    teamId: string,
    csvFile: File,
    listName: string
  ) => {
    try {
      const { data } = await apolloClient.mutate({
        mutation: ContactMutations.UPLOAD_CONTACTS_CSV,
        variables: {
          teamId,
          csvFile,
          listName,
        },
      });

      return data?.team?.uploadContactListCsv;
    } catch (error) {
      console.error("Error uploading contacts CSV:", error);
      throw new Error("Failed to upload contacts CSV");
    }
  },

  // GraphQL query for getting campaign contacts
  getCampaignContacts: async (
    apolloClient: ApolloClient<NormalizedCacheObject>,
    teamId: string,
    campaignId: string
  ) => {
    try {
      const { data } = await apolloClient.query({
        query: ContactQueries.GET_CAMPAIGN_CONTACTS,
        variables: {
          teamId,
          campaignId,
        },
        fetchPolicy: "network-only",
      });

      return data?.team?.campaign?.contacts || [];
    } catch (error) {
      console.error("Error fetching campaign contacts:", error);
      throw new Error("Failed to fetch campaign contacts");
    }
  },
};

// Hook for adding contacts to campaign
export const useAddContactsToCampaign = () => {
  return useMutation(ContactMutations.ADD_CONTACTS_TO_CAMPAIGN);
};

// Hook for uploading contacts CSV
export const useUploadContactsCsv = () => {
  return useMutation(ContactMutations.UPLOAD_CONTACTS_CSV);
};

// Hook for getting campaign contacts
export const useGetCampaignContacts = (teamId: string, campaignId: string) => {
  return useQuery(ContactQueries.GET_CAMPAIGN_CONTACTS, {
    variables: { teamId, campaignId },
    skip: !teamId || !campaignId,
  });
};
