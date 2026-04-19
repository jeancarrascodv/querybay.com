import { gql } from "@apollo/client";
import { GET_CAMPAIGN_CONTACTS } from "./mutations/contacts";

export const Queries = {
  GET_CAMPAIGN_FLOW: gql`
    query GetCampaignFlow($campaignId: UUID!) {
      team {
        campaign(id: $campaignId) {
          steps {
            id
            campaignId
            enabled
            priority
            stepData {
              __typename
              ... on SendEmail {
                subject
                body
                from
                replyToPrevious
              }
              ... on SendLinkedInMessage {
                linkedinMessage
              }
              ... on SendLinkedInConnectionRequest {
                connectionRequestMessage
              }
            }
            weeklyRestrictions {
              sunday {
                startTime
                endTime
              }
              monday {
                startTime
                endTime
              }
              tuesday {
                startTime
                endTime
              }
              wednesday {
                startTime
                endTime
              }
              thursday {
                startTime
                endTime
              }
              friday {
                startTime
                endTime
              }
              saturday {
                startTime
                endTime
              }
            }
            ui {
              box {
                xmin
                xmax
                ymin
                ymax
              }
            }
          }
          links {
            id
            prev
            next
            enabled
            delay {
              businessDays
              seconds
              days
            }
            randomDelay {
              businessDays
              seconds
              days
            }
            priority
            filter {
              ... on ConstFilter {
                pass
              }
              ... on AndFilter {
                and {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
              ... on OrFilter {
                or {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
              ... on NotFilter {
                not {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  GET_CAMPAIGN_STEPS: gql`
    query GetCampaignSteps($campaignId: UUID!) {
      team {
        campaign(id: $campaignId) {
          steps {
            id
            campaignId
            enabled
            priority
            stepData {
              __typename
              ... on SendEmail {
                subject
                body
                from
                replyToPrevious
              }
              ... on SendLinkedInMessage {
                linkedinMessage
              }
              ... on SendLinkedInConnectionRequest {
                connectionRequestMessage
              }
            }
            weeklyRestrictions {
              sunday {
                startTime
                endTime
              }
              monday {
                startTime
                endTime
              }
              tuesday {
                startTime
                endTime
              }
              wednesday {
                startTime
                endTime
              }
              thursday {
                startTime
                endTime
              }
              friday {
                startTime
                endTime
              }
              saturday {
                startTime
                endTime
              }
            }
            ui {
              box {
                xmin
                xmax
                ymin
                ymax
              }
            }
          }
        }
      }
    }
  `,

  GET_CAMPAIGN_LINKS: gql`
    query GetCampaignLinks($campaignId: UUID!) {
      team {
        campaign(id: $campaignId) {
          links {
            id
            prev
            next
            enabled
            delay {
              businessDays
              seconds
              days
            }
            randomDelay {
              businessDays
              seconds
              days
            }
            priority
            filter {
              ... on OpenedPreviousEmail {
                within {
                  businessDays
                  seconds
                  days
                }
              }
              ... on OpenedAnyEmail {
                within {
                  businessDays
                  seconds
                  days
                }
              }
              ... on RespondedPreviousEmail {
                within {
                  businessDays
                  seconds
                  days
                }
              }
              ... on RespondedAnyEmail {
                within {
                  businessDays
                  seconds
                  days
                }
              }
              ... on ConstFilter {
                pass
              }
              ... on AndFilter {
                and {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
              ... on OrFilter {
                or {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
              ... on NotFilter {
                not {
                  ... on ConstFilter {
                    pass
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  GET_CAMPAIGN_CONTACTS: gql`
    query GetCampaignContacts($campaignId: UUID!) {
      team {
        campaign(id: $campaignId) {
          contacts {
            id
            contactId
            stepId
            status
            extraData
            lastAction
            contact {
              id
              firstName
              lastName
              fullName
              emails {
                id
                email
                emailType
              }
            }
          }
        }
      }
    }
  `,
};

export const Mutations = {
  RENDER_TEMPLATE: gql`
    query RenderTemplate(
      $campaignId: UUID!
      $campaignContactIds: [UUID!]!
      $template: String!
    ) {
      team {
        campaign(id: $campaignId) {
          steps {
            id
            render(campaignContactIds: $campaignContactIds, template: $template)
          }
        }
      }
    }
  `,

  ADD_CAMPAIGN_STEP: gql`
    mutation AddCampaignStep(
      $campaignId: UUID!
      $stepCreations: [CreateCampaignStep!]! = []
    ) {
      team {
        campaign(id: $campaignId) {
          modifySteps(stepCreations: $stepCreations) {
            steps {
              id
              campaignId
              enabled
              priority
              stepData {
                __typename
                ... on SendEmail {
                  subject
                  body
                  from
                  replyToPrevious
                }
                ... on SendLinkedInMessage {
                  linkedinMessage
                }
                ... on SendLinkedInConnectionRequest {
                  connectionRequestMessage
                }
              }
              weeklyRestrictions {
                sunday {
                  startTime
                  endTime
                }
                monday {
                  startTime
                  endTime
                }
                tuesday {
                  startTime
                  endTime
                }
                wednesday {
                  startTime
                  endTime
                }
                thursday {
                  startTime
                  endTime
                }
                friday {
                  startTime
                  endTime
                }
                saturday {
                  startTime
                  endTime
                }
              }
              ui {
                box {
                  xmin
                  xmax
                  ymin
                  ymax
                }
              }
            }
            links {
              id
              prev
              next
              enabled
              delay {
                businessDays
                seconds
                days
              }
              randomDelay {
                businessDays
                seconds
                days
              }
              priority
              filter {
                ... on ConstFilter {
                  pass
                }
                ... on AndFilter {
                  and {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on OrFilter {
                  or {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on NotFilter {
                  not {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  MODIFY_CAMPAIGN_STEP: gql`
    mutation ModifyCampaignStep(
      $campaignId: UUID!
      $stepMutations: [MutateCampaignStep!]! = []
    ) {
      team {
        campaign(id: $campaignId) {
          modifySteps(stepMutations: $stepMutations) {
            steps {
              id
              campaignId
              enabled
              priority
              stepData {
                __typename
                ... on SendEmail {
                  subject
                  body
                  from
                  replyToPrevious
                }
                ... on SendLinkedInMessage {
                  linkedinMessage
                }
                ... on SendLinkedInConnectionRequest {
                  connectionRequestMessage
                }
              }
              weeklyRestrictions {
                sunday {
                  startTime
                  endTime
                }
                monday {
                  startTime
                  endTime
                }
                tuesday {
                  startTime
                  endTime
                }
                wednesday {
                  startTime
                  endTime
                }
                thursday {
                  startTime
                  endTime
                }
                friday {
                  startTime
                  endTime
                }
                saturday {
                  startTime
                  endTime
                }
              }
              ui {
                box {
                  xmin
                  xmax
                  ymin
                  ymax
                }
              }
            }
            links {
              id
              prev
              next
              enabled
              delay {
                businessDays
                seconds
                days
              }
              randomDelay {
                businessDays
                seconds
                days
              }
              priority
              filter {
                ... on ConstFilter {
                  pass
                }
                ... on AndFilter {
                  and {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on OrFilter {
                  or {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on NotFilter {
                  not {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  ADD_CAMPAIGN_STEP_LINK: gql`
    mutation AddCampaignStepLink(
      $campaignId: UUID!
      $linkCreations: [CreateCampaignStepLink!]! = []
    ) {
      team {
        campaign(id: $campaignId) {
          modifySteps(linkCreations: $linkCreations) {
            links {
              id
              prev
              next
              enabled
              delay {
                businessDays
                seconds
                days
              }
              randomDelay {
                businessDays
                seconds
                days
              }
              priority
              filter {
                ... on ConstFilter {
                  pass
                }
                ... on AndFilter {
                  and {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on OrFilter {
                  or {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on NotFilter {
                  not {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  MODIFY_CAMPAIGN_STEP_LINK: gql`
    mutation ModifyCampaignStepLink(
      $campaignId: UUID!
      $linkMutations: [MutateCampaignStepLink!]! = []
    ) {
      team {
        campaign(id: $campaignId) {
          modifySteps(linkMutations: $linkMutations) {
            links {
              id
              prev
              next
              enabled
              delay {
                businessDays
                seconds
                days
              }
              randomDelay {
                businessDays
                seconds
                days
              }
              priority
              filter {
                ... on ConstFilter {
                  pass
                }
                ... on AndFilter {
                  and {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on OrFilter {
                  or {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on NotFilter {
                  not {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  BULK_UPDATE_STEPS: gql`
    mutation BulkUpdateSteps(
      $campaignId: UUID!
      $stepCreations: [CreateCampaignStep!] = []
      $stepMutations: [MutateCampaignStep!] = []
      $stepDeletions: [UUID!] = []
      $linkCreations: [CreateCampaignStepLink!] = []
      $linkMutations: [MutateCampaignStepLink!] = []
      $linkDeletions: [UUID!] = []
    ) {
      team {
        campaign(id: $campaignId) {
          modifySteps(
            stepCreations: $stepCreations
            stepMutations: $stepMutations
            stepDeletions: $stepDeletions
            linkCreations: $linkCreations
            linkMutations: $linkMutations
            linkDeletions: $linkDeletions
          ) {
            steps {
              id
              campaignId
              enabled
              priority
              stepData {
                __typename
                ... on SendEmail {
                  subject
                  body
                  from
                  replyToPrevious
                }
                ... on SendLinkedInMessage {
                  linkedinMessage
                }
                ... on SendLinkedInConnectionRequest {
                  connectionRequestMessage
                }
              }
              weeklyRestrictions {
                sunday {
                  startTime
                  endTime
                }
                monday {
                  startTime
                  endTime
                }
                tuesday {
                  startTime
                  endTime
                }
                wednesday {
                  startTime
                  endTime
                }
                thursday {
                  startTime
                  endTime
                }
                friday {
                  startTime
                  endTime
                }
                saturday {
                  startTime
                  endTime
                }
              }
              ui {
                box {
                  xmin
                  xmax
                  ymin
                  ymax
                }
              }
            }
            links {
              id
              prev
              next
              enabled
              delay {
                businessDays
                seconds
                days
              }
              randomDelay {
                businessDays
                seconds
                days
              }
              priority
              filter {
                ... on ConstFilter {
                  pass
                }
                ... on AndFilter {
                  and {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on OrFilter {
                  or {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
                ... on NotFilter {
                  not {
                    ... on ConstFilter {
                      pass
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `,

  ADD_CAMPAIGN_CONTACTS: gql`
    mutation AddCampaignContacts(
      $campaignId: UUID!
      $contacts: [AddCampaignContact!]!
    ) {
      team {
        campaign(id: $campaignId) {
          addCampaignContact(contacts: $contacts) {
            id
            contactId
            stepId
            status
            extraData
            lastAction
            contact {
              id
              firstName
              lastName
              fullName
            }
          }
        }
      }
    }
  `,
};
