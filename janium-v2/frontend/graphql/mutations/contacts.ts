import { gql } from "@apollo/client";

// Mutation for adding contacts to a campaign (simplified for debugging)
export const ADD_CONTACTS_TO_CAMPAIGN = gql`
  mutation AddContactsToCampaign(
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
`;

// Mutation for uploading contacts via CSV
export const UPLOAD_CONTACTS_CSV = gql`
  mutation UploadContactsCsv($csvFile: Upload!, $listName: String!) {
    team {
      uploadContactListCsv(csvFile: $csvFile, listName: $listName) {
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
`;

// Query for getting contact lists
export const GET_CONTACT_LISTS = gql`
  query GetContactLists {
    team {
      contactLists {
        id
        name
        salesNavQuery
        linkedinId
        createdDate
        contacts {
          id
          firstName
          fullName
          lastName
          location
          title
          department
          seniority
          liProfileHandle
          emails {
            email
            emailType
          }
          company {
            id
            name
          }
        }
      }
    }
  }
`;

// Query for getting campaign contacts
export const GET_CAMPAIGN_CONTACTS = gql`
  query GetCampaignContacts($campaignId: ID!) {
    team {
      campaign(id: $campaignId) {
        get {
          id
          name
          active
        }
        contacts {
          id
          contactId
          stepId
          status
          extraData
          lastAction
          templateData
          contact {
            id
            firstName
            lastName
            fullName
            title
            department
            seniority
            liProfileHandle
            city
            state
            location
            emails {
              id
              email
              emailType
              emailSource
            }
            company {
              id
              name
              liProfileUrl
              website
              city
              state
              location
            }
          }
        }
      }
    }
  }
`;

// Export all mutations and queries
export const ContactMutations = {
  ADD_CONTACTS_TO_CAMPAIGN,
  UPLOAD_CONTACTS_CSV,
};

export const ContactQueries = {
  GET_CONTACT_LISTS,
  GET_CAMPAIGN_CONTACTS,
};
