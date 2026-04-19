import { gql } from "@apollo/client";

export const GET_CONTACTS = gql`
  query GetContacts($customerId: String!, $filter: ContactFilter) {
    getContacts(customerId: $customerId, filter: $filter) {
      id
      customerId
      status
      isActive
      priority
      sourceId
      contactListId
      profileUrl
      profileFullName
      profileFirstName
      salesNavigatorProfileUrl
      campaignId
      updatedAt

      extraData
      contactEmail {
        id
        address
        contactId
        isActive
      }
    }
  }
`;

export const GET_ALL_CONTACT_LISTS = gql`
  query GetAllContactLists($customerId: String!) {
    contactQuery {
      getContactList(customer_id: $customerId) {
        id
        contactListName
        campaignId
        customerId
        source
        createdAt
      }
    }
  }
`;

export const GET_TEAM_CONTACT_LISTS = gql`
  query GetTeamContactLists {
    team {
      contactLists {
        name
        id
      }
    }
  }
`;
