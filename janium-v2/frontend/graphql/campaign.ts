import { gql } from "@apollo/client";

const DAILY_RESTRICTION_FRAGMENT = gql`
  fragment DailyRestrictionFields on DailyRestriction {
    startTime
    endTime
  }
`;

const CREATE_CAMPAIGN = gql`
  mutation CreateCampaign($campaign: CreateCampaign!) {
    team {
      createCampaign(campaign: $campaign) {
        id
        name
        active
        allowedMessagingDayTimes {
          sunday {
            ...DailyRestrictionFields
          }
          monday {
            ...DailyRestrictionFields
          }

          tuesday {
            ...DailyRestrictionFields
          }
          wednesday {
            ...DailyRestrictionFields
          }
          thursday {
            ...DailyRestrictionFields
          }
          friday {
            ...DailyRestrictionFields
          }
          saturday {
            ...DailyRestrictionFields
          }
        }
      }
    }
  }
  ${DAILY_RESTRICTION_FRAGMENT}
`;

const UPDATE_CAMPAIGN = gql`
  mutation UpdateCampaign($campaignId: UUID!, $changes: MutateCampaign!) {
    team {
      campaign(id: $campaignId) {
        modify(changes: $changes) {
          id
          name
          active
          linkedinIds
          allowedMessagingDayTimes {
            sunday {
              ...DailyRestrictionFields
            }
            monday {
              ...DailyRestrictionFields
            }
            tuesday {
              ...DailyRestrictionFields
            }
            wednesday {
              ...DailyRestrictionFields
            }
            thursday {
              ...DailyRestrictionFields
            }
            friday {
              ...DailyRestrictionFields
            }
            saturday {
              ...DailyRestrictionFields
            }
          }
        }
      }
    }
  }
  ${DAILY_RESTRICTION_FRAGMENT}
`;

const GET_CAMPAIGNS = gql`
  query GetCampaigns {
    team {
      campaigns {
        get {
          id
          name
          active
          linkedinIds
          allowedMessagingDayTimes {
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
        }
      }
    }
  }
`;

const GET_CAMPAIGNS_WITH_CONTACTS = gql`
  query GetCampaignsWithContacts {
    team {
      campaigns {
        get {
          id
          name
          active
          allowedMessagingDayTimes {
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
        }
      }
    }
  }
`;

export const Mutations = {
  CREATE_CAMPAIGN,
  UPDATE_CAMPAIGN,
};

export const Queries = {
  GET_CAMPAIGNS,
  GET_CAMPAIGNS_WITH_CONTACTS,
};
