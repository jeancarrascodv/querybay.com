import { gql } from "@apollo/client";

export const Queries = {
  // Query to get contacts
  GET_CONTACTS: gql`
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
  `,

  // Query to get all contact lists
  GET_ALL_CONTACT_LISTS: gql`
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
  `,

  // Query to get contact lists for a team
  GET_TEAM_CONTACT_LISTS: gql`
    query GetTeamContactLists {
      team {
        contactLists {
          id
          name
          contacts {
            id
            state
            firstName
            lastName
            fullName
            location
            title
            emails {
              email
              emailType
              priority
              emailSource
              validationType
            }
            company {
              id
              liProfileHandle
              name
              country2
              country3
            }
          }
        }
      }
    }
  `,
};

export const Mutations = {
  // Mutation for uploading contacts
  UPLOAD_CONTACTS: gql`
    mutation uploadContacts($file: Upload!, $listName: String!) {
      team {
        uploadContactListCsv(listName: $listName, csvFile: $file) {
          contactList {
            id
            name
          }
          contacts {
            id
            firstName
          }
          companies {
            id
            name
          }
          rejectedContacts {
            matchedIds
            message
            contactRow {
              bestEmail
              firstName
            }
          }
        }
      }
    }
  `,

  // Mutation for adding contacts to campaign
  ADD_CONTACTS_TO_CAMPAIGN: gql`
    mutation addContactsToCampaign(
      $campaignId: ID!
      $contacts: [AddCampaignContact]!
    ) {
      team {
        campaign(id: $campaignId) {
          addCampaignContact(contacts: $contacts) {
            id
            contactId
            status
          }
        }
      }
    }
  `,
};
