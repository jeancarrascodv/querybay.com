import { gql } from "@apollo/client";

// Export queries from the main GraphQL files
export {
  Queries as TeamQueries,
  Mutations as TeamMutations,
} from "@/graphql/team";

// Import from the refactored GraphQL files with namespaces
import {
  Queries as ContactQueries,
  Mutations as ContactMutations,
} from "@/graphql/contacts";

// Re-export for backward compatibility
export const UPLOAD_CONTACTS = ContactMutations.UPLOAD_CONTACTS;
export const ADD_CONTACTS_TO_CAMPAIGN =
  ContactMutations.ADD_CONTACTS_TO_CAMPAIGN;
export const GET_TEAM_CONTACT_LISTS = ContactQueries.GET_TEAM_CONTACT_LISTS;

// Local query definitions if needed
export const GET_CAMPAIGN_CONTACTS = gql`
  query campaignContact($campaignId: ID!) {
    campaign(id: $campaignId) {
      contacts {
        id
        contact {
          firstName
        }
        status
        extraData
      }
    }
  }
`;

export const CREATE_CAMPAIGN = gql`
  mutation createCampaign($name: String!) {
    team {
      createCampaign(campaign: { name: $name }) {
        id
        name
      }
    }
  }
`;
